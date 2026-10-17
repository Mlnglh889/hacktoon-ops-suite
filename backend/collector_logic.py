"""Pure normalization helpers for heterogeneous Substrate storage values."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

RAW_PER_POT = Decimal(10**14)
COMMISSION_DIVISOR = Decimal(10**7)


def _plain(value: Any) -> Any:
    if isinstance(value, dict) and '__enum__' in value:
        return value.get('value', 0)
    return value


def normalize_commission(prefs: Any) -> str:
    if not isinstance(prefs, dict):
        return '0'
    raw = _plain(prefs.get('commission', 0))
    if isinstance(raw, dict):
        raw = raw.get('value', 0)
    try:
        value = Decimal(str(raw))
    except Exception:
        return '0'
    # Runtime Percent is normally fixed-point 1e7; accept an already-percent shape too.
    percent = value / COMMISSION_DIVISOR if value > 100 else value
    return format(percent.normalize(), 'f')


def normalize_exposure(exposure: Any) -> dict[str, Any]:
    if not isinstance(exposure, dict):
        return {'total_pot': '0', 'own_pot': '0', 'nominator_count': 0}
    def pot(key: str) -> str:
        try:
            return format((Decimal(str(exposure.get(key, 0))) / RAW_PER_POT).normalize(), 'f')
        except Exception:
            return '0'
    others = exposure.get('others') or []
    return {'total_pot': pot('total'), 'own_pot': pot('own'), 'nominator_count': len(others) if isinstance(others, (list, tuple)) else 0}


def normalize_points(rewards: Any) -> dict[str, int]:
    if not isinstance(rewards, dict):
        return {}
    individual = rewards.get('individual') or {}
    if isinstance(individual, dict):
        pairs = individual.items()
    elif isinstance(individual, (list, tuple)):
        pairs = individual
    else:
        return {}
    result: dict[str, int] = {}
    for item in pairs:
        try:
            address, points = item
            result[str(address)] = int(points)
        except Exception:
            continue
    return result


def active_share(total_pot: Decimal, network_total: Decimal) -> Decimal:
    if network_total <= 0:
        return Decimal(0)
    return (total_pot / network_total) * Decimal(100)


__all__ = ['normalize_commission', 'normalize_exposure', 'normalize_points', 'active_share']

# Explicit constants document the chain units used by this module.
assert RAW_PER_POT == Decimal('100000000000000')
assert COMMISSION_DIVISOR == Decimal('10000000')

__version__ = '1.0'
assert __version__

