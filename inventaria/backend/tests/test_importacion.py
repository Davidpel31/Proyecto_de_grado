from datetime import date, timedelta

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Producto, VentaHistorica

ayer = (date(2026, 10, 27) - timedelta(days=1)).isoformat()
hace2 = (date(2026, 10, 27) - timedelta(days=2)).isoformat()


def importar(cliente, h, contenido, confirmar=False, archivo="v.csv"):
    return cliente.post("/api/importaciones/ventas", headers=h, json={"archivo": archivo, "contenido": contenido, "confirmar": confirmar})


def test_validacion_detecta_cada_tipo_de_error(cliente, admin, producto):
    sku = producto(stock=50)
    csv = "\n".join(["sku,fecha,cantidad", f"{sku},{ayer},5", f"XXX-9,{ayer},5", f"{sku},31/02/2026,4", f"{sku},{hace2},-3", f"{sku},{ayer},7", f"{sku},2026-12-01,2", f"{sku},{hace2},abc"])
    r = importar(cliente, admin, csv)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 7 and d["validas"] == 1 and len(d["errores"]) == 6 and d["aplicada"] is False
    texto = " | ".join(e["msg"] for e in d["errores"])
    for esperado in ("no existe en el catálogo", "no es válida", "debe ser un número entero", "duplicado en el archivo", "posterior a hoy"):
        assert esperado in texto


def test_faltan_columnas_y_archivo_vacio(cliente, admin):
    assert importar(cliente, admin, "sku,cantidad\nA,1").status_code == 422
    assert importar(cliente, admin, "").status_code == 422


def test_aceptar_punto_y_coma_y_fechas_dia_mes_anio(cliente, admin, producto):
    sku = producto(stock=50)
    d = importar(cliente, admin, f"SKU;Fecha;Cantidad\n{sku};26/10/2026;4").json()
    assert d["validas"] == 1 and not d["errores"]


def test_confirmar_guarda_y_reimportar_reemplaza_sin_duplicar(cliente, admin, producto):
    sku = producto(stock=50)
    r = importar(cliente, admin, f"sku,fecha,cantidad\n{sku},{ayer},5", confirmar=True)
    assert r.status_code == 200 and r.json()["aplicada"] is True
    r2 = importar(cliente, admin, f"sku,fecha,cantidad\n{sku},{ayer},9", confirmar=True)          # otro archivo, mismo producto y día
    assert r2.status_code == 200
    with SessionLocal() as db:
        filas = db.scalars(select(VentaHistorica).join(Producto, Producto.id == VentaHistorica.producto_id).where(Producto.sku == sku)).all()
        assert len(filas) == 1 and filas[0].cantidad == 9              # una sola fila: reemplazó


def test_el_mismo_archivo_no_se_importa_dos_veces(cliente, admin, producto):
    sku = producto(stock=50)
    csv = f"sku,fecha,cantidad\n{sku},{hace2},3"
    assert importar(cliente, admin, csv, confirmar=True).status_code == 200
    assert importar(cliente, admin, csv, confirmar=False).json()["archivoRepetido"] is True
    assert importar(cliente, admin, csv, confirmar=True).status_code == 409


def test_sin_filas_validas_no_se_importa(cliente, admin):
    assert importar(cliente, admin, f"sku,fecha,cantidad\nNOEXISTE,{ayer},1", confirmar=True).status_code == 422


def test_dia_con_existencias_en_cero_queda_marcado_como_demanda_censurada(cliente, admin, operativo, producto):
    """Ventas registradas ≠ demanda: si el producto terminó agotado ese día, el dato queda marcado."""
    sku = producto(stock=0)
    cliente.post("/api/movimientos", headers=admin, json={"sku": sku, "tipo": "entrada", "cantidad": 10, "fecha": hace2, "motivo": "Compra"})
    cliente.post("/api/movimientos", headers=operativo, json={"sku": sku, "tipo": "salida", "cantidad": 10, "fecha": ayer, "motivo": "Venta"})   # se agota ayer
    cliente.post("/api/movimientos", headers=admin, json={"sku": sku, "tipo": "entrada", "cantidad": 20, "fecha": "2026-10-27", "motivo": "Compra"})
    csv = f"sku,fecha,cantidad\n{sku},{hace2},4\n{sku},{ayer},10\n{sku},2026-10-27,0"
    r = importar(cliente, admin, csv, confirmar=True).json()
    with SessionLocal() as db:
        filas = {v.fecha.isoformat(): v.demanda_censurada for v in db.scalars(select(VentaHistorica).join(Producto, Producto.id == VentaHistorica.producto_id).where(Producto.sku == sku))}
    assert filas[ayer] is True            # terminó el día con 0 existencias: censurado
    assert filas[hace2] is False and filas["2026-10-27"] is False
    assert r["censuradas"] == 1
