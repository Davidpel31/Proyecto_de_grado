"""Autenticación (JWT) y roles. Las contraseñas se guardan con scrypt + sal, nunca en texto plano."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Usuario

_esquema = HTTPBearer(auto_error=False)


def hash_password(clave: str) -> str:
    sal = os.urandom(16)
    h = hashlib.scrypt(clave.encode(), salt=sal, n=2 ** 14, r=8, p=1, dklen=32)
    return f"scrypt${sal.hex()}${h.hex()}"


def verificar_password(clave: str, almacenado: str) -> bool:
    try:
        _, sal, h = almacenado.split("$")
        calculado = hashlib.scrypt(clave.encode(), salt=bytes.fromhex(sal), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calculado.hex(), h)
    except Exception:
        return False


def crear_token(usuario: Usuario) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.TOKEN_MINUTOS)
    return jwt.encode({"sub": str(usuario.id), "rol": usuario.rol, "exp": exp}, settings.SECRET_KEY, algorithm="HS256")


def usuario_actual(cred: HTTPAuthorizationCredentials | None = Depends(_esquema), db: Session = Depends(get_db)) -> Usuario:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Debes iniciar sesión.")
    try:
        datos = jwt.decode(cred.credentials, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La sesión expiró o no es válida. Inicia sesión de nuevo.")
    usuario = db.get(Usuario, int(datos["sub"]))
    if not usuario or not usuario.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no válido.")
    return usuario


def solo_admin(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    if usuario.rol != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta acción es solo para el administrador.")
    return usuario
