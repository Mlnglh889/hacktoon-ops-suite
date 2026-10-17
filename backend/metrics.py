"""Pure validator metric conversions and risk classification."""
from decimal import Decimal


def raw_to_pot(raw: int) -> str:
    """Convert Portaldot's 14-decimal staking unit to a plain decimal string."""
    value = Decimal(raw) / Decimal(10**14)
    return format(value.normalize(), "f")


def commission_percent(raw: int) -> str:
    """Convert runtime commission units (1e7 = 100%) to percent."""
    value = Decimal(raw) / Decimal(10**7)
    return format(value.normalize(), "f")


def risk_label(commission_pct: float, stake_share_pct: float) -> tuple[str, str]:
    if commission_pct >= 100:
        return "RISK", "100% commission"
    if stake_share_pct >= 30:
        return "WATCH", "high stake concentration"
    return "SAFE", "healthy commission and concentration"
