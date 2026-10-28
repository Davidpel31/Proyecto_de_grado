"""Ventas simultáneas: no se producen existencias negativas ni movimientos perdidos."""
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import MovimientoInventario, Producto, Usuario
from app.services import movimientos as svc
from app.services.errores import ErrorNegocio
from datetime import date
from sqlalchemy import select

from .conftest import existencias


def _usuario(db, username):
    return db.scalar(select(Usuario).where(Usuario.username == username))


def test_30_ventas_simultaneas_de_2_unidades_con_41_en_existencias(cliente, admin, producto):
    sku = producto(stock=41)
    hilos, barrera = 30, threading.Barrier(30)
    resultados = []

    def vender(_):
        with SessionLocal() as db:
            barrera.wait()                                     # todos disparan a la vez
            try:
                svc.registrar_movimiento(db, _usuario(db, "operativo"), sku=sku, tipo="salida", cantidad=2, fecha=date(2026, 10, 27), motivo="Venta")
                return "ok"
            except ErrorNegocio:
                return "rechazada"

    with ThreadPoolExecutor(hilos) as ex:
        resultados = list(ex.map(vender, range(hilos)))

    assert resultados.count("ok") == 20 and resultados.count("rechazada") == 10      # 41 // 2 = 20
    assert existencias(cliente, admin, sku) == 1
    with SessionLocal() as db:
        ventas = db.scalars(select(MovimientoInventario).join(Producto).where(Producto.sku == sku, MovimientoInventario.tipo == "salida")).all()
        assert len(ventas) == 20                                                     # ningún movimiento perdido
        assert sum(v.cantidad for v in ventas) == 40
        assert min(v.existencias_resultantes for v in ventas) >= 0
        assert sorted(v.existencias_resultantes for v in ventas) == list(range(1, 41, 2))   # cada venta vio un saldo distinto


def test_ventas_y_entradas_mezcladas_por_http(cliente, admin, operativo, producto):
    sku = producto(stock=10)
    cuerpo = lambda t, c: {"sku": sku, "tipo": t, "cantidad": c, "fecha": "2026-10-27", "motivo": "x"}
    tokens = {"admin": admin, "operativo": operativo}

    def operar(i):
        with TestClient(app) as c:
            tipo, h = ("entrada", tokens["operativo"]) if i % 3 == 0 else ("salida", tokens["operativo"])
            return c.post("/api/movimientos", headers=h, json=cuerpo(tipo, 3)).status_code

    with ThreadPoolExecutor(18) as ex:
        codigos = list(ex.map(operar, range(18)))

    assert set(codigos) <= {201, 409}
    final = existencias(cliente, admin, sku)
    movs = cliente.get(f"/api/movimientos?sku={sku}&limite=500", headers=admin).json()
    assert final >= 0 and final == sum(-m["cantidad"] if m["tipo"] == "salida" else m["cantidad"] for m in movs)


def test_recibir_el_mismo_pedido_a_la_vez_solo_cuenta_una_vez(cliente, admin, producto):
    sku = producto(stock=0)
    pid = cliente.post("/api/pedidos", headers=admin, json={"sku": sku, "cantidad": 50}).json()["idNum"]
    barrera = threading.Barrier(8)

    def recibir(_):
        with SessionLocal() as db:
            barrera.wait()
            try:
                svc.recibir_pedido(db, _usuario(db, "operativo"), pid)
                return "ok"
            except ErrorNegocio:
                return "rechazada"

    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(recibir, range(8)))
    assert res.count("ok") == 1 and res.count("rechazada") == 7
    assert existencias(cliente, admin, sku) == 50                  # la entrada no se duplicó
