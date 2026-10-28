"""Importación validada de ventas históricas (CSV).

Reglas (sección 9.1, RF-10 y sección de tratamiento de datos del documento):
- Columnas obligatorias: sku, fecha, cantidad. Separador coma o punto y coma.
- Se rechaza la fila con producto inexistente, fecha inválida o futura, cantidad no entera o negativa,
  o repetida dentro del archivo.
- Reimportar no duplica: hay UNA fila por (producto, fecha) y la nueva reemplaza a la anterior.
- Cargar dos veces el mismo archivo se detecta con su huella SHA-256.
- Tras importar, cada día se marca como "censurado" si el producto terminó agotado ese día:
  vender cero (o poco) en un día sin existencias no significa que no hubiera demanda.
"""
import hashlib
import re
import unicodedata
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..fechas import hoy
from ..models import ImportacionVentas, MovimientoInventario, Producto, Usuario, VentaHistorica
from .errores import ErrorNegocio


def _linea(l: str, delim: str) -> list[str]:
    out, cur, q, i = [], "", False, 0
    while i < len(l):
        c = l[i]
        if c == '"':
            if q and i + 1 < len(l) and l[i + 1] == '"':
                cur += '"'; i += 1
            else:
                q = not q
        elif c == delim and not q:
            out.append(cur.strip()); cur = ""
        else:
            cur += c
        i += 1
    out.append(cur.strip())
    return out


def _quitar_tildes(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def _fecha(t: str) -> date | None:
    t = (t or "").strip()
    m = re.fullmatch(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", t)
    try:
        if m:
            return date(int(m[3]), int(m[2]), int(m[1]))
        return date.fromisoformat(t)
    except ValueError:
        return None


def validar(db: Session, contenido: str) -> dict:
    contenido = contenido.lstrip("\ufeff")
    lineas = [l for l in re.split(r"\r\n|\n|\r", contenido) if l.strip()]
    if not lineas:
        raise ErrorNegocio("El archivo está vacío.", 422)
    delim = ";" if lineas[0].count(";") > lineas[0].count(",") else ","
    enc = [_quitar_tildes(c).lower() for c in _linea(lineas[0], delim)]

    def col(*nombres):
        for n in nombres:
            if n in enc:
                return enc.index(n)
        return -1
    i_sku, i_fecha, i_cant = col("sku", "codigo", "producto"), col("fecha"), col("cantidad", "unidades")
    if min(i_sku, i_fecha, i_cant) < 0:
        raise ErrorNegocio("Faltan columnas. El archivo debe tener los encabezados: sku, fecha y cantidad.", 422)

    productos = {p.sku.upper(): p for p in db.scalars(select(Producto))}
    inicio = hoy() - timedelta(days=settings.DIAS_VENTANA - 1)
    vistos, validas, errores = set(), [], []
    for n, texto in enumerate(lineas[1:], start=2):
        c = _linea(texto, delim)
        get = lambda i: c[i] if i < len(c) else ""
        sku, f, cant_txt = get(i_sku).upper(), _fecha(get(i_fecha)), get(i_cant).strip()
        msg = None
        if not sku:
            msg = "Falta el código del producto."
        elif sku not in productos:
            msg = f"El producto «{sku}» no existe en el catálogo."
        elif f is None:
            msg = f"La fecha «{get(i_fecha)}» no es válida. Usa AAAA-MM-DD o DD/MM/AAAA."
        elif f > hoy():
            msg = f"La fecha {f:%d/%m/%Y} es posterior a hoy."
        elif f < inicio:
            msg = f"La fecha {f:%d/%m/%Y} es anterior al periodo disponible ({inicio:%d/%m/%Y})."
        elif not re.fullmatch(r"\d+", cant_txt):
            msg = f"La cantidad «{cant_txt}» debe ser un número entero mayor o igual a cero."
        elif (sku, f) in vistos:
            msg = f"Ya hay otra fila para {sku} el {f:%d/%m/%Y} (duplicado en el archivo)."
        if msg:
            errores.append({"fila": n, "texto": texto, "msg": msg})
        else:
            vistos.add((sku, f))
            validas.append({"sku": sku, "fecha": f, "cantidad": int(cant_txt)})
    return {"total": len(lineas) - 1, "validas": validas, "errores": errores}


def marcar_censuradas(db: Session, producto_ids: set[int]) -> int:
    """Marca como censurados los días en que el producto terminó con existencias en cero."""
    marcadas = 0
    for pid in producto_ids:
        existencias = db.scalar(select(Producto.existencias).where(Producto.id == pid))
        movs = db.execute(select(MovimientoInventario.fecha, MovimientoInventario.tipo, MovimientoInventario.cantidad)
                          .where(MovimientoInventario.producto_id == pid)).all()
        delta: dict[date, int] = {}
        for f, tipo, cant in movs:
            delta[f] = delta.get(f, 0) + (-cant if tipo == "salida" else cant)
        ventas = db.scalars(select(VentaHistorica).where(VentaHistorica.producto_id == pid).order_by(VentaHistorica.fecha.desc())).all()
        if not ventas:
            continue
        # existencias al cierre de cada día, reconstruidas hacia atrás desde las existencias actuales
        fechas = sorted(delta.keys() | {v.fecha for v in ventas}, reverse=True)
        cierre, actual = {}, existencias
        dia = hoy()
        while dia >= min(fechas):
            cierre[dia] = actual
            actual -= delta.get(dia, 0)
            dia -= timedelta(days=1)
        for v in ventas:
            censurada = cierre.get(v.fecha, 1) <= 0
            if v.demanda_censurada != censurada:
                v.demanda_censurada = censurada
            marcadas += censurada
    return marcadas


def importar(db: Session, usuario: Usuario, archivo: str, contenido: str, confirmar: bool) -> dict:
    r = validar(db, contenido)
    huella = hashlib.sha256(contenido.encode()).hexdigest()
    previa = db.scalar(select(ImportacionVentas).where(ImportacionVentas.huella == huella, ImportacionVentas.estado == "aplicada"))
    resumen = {"total": r["total"], "validas": len(r["validas"]), "errores": r["errores"], "archivoRepetido": previa is not None,
               "aplicada": False}
    if not confirmar:
        return resumen
    if previa is not None:
        raise ErrorNegocio("Este mismo archivo ya se importó antes. Si quieres corregir datos, modifica el archivo y vuelve a cargarlo.", 409)
    if not r["validas"]:
        raise ErrorNegocio("El archivo no tiene filas válidas para importar.", 422)
    imp = ImportacionVentas(usuario_id=usuario.id, archivo=archivo, huella=huella, filas_leidas=r["total"],
                            filas_validas=len(r["validas"]), filas_con_error=len(r["errores"]))
    db.add(imp)
    db.flush()
    prods = {p.sku.upper(): p.id for p in db.scalars(select(Producto))}
    existentes = {(v.producto_id, v.fecha): v for v in db.scalars(select(VentaHistorica).where(
        VentaHistorica.producto_id.in_({prods[f["sku"]] for f in r["validas"]})))}
    afectados = set()
    for f in r["validas"]:
        pid = prods[f["sku"]]
        afectados.add(pid)
        v = existentes.get((pid, f["fecha"]))
        if v:
            v.cantidad, v.importacion_id = f["cantidad"], imp.id      # reemplaza, no duplica
        else:
            db.add(VentaHistorica(producto_id=pid, fecha=f["fecha"], cantidad=f["cantidad"], importacion_id=imp.id))
    db.flush()
    resumen["censuradas"] = marcar_censuradas(db, afectados)
    db.commit()
    resumen.update(aplicada=True, importacionId=imp.id, productosAfectados=len(afectados))
    return resumen
