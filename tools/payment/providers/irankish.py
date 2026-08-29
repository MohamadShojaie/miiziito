from .base import NotConfiguredProvider


class IrankishProvider(NotConfiguredProvider):
    id = "irankish"
    name = "ایران‌کیش"
    configured = False

    def __init__(self):
        super().__init__("irankish", self.name)
