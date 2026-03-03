"""
Optional integration test for TradingView tvDatafeed connectivity.

This test is intentionally resilient:
- it skips if `tvDatafeed` is not installed
- it skips if the upstream source is temporarily unavailable
"""

from typing import List, Tuple

import pytest


tv_module = pytest.importorskip("tvDatafeed", reason="tvDatafeed dependency is optional")
TvDatafeed = tv_module.TvDatafeed
Interval = tv_module.Interval


SYMBOLS: List[Tuple[str, str]] = [
    ("US100", "CAPITALCOM"),
    ("XAUUSD", "OANDA"),
    ("SP500", "SPCFD"),
    ("VIX", "CAPITALCOM"),
    ("EURUSD", "FXCM"),
]


def test_tvdatafeed_fetches_at_least_one_symbol() -> None:
    tv = TvDatafeed()
    successes = 0
    errors: List[str] = []

    for symbol, exchange in SYMBOLS:
        try:
            data = tv.get_hist(symbol=symbol, exchange=exchange, interval=Interval.in_1_minute, n_bars=1)
            if data is not None and not data.empty and "close" in data:
                _ = float(data["close"].iloc[-1])
                successes += 1
            else:
                errors.append(f"{exchange}:{symbol} empty")
        except Exception as exc:  # pragma: no cover - network/provider behavior
            errors.append(f"{exchange}:{symbol} error={exc}")

    if successes == 0:
        pytest.skip("tvDatafeed source unavailable or symbols not reachable: " + "; ".join(errors))

    assert successes >= 1
