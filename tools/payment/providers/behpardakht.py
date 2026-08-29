from .base import NotConfiguredProvider


class BehpardakhtProvider(NotConfiguredProvider):
    id = "behpardakht"
    name = "به‌پرداخت"
    configured = False

    def __init__(self):
        super().__init__("behpardakht", self.name)
