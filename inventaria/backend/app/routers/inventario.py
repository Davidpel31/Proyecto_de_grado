from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import MovimientoInventario, Producto, Usuario
from ..schemas import ImportacionIn, MovimientoIn, PedidoIn
from ..security import solo_admin, usuario_actual
from ..services import estado as estado_svc
from ..services import importacion as importacion_svc
from ..services import movimientos as mov_svc

router = APIRouter(prefix="/api", tags=["inventario"])


@router.get("/estado")
def estado(db: Session = Depends(get_db), u: Usuario = Depends(usuario_actual)):
    """Todo lo que necesita el frontend para pintarse. El operativo no recibe el historial de ventas."""
    return estado_svc.construir(db, con_ventas=(u.rol == "admin"))


@router.post("/movimientos", status_code=201)
def registrar(d: MovimientoIn, db: Session = Depends(get_db), u: Usuario = Depends(usuario_actual)):
    m = mov_svc.registrar_movimiento(db, u, sku=d.sku, tipo=d.tipo, cantidad=d.cantidad, fecha=d.fecha, motivo=d.motivo, proveedor_id=d.proveedor_id)
    return {"id": f"M{m.id:05d}", "existenciasResultantes": m.existencias_resultantes}


@router.get("/movimientos")
def listar(sku: str | None = None, tipo: str | None = None, desde: date | None = None, hasta: date | None = None,
           limite: int = Query(50, ge=1, le=500), desplazamiento: int = Query(0, ge=0),
           db: Session = Depends(get_db), _: Usuario = Depends(usuario_actual)):
    q = select(MovimientoInventario).join(Producto)
    if sku: q = q.where(Producto.sku == sku.upper())
    if tipo: q = q.where(MovimientoInventario.tipo == tipo)
    if desde: q = q.where(MovimientoInventario.fecha >= desde)
    if hasta: q = q.where(MovimientoInventario.fecha <= hasta)
    q = q.order_by(MovimientoInventario.fecha.desc(), MovimientoInventario.id.desc()).limit(limite).offset(desplazamiento)
    return [{"id": f"M{m.id:05d}", "sku": m.producto.sku, "tipo": m.tipo, "cantidad": m.cantidad, "fecha": m.fecha.isoformat(), "motivo": m.motivo,
             "usuario": m.usuario_nombre, "existenciasResultantes": m.existencias_resultantes} for m in db.scalars(q)]


@router.post("/pedidos", status_code=201)
def crear_pedido(d: PedidoIn, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    p = mov_svc.crear_pedido(db, sku=d.sku, cantidad=d.cantidad, fecha_pedido=d.fecha_pedido, fecha_esperada=d.fecha_esperada)
    return {"id": f"P{p.id:04d}", "idNum": p.id, "fechaEsperada": p.fecha_esperada.isoformat()}


@router.post("/pedidos/{pedido_id}/recibir")
def recibir(pedido_id: int, db: Session = Depends(get_db), u: Usuario = Depends(usuario_actual)):
    p = mov_svc.recibir_pedido(db, u, pedido_id)
    return {"id": f"P{p.id:04d}", "estado": p.estado, "movimientoId": p.movimiento_id}


@router.post("/pedidos/{pedido_id}/cancelar")
def cancelar(pedido_id: int, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    p = mov_svc.cancelar_pedido(db, pedido_id)
    return {"id": f"P{p.id:04d}", "estado": p.estado}


@router.post("/importaciones/ventas")
def importar_ventas(d: ImportacionIn, db: Session = Depends(get_db), u: Usuario = Depends(solo_admin)):
    return importacion_svc.importar(db, u, d.archivo, d.contenido, d.confirmar)
