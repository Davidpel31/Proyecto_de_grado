"""InventarIA · API (FastAPI).

Ejecutar:  uvicorn app.main:app --reload     (desde la carpeta backend)
Documentación interactiva de la API:  http://localhost:8000/docs
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, SessionLocal, engine
from .routers import auth, catalogo, inventario
from .services.errores import ErrorNegocio
from .services.seed import sembrar_demo, sembrar_usuarios


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    Base.metadata.create_all(engine)   # en el Avance 5 se reemplaza por migraciones con Alembic
    with SessionLocal() as db:
        sembrar_usuarios(db)
        if settings.SEMBRAR_DEMO:
            sembrar_demo(db)
    yield


app = FastAPI(title="InventarIA API", version="0.4.0", lifespan=ciclo_de_vida,
              description="Inventario con pronóstico de demanda para PYMEs. Avance 4: flujo de inventario de punta a punta.")


@app.exception_handler(ErrorNegocio)
async def manejar_error_negocio(_: Request, e: ErrorNegocio):
    return JSONResponse(status_code=e.codigo, content={"detail": e.mensaje})


@app.get("/api/salud", tags=["sistema"])
def salud():
    return {"estado": "ok", "version": app.version}


app.include_router(auth.router)
app.include_router(catalogo.router)
app.include_router(inventario.router)

# El frontend (HTML/CSS/JS) lo sirve la misma aplicación: así no hace falta configurar CORS.
FRONT = Path(__file__).resolve().parents[2] / "frontend"
if FRONT.exists():
    app.mount("/", StaticFiles(directory=FRONT, html=True), name="frontend")
