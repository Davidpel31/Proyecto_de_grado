"""Datos de demostración: los mismos 25 productos del prototipo, con las fechas movidas para que
terminen en el día de hoy. Solo se siembra si la base está vacía."""
import json
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..fechas import hoy
from ..models import (Categoria, MovimientoInventario, ParametroReposicion, PedidoReposicion, Producto, ProductoProveedor,
                      Proveedor, UnidadMedida, Usuario, VentaHistorica)
from ..security import hash_password

RUTA = Path(__file__).resolve().parent.parent / "seed" / "datos_demo.json"

USUARIOS_DEMO = [
    ("Propietario", "admin", "admin123", "admin"),
    ("Encargado de bodega", "operativo", "operativo123", "operativo"),
]


def sembrar_usuarios(db: Session) -> None:
    for nombre, username, clave, rol in USUARIOS_DEMO:
        if not db.scalar(select(Usuario).where(Usuario.username == username)):
            db.add(Usuario(nombre=nombre, username=username, password_hash=hash_password(clave), rol=rol))
    db.commit()


def sembrar_demo(db: Session) -> bool:
    if db.scalar(select(Producto.id).limit(1)) is not None:
        return False
    datos = json.loads(RUTA.read_text(encoding="utf-8"))
    desfase = hoy() - date.fromisoformat(datos["hoy"])
    mover = lambda f: (date.fromisoformat(f) + desfase)

    cat = {}
    for c in datos["categorias"]:
        o = Categoria(nombre=c["nombre"]); db.add(o); db.flush(); cat[c["id"]] = o.id
    uni = {}
    for u in datos["unidades"]:
        o = UnidadMedida(nombre=u["nombre"], abreviatura=u["abrev"]); db.add(o); db.flush(); uni[u["id"]] = o.id
    prov = {}
    for p in datos["proveedores"]:
        o = Proveedor(nombre=p["nombre"], contacto=p["contacto"], tiempo_entrega_dias=p["tiempoEntrega"]); db.add(o); db.flush(); prov[p["id"]] = o.id

    # existencias = suma de los movimientos, en el orden en que ocurrieron
    saldo: dict[str, int] = {}
    resultante = []
    for m in datos["movimientos"]:
        d = -m["cantidad"] if m["tipo"] == "salida" else m["cantidad"]
        saldo[m["sku"]] = saldo.get(m["sku"], 0) + d
        resultante.append(saldo[m["sku"]])
        assert saldo[m["sku"]] >= 0, f"existencias negativas en la semilla: {m['sku']}"

    pid = {}
    for p in datos["productos"]:
        o = Producto(sku=p["sku"], nombre=p["nombre"], categoria_id=cat[p["categoriaId"]], unidad_id=uni[p["unidadId"]],
                     costo_unitario=p["costo"], existencias=saldo.get(p["sku"], 0), nivel_minimo=p["nivelMinimo"], activo=True)
        db.add(o); db.flush(); pid[p["sku"]] = o.id
        db.add(ProductoProveedor(producto_id=o.id, proveedor_id=prov[p["proveedorId"]], tiempo_entrega_dias=p["tiempoEntrega"], es_principal=True,
                                 cantidad_minima_pedido=p.get("minimoPedido", 1), multiplo_pedido=p.get("multiploPedido", 1)))
        db.add(ParametroReposicion(producto_id=o.id, cobertura_objetivo_dias=p["cobertura"], nivel_servicio=p["nivelServicio"]))

    for m, r in zip(datos["movimientos"], resultante):
        db.add(MovimientoInventario(producto_id=pid[m["sku"]], proveedor_id=prov.get(m["proveedorId"]), tipo=m["tipo"], cantidad=m["cantidad"],
                                    fecha=mover(m["fecha"]), motivo=m["motivo"], usuario_nombre=m["usuario"], existencias_resultantes=r))
    inicio = hoy() - timedelta(days=datos["dias"] - 1)
    for sku, serie in datos["ventas"].items():
        for i, cant in enumerate(serie):
            db.add(VentaHistorica(producto_id=pid[sku], fecha=inicio + timedelta(days=i), cantidad=cant))
    for p in datos["pedidos"]:
        db.add(PedidoReposicion(producto_id=pid[p["sku"]], proveedor_id=prov[p["proveedorId"]], cantidad=p["cantidad"],
                                fecha_pedido=mover(p["fechaPedido"]), fecha_esperada=mover(p["fechaEsperada"]), estado=p["estado"]))
    db.commit()
    # marcar los días en que cada producto terminó agotado
    from .importacion import marcar_censuradas
    marcar_censuradas(db, set(pid.values()))
    db.commit()
    return True
