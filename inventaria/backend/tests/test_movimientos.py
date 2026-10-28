from .conftest import existencias


def mov(cliente, h, sku, tipo, cantidad, fecha="2026-10-27", motivo="", **extra):
    return cliente.post("/api/movimientos", headers=h, json={"sku": sku, "tipo": tipo, "cantidad": cantidad, "fecha": fecha, "motivo": motivo, **extra})


def test_entrada_aumenta_las_existencias(cliente, admin, producto):
    sku = producto(stock=10)
    r = mov(cliente, admin, sku, "entrada", 25, motivo="Compra")
    assert r.status_code == 201 and r.json()["existenciasResultantes"] == 35
    assert existencias(cliente, admin, sku) == 35


def test_salida_descuenta_las_existencias(cliente, operativo, admin, producto):
    sku = producto(stock=10)
    r = mov(cliente, operativo, sku, "salida", 4)
    assert r.status_code == 201 and r.json()["existenciasResultantes"] == 6
    assert existencias(cliente, admin, sku) == 6


def test_salida_mayor_a_las_existencias_se_rechaza_y_no_deja_rastro(cliente, operativo, admin, producto):
    sku = producto(stock=5)
    r = mov(cliente, operativo, sku, "salida", 6)
    assert r.status_code == 409 and "Solo hay 5" in r.json()["detail"]
    assert existencias(cliente, admin, sku) == 5
    historial = cliente.get(f"/api/movimientos?sku={sku}", headers=admin).json()
    assert [m["tipo"] for m in historial] == ["ajuste"]          # solo el inventario inicial


def test_se_puede_sacar_exactamente_todo(cliente, operativo, admin, producto):
    sku = producto(stock=7)
    assert mov(cliente, operativo, sku, "salida", 7).status_code == 201
    assert existencias(cliente, admin, sku) == 0
    assert mov(cliente, operativo, sku, "salida", 1).status_code == 409


def test_cantidad_cero_o_negativa_se_rechaza(cliente, admin, producto):
    sku = producto(stock=5)
    assert mov(cliente, admin, sku, "entrada", 0).status_code == 422
    assert mov(cliente, admin, sku, "salida", -3).status_code == 422
    assert mov(cliente, admin, sku, "ajuste", 0, motivo="x").status_code == 422


def test_el_ajuste_exige_motivo_y_puede_restar(cliente, admin, producto):
    sku = producto(stock=10)
    assert mov(cliente, admin, sku, "ajuste", -2).status_code == 422
    r = mov(cliente, admin, sku, "ajuste", -2, motivo="Producto vencido")
    assert r.status_code == 201 and r.json()["existenciasResultantes"] == 8


def test_el_ajuste_negativo_tampoco_deja_existencias_negativas(cliente, admin, producto):
    sku = producto(stock=3)
    r = mov(cliente, admin, sku, "ajuste", -4, motivo="Conteo")
    assert r.status_code == 409 and existencias(cliente, admin, sku) == 3


def test_fecha_futura_o_muy_antigua_se_rechaza(cliente, admin, producto):
    sku = producto(stock=3)
    assert mov(cliente, admin, sku, "entrada", 1, fecha="2026-10-28").status_code == 422
    assert mov(cliente, admin, sku, "entrada", 1, fecha="2024-01-01").status_code == 422


def test_producto_inexistente_o_desactivado(cliente, admin, producto):
    assert mov(cliente, admin, "NO-EXISTE", "entrada", 1).status_code == 404
    sku = producto(stock=3)
    assert cliente.put(f"/api/productos/{sku}", headers=admin, json={"activo": False}).status_code == 200
    assert mov(cliente, admin, sku, "entrada", 1).status_code == 409


def test_historial_con_filtros_y_existencias_resultantes(cliente, admin, producto):
    sku = producto(stock=10)
    mov(cliente, admin, sku, "entrada", 5)
    mov(cliente, admin, sku, "salida", 3)
    todos = cliente.get(f"/api/movimientos?sku={sku}", headers=admin).json()
    assert [m["existenciasResultantes"] for m in todos] == [12, 15, 10]   # del más reciente al más antiguo
    solo_salidas = cliente.get(f"/api/movimientos?sku={sku}&tipo=salida", headers=admin).json()
    assert len(solo_salidas) == 1 and solo_salidas[0]["cantidad"] == 3


def test_las_existencias_siempre_igualan_la_suma_de_los_movimientos(cliente, admin, operativo, producto):
    sku = producto(stock=20)
    for tipo, c in [("entrada", 10), ("salida", 7), ("salida", 2), ("entrada", 4), ("salida", 25)]:
        mov(cliente, operativo, sku, tipo, c)
    movs = cliente.get(f"/api/movimientos?sku={sku}&limite=500", headers=admin).json()
    suma = sum(-m["cantidad"] if m["tipo"] == "salida" else m["cantidad"] for m in movs)
    assert suma == existencias(cliente, admin, sku) >= 0


def test_la_base_de_datos_misma_impide_existencias_negativas():
    """Última línea de defensa: aunque alguien se salte la aplicación, la base lo rechaza."""
    import pytest
    from sqlalchemy.exc import IntegrityError
    from app.db import SessionLocal
    from app.models import Producto
    with SessionLocal() as db:
        p = db.query(Producto).first()
        p.existencias = -1
        with pytest.raises(IntegrityError):
            db.commit()
