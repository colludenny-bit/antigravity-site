from datetime import datetime, timezone
import math

from backend.smart_money_positioning import THEME_META, _build_historical_analysis_10y


def _synthetic_series(
    n: int,
    start_ts: int,
    base_price: float,
    drift: float,
    amp: float,
    freq: float,
    phase: float,
):
    timestamps = []
    close = []
    volume = []
    px = float(base_price)
    for i in range(n):
        cyc = amp * math.sin((i * freq) + phase)
        ret = max(-0.08, min(0.08, drift + cyc))
        px = max(1.0, px * (1.0 + ret))
        timestamps.append(float(start_ts + (i * 86400)))
        close.append(float(px))
        volume.append(float(1_000_000 + int(250_000 * (1.0 + math.sin((i * freq * 0.5) + phase)))))
    return {"timestamps": timestamps, "close": close, "volume": volume}


def _build_history_map():
    n = 3000
    start_ts = int(datetime(2014, 1, 1, tzinfo=timezone.utc).timestamp())
    params = {
        "SPY": (250.0, 0.00030, 0.0015, 0.05, 0.10),
        "QQQ": (160.0, 0.00045, 0.0020, 0.05, 0.25),
        "^VIX": (20.0, 0.00002, 0.0035, 0.08, 1.05),
        "GLD": (120.0, 0.00018, 0.0016, 0.06, 0.40),
        "UUP": (26.0, 0.00009, 0.0010, 0.04, 0.75),
        "BTC-USD": (500.0, 0.00085, 0.0060, 0.09, 0.15),
        "XLE": (70.0, 0.00025, 0.0024, 0.06, 0.45),
        "ITA": (90.0, 0.00028, 0.0021, 0.05, 0.65),
        "XLK": (60.0, 0.00040, 0.0022, 0.06, 0.95),
        "TLT": (115.0, 0.00008, 0.0014, 0.05, 1.20),
        "CL=F": (65.0, 0.00020, 0.0030, 0.08, 0.35),
    }
    out = {}
    for ticker, (base, drift, amp, freq, phase) in params.items():
        out[ticker] = _synthetic_series(n, start_ts, base, drift, amp, freq, phase)
    return out


def test_historical_analysis_10y_includes_tests_and_correlation_battery():
    history_map = _build_history_map()
    payload = _build_historical_analysis_10y(
        now=datetime(2026, 3, 1, tzinfo=timezone.utc),
        history_map=history_map,
        theme_scores=[],
    )

    assert payload["status"] == "active"
    assert payload["lookback_years"] == 10
    assert payload["coverage"]["themes_covered"] == len(THEME_META)
    assert payload["coverage"]["statistical_tests_covered"] == len(THEME_META)
    assert payload["coverage"]["correlation_pairs_covered"] >= 8
    assert payload["coverage"]["leaderboard_rows"] == len(THEME_META)
    assert payload["coverage"]["playbook_rows"] == len(THEME_META)

    theme_rows = payload["theme_rows"]
    assert theme_rows
    assert {"theme", "proxy", "cagr_10y_pct", "corr_spy_10y"} <= set(theme_rows[0].keys())

    stat_rows = payload["statistical_tests"]
    assert stat_rows
    assert {
        "theme",
        "trend_t_stat_10y",
        "trend_p_value_10y",
        "win_rate_z_10y",
        "win_rate_p_value_10y",
        "vix_regime_spread_daily_pct",
        "regime_edge_state",
    } <= set(stat_rows[0].keys())

    corr_rows = payload["correlation_tests"]
    assert corr_rows
    assert {
        "pair",
        "corr_10y",
        "corr_1y",
        "corr_delta",
        "t_stat_10y",
        "p_value_10y",
        "significance",
        "rolling_corr_std_1y",
        "drift_state",
    } <= set(corr_rows[0].keys())

    leaderboard_rows = payload["institutional_leaderboard"]
    assert leaderboard_rows
    assert {
        "theme",
        "conviction_score",
        "today_signal",
        "week_signal",
        "month_signal",
        "risk_profile",
        "action",
    } <= set(leaderboard_rows[0].keys())

    playbook = payload["calendar_playbook"]
    assert {"today", "week", "month", "summary", "effective_weekday"} <= set(playbook.keys())
    assert playbook["today"]
    assert {
        "theme",
        "today_mean_pct",
        "today_win_rate_pct",
        "today_signal",
        "week_signal",
        "month_signal",
        "conviction_score",
    } <= set(playbook["today"][0].keys())
    assert {"bullish_today_count", "bearish_today_count"} <= set(playbook["summary"].keys())
