from .base import NotConfiguredProvider


class PasargadProvider(NotConfiguredProvider):
    id = "pasargad"
    name = "پاسارگاد"
    configured = False

    def __init__(self):
        super().__init__("pasargad", self.name)
