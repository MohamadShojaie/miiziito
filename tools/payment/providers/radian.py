"""Radian adapter stub — implement only after official integration docs/SDK."""

from .base import NotConfiguredProvider


class RadianProvider(NotConfiguredProvider):
    id = "radian"
    name = "رادین (Radian)"
    configured = False

    def __init__(self):
        super().__init__("radian", self.name)
        # TODO when official docs available:
        # - Terminal model / PSP
        # - Integration method (LAN/USB/SDK)
        # - Auth, sale, inquiry, cancel, reversal commands
        # - Never invent ports or proprietary frames
