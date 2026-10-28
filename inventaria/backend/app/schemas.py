"""Formatos de entrada de la API. Los nombres van en camelCase porque es el formato que usa el frontend."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LoginIn(Base):
    username: str
    password: str


class MovimientoIn(Base):
    sku: str
    tipo: Literal["entrada", "salida", "ajuste"]
    cantidad: int
    fecha: date
    motivo: str = Field(default="", max_length=120)
    proveedor_id: int | None = None


class ProductoIn(Base):
    sku: str = Field(min_length=2, max_length=16, pattern=r"^[A-Za-z0-9-]+$")
    nombre: str = Field(min_length=1, max_length=80)
    categoria_id: int
    unidad_id: int
    costo: float = Field(ge=0)
    proveedor_id: int
    tiempo_entrega: int = Field(ge=1, le=60)
    nivel_minimo: int = Field(ge=0)
    cobertura: int = Field(ge=1, le=90)
    nivel_servicio: float = 0.95
    minimo_pedido: int = Field(default=1, ge=1)
    multiplo_pedido: int = Field(default=1, ge=1)


class ProductoEdicion(Base):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    categoria_id: int | None = None
    unidad_id: int | None = None
    costo: float | None = Field(default=None, ge=0)
    proveedor_id: int | None = None
    tiempo_entrega: int | None = Field(default=None, ge=1, le=60)
    nivel_minimo: int | None = Field(default=None, ge=0)
    cobertura: int | None = Field(default=None, ge=1, le=90)
    nivel_servicio: float | None = None
    minimo_pedido: int | None = Field(default=None, ge=1)
    multiplo_pedido: int | None = Field(default=None, ge=1)
    activo: bool | None = None


class CategoriaIn(Base):
    nombre: str = Field(min_length=1, max_length=60)


class UnidadIn(Base):
    nombre: str = Field(min_length=1, max_length=40)
    abrev: str = Field(min_length=1, max_length=8)


class ProveedorIn(Base):
    nombre: str = Field(min_length=1, max_length=80)
    contacto: str = Field(default="", max_length=80)
    tiempo_entrega: int = Field(default=5, ge=1, le=60)


class PedidoIn(Base):
    sku: str
    cantidad: int = Field(gt=0)
    fecha_pedido: date | None = None
    fecha_esperada: date | None = None


class ImportacionIn(Base):
    archivo: str = Field(max_length=120)
    contenido: str
    confirmar: bool = False
