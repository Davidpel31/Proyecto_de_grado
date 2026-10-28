from .conftest import existencias


def test_login_correcto_devuelve_rol(cliente):
    r = cliente.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200 and r.json()["rol"] == "admin" and r.json()["token"]


def test_login_incorrecto_no_revela_cual_fallo(cliente):
    a = cliente.post("/api/auth/login", json={"username": "admin", "password": "mala"})
    b = cliente.post("/api/auth/login", json={"username": "noexiste", "password": "x"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]


def test_sin_token_no_se_puede_consultar(cliente):
    assert cliente.get("/api/estado").status_code == 401
    assert cliente.post("/api/movimientos", json={}).status_code in (401, 422)


def test_token_invalido_se_rechaza(cliente):
    assert cliente.get("/api/estado", headers={"Authorization": "Bearer inventado"}).status_code == 401


def test_operativo_no_puede_administrar(cliente, operativo, catalogo):
    r = cliente.post("/api/productos", headers=operativo, json={"sku": "OP-1", "nombre": "x", "categoriaId": catalogo["categoriaId"], "unidadId": catalogo["unidadId"],
                                                              "costo": 1, "proveedorId": catalogo["proveedorId"], "tiempoEntrega": 3, "nivelMinimo": 1, "cobertura": 7})
    assert r.status_code == 403
    assert cliente.post("/api/importaciones/ventas", headers=operativo, json={"archivo": "a.csv", "contenido": "sku,fecha,cantidad"}).status_code == 403


def test_operativo_no_registra_ajustes(cliente, operativo, producto):
    sku = producto(stock=10)
    r = cliente.post("/api/movimientos", headers=operativo, json={"sku": sku, "tipo": "ajuste", "cantidad": -1, "fecha": "2026-10-27", "motivo": "x"})
    assert r.status_code == 403


def test_operativo_no_recibe_el_historial_de_ventas(cliente, admin, operativo):
    assert cliente.get("/api/estado", headers=operativo).json()["ventas"] == {}
    assert "ventas" in cliente.get("/api/estado", headers=admin).json()


def test_la_contrasena_no_se_guarda_en_texto_plano():
    from app.db import SessionLocal
    from app.models import Usuario
    with SessionLocal() as db:
        for u in db.query(Usuario).all():
            assert "admin123" not in u.password_hash and u.password_hash.startswith("scrypt$")
