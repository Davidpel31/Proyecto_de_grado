class ErrorNegocio(Exception):
    """Regla de negocio incumplida. `codigo` es el código HTTP con el que se responde."""

    def __init__(self, mensaje: str, codigo: int = 409):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo
