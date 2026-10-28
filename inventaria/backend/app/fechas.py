"""La 'fecha de hoy' se puede fijar con HOY_FIJO=AAAA-MM-DD (útil para pruebas y demostraciones)."""
import os
from datetime import date


def hoy() -> date:
    fijo = os.environ.get("HOY_FIJO")
    return date.fromisoformat(fijo) if fijo else date.today()
