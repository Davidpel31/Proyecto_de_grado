"""Arma el 'estado' que consume el frontend: catálogo, movimientos, ventas por día y pedidos."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..fechas import hoy
from ..models import (Categoria, MovimientoInventario, PedidoReposicion, Producto, Proveedor, UnidadMedida,
                      VentaHistorica)


def construir(db: Session, con_ventas: bool = True) -> dict:
    h = hoy()
    dias = settings.DIAS_VENTANA
    inicio = h - timedelta(days=dias - 1)
    fechas = [(inicio + timedelta(days=i)).isoformat() for i in range(dias)]
    indice = {f: i for i, f in enumerate(fechas)}

    productos = db.scalars(select(Producto).options(selectinload(Producto.abastecimiento), selectinload(Producto.parametros)).order_by(Producto.sku)).all()
    sku_por_id = {p.id: p.sku for p in productos}

    ventas: dict[str, list[int]] = {}
    if con_ventas:
        for p in productos:
            ventas[p.sku] = [0] * dias
        for pid, f, cant in db.execute(select(VentaHistorica.producto_id, VentaHistorica.fecha, VentaHistorica.cantidad)
                                       .where(VentaHistorica.fecha >= inicio)):
            i = indice.get(f.isoformat())
            if i is not None and pid in sku_por_id:
                ventas[sku_por_id[pid]][i] = cant

    return {
        "hoy": h.isoformat(), "inicio": inicio.isoformat(), "dias": dias,
        "categorias": [{"id": c.id, "nombre": c.nombre} for c in db.scalars(select(Categoria).order_by(Categoria.id))],
        "unidades": [{"id": u.id, "nombre": u.nombre, "abrev": u.abreviatura} for u in db.scalars(select(UnidadMedida).order_by(UnidadMedida.id))],
        "proveedores": [{"id": p.id, "nombre": p.nombre, "contacto": p.contacto, "tiempoEntrega": p.tiempo_entrega_dias, "activo": p.activo}
                        for p in db.scalars(select(Proveedor).order_by(Proveedor.id))],
        "productos": [{
            "sku": p.sku, "nombre": p.nombre, "categoriaId": p.categoria_id, "unidadId": p.unidad_id, "costo": p.costo_unitario,
            "activo": p.activo, "proveedorId": p.abastecimiento.proveedor_id if p.abastecimiento else None,
            "tiempoEntrega": p.abastecimiento.tiempo_entrega_dias if p.abastecimiento else 5,
            "nivelMinimo": p.nivel_minimo, "cobertura": p.parametros.cobertura_objetivo_dias if p.parametros else 14,
            "nivelServicio": p.parametros.nivel_servicio if p.parametros else 0.95,
            "minimoPedido": p.abastecimiento.cantidad_minima_pedido if p.abastecimiento else 1,
            "multiploPedido": p.abastecimiento.multiplo_pedido if p.abastecimiento else 1,
            "existencias": p.existencias} for p in productos],
        "movimientos": [{"id": f"M{m.id:05d}", "sku": sku_por_id.get(m.producto_id), "tipo": m.tipo, "cantidad": m.cantidad, "fecha": m.fecha.isoformat(),
                         "motivo": m.motivo, "proveedorId": m.proveedor_id, "usuario": m.usuario_nombre, "existenciasResultantes": m.existencias_resultantes}
                        for m in db.scalars(select(MovimientoInventario).order_by(MovimientoInventario.fecha, MovimientoInventario.id))],
        "ventas": ventas,
        "pedidos": [{"id": f"P{p.id:04d}", "idNum": p.id, "sku": sku_por_id.get(p.producto_id), "proveedorId": p.proveedor_id, "cantidad": p.cantidad,
                     "fechaPedido": p.fecha_pedido.isoformat(), "fechaEsperada": p.fecha_esperada.isoformat(), "estado": p.estado}
                    for p in db.scalars(select(PedidoReposicion).order_by(PedidoReposicion.id))],
    }
