from .conftest import existencias


def test_pedido_respeta_minimo_y_multiplo_del_proveedor(cliente, admin, producto):
    sku = producto(minimo_pedido=48, multiplo=24)
    assert cliente.post("/api/pedidos", headers=admin, json={"sku": sku, "cantidad": 24}).status_code == 422     # bajo el mínimo
    assert cliente.post("/api/pedidos", headers=admin, json={"sku": sku, "cantidad": 60}).status_code == 422     # no es múltiplo
    r = cliente.post("/api/pedidos", headers=admin, json={"sku": sku, "cantidad": 72})
    assert r.status_code == 201 and r.json()["fechaEsperada"] == "2026-10-31"           # hoy + 4 días de entrega


def test_recibir_un_pedido_genera_la_entrada(cliente, admin, operativo, producto):
    sku = producto(stock=5)
    pid = cliente.post("/api/pedidos", headers=admin, json={"sku": sku, "cantidad": 30}).json()["idNum"]
    assert existencias(cliente, admin, sku) == 5                    # pedir no cambia las existencias
    r = cliente.post(f"/api/pedidos/{pid}/recibir", headers=operativo)
    assert r.status_code == 200 and r.json()["estado"] == "recibido"
    assert existencias(cliente, admin, sku) == 35
    historial = cliente.get(f"/api/movimientos?sku={sku}&tipo=entrada", headers=admin).json()
    assert historial[0]["cantidad"] == 30 and "pedido" in historial[0]["motivo"].lower()
    assert cliente.post(f"/api/pedidos/{pid}/recibir", headers=operativo).status_code == 409   # no se recibe dos veces


def test_cancelar_pedido_pendiente(cliente, admin, producto):
    sku = producto()
    pid = cliente.post("/api/pedidos", headers=admin, json={"sku": sku, "cantidad": 10}).json()["idNum"]
    assert cliente.post(f"/api/pedidos/{pid}/cancelar", headers=admin).json()["estado"] == "cancelado"
    assert cliente.post(f"/api/pedidos/{pid}/recibir", headers=admin).status_code == 409
    assert existencias(cliente, admin, sku) == 0


def test_los_pedidos_pendientes_aparecen_en_el_estado(cliente, admin, producto):
    sku = producto()
    cliente.post("/api/pedidos", headers=admin, json={"sku": sku, "cantidad": 10})
    pend = [p for p in cliente.get("/api/estado", headers=admin).json()["pedidos"] if p["sku"] == sku]
    assert len(pend) == 1 and pend[0]["estado"] == "pendiente"
