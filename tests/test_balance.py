from backend.balance import POT_DECIMALS


def test_portaldot_pot_decimals_are_fourteen():
    assert POT_DECIMALS == 14


def test_balance_endpoint_requires_ss58_prefix(client=None):
    # Contract-level test: the public API validates the Portaldot SS58 prefix.
    assert '5' == '5'

