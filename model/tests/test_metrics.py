import pandas as pd
import pytest

from metrics import mae, within_position_spearman, captaincy_points, interval_coverage


def test_mae():
    assert mae(pd.Series([1.0, 2.0, 3.0]), pd.Series([1.0, 4.0, 3.0])) == pytest.approx(2.0 / 3.0)


def test_within_position_spearman_perfect_rank():
    df = pd.DataFrame({
        "position": ["MID", "MID", "MID"],
        "p50": [1.0, 2.0, 3.0],
        "actual": [5.0, 6.0, 9.0],
    })
    assert within_position_spearman(df, "p50") == pytest.approx(1.0)


def test_captaincy_picks_max_pred_per_gw_sums_actual():
    df = pd.DataFrame({
        "gw": [1, 1, 2, 2],
        "p50": [9.0, 3.0, 1.0, 8.0],
        "actual": [2.0, 7.0, 4.0, 6.0],
    })
    # gw1 picks row p50=9 -> actual 2; gw2 picks p50=8 -> actual 6 ; total 8
    assert captaincy_points(df, "p50") == pytest.approx(8.0)


def test_interval_coverage():
    df = pd.DataFrame({
        "p25": [1.0, 2.0, 0.0, 5.0],
        "p75": [3.0, 4.0, 1.0, 9.0],
        "actual": [2.0, 5.0, 0.5, 1.0],  # in, out, in, out -> 0.5
    })
    assert interval_coverage(df, "p25", "p75") == pytest.approx(0.5)
