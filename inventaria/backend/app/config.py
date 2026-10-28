"""Configuración leída de variables de entorno (ver .env.example)."""
import os


class Settings:
    # SQLite para desarrollar sin instalar nada; PostgreSQL en docker-compose.
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "sqlite:///./inventaria.db")
    # En producción SIEMPRE se cambia. Este valor solo sirve para la demostración local.
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "cambia-esta-clave-en-produccion")
    TOKEN_MINUTOS: int = int(os.environ.get("TOKEN_MINUTOS", "480"))
    SEMBRAR_DEMO: bool = os.environ.get("SEMBRAR_DEMO", "1") == "1"
    DIAS_VENTANA: int = int(os.environ.get("DIAS_VENTANA", "240"))


settings = Settings()
