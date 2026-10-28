from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Categoria, ParametroReposicion, Producto, ProductoProveedor, Proveedor, UnidadMedida, Usuario)
from ..schemas import CategoriaIn, ProductoEdicion, ProductoIn, ProveedorIn, UnidadIn
from ..security import solo_admin

router = APIRouter(prefix="/api", tags=["catálogo"])


@router.post("/categorias", status_code=201)
def crear_categoria(d: CategoriaIn, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    if db.scalar(select(Categoria).where(Categoria.nombre.ilike(d.nombre.strip()))):
        raise HTTPException(409, "Esa categoría ya existe.")
    c = Categoria(nombre=d.nombre.strip()); db.add(c); db.commit()
    return {"id": c.id, "nombre": c.nombre}


@router.post("/unidades", status_code=201)
def crear_unidad(d: UnidadIn, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    if db.scalar(select(UnidadMedida).where(UnidadMedida.abreviatura.ilike(d.abrev.strip()))):
        raise HTTPException(409, "Esa abreviatura ya existe.")
    u = UnidadMedida(nombre=d.nombre.strip(), abreviatura=d.abrev.strip()); db.add(u); db.commit()
    return {"id": u.id, "nombre": u.nombre, "abrev": u.abreviatura}


@router.post("/proveedores", status_code=201)
def crear_proveedor(d: ProveedorIn, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    p = Proveedor(nombre=d.nombre.strip(), contacto=d.contacto.strip(), tiempo_entrega_dias=d.tiempo_entrega)
    db.add(p); db.commit()
    return {"id": p.id}


@router.post("/productos", status_code=201)
def crear_producto(d: ProductoIn, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    sku = d.sku.strip().upper()
    if db.scalar(select(Producto).where(Producto.sku == sku)):
        raise HTTPException(409, "Ya existe un producto con ese código.")
    for modelo, valor, nombre in ((Categoria, d.categoria_id, "categoría"), (UnidadMedida, d.unidad_id, "unidad"), (Proveedor, d.proveedor_id, "proveedor")):
        if db.get(modelo, valor) is None:
            raise HTTPException(422, f"La {nombre} indicada no existe." if nombre != "proveedor" else "El proveedor indicado no existe.")
    p = Producto(sku=sku, nombre=d.nombre.strip(), categoria_id=d.categoria_id, unidad_id=d.unidad_id, costo_unitario=d.costo,
                 existencias=0, nivel_minimo=d.nivel_minimo)
    db.add(p)
    db.flush()
    db.add(ProductoProveedor(producto_id=p.id, proveedor_id=d.proveedor_id, tiempo_entrega_dias=d.tiempo_entrega, es_principal=True,
                             cantidad_minima_pedido=d.minimo_pedido, multiplo_pedido=d.multiplo_pedido))
    db.add(ParametroReposicion(producto_id=p.id, cobertura_objetivo_dias=d.cobertura, nivel_servicio=d.nivel_servicio))
    db.commit()
    return {"sku": p.sku}


@router.put("/productos/{sku}")
def editar_producto(sku: str, d: ProductoEdicion, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    p = db.scalar(select(Producto).where(Producto.sku == sku.upper()))
    if p is None:
        raise HTTPException(404, "No existe ese producto.")
    c = d.model_dump(exclude_unset=True)
    if "nombre" in c: p.nombre = c["nombre"].strip()
    if "categoria_id" in c: p.categoria_id = c["categoria_id"]
    if "unidad_id" in c: p.unidad_id = c["unidad_id"]
    if "costo" in c: p.costo_unitario = c["costo"]
    if "nivel_minimo" in c: p.nivel_minimo = c["nivel_minimo"]
    if "activo" in c: p.activo = c["activo"]
    ab = p.abastecimiento
    if ab is None and ("proveedor_id" in c):
        ab = ProductoProveedor(producto_id=p.id, proveedor_id=c["proveedor_id"], tiempo_entrega_dias=c.get("tiempo_entrega", 5), es_principal=True)
        db.add(ab)
    if ab is not None:
        if "proveedor_id" in c and c["proveedor_id"] != ab.proveedor_id:
            db.delete(ab); db.flush()
            ab = ProductoProveedor(producto_id=p.id, proveedor_id=c["proveedor_id"], tiempo_entrega_dias=c.get("tiempo_entrega", ab.tiempo_entrega_dias),
                                   es_principal=True, cantidad_minima_pedido=c.get("minimo_pedido", ab.cantidad_minima_pedido), multiplo_pedido=c.get("multiplo_pedido", ab.multiplo_pedido))
            db.add(ab)
        else:
            if "tiempo_entrega" in c: ab.tiempo_entrega_dias = c["tiempo_entrega"]
            if "minimo_pedido" in c: ab.cantidad_minima_pedido = c["minimo_pedido"]
            if "multiplo_pedido" in c: ab.multiplo_pedido = c["multiplo_pedido"]
    par = p.parametros
    if par is None:
        par = ParametroReposicion(producto_id=p.id); db.add(par)
    if "cobertura" in c: par.cobertura_objetivo_dias = c["cobertura"]
    if "nivel_servicio" in c: par.nivel_servicio = c["nivel_servicio"]
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(422, "Los datos no cumplen las restricciones del modelo.")
    return {"sku": p.sku}
