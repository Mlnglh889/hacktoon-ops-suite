from backend.collector_logic import normalize_commission, normalize_exposure, normalize_points


def test_normalize_commission_runtime_units():
    assert normalize_commission({'commission': 250_000_000}) == '25'


def test_normalize_commission_accepts_percent_shape():
    assert normalize_commission({'commission': {'__enum__': 'Percent', 'value': 25}}) == '25'


def test_normalize_exposure_extracts_total_own_and_nominators():
    result = normalize_exposure({'total': 123456789000000, 'own': 10000000000000, 'others': [{'who': 'a'}, {'who': 'b'}]})
    assert result == {'total_pot': '1.23456789', 'own_pot': '0.1', 'nominator_count': 2}


def test_normalize_points_accepts_individual_mapping():
    assert normalize_points({'total': 100, 'individual': {'validator-a': 7}}) == {'validator-a': 7}


def test_normalize_points_accepts_individual_pairs():
    assert normalize_points({'total': 100, 'individual': [['validator-a', 7]]}) == {'validator-a': 7}


def test_normalize_points_handles_missing_data():
    assert normalize_points(None) == {}
    assert normalize_exposure(None) == {'total_pot': '0', 'own_pot': '0', 'nominator_count': 0}
    assert normalize_commission(None) == '0'


def test_normalize_exposure_reads_eras_stakers_overview_shape():
    # Shape returned by Staking.ErasStakersOverview on Portaldot V3 (era 44, validator 5F4ZyJ...)
    result = normalize_exposure({'total': 1007935895192072112, 'own': 1007214501342156696, 'nominator_count': 2, 'page_count': 1})
    assert result['nominator_count'] == 2
    assert result['total_pot'] == '10079.35895192072112'
    assert result['own_pot'] == '10072.14501342156696'


def test_normalize_exposure_overview_zero_is_zero():
    assert normalize_exposure({'total': 0, 'own': 0, 'nominator_count': 0, 'page_count': 0}) == {'total_pot': '0', 'own_pot': '0', 'nominator_count': 0}
