from .base import NotConfiguredProvider


class SamanProvider(NotConfiguredProvider):
    id = "saman"
    name = "سامان"
    configured = False

    def __init__(self):
        super().__init__("saman", self.name)
