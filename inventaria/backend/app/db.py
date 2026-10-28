"""Conexión a la base de datos (SQLAlchemy 2)."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def crear_motor(url: str):
    if url.startswith("sqlite"):
        motor = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(motor, "connect")
        def _al_conectar(conexion, _):
            # Recomendado por SQLAlchemy para SQLite: el control de transacciones lo hace el motor.
            conexion.isolation_level = None
            conexion.execute("PRAGMA foreign_keys=ON")
            conexion.execute("PRAGMA journal_mode=WAL")
            conexion.execute("PRAGMA busy_timeout=30000")

        @event.listens_for(motor, "begin")
        def _al_iniciar(conexion):
            # Cada transacción toma el bloqueo de escritura desde el inicio: las operaciones
            # de inventario quedan en fila y nunca se pisan entre sí.
            conexion.exec_driver_sql("BEGIN IMMEDIATE")

        return motor
    return create_engine(url, pool_pre_ping=True)


engine = crear_motor(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
