from backend.metrics import commission_percent, raw_to_pot, risk_label


def test_raw_to_pot_converts_chain_units_without_float_loss():
    assert raw_to_pot(250_000_000_000_000) == "2.5"


def test_commission_raw_uses_runtime_divisor():
    assert commission_percent(250_000_000) == "25"


def test_risk_label_explains_high_commission():
    assert risk_label(100.0, 0.0) == ("RISK", "100% commission")


def test_risk_label_marks_concentration_watch():
    assert risk_label(5.0, 35.0) == ("WATCH", "high stake concentration")


def test_risk_label_marks_healthy_validator_safe():
    assert risk_label(5.0, 10.0) == ("SAFE", "healthy commission and concentration")
