from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Usuario
from ..schemas import LoginIn
from ..security import crear_token, usuario_actual, verificar_password

router = APIRouter(prefix="/api/auth", tags=["autenticación"])


@router.post("/login")
def login(datos: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(Usuario).where(Usuario.username == datos.username.strip().lower()))
    # el mismo mensaje para usuario inexistente y clave incorrecta (no revela cuál falló)
    if not u or not u.activo or not verificar_password(datos.password, u.password_hash):
        raise HTTPException(401, "Usuario o contraseña incorrectos.")
    return {"token": crear_token(u), "rol": u.rol, "nombre": u.nombre, "username": u.username}


@router.get("/me")
def yo(u: Usuario = Depends(usuario_actual)):
    return {"nombre": u.nombre, "rol": u.rol, "username": u.username}
