import os
import tempfile

# La base de pruebas es un archivo temporal propio: nunca toca la base real.
_carpeta = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_carpeta}/prueba.db")
os.environ["SEMBRAR_DEMO"] = "0"
os.environ["HOY_FIJO"] = "2026-10-27"
os.environ["SECRET_KEY"] = "clave-de-pruebas"

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def cliente():
    with TestClient(app) as c:
        yield c


def _login(cliente, usuario, clave):
    r = cliente.post("/api/auth/login", json={"username": usuario, "password": clave})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture(scope="session")
def admin(cliente):
    return _login(cliente, "admin", "admin123")


@pytest.fixture(scope="session")
def operativo(cliente):
    return _login(cliente, "operativo", "operativo123")


@pytest.fixture(scope="session")
def catalogo(cliente, admin):
    c = cliente.post("/api/categorias", json={"nombre": "Pruebas"}, headers=admin).json()["id"]
    u = cliente.post("/api/unidades", json={"nombre": "Unidad de prueba", "abrev": "u-p"}, headers=admin).json()["id"]
    p = cliente.post("/api/proveedores", json={"nombre": "Proveedor de prueba", "contacto": "x", "tiempoEntrega": 4}, headers=admin).json()["id"]
    return {"categoriaId": c, "unidadId": u, "proveedorId": p}


_contador = itertools.count(1)


@pytest.fixture
def producto(cliente, admin, catalogo):
    """Crea un producto nuevo (código único) con las existencias que se pidan."""
    def _crear(stock=0, minimo_pedido=1, multiplo=1, sku=None):
        sku = sku or f"T-{next(_contador):04d}"
        r = cliente.post("/api/productos", headers=admin, json={
            "sku": sku, "nombre": f"Producto {sku}", "categoriaId": catalogo["categoriaId"], "unidadId": catalogo["unidadId"],
            "costo": 1000, "proveedorId": catalogo["proveedorId"], "tiempoEntrega": 4, "nivelMinimo": 5, "cobertura": 14,
            "minimoPedido": minimo_pedido, "multiploPedido": multiplo})
        assert r.status_code == 201, r.text
        if stock:
            m = cliente.post("/api/movimientos", headers=admin, json={"sku": sku, "tipo": "ajuste", "cantidad": stock,
                                                                       "fecha": "2026-10-27", "motivo": "Inventario inicial"})
            assert m.status_code == 201, m.text
        return sku
    return _crear


def existencias(cliente, headers, sku):
    e = cliente.get("/api/estado", headers=headers).json()
    return next(p["existencias"] for p in e["productos"] if p["sku"] == sku)
