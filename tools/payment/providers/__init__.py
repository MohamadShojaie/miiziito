from .base import PaymentProvider, NotConfiguredProvider
from .generic import GenericNetworkProvider
from .simulator import SimulatorProvider
from .radian import RadianProvider
from .behpardakht import BehpardakhtProvider
from .saman import SamanProvider
from .irankish import IrankishProvider
from .pasargad import PasargadProvider

PROVIDERS = {
    "simulator": SimulatorProvider(),
    "generic": GenericNetworkProvider(),
    "radian": RadianProvider(),
    "behpardakht": BehpardakhtProvider(),
    "saman": SamanProvider(),
    "irankish": IrankishProvider(),
    "pasargad": PasargadProvider(),
}


def get_provider(provider_id: str) -> PaymentProvider:
    key = str(provider_id or "generic").strip().lower()
    return PROVIDERS.get(key) or NotConfiguredProvider(key, key)


__all__ = [
    "PROVIDERS",
    "PaymentProvider",
    "get_provider",
]
