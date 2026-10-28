"""Reglas de negocio del inventario.

La regla central: las existencias NUNCA quedan negativas ni se pierden movimientos, aunque lleguen
varias ventas al mismo tiempo. Se logra con una actualización atómica y condicionada:

    UPDATE producto SET existencias = existencias - :q
    WHERE id = :id AND existencias >= :q
    RETURNING existencias

Si la condición no se cumple, no se actualiza ninguna fila y la operación se rechaza. El movimiento
se guarda en la misma transacción, y una restricción CHECK de la base de datos actúa como última defensa.
"""
from datetime import date, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..fechas import hoy
from ..models import MovimientoInventario, PedidoReposicion, Producto, ProductoProveedor, Usuario
from .errores import ErrorNegocio

MAX_DIAS_ATRAS = 365


def _producto(db: Session, sku: str) -> Producto:
    p = db.scalar(select(Producto).where(Producto.sku == sku.strip().upper()))
    if p is None:
        raise ErrorNegocio(f"No existe un producto con el código «{sku}».", 404)
    if not p.activo:
        raise ErrorNegocio(f"El producto «{p.nombre}» está desactivado.", 409)
    return p


def _validar_fecha(f: date) -> None:
    if f > hoy():
        raise ErrorNegocio("La fecha del movimiento no puede ser futura.", 422)
    if f < hoy() - timedelta(days=MAX_DIAS_ATRAS):
        raise ErrorNegocio(f"La fecha del movimiento no puede tener más de {MAX_DIAS_ATRAS} días de antigüedad.", 422)


def registrar_movimiento(db: Session, usuario: Usuario, *, sku: str, tipo: str, cantidad: int, fecha: date,
                         motivo: str = "", proveedor_id: int | None = None) -> MovimientoInventario:
    if tipo == "ajuste" and usuario.rol != "admin":
        raise ErrorNegocio("Los ajustes de inventario los registra el administrador.", 403)
    if tipo in ("entrada", "salida") and cantidad <= 0:
        raise ErrorNegocio("La cantidad debe ser un número entero mayor que cero.", 422)
    if tipo == "ajuste" and cantidad == 0:
        raise ErrorNegocio("El ajuste no puede ser de cero unidades.", 422)
    if tipo == "ajuste" and not motivo.strip():
        raise ErrorNegocio("Escribe el motivo del ajuste para dejar rastro.", 422)
    _validar_fecha(fecha)
    prod = _producto(db, sku)

    delta = -cantidad if tipo == "salida" else cantidad
    stmt = update(Producto).where(Producto.id == prod.id).values(existencias=Producto.existencias + delta)
    if delta < 0:
        stmt = stmt.where(Producto.existencias >= -delta)   # la condición que evita existencias negativas
    nuevas = db.execute(stmt.returning(Producto.existencias).execution_options(synchronize_session=False)).scalar_one_or_none()
    if nuevas is None:
        db.rollback()
        actuales = db.scalar(select(Producto.existencias).where(Producto.id == prod.id))
        accion = "disminuir" if tipo == "ajuste" else "sacar"
        raise ErrorNegocio(f"Solo hay {actuales} en existencias; no se pueden {accion} {-delta}. "
                           "Reduce la cantidad o registra un ajuste.", 409)

    mov = MovimientoInventario(producto_id=prod.id, usuario_id=usuario.id, usuario_nombre=usuario.nombre,
                               proveedor_id=proveedor_id if tipo == "entrada" else None, tipo=tipo,
                               cantidad=cantidad if tipo != "ajuste" else cantidad, fecha=fecha,
                               motivo=motivo.strip() or ("Entrada de mercancía" if tipo == "entrada" else "Salida de inventario"),
                               existencias_resultantes=nuevas)
    db.add(mov)
    db.commit()
    return mov


def crear_pedido(db: Session, *, sku: str, cantidad: int, fecha_pedido: date | None, fecha_esperada: date | None) -> PedidoReposicion:
    prod = _producto(db, sku)
    ab = db.scalar(select(ProductoProveedor).where(ProductoProveedor.producto_id == prod.id, ProductoProveedor.es_principal))
    if ab is None:
        raise ErrorNegocio("El producto no tiene un proveedor principal asignado.", 409)
    if cantidad < ab.cantidad_minima_pedido:
        raise ErrorNegocio(f"El proveedor exige un pedido mínimo de {ab.cantidad_minima_pedido}.", 422)
    if cantidad % ab.multiplo_pedido:
        raise ErrorNegocio(f"El proveedor vende en múltiplos de {ab.multiplo_pedido}.", 422)
    fp = fecha_pedido or hoy()
    fe = fecha_esperada or fp + timedelta(days=ab.tiempo_entrega_dias)
    if fe < fp:
        raise ErrorNegocio("La fecha esperada no puede ser anterior a la fecha del pedido.", 422)
    ped = PedidoReposicion(producto_id=prod.id, proveedor_id=ab.proveedor_id, cantidad=cantidad, fecha_pedido=fp, fecha_esperada=fe)
    db.add(ped)
    db.commit()
    return ped


def recibir_pedido(db: Session, usuario: Usuario, pedido_id: int) -> PedidoReposicion:
    # Se "reclama" el pedido con una actualización condicionada: si dos personas lo reciben a la vez,
    # solo una lo consigue y la entrada de inventario no se duplica.
    reclamado = db.execute(update(PedidoReposicion).where(PedidoReposicion.id == pedido_id, PedidoReposicion.estado == "pendiente")
                           .values(estado="recibido").returning(PedidoReposicion.id).execution_options(synchronize_session=False)).scalar_one_or_none()
    if reclamado is None:
        db.rollback()
        if db.get(PedidoReposicion, pedido_id) is None:
            raise ErrorNegocio("No existe ese pedido.", 404)
        raise ErrorNegocio("Ese pedido ya fue recibido o cancelado.", 409)
    ped = db.get(PedidoReposicion, pedido_id)
    prod = db.get(Producto, ped.producto_id)
    nuevas = db.execute(update(Producto).where(Producto.id == prod.id).values(existencias=Producto.existencias + ped.cantidad)
                        .returning(Producto.existencias).execution_options(synchronize_session=False)).scalar_one()
    mov = MovimientoInventario(producto_id=prod.id, usuario_id=usuario.id, usuario_nombre=usuario.nombre, proveedor_id=ped.proveedor_id,
                               tipo="entrada", cantidad=ped.cantidad, fecha=hoy(), motivo=f"Recepción del pedido P{ped.id:04d}",
                               existencias_resultantes=nuevas)
    db.add(mov)
    db.flush()
    ped.movimiento_id = mov.id
    db.commit()
    return ped


def cancelar_pedido(db: Session, pedido_id: int) -> PedidoReposicion:
    ok = db.execute(update(PedidoReposicion).where(PedidoReposicion.id == pedido_id, PedidoReposicion.estado == "pendiente")
                    .values(estado="cancelado").returning(PedidoReposicion.id).execution_options(synchronize_session=False)).scalar_one_or_none()
    if ok is None:
        db.rollback()
        raise ErrorNegocio("Solo se pueden cancelar pedidos pendientes.", 409)
    db.commit()
    return db.get(PedidoReposicion, pedido_id)
