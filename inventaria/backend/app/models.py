"""Modelo de datos (ver sección 12.1 del documento).

Bloques: catálogo e inventario, ventas históricas importadas, pedidos a proveedores y
resultados analíticos (pronóstico, evaluación, alertas, recomendaciones: se llenan en el Avance 5).
"""
from datetime import date, datetime

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String,
                        UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Usuario(Base):
    __tablename__ = "usuario"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    username: Mapped[str] = mapped_column(String(40), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    rol: Mapped[str] = mapped_column(String(12))  # 'admin' | 'operativo'
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (CheckConstraint("rol IN ('admin','operativo')", name="ck_usuario_rol"),)


class Categoria(Base):
    __tablename__ = "categoria"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(60), unique=True)


class UnidadMedida(Base):
    __tablename__ = "unidad_medida"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(40))
    abreviatura: Mapped[str] = mapped_column(String(8), unique=True)


class Proveedor(Base):
    __tablename__ = "proveedor"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    contacto: Mapped[str] = mapped_column(String(80), default="")
    tiempo_entrega_dias: Mapped[int] = mapped_column(Integer, default=5)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Producto(Base):
    __tablename__ = "producto"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(16), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    categoria_id: Mapped[int] = mapped_column(ForeignKey("categoria.id"))
    unidad_id: Mapped[int] = mapped_column(ForeignKey("unidad_medida.id"))
    costo_unitario: Mapped[float] = mapped_column(Float, default=0)
    # Dato derivado de los movimientos; se actualiza SIEMPRE dentro de la misma transacción que
    # registra el movimiento. La restricción impide que quede negativo aunque falle la aplicación.
    existencias: Mapped[int] = mapped_column(Integer, default=0)
    nivel_minimo: Mapped[int] = mapped_column(Integer, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (CheckConstraint("existencias >= 0", name="ck_producto_existencias_no_negativas"),
                      CheckConstraint("nivel_minimo >= 0", name="ck_producto_nivel_minimo"))
    categoria: Mapped[Categoria] = relationship()
    unidad: Mapped[UnidadMedida] = relationship()
    abastecimiento: Mapped["ProductoProveedor | None"] = relationship(back_populates="producto", uselist=False)
    parametros: Mapped["ParametroReposicion | None"] = relationship(back_populates="producto", uselist=False)


class ProductoProveedor(Base):
    """Quién surte el producto y bajo qué condiciones (tiempo de entrega, mínimo y múltiplo de pedido)."""
    __tablename__ = "producto_proveedor"
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), primary_key=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedor.id"), primary_key=True)
    tiempo_entrega_dias: Mapped[int] = mapped_column(Integer)
    es_principal: Mapped[bool] = mapped_column(Boolean, default=True)
    cantidad_minima_pedido: Mapped[int] = mapped_column(Integer, default=1)
    multiplo_pedido: Mapped[int] = mapped_column(Integer, default=1)
    producto: Mapped[Producto] = relationship(back_populates="abastecimiento")
    proveedor: Mapped[Proveedor] = relationship()
    __table_args__ = (CheckConstraint("cantidad_minima_pedido >= 1 AND multiplo_pedido >= 1", name="ck_pp_lote"),)


class ParametroReposicion(Base):
    __tablename__ = "parametro_reposicion"
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), primary_key=True)
    cobertura_objetivo_dias: Mapped[int] = mapped_column(Integer, default=14)
    nivel_servicio: Mapped[float] = mapped_column(Float, default=0.95)
    producto: Mapped[Producto] = relationship(back_populates="parametros")


class MovimientoInventario(Base):
    """Libro de movimientos: no se borra ni se edita; los errores se corrigen con un ajuste."""
    __tablename__ = "movimiento_inventario"
    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    proveedor_id: Mapped[int | None] = mapped_column(ForeignKey("proveedor.id"))
    tipo: Mapped[str] = mapped_column(String(10))  # entrada | salida | ajuste
    cantidad: Mapped[int] = mapped_column(Integer)  # entrada/salida: > 0; ajuste: con signo
    fecha: Mapped[date] = mapped_column(Date)
    motivo: Mapped[str] = mapped_column(String(120), default="")
    usuario_nombre: Mapped[str] = mapped_column(String(80), default="")
    existencias_resultantes: Mapped[int] = mapped_column(Integer)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (
        CheckConstraint("tipo IN ('entrada','salida','ajuste')", name="ck_mov_tipo"),
        CheckConstraint("(tipo = 'ajuste' AND cantidad <> 0) OR (tipo <> 'ajuste' AND cantidad > 0)", name="ck_mov_cantidad"),
        Index("ix_mov_producto_fecha", "producto_id", "fecha"),
    )
    producto: Mapped[Producto] = relationship()


class PedidoReposicion(Base):
    __tablename__ = "pedido_reposicion"
    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), index=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedor.id"))
    cantidad: Mapped[int] = mapped_column(Integer)
    fecha_pedido: Mapped[date] = mapped_column(Date)
    fecha_esperada: Mapped[date] = mapped_column(Date)
    estado: Mapped[str] = mapped_column(String(10), default="pendiente")  # pendiente | recibido | cancelado
    movimiento_id: Mapped[int | None] = mapped_column(ForeignKey("movimiento_inventario.id"))
    __table_args__ = (CheckConstraint("cantidad > 0", name="ck_pedido_cantidad"),
                      CheckConstraint("estado IN ('pendiente','recibido','cancelado')", name="ck_pedido_estado"))
    producto: Mapped[Producto] = relationship()


class ImportacionVentas(Base):
    __tablename__ = "importacion_ventas"
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    archivo: Mapped[str] = mapped_column(String(120))
    huella: Mapped[str] = mapped_column(String(64), index=True)  # SHA-256 del contenido: detecta archivos repetidos
    fecha_carga: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    filas_leidas: Mapped[int] = mapped_column(Integer, default=0)
    filas_validas: Mapped[int] = mapped_column(Integer, default=0)
    filas_con_error: Mapped[int] = mapped_column(Integer, default=0)
    estado: Mapped[str] = mapped_column(String(12), default="aplicada")


class VentaHistorica(Base):
    """Ventas por producto y día. Una sola fila por (producto, fecha): reimportar reemplaza, no duplica."""
    __tablename__ = "venta_historica"
    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"))
    importacion_id: Mapped[int | None] = mapped_column(ForeignKey("importacion_ventas.id"))
    fecha: Mapped[date] = mapped_column(Date)
    cantidad: Mapped[int] = mapped_column(Integer)
    # True si ese día el producto terminó agotado: lo vendido NO mide la demanda real (demanda censurada).
    demanda_censurada: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("producto_id", "fecha", name="uq_venta_producto_fecha"),
                      CheckConstraint("cantidad >= 0", name="ck_venta_cantidad"))


# ---- Resultados analíticos (se poblan en el Avance 5) ----
class Pronostico(Base):
    __tablename__ = "pronostico"
    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), index=True)
    tecnica: Mapped[str] = mapped_column(String(30))
    horizonte_dias: Mapped[int] = mapped_column(Integer)
    fecha_generacion: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    seleccionado: Mapped[bool] = mapped_column(Boolean, default=False)


class PronosticoDetalle(Base):
    __tablename__ = "pronostico_detalle"
    pronostico_id: Mapped[int] = mapped_column(ForeignKey("pronostico.id"), primary_key=True)
    fecha: Mapped[date] = mapped_column(Date, primary_key=True)
    valor_pronosticado: Mapped[float] = mapped_column(Float)
    limite_inferior: Mapped[float] = mapped_column(Float)
    limite_superior: Mapped[float] = mapped_column(Float)


class EvaluacionModelo(Base):
    __tablename__ = "evaluacion_modelo"
    id: Mapped[int] = mapped_column(primary_key=True)
    pronostico_id: Mapped[int] = mapped_column(ForeignKey("pronostico.id"), index=True)
    mae: Mapped[float] = mapped_column(Float)
    rmse: Mapped[float] = mapped_column(Float)
    wape: Mapped[float | None] = mapped_column(Float)
    mase: Mapped[float | None] = mapped_column(Float)
    ventanas: Mapped[int] = mapped_column(Integer, default=8)
    horizonte_dias: Mapped[int] = mapped_column(Integer, default=7)


class Alerta(Base):
    __tablename__ = "alerta"
    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(20))  # agotamiento | sobreinventario
    fecha_estimada: Mapped[date | None] = mapped_column(Date)
    estado: Mapped[str] = mapped_column(String(12), default="activa")
    mensaje: Mapped[str] = mapped_column(String(300), default="")


class RecomendacionReposicion(Base):
    __tablename__ = "recomendacion_reposicion"
    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), index=True)
    cantidad_sugerida: Mapped[int] = mapped_column(Integer)
    fecha_sugerida: Mapped[date | None] = mapped_column(Date)
    justificacion: Mapped[str] = mapped_column(String(500), default="")
    estado: Mapped[str] = mapped_column(String(12), default="vigente")
