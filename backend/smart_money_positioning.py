"""
smart_money_positioning.py

Real-data Smart Money Positioning engine.
Data sources:
- Yahoo Finance chart endpoint (long history, daily bars)
- CBOE delayed options endpoint (volume/open interest chain)

No heavy dataframe dependency is required in runtime.
"""
from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote
import copy
import math
import re
import time

import requests


THEMES: Tuple[str, ...] = (
    "DEFENSE",
    "ENERGY",
    "AI_TECH",
    "CRISIS_HEDGE",
    "USD_RATES",
    "CRYPTO_BETA",
)

THEME_META: Dict[str, Dict[str, Any]] = {
    "DEFENSE": {
        "sector": "Defense",
        "proxy": "ITA",
        "scenario": "geopolitical premium and defense spending repricing",
    },
    "ENERGY": {
        "sector": "Energy",
        "proxy": "XLE",
        "scenario": "energy squeeze and supply shock repricing",
    },
    "AI_TECH": {
        "sector": "Technology",
        "proxy": "XLK",
        "scenario": "AI capex and growth concentration momentum",
    },
    "CRISIS_HEDGE": {
        "sector": "Metals & Defensive",
        "proxy": "GLD",
        "scenario": "risk-off hedging via hard assets and convexity",
    },
    "USD_RATES": {
        "sector": "FX & Rates",
        "proxy": "UUP",
        "scenario": "USD strength and rates repricing regime",
    },
    "CRYPTO_BETA": {
        "sector": "Digital Assets Proxy",
        "proxy": "BTC-USD",
        "scenario": "liquidity beta rotation into high-vol growth",
    },
}

THEME_LAG_HOURS = {
    "DEFENSE": 42,
    "ENERGY": 36,
    "AI_TECH": 18,
    "CRISIS_HEDGE": 30,
    "USD_RATES": 16,
    "CRYPTO_BETA": 12,
}

THEME_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "DEFENSE": (
        "defense",
        "military",
        "geopolit",
        "war",
        "aerospace",
        "security",
        "nato",
        "missile",
    ),
    "ENERGY": (
        "energy",
        "oil",
        "gas",
        "opec",
        "supply",
        "refinery",
        "commodity",
    ),
    "AI_TECH": (
        "ai",
        "tech",
        "semiconductor",
        "chip",
        "cloud",
        "software",
        "nasdaq",
        "innovation",
    ),
    "CRISIS_HEDGE": (
        "gold",
        "hedge",
        "safe haven",
        "crisis",
        "volatility",
        "uncertainty",
        "risk-off",
    ),
    "USD_RATES": (
        "dollar",
        "usd",
        "rates",
        "yield",
        "treasury",
        "fed",
        "inflation",
        "macro",
    ),
    "CRYPTO_BETA": (
        "crypto",
        "bitcoin",
        "btc",
        "digital asset",
        "stablecoin",
        "altcoin",
    ),
}

OPTIONS_UNIVERSE: Tuple[str, ...] = (
    "XLK",
    "XLE",
    "ITA",
    "GLD",
    "UUP",
    "BITO",
)

OPTION_TICKER_TO_THEME: Dict[str, Tuple[str, ...]] = {
    "XLK": ("AI_TECH",),
    "XLE": ("ENERGY",),
    "ITA": ("DEFENSE",),
    "GLD": ("CRISIS_HEDGE",),
    "UUP": ("USD_RATES",),
    "BITO": ("CRYPTO_BETA",),
}

DEEP_ASSET_TO_THEME = {
    "NAS100": ("AI_TECH", "CRYPTO_BETA"),
    "SP500": ("DEFENSE", "ENERGY"),
    "XAUUSD": ("CRISIS_HEDGE", "DEFENSE"),
    "EURUSD": ("USD_RATES",),
}

DEEP_ASSET_TO_PROXY_TICKERS = {
    "NAS100": ("QQQ", "NVDA"),
    "SP500": ("SPY", "XLE"),
    "XAUUSD": ("GLD",),
    "EURUSD": ("UUP",),
}

BENCHMARK_TICKER = "SPY"
HISTORY_RANGE = "12y"
HISTORY_INTERVAL = "1d"
CACHE_TTL_SECONDS = 300
OPTIONS_EXPIRY_MAX_DAYS = 70
OPTIONS_MAX_PER_TICKER = 24
OPTIONS_MAX_ROWS = 80

MARKET_TICKERS = tuple(
    sorted(
        set(
            [BENCHMARK_TICKER, "^VIX", "CL=F", "BTC-USD", "QQQ", "XLE", "ITA", "GLD", "UUP", "TLT", "XLK"]
            + list(v["proxy"] for v in THEME_META.values())
            + list(OPTIONS_UNIVERSE)
        )
    )
)

OPTION_RE = re.compile(r"^([A-Z]+)(\d{6})([CP])(\d{8})$")

STOOQ_SYMBOL_MAP = {
    "SPY": "spy.us",
    "QQQ": "qqq.us",
    "XLE": "xle.us",
    "ITA": "ita.us",
    "GLD": "gld.us",
    "UUP": "uup.us",
    "TLT": "tlt.us",
    "XLK": "xlk.us",
    "BITO": "bito.us",
    "BTC-USD": "btcusd",
}

_HTTP = requests.Session()
_HTTP.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
    }
)

_CACHE: Dict[str, Any] = {"ts": None, "payload": None}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except Exception:
        return int(default)


def _asset_direction_sign(direction: str) -> int:
    d = str(direction or "").upper()
    if d == "UP":
        return 1
    if d == "DOWN":
        return -1
    return 0


def _bucket_from_score(score: float) -> str:
    if score >= 78:
        return "STRONG_POSITIONING"
    if score >= 60:
        return "BUILDING_POSITIONING"
    if score >= 45:
        return "EARLY_ACCUMULATION"
    return "NOISE"


def _direction_from_score(score: float) -> str:
    if score >= 56:
        return "BULLISH"
    if score <= 44:
        return "BEARISH"
    return "NEUTRAL"


def _mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _stddev(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    var = sum((x - m) ** 2 for x in values) / max(1, len(values) - 1)
    return math.sqrt(max(var, 0.0))


def _pearson_corr(xs: List[float], ys: List[float]) -> float:
    if len(xs) < 3 or len(ys) < 3:
        return 0.0
    n = min(len(xs), len(ys))
    x = xs[:n]
    y = ys[:n]
    mx = _mean(x)
    my = _mean(y)
    cov = sum((a - mx) * (b - my) for a, b in zip(x, y))
    vx = sum((a - mx) ** 2 for a in x)
    vy = sum((b - my) ** 2 for b in y)
    if vx <= 1e-12 or vy <= 1e-12:
        return 0.0
    return _clamp(cov / math.sqrt(vx * vy), -1.0, 1.0)


def _series_period_return(series: Dict[str, List[float]], periods: int) -> float:
    closes = series.get("close", [])
    if len(closes) <= periods:
        return 0.0
    start = _safe_float(closes[-1 - periods], 0.0)
    end = _safe_float(closes[-1], 0.0)
    if start <= 0.0 or end <= 0.0:
        return 0.0
    return (end / start) - 1.0


def _series_cagr(series: Dict[str, List[float]], periods: int) -> float:
    closes = series.get("close", [])
    ts = series.get("timestamps", [])
    if len(closes) <= periods or len(ts) <= periods:
        return 0.0
    start = _safe_float(closes[-1 - periods], 0.0)
    end = _safe_float(closes[-1], 0.0)
    t0 = _safe_int(ts[-1 - periods], 0)
    t1 = _safe_int(ts[-1], 0)
    if start <= 0.0 or end <= 0.0 or t1 <= t0:
        return 0.0
    years = (t1 - t0) / (365.25 * 86400.0)
    if years <= 0.0:
        return 0.0
    try:
        return (end / start) ** (1.0 / years) - 1.0
    except Exception:
        return 0.0


def _series_max_drawdown(series: Dict[str, List[float]], periods: int) -> float:
    closes = [_safe_float(x, 0.0) for x in (series.get("close") or [])]
    if len(closes) <= periods:
        closes = closes[:]
    else:
        closes = closes[-periods:]
    if len(closes) < 3:
        return 0.0
    peak = closes[0]
    max_dd = 0.0
    for c in closes:
        if c > peak:
            peak = c
        if peak > 0:
            dd = (c / peak) - 1.0
            if dd < max_dd:
                max_dd = dd
    return max_dd


def _series_daily_returns(series: Dict[str, List[float]], periods: int) -> List[float]:
    closes = [_safe_float(x, 0.0) for x in (series.get("close") or [])]
    if len(closes) <= periods:
        src = closes
    else:
        src = closes[-periods:]
    out: List[float] = []
    for i in range(1, len(src)):
        prev = _safe_float(src[i - 1], 0.0)
        curr = _safe_float(src[i], 0.0)
        if prev <= 0.0 or curr <= 0.0:
            continue
        out.append((curr / prev) - 1.0)
    return out


def _series_corr(a: Dict[str, List[float]], b: Dict[str, List[float]], periods: int) -> float:
    aligned = _align_to_benchmark(a, b)
    if len(aligned) < 6:
        return 0.0
    if len(aligned) > periods:
        aligned = aligned[-periods:]
    ra: List[float] = []
    rb: List[float] = []
    for i in range(1, len(aligned)):
        a_prev = _safe_float(aligned[i - 1][1], 0.0)
        a_cur = _safe_float(aligned[i][1], 0.0)
        b_prev = _safe_float(aligned[i - 1][2], 0.0)
        b_cur = _safe_float(aligned[i][2], 0.0)
        if a_prev <= 0.0 or a_cur <= 0.0 or b_prev <= 0.0 or b_cur <= 0.0:
            continue
        ra.append((a_cur / a_prev) - 1.0)
        rb.append((b_cur / b_prev) - 1.0)
    return _pearson_corr(ra, rb)


def _quantile(values: List[float], q: float) -> float:
    clean = sorted([_safe_float(v, 0.0) for v in values if math.isfinite(_safe_float(v, 0.0))])
    if not clean:
        return 0.0
    q_clamped = _clamp(_safe_float(q, 0.5), 0.0, 1.0)
    if len(clean) == 1:
        return clean[0]
    pos = q_clamped * (len(clean) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return clean[lo]
    frac = pos - lo
    return (clean[lo] * (1.0 - frac)) + (clean[hi] * frac)


def _two_tail_p_from_z(z_score: float) -> float:
    z = abs(_safe_float(z_score, 0.0))
    return _clamp(math.erfc(z / math.sqrt(2.0)), 0.0, 1.0)


def _series_return_pairs(
    series_a: Dict[str, List[float]],
    series_b: Dict[str, List[float]],
    periods: int,
) -> Tuple[List[float], List[float]]:
    aligned = _align_to_benchmark(series_a, series_b)
    if len(aligned) > periods:
        aligned = aligned[-periods:]
    ra: List[float] = []
    rb: List[float] = []
    for i in range(1, len(aligned)):
        a_prev = _safe_float(aligned[i - 1][1], 0.0)
        a_cur = _safe_float(aligned[i][1], 0.0)
        b_prev = _safe_float(aligned[i - 1][2], 0.0)
        b_cur = _safe_float(aligned[i][2], 0.0)
        if a_prev <= 0.0 or a_cur <= 0.0 or b_prev <= 0.0 or b_cur <= 0.0:
            continue
        ra.append((a_cur / a_prev) - 1.0)
        rb.append((b_cur / b_prev) - 1.0)
    return ra, rb


def _corr_significance_label(abs_corr: float, p_value: float) -> str:
    if p_value <= 0.01 and abs_corr >= 0.35:
        return "VERY_STRONG"
    if p_value <= 0.05 and abs_corr >= 0.20:
        return "STRONG"
    if p_value <= 0.10:
        return "MODERATE"
    return "WEAK"


def _series_corr_with_stats(
    series_a: Dict[str, List[float]],
    series_b: Dict[str, List[float]],
    periods: int,
) -> Dict[str, float]:
    ra, rb = _series_return_pairs(series_a, series_b, periods)
    n = min(len(ra), len(rb))
    if n < 8:
        return {
            "corr": 0.0,
            "sample_days": float(n),
            "t_stat": 0.0,
            "z_score": 0.0,
            "p_value": 1.0,
            "abs_corr": 0.0,
        }

    corr = _pearson_corr(ra, rb)
    denom = max(1e-9, 1.0 - (corr * corr))
    t_stat = corr * math.sqrt(max(1.0, (n - 2) / denom))
    z_score = abs(corr) * math.sqrt(max(1.0, n - 3))
    p_value = _two_tail_p_from_z(z_score)
    return {
        "corr": corr,
        "sample_days": float(n),
        "t_stat": t_stat,
        "z_score": z_score,
        "p_value": p_value,
        "abs_corr": abs(corr),
    }


def _series_rolling_corr(
    series_a: Dict[str, List[float]],
    series_b: Dict[str, List[float]],
    periods: int,
    window: int = 252,
    step: int = 21,
) -> List[float]:
    ra, rb = _series_return_pairs(series_a, series_b, periods)
    n = min(len(ra), len(rb))
    if n < max(12, window):
        return []
    out: List[float] = []
    last_start = max(0, n - window)
    for start in range(0, max(1, n - window + 1), max(1, step)):
        out.append(_pearson_corr(ra[start : start + window], rb[start : start + window]))
    if not out or last_start > 0:
        tail_corr = _pearson_corr(ra[last_start:last_start + window], rb[last_start:last_start + window])
        if not out or abs(out[-1] - tail_corr) > 1e-6:
            out.append(tail_corr)
    return out


def _series_vs_vix_regime_test(
    asset_series: Dict[str, List[float]],
    vix_series: Dict[str, List[float]],
    periods: int,
) -> Dict[str, float]:
    aligned = _align_to_benchmark(asset_series, vix_series)
    if len(aligned) > periods:
        aligned = aligned[-periods:]
    returns: List[float] = []
    vix_levels: List[float] = []
    for i in range(1, len(aligned)):
        prev_px = _safe_float(aligned[i - 1][1], 0.0)
        cur_px = _safe_float(aligned[i][1], 0.0)
        vix_level = _safe_float(aligned[i][2], 0.0)
        if prev_px <= 0.0 or cur_px <= 0.0 or vix_level <= 0.0:
            continue
        returns.append((cur_px / prev_px) - 1.0)
        vix_levels.append(vix_level)

    n = min(len(returns), len(vix_levels))
    if n < 40:
        return {
            "sample_days": float(n),
            "high_vix_daily_mean_pct": 0.0,
            "low_vix_daily_mean_pct": 0.0,
            "spread_daily_pct": 0.0,
            "spread_z_score": 0.0,
            "spread_p_value": 1.0,
        }

    high_cut = _quantile(vix_levels, 0.75)
    low_cut = _quantile(vix_levels, 0.25)
    high_bucket = [r for r, v in zip(returns, vix_levels) if v >= high_cut]
    low_bucket = [r for r, v in zip(returns, vix_levels) if v <= low_cut]

    high_mean = _mean(high_bucket) if high_bucket else 0.0
    low_mean = _mean(low_bucket) if low_bucket else 0.0
    spread = high_mean - low_mean

    std_high = _stddev(high_bucket)
    std_low = _stddev(low_bucket)
    denom = math.sqrt((std_high * std_high / max(1, len(high_bucket))) + (std_low * std_low / max(1, len(low_bucket))))
    z_score = spread / denom if denom > 1e-9 else 0.0
    p_value = _two_tail_p_from_z(z_score)

    return {
        "sample_days": float(n),
        "high_vix_daily_mean_pct": high_mean * 100.0,
        "low_vix_daily_mean_pct": low_mean * 100.0,
        "spread_daily_pct": spread * 100.0,
        "spread_z_score": z_score,
        "spread_p_value": p_value,
    }


def _series_weekday_profile(series: Dict[str, List[float]], periods: int) -> Dict[str, Dict[str, float]]:
    closes = [_safe_float(x, 0.0) for x in (series.get("close") or [])]
    ts = [_safe_int(x, 0) for x in (series.get("timestamps") or [])]
    if len(closes) > periods:
        closes = closes[-periods:]
        ts = ts[-periods:]
    bucket = defaultdict(list)
    for i in range(1, min(len(closes), len(ts))):
        prev = _safe_float(closes[i - 1], 0.0)
        cur = _safe_float(closes[i], 0.0)
        if prev <= 0.0 or cur <= 0.0:
            continue
        wd = datetime.fromtimestamp(ts[i], tz=timezone.utc).weekday()
        bucket[wd].append((cur / prev) - 1.0)
    out: Dict[str, Dict[str, float]] = {}
    for wd in range(5):
        vals = bucket.get(wd, [])
        n = len(vals)
        if n <= 0:
            out[str(wd)] = {"samples": 0, "mean_pct": 0.0, "win_rate_pct": 0.0}
        else:
            out[str(wd)] = {
                "samples": n,
                "mean_pct": round(_mean(vals) * 100.0, 4),
                "win_rate_pct": round((sum(1 for v in vals if v > 0) / n) * 100.0, 2),
            }
    return out


def _series_month_profile(series: Dict[str, List[float]], periods: int) -> Dict[str, Dict[str, float]]:
    closes = [_safe_float(x, 0.0) for x in (series.get("close") or [])]
    ts = [_safe_int(x, 0) for x in (series.get("timestamps") or [])]
    if len(closes) > periods:
        closes = closes[-periods:]
        ts = ts[-periods:]
    bucket = defaultdict(list)
    for i in range(1, min(len(closes), len(ts))):
        prev = _safe_float(closes[i - 1], 0.0)
        cur = _safe_float(closes[i], 0.0)
        if prev <= 0.0 or cur <= 0.0:
            continue
        m = datetime.fromtimestamp(ts[i], tz=timezone.utc).month
        bucket[m].append((cur / prev) - 1.0)
    out: Dict[str, Dict[str, float]] = {}
    for m in range(1, 13):
        vals = bucket.get(m, [])
        n = len(vals)
        if n <= 0:
            out[str(m)] = {"samples": 0, "mean_pct": 0.0, "win_rate_pct": 0.0}
        else:
            out[str(m)] = {
                "samples": n,
                "mean_pct": round(_mean(vals) * 100.0, 4),
                "win_rate_pct": round((sum(1 for v in vals if v > 0) / n) * 100.0, 2),
            }
    return out


def _series_return(series: Dict[str, List[float]], periods: int) -> float:
    closes = series.get("close", [])
    if len(closes) <= periods:
        return 0.0
    prev = _safe_float(closes[-1 - periods], 0.0)
    curr = _safe_float(closes[-1], 0.0)
    if prev <= 0.0:
        return 0.0
    return (curr / prev) - 1.0


def _series_last(series: Dict[str, List[float]]) -> float:
    closes = series.get("close", [])
    if not closes:
        return 0.0
    return _safe_float(closes[-1], 0.0)


def _series_volume_ratio(series: Dict[str, List[float]], window: int = 30) -> float:
    volumes = series.get("volume", [])
    if len(volumes) < window:
        return 1.0
    ma = _mean([_safe_float(v, 0.0) for v in volumes[-window:]])
    curr = _safe_float(volumes[-1], 0.0)
    if ma <= 0.0:
        return 1.0
    return curr / ma


def _fetch_history_series(symbol: str, warnings: List[str]) -> Dict[str, List[float]]:
    stooq_symbol = STOOQ_SYMBOL_MAP.get(symbol)
    if stooq_symbol:
        stooq_series = _fetch_stooq_series(stooq_symbol, warnings)
        if len(stooq_series.get("close", [])) >= 120:
            return stooq_series

    return _fetch_yahoo_series(symbol, warnings)


def _fetch_stooq_series(stooq_symbol: str, warnings: List[str]) -> Dict[str, List[float]]:
    url = f"https://stooq.com/q/d/l/?s={quote(stooq_symbol, safe='')}&i=d"
    try:
        response = _HTTP.get(url, timeout=18)
    except Exception as exc:
        warnings.append(f"stooq request failed {stooq_symbol}: {exc}")
        return {"timestamps": [], "close": [], "volume": []}

    if response.status_code != 200:
        warnings.append(f"stooq bad status {stooq_symbol}: {response.status_code}")
        return {"timestamps": [], "close": [], "volume": []}

    lines = response.text.splitlines()
    if len(lines) <= 1:
        return {"timestamps": [], "close": [], "volume": []}
    if "No data" in lines[0]:
        return {"timestamps": [], "close": [], "volume": []}

    rows: List[Tuple[int, float, float]] = []
    has_volume = "Volume" in lines[0]
    for raw in lines[1:]:
        parts = raw.strip().split(",")
        if len(parts) < 5:
            continue
        day = parts[0]
        close = _safe_float(parts[4], 0.0)
        volume = _safe_float(parts[5], 0.0) if has_volume and len(parts) > 5 else 0.0
        if close <= 0:
            continue
        try:
            dt = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            continue
        rows.append((int(dt.timestamp()), close, volume))

    rows.sort(key=lambda x: x[0])
    return {
        "timestamps": [float(r[0]) for r in rows],
        "close": [float(r[1]) for r in rows],
        "volume": [float(r[2]) for r in rows],
    }


def _fetch_yahoo_series(symbol: str, warnings: List[str]) -> Dict[str, List[float]]:
    encoded = quote(symbol, safe="")
    params = {
        "range": HISTORY_RANGE,
        "interval": HISTORY_INTERVAL,
        "includePrePost": "false",
        "events": "div,splits",
    }
    last_status = None
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{encoded}"
        for attempt in range(3):
            try:
                response = _HTTP.get(url, params=params, timeout=18)
            except Exception as exc:
                warnings.append(f"history request failed {symbol} ({host}): {exc}")
                continue

            last_status = response.status_code
            if response.status_code == 429:
                time.sleep(0.2 * (attempt + 1))
                continue
            if response.status_code != 200:
                continue

            try:
                payload = response.json()
            except Exception:
                continue

            result = ((payload.get("chart") or {}).get("result") or [None])[0]
            if not result:
                continue

            timestamps = result.get("timestamp") or []
            quote0 = (((result.get("indicators") or {}).get("quote") or [{}])[0])
            closes = quote0.get("close") or []
            volumes = quote0.get("volume") or []

            rows: List[Tuple[int, float, float]] = []
            for ts, close, vol in zip(timestamps, closes, volumes):
                if close is None:
                    continue
                rows.append((int(ts), _safe_float(close, 0.0), _safe_float(vol, 0.0)))

            rows.sort(key=lambda x: x[0])
            if rows:
                return {
                    "timestamps": [float(r[0]) for r in rows],
                    "close": [float(r[1]) for r in rows],
                    "volume": [float(r[2]) for r in rows],
                }

    if last_status is not None:
        warnings.append(f"history bad status {symbol}: {last_status}")
    else:
        warnings.append(f"history unavailable {symbol}")
    return {"timestamps": [], "close": [], "volume": []}


def _download_history_map(tickers: Tuple[str, ...], warnings: List[str]) -> Dict[str, Dict[str, List[float]]]:
    history_map: Dict[str, Dict[str, List[float]]] = {}

    def _worker(symbol: str) -> Tuple[str, Dict[str, List[float]], List[str]]:
        local_warnings: List[str] = []
        series = _fetch_history_series(symbol, local_warnings)
        return symbol, series, local_warnings

    max_workers = max(1, min(8, len(tickers)))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {pool.submit(_worker, ticker): ticker for ticker in tickers}
        for future in as_completed(future_map):
            symbol = future_map[future]
            try:
                ticker, series, local_warnings = future.result()
            except Exception as exc:
                warnings.append(f"history worker failed {symbol}: {exc}")
                continue
            warnings.extend(local_warnings)
            if series.get("close"):
                history_map[ticker] = series

    return history_map


def _align_to_benchmark(
    symbol_series: Dict[str, List[float]],
    benchmark_series: Dict[str, List[float]],
) -> List[Tuple[int, float, float, float]]:
    ts_s = [_safe_int(t, 0) for t in symbol_series.get("timestamps", [])]
    close_s = [_safe_float(c, 0.0) for c in symbol_series.get("close", [])]
    vol_s = [_safe_float(v, 0.0) for v in symbol_series.get("volume", [])]

    ts_b = [_safe_int(t, 0) for t in benchmark_series.get("timestamps", [])]
    close_b = [_safe_float(c, 0.0) for c in benchmark_series.get("close", [])]

    rows: List[Tuple[int, float, float, float]] = []
    bi = 0
    last_bench = None
    for idx, ts in enumerate(ts_s):
        while bi < len(ts_b) and ts_b[bi] <= ts:
            last_bench = close_b[bi]
            bi += 1
        if last_bench is None:
            continue
        rows.append((ts, close_s[idx], _safe_float(last_bench, 0.0), vol_s[idx]))
    return rows


def _historical_validation(
    symbol_series: Dict[str, List[float]],
    benchmark_series: Dict[str, List[float]],
    state: str,
) -> Dict[str, Any]:
    aligned = _align_to_benchmark(symbol_series, benchmark_series)
    n = len(aligned)
    if n < 120:
        return {
            "sample_days": 0,
            "accumulation_sample": 0,
            "distribution_sample": 0,
            "accumulation_hit_rate_5d": 0.0,
            "accumulation_hit_rate_20d": 0.0,
            "distribution_hit_rate_5d": 0.0,
            "distribution_hit_rate_20d": 0.0,
            "baseline_hit_rate_20d": 0.0,
            "edge_score": 50.0,
        }

    close = [_safe_float(row[1], 0.0) for row in aligned]
    bench = [_safe_float(row[2], 0.0) for row in aligned]
    volume = [_safe_float(row[3], 0.0) for row in aligned]

    acc_sample = 0
    dist_sample = 0
    acc_hit_5 = 0
    acc_hit_20 = 0
    dist_hit_5 = 0
    dist_hit_20 = 0
    baseline_hit_20 = 0
    baseline_sample_20 = 0

    valid_count = 0
    for i in range(50, n - 20):
        c = close[i]
        c20 = close[i - 20]
        b = bench[i]
        b20 = bench[i - 20]
        if c <= 0 or c20 <= 0 or b <= 0 or b20 <= 0:
            continue

        ma50 = _mean(close[i - 49:i + 1])
        if ma50 <= 0:
            continue

        vol_ma = _mean(volume[i - 29:i + 1]) if i >= 29 else _mean(volume[:i + 1])
        vol_ratio = (volume[i] / vol_ma) if vol_ma > 0 else 1.0

        rel20 = (c / c20 - 1.0) - (b / b20 - 1.0)
        trend = (c / ma50) - 1.0
        fwd5 = (close[i + 5] / c) - 1.0
        fwd20 = (close[i + 20] / c) - 1.0

        baseline_sample_20 += 1
        if fwd20 > 0:
            baseline_hit_20 += 1

        valid_count += 1

        accum_cond = rel20 > 0 and trend > 0 and vol_ratio >= 1.03
        dist_cond = rel20 < 0 and trend < 0 and vol_ratio >= 1.03

        if accum_cond:
            acc_sample += 1
            if fwd5 > 0:
                acc_hit_5 += 1
            if fwd20 > 0:
                acc_hit_20 += 1

        if dist_cond:
            dist_sample += 1
            if fwd5 < 0:
                dist_hit_5 += 1
            if fwd20 < 0:
                dist_hit_20 += 1

    def _rate(hits: int, sample: int, default: float = 0.5) -> float:
        if sample <= 0:
            return default
        return hits / sample

    acc_r5 = _rate(acc_hit_5, acc_sample)
    acc_r20 = _rate(acc_hit_20, acc_sample)
    dist_r5 = _rate(dist_hit_5, dist_sample)
    dist_r20 = _rate(dist_hit_20, dist_sample)
    base20 = _rate(baseline_hit_20, baseline_sample_20)

    if state == "ACCUMULATION":
        selected_hit = (acc_r5 * 0.45) + (acc_r20 * 0.55)
        selected_sample = acc_sample
    elif state == "DISTRIBUTION":
        selected_hit = (dist_r5 * 0.45) + (dist_r20 * 0.55)
        selected_sample = dist_sample
    else:
        selected_hit = (acc_r20 + dist_r20) / 2.0
        selected_sample = int((acc_sample + dist_sample) / 2)

    sample_weight = _clamp(selected_sample / 180.0, 0.0, 1.0)
    edge_score = _clamp((50.0 * (1.0 - sample_weight)) + (selected_hit * 100.0 * sample_weight), 0.0, 100.0)

    return {
        "sample_days": int(valid_count),
        "accumulation_sample": int(acc_sample),
        "distribution_sample": int(dist_sample),
        "accumulation_hit_rate_5d": round(acc_r5 * 100.0, 2),
        "accumulation_hit_rate_20d": round(acc_r20 * 100.0, 2),
        "distribution_hit_rate_5d": round(dist_r5 * 100.0, 2),
        "distribution_hit_rate_20d": round(dist_r20 * 100.0, 2),
        "baseline_hit_rate_20d": round(base20 * 100.0, 2),
        "edge_score": round(edge_score, 2),
    }


def _build_sector_rotation(history_map: Dict[str, Dict[str, List[float]]]) -> List[Dict[str, Any]]:
    benchmark = history_map.get(BENCHMARK_TICKER) or {"timestamps": [], "close": [], "volume": []}
    rows: List[Dict[str, Any]] = []

    for theme in THEMES:
        meta = THEME_META.get(theme, {})
        proxy = str(meta.get("proxy", ""))
        series = history_map.get(proxy) or {"timestamps": [], "close": [], "volume": []}

        if not series.get("close"):
            rows.append(
                {
                    "theme": theme,
                    "sector": meta.get("sector", "N/A"),
                    "proxy": proxy,
                    "state": "NEUTRAL",
                    "rotation_score": 50.0,
                    "relative_strength": {"1d": 0.0, "5d": 0.0, "20d": 0.0},
                    "volume_ratio": 1.0,
                    "benchmark_alpha": 0.0,
                    "historical_validation": {
                        "sample_days": 0,
                        "accumulation_sample": 0,
                        "distribution_sample": 0,
                        "accumulation_hit_rate_5d": 0.0,
                        "accumulation_hit_rate_20d": 0.0,
                        "distribution_hit_rate_5d": 0.0,
                        "distribution_hit_rate_20d": 0.0,
                        "baseline_hit_rate_20d": 0.0,
                        "edge_score": 50.0,
                    },
                }
            )
            continue

        rs_1d = _series_return(series, 1) - _series_return(benchmark, 1)
        rs_5d = _series_return(series, 5) - _series_return(benchmark, 5)
        rs_20d = _series_return(series, 20) - _series_return(benchmark, 20)

        close = series.get("close", [])
        ma50 = _mean(close[-50:]) if len(close) >= 50 else _mean(close)
        trend = (close[-1] / ma50 - 1.0) if ma50 > 0 else 0.0

        volume_ratio = _series_volume_ratio(series, 30)
        benchmark_alpha = rs_20d * 100.0

        rotation_score = _clamp(
            50.0 + (rs_20d * 400.0) + (rs_5d * 230.0) + (trend * 250.0) + ((volume_ratio - 1.0) * 12.0),
            2.0,
            98.0,
        )

        if rotation_score >= 62.0 and rs_20d > 0 and trend > 0:
            state = "ACCUMULATION"
        elif rotation_score <= 38.0 and rs_20d < 0 and trend < 0:
            state = "DISTRIBUTION"
        else:
            state = "NEUTRAL"

        hist = _historical_validation(series, benchmark, state)

        rows.append(
            {
                "theme": theme,
                "sector": meta.get("sector", "N/A"),
                "proxy": proxy,
                "state": state,
                "rotation_score": round(rotation_score, 2),
                "relative_strength": {
                    "1d": round(rs_1d * 100.0, 2),
                    "5d": round(rs_5d * 100.0, 2),
                    "20d": round(rs_20d * 100.0, 2),
                },
                "volume_ratio": round(volume_ratio, 2),
                "benchmark_alpha": round(benchmark_alpha, 2),
                "historical_validation": hist,
            }
        )

    rows.sort(key=lambda item: item.get("rotation_score", 0.0), reverse=True)
    return rows


def _build_cross_asset_flags(history_map: Dict[str, Dict[str, List[float]]]) -> List[Dict[str, Any]]:
    spy = history_map.get("SPY") or {}
    qqq = history_map.get("QQQ") or {}
    vix = history_map.get("^VIX") or {}
    gold = history_map.get("GLD") or {}
    usd = history_map.get("UUP") or {}
    oil = history_map.get("CL=F") or {}
    btc = history_map.get("BTC-USD") or {}
    ita = history_map.get("ITA") or {}
    xle = history_map.get("XLE") or {}
    tlt = history_map.get("TLT") or {}

    spy_5 = _series_return(spy, 5)
    spy_20 = _series_return(spy, 20)
    qqq_20 = _series_return(qqq, 20)
    vix_5 = _series_return(vix, 5)
    vix_20 = _series_return(vix, 20)
    vix_level = _series_last(vix)
    gold_20 = _series_return(gold, 20)
    usd_20 = _series_return(usd, 20)
    oil_5 = _series_return(oil, 5)
    oil_vol = _series_volume_ratio(oil, 30)
    btc_5 = _series_return(btc, 5)
    btc_20 = _series_return(btc, 20)
    ita_rel_20 = _series_return(ita, 20) - spy_20
    xle_rel_20 = _series_return(xle, 20) - spy_20
    tlt_20 = _series_return(tlt, 20)

    flags = [
        {
            "id": "VIX_UP_SPX_FLAT",
            "label": "VIX rising while SPY flat/down",
            "active": bool(vix_5 >= 0.08 and spy_5 <= 0.005),
            "weight": 18,
            "scenario": "protective hedging ahead of headline risk",
            "themes": ["DEFENSE", "CRISIS_HEDGE", "USD_RATES"],
            "metrics": {"vix_5d_pct": round(vix_5 * 100.0, 2), "spy_5d_pct": round(spy_5 * 100.0, 2)},
        },
        {
            "id": "GOLD_UP_USD_UP",
            "label": "Gold and USD jointly bid",
            "active": bool(gold_20 >= 0.015 and usd_20 >= 0.0075),
            "weight": 16,
            "scenario": "uncertainty premium and geopolitical stress",
            "themes": ["CRISIS_HEDGE", "USD_RATES", "DEFENSE"],
            "metrics": {"gold_20d_pct": round(gold_20 * 100.0, 2), "usd_20d_pct": round(usd_20 * 100.0, 2)},
        },
        {
            "id": "OIL_VOLUME_SPIKE_PRICE_FLAT",
            "label": "Oil volume spike with compressed price",
            "active": bool(oil_vol >= 1.6 and abs(oil_5) <= 0.018),
            "weight": 14,
            "scenario": "silent energy accumulation ahead of supply narrative",
            "themes": ["ENERGY"],
            "metrics": {"oil_5d_pct": round(oil_5 * 100.0, 2), "oil_volume_ratio": round(oil_vol, 2)},
        },
        {
            "id": "BTC_DECOUPLE_EQUITY",
            "label": "BTC up while equity muted",
            "active": bool(btc_5 >= 0.05 and spy_5 <= 0.005),
            "weight": 12,
            "scenario": "liquidity narrative rotation into crypto beta",
            "themes": ["CRYPTO_BETA", "AI_TECH"],
            "metrics": {"btc_5d_pct": round(btc_5 * 100.0, 2), "spy_5d_pct": round(spy_5 * 100.0, 2)},
        },
        {
            "id": "DEFENSE_REL_STRENGTH",
            "label": "Defense relative strength cluster",
            "active": bool(ita_rel_20 >= 0.018 and (vix_20 >= 0.02 or vix_level >= 20.0)),
            "weight": 11,
            "scenario": "institutional tilt toward defense under stress premium",
            "themes": ["DEFENSE", "CRISIS_HEDGE"],
            "metrics": {
                "ita_rel_20d_pct": round(ita_rel_20 * 100.0, 2),
                "vix_20d_pct": round(vix_20 * 100.0, 2),
                "vix_level": round(vix_level, 2),
            },
        },
        {
            "id": "USD_UP_TLT_DOWN",
            "label": "USD bid with duration pressure",
            "active": bool(usd_20 >= 0.01 and tlt_20 <= -0.01),
            "weight": 10,
            "scenario": "rates and dollar repricing pressure",
            "themes": ["USD_RATES"],
            "metrics": {"usd_20d_pct": round(usd_20 * 100.0, 2), "tlt_20d_pct": round(tlt_20 * 100.0, 2)},
        },
        {
            "id": "RISK_ON_BREADTH_TECH",
            "label": "Risk-on tech and beta expansion",
            "active": bool(qqq_20 >= 0.02 and vix_5 <= -0.05 and xle_rel_20 <= 0.01),
            "weight": 10,
            "scenario": "growth concentration with volatility compression",
            "themes": ["AI_TECH", "CRYPTO_BETA"],
            "metrics": {
                "qqq_20d_pct": round(qqq_20 * 100.0, 2),
                "vix_5d_pct": round(vix_5 * 100.0, 2),
                "xle_rel_20d_pct": round(xle_rel_20 * 100.0, 2),
            },
        },
    ]
    return flags


def _build_macro_filter(
    multi_snapshot: Dict[str, Any],
    overlay: Dict[str, Any],
    cross_asset_flags: List[Dict[str, Any]],
    history_map: Dict[str, Dict[str, List[float]]],
    now: datetime,
) -> Dict[str, Any]:
    analyses = multi_snapshot.get("analyses") or {}
    overlay_scores = (overlay or {}).get("scores") or {}

    spx_sign = _asset_direction_sign((analyses.get("SP500") or {}).get("direction"))
    nas_sign = _asset_direction_sign((analyses.get("NAS100") or {}).get("direction"))
    xau_sign = _asset_direction_sign((analyses.get("XAUUSD") or {}).get("direction"))
    eur_sign = _asset_direction_sign((analyses.get("EURUSD") or {}).get("direction"))
    usd_sign = -eur_sign

    spy_20 = _series_return(history_map.get("SPY") or {}, 20)
    qqq_20 = _series_return(history_map.get("QQQ") or {}, 20)
    vix_5 = _series_return(history_map.get("^VIX") or {}, 5)
    vix_level = _series_last(history_map.get("^VIX") or {})
    gold_20 = _series_return(history_map.get("GLD") or {}, 20)
    usd_20 = _series_return(history_map.get("UUP") or {}, 20)
    oil_20 = _series_return(history_map.get("CL=F") or {}, 20)
    btc_20 = _series_return(history_map.get("BTC-USD") or {}, 20)

    macro_score = _safe_float(overlay_scores.get("macro_score"), 0.0)
    news_score = _safe_float(overlay_scores.get("news_score"), 0.0)
    regime_score = _safe_float(overlay_scores.get("regime_score"), 0.0)
    risk_score = _safe_float(overlay_scores.get("risk_score"), 0.0)
    fed_proxy_score = _safe_float(overlay_scores.get("fed_proxy_score"), 0.0)
    seasonality_score = _safe_float(overlay_scores.get("seasonality_score"), 0.0)

    active_ids = {flag.get("id") for flag in cross_asset_flags if flag.get("active")}

    risk_on_votes = 0.0
    risk_off_votes = 0.0

    if spy_20 > 0.02 and qqq_20 > 0.025:
        risk_on_votes += 2.0
    if vix_level >= 22.0 or vix_5 >= 0.08:
        risk_off_votes += 2.0
    if gold_20 > 0.015 and usd_20 > 0.007:
        risk_off_votes += 1.0
    if btc_20 > 0.10 and vix_5 < 0:
        risk_on_votes += 1.0

    if "RISK_ON_BREADTH_TECH" in active_ids:
        risk_on_votes += 1.25
    if "BTC_DECOUPLE_EQUITY" in active_ids:
        risk_on_votes += 0.75
    if "VIX_UP_SPX_FLAT" in active_ids:
        risk_off_votes += 1.5
    if "GOLD_UP_USD_UP" in active_ids:
        risk_off_votes += 1.25

    if macro_score > 0.12:
        risk_on_votes += 0.6
    elif macro_score < -0.12:
        risk_off_votes += 0.6

    if regime_score > 0.12:
        risk_on_votes += 0.5
    elif regime_score < -0.12:
        risk_off_votes += 0.5

    if risk_score > 0.12:
        risk_off_votes += 0.5
    elif risk_score < -0.12:
        risk_on_votes += 0.4

    spread = risk_on_votes - risk_off_votes
    if spread >= 1.8:
        regime = "RISK_ON"
    elif spread <= -1.8:
        regime = "RISK_OFF"
    else:
        regime = "MIXED"

    input_vec = [macro_score, news_score, regime_score, -risk_score, fed_proxy_score, seasonality_score]
    signs = [1 if x > 0.08 else -1 if x < -0.08 else 0 for x in input_vec]
    non_zero = [s for s in signs if s != 0]

    disagreements = 0
    pairs = 0
    for i in range(len(non_zero)):
        for j in range(i + 1, len(non_zero)):
            pairs += 1
            if non_zero[i] != non_zero[j]:
                disagreements += 1
    disagreement_ratio = (disagreements / pairs) if pairs else 0.0

    structural_clarity = _clamp(100.0 - disagreement_ratio * 58.0 + abs(spread) * 6.0, 15.0, 98.0)
    stress_score = _clamp(
        (max(vix_level - 16.0, 0.0) * 3.0)
        + (max(vix_5, 0.0) * 170.0)
        + (max(gold_20 + usd_20, 0.0) * 60.0)
        + (max(oil_20, 0.0) * 45.0)
        + (risk_off_votes * 5.0)
        - (risk_on_votes * 2.5),
        0.0,
        100.0,
    )
    macro_filter_score = _clamp(100.0 - stress_score + structural_clarity * 0.24, 4.0, 99.0)

    growth_proxy = _direction_from_score(50.0 + (spy_20 * 450.0) + (qqq_20 * 500.0) + (spx_sign + nas_sign) * 4.0)
    inflation_proxy = _direction_from_score(
        50.0 + (gold_20 * 220.0) + (oil_20 * 280.0) + (usd_sign + xau_sign) * 5.0 + (fed_proxy_score * 12.0)
    )
    liquidity_signal = (qqq_20 * 220.0) + (btc_20 * 110.0) - (vix_5 * 160.0)
    liquidity_tone = "EXPANDING" if liquidity_signal > 8 else "CONTRACTING" if liquidity_signal < -8 else "TRANSITION"

    return {
        "generated_at": now.isoformat(),
        "regime": regime,
        "growth_proxy": growth_proxy,
        "inflation_proxy": inflation_proxy,
        "liquidity_tone": liquidity_tone,
        "vix": {"current": round(vix_level, 2), "change_5d_pct": round(vix_5 * 100.0, 2)},
        "scores": {
            "macro_filter_score": round(macro_filter_score, 2),
            "clarity_score": round(structural_clarity, 2),
            "stress_score": round(stress_score, 2),
            "macro_score": round(macro_score, 4),
            "news_score": round(news_score, 4),
            "regime_score": round(regime_score, 4),
            "risk_score": round(risk_score, 4),
            "fed_proxy_score": round(fed_proxy_score, 4),
            "seasonality_score": round(seasonality_score, 4),
        },
        "notes": [
            "Macro layer blends live cross-asset states with deep-research overlay.",
            "High clarity means macro/news/regime components are internally aligned.",
            "This model maps positioning clusters; it does not produce execution entries.",
        ],
    }


def _fetch_cboe_options(symbol: str, warnings: List[str]) -> List[Dict[str, Any]]:
    url = f"https://cdn.cboe.com/api/global/delayed_quotes/options/{quote(symbol, safe='')}.json"
    try:
        response = _HTTP.get(url, timeout=20)
    except Exception as exc:
        warnings.append(f"options request failed {symbol}: {exc}")
        return []

    if response.status_code != 200:
        warnings.append(f"options bad status {symbol}: {response.status_code}")
        return []

    try:
        payload = response.json()
    except Exception as exc:
        warnings.append(f"options json parse failed {symbol}: {exc}")
        return []

    return ((payload.get("data") or {}).get("options") or [])


def _parse_option_symbol(symbol: str) -> Optional[Tuple[date, str, float]]:
    match = OPTION_RE.match(str(symbol or ""))
    if not match:
        return None
    yy_mm_dd = match.group(2)
    side_raw = match.group(3)
    strike_raw = match.group(4)

    year = 2000 + _safe_int(yy_mm_dd[0:2], 0)
    month = _safe_int(yy_mm_dd[2:4], 0)
    day = _safe_int(yy_mm_dd[4:6], 0)
    try:
        expiry = date(year, month, day)
    except Exception:
        return None

    side = "CALL" if side_raw == "C" else "PUT"
    strike = _safe_int(strike_raw, 0) / 1000.0
    return expiry, side, strike


def _process_cboe_options(
    options: List[Dict[str, Any]],
    ticker: str,
    spot: float,
    now: datetime,
    themes: Tuple[str, ...],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if not options or spot <= 0:
        return rows

    for option in options:
        volume = _safe_float(option.get("volume"), 0.0)
        if volume <= 0:
            continue

        parsed = _parse_option_symbol(option.get("option", ""))
        if not parsed:
            continue

        expiry, side, strike = parsed
        dte = (expiry - now.date()).days
        if dte < 2 or dte > OPTIONS_EXPIRY_MAX_DAYS:
            continue
        if strike <= 0:
            continue

        # keep practical strikes only
        if strike < spot * 0.55 or strike > spot * 1.45:
            continue

        oi = max(_safe_float(option.get("open_interest"), 0.0), 1.0)
        bid = _safe_float(option.get("bid"), 0.0)
        ask = _safe_float(option.get("ask"), 0.0)
        last = _safe_float(option.get("last_trade_price"), 0.0)
        iv = _safe_float(option.get("iv"), 0.0)

        mid = ((bid + ask) / 2.0) if (bid > 0 and ask > 0) else max(last, bid, ask, 0.0)
        if mid <= 0.0:
            continue

        spread = max(ask - bid, 0.0)
        rel_fill = ((last - mid) / (spread / 2.0)) if spread > 1e-9 else 0.0
        rel_fill = _clamp(rel_fill, -1.8, 1.8)

        volume_oi_ratio = volume / oi
        premium = max(last, mid) * volume * 100.0
        urgency = _clamp((abs(rel_fill) * 0.45) + (volume_oi_ratio / 8.0) + (premium / 2000000.0), 0.0, 1.0)

        moneyness = abs((strike / max(spot, 1e-9)) - 1.0)
        is_otm = (side == "CALL" and strike > spot) or (side == "PUT" and strike < spot)

        anomaly_score = _clamp(
            min(volume_oi_ratio / 6.0, 1.0) * 34.0
            + min(premium / 1500000.0, 1.0) * 28.0
            + urgency * 18.0
            + (10.0 if (is_otm and dte <= 30 and moneyness <= 0.12) else 0.0)
            + min(iv / 1.5, 1.0) * 10.0,
            0.0,
            99.5,
        )

        quality_score = 0.0
        if volume_oi_ratio >= 2.0:
            quality_score += 28.0
        if premium >= 300000:
            quality_score += 24.0
        if abs(rel_fill) >= 0.30:
            quality_score += 16.0
        if 7 <= dte <= 45:
            quality_score += 16.0
        if is_otm:
            quality_score += 8.0
        if volume >= 200:
            quality_score += 8.0
        quality_score = _clamp(quality_score, 0.0, 100.0)

        is_footprint = bool(anomaly_score >= 58.0 and quality_score >= 48.0 and premium >= 150000.0)

        rows.append(
            {
                "ticker": ticker,
                "asset_proxy": ticker,
                "themes": list(themes),
                "bias": "BULLISH" if side == "CALL" else "BEARISH",
                "option_side": side,
                "expiry": expiry.isoformat(),
                "dte": dte,
                "is_footprint": is_footprint,
                "anomaly_score": round(anomaly_score, 2),
                "quality_score": round(quality_score, 2),
                "metrics": {
                    "volume_oi_ratio": round(volume_oi_ratio, 2),
                    "sweep_ratio": round(urgency, 2),
                    "aggressive_fill_pct": round(_clamp(50.0 + abs(rel_fill) * 33.0, 0.0, 100.0), 1),
                    "call_put_skew": 1.0 if side == "CALL" else -1.0,
                    "block_premium_usd": int(max(0.0, round(premium))),
                    "quality_score": round(quality_score, 2),
                    "dte": int(dte),
                    "moneyness_pct": round(moneyness * 100.0, 2),
                    "iv": round(iv, 4),
                },
            }
        )

    rows.sort(key=lambda row: row.get("anomaly_score", 0.0), reverse=True)
    return rows[:OPTIONS_MAX_PER_TICKER]


def _build_uoa_watchlist(
    history_map: Dict[str, Dict[str, List[float]]],
    now: datetime,
    warnings: List[str],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    def _worker(ticker: str) -> Tuple[List[Dict[str, Any]], List[str]]:
        local_warnings: List[str] = []
        local_rows: List[Dict[str, Any]] = []
        themes = OPTION_TICKER_TO_THEME.get(ticker, ("AI_TECH",))
        spot = _series_last(history_map.get(ticker) or {})
        if spot <= 0:
            return local_rows, local_warnings
        options = _fetch_cboe_options(ticker, local_warnings)
        if not options:
            return local_rows, local_warnings
        local_rows.extend(_process_cboe_options(options, ticker, spot, now, themes))
        return local_rows, local_warnings

    max_workers = max(1, min(6, len(OPTIONS_UNIVERSE)))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {pool.submit(_worker, ticker): ticker for ticker in OPTIONS_UNIVERSE}
        for future in as_completed(future_map):
            symbol = future_map[future]
            try:
                local_rows, local_warnings = future.result()
            except Exception as exc:
                warnings.append(f"options worker failed {symbol}: {exc}")
                continue
            warnings.extend(local_warnings)
            rows.extend(local_rows)

    rows.sort(key=lambda row: row.get("anomaly_score", 0.0), reverse=True)
    return rows[:OPTIONS_MAX_ROWS]


def _inject_deep_signal_proxies(
    signals: List[Dict[str, Any]],
    uoa_watchlist: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if len(uoa_watchlist) >= 8:
        return uoa_watchlist

    out = list(uoa_watchlist)
    for idx, signal in enumerate((signals or [])[:12]):
        asset = str(signal.get("asset", "UNKNOWN"))
        themes = DEEP_ASSET_TO_THEME.get(asset, ("AI_TECH",))
        proxy_tickers = DEEP_ASSET_TO_PROXY_TICKERS.get(asset, ("SPY",))
        ticker = proxy_tickers[idx % len(proxy_tickers)]

        probability = _safe_float(signal.get("probability_score"), 50.0)
        confluence = _safe_float(signal.get("confluence_score"), 50.0)
        sample_size = _safe_float(signal.get("sample_size"), 0.0)
        win_rate = _safe_float(signal.get("win_rate"), 50.0)
        bias = str(signal.get("bias", "NEUTRAL")).upper()
        direction = "CALL" if "BULL" in bias else "PUT" if "BEAR" in bias else "CALL"

        anomaly = _clamp(
            24.0 + (probability - 50.0) * 0.55 + (confluence - 50.0) * 0.25 + min(sample_size / 15.0, 12.0),
            20.0,
            78.0,
        )
        quality = _clamp(18.0 + (win_rate - 50.0) * 0.45 + min(sample_size / 20.0, 16.0), 15.0, 72.0)
        premium = int(_clamp(60000.0 + probability * sample_size * 60.0, 50000.0, 700000.0))

        out.append(
            {
                "ticker": ticker,
                "asset_proxy": asset,
                "themes": list(themes),
                "bias": "BULLISH" if direction == "CALL" else "BEARISH",
                "option_side": direction,
                "expiry": None,
                "dte": None,
                "is_footprint": bool(anomaly >= 62.0 and quality >= 55.0),
                "anomaly_score": round(anomaly, 2),
                "quality_score": round(quality, 2),
                "source_signal": {
                    "probability_score": round(probability, 2),
                    "confluence_score": round(confluence, 2),
                    "sample_size": int(sample_size),
                },
                "metrics": {
                    "volume_oi_ratio": round(_clamp(1.0 + probability / 40.0, 0.8, 4.5), 2),
                    "sweep_ratio": round(_clamp(confluence / 100.0, 0.1, 0.85), 2),
                    "aggressive_fill_pct": round(_clamp(win_rate, 20.0, 85.0), 1),
                    "call_put_skew": 1.0 if direction == "CALL" else -1.0,
                    "block_premium_usd": premium,
                    "quality_score": round(quality, 2),
                    "dte": None,
                    "moneyness_pct": None,
                    "iv": None,
                },
            }
        )

    out.sort(key=lambda row: row.get("anomaly_score", 0.0), reverse=True)
    return out[:OPTIONS_MAX_ROWS]


def _aggregate_uoa_by_theme(uoa_rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {
            "weighted_anomaly": 0.0,
            "weighted_quality": 0.0,
            "weight": 0.0,
            "count": 0,
            "footprints": 0,
            "tickers": [],
            "call_count": 0,
            "put_count": 0,
        }
    )

    for row in uoa_rows:
        anomaly = _safe_float(row.get("anomaly_score"), 0.0)
        quality = _safe_float(row.get("quality_score"), 0.0)
        is_footprint = bool(row.get("is_footprint"))
        weight = 1.0 + (0.35 if is_footprint else 0.0)
        side = str(row.get("option_side", "")).upper()
        ticker = str(row.get("ticker", ""))

        for theme in row.get("themes", []):
            g = grouped[theme]
            g["weighted_anomaly"] += anomaly * weight
            g["weighted_quality"] += quality * weight
            g["weight"] += weight
            g["count"] += 1
            if is_footprint:
                g["footprints"] += 1
            if ticker:
                g["tickers"].append(ticker)
            if side == "CALL":
                g["call_count"] += 1
            elif side == "PUT":
                g["put_count"] += 1

    out: Dict[str, Dict[str, Any]] = {}
    for theme, val in grouped.items():
        w = _safe_float(val.get("weight"), 0.0)
        if w <= 0:
            continue
        agg = _safe_float(val.get("weighted_anomaly"), 0.0) / w
        cons = _safe_float(val.get("weighted_quality"), 0.0) / w
        calls = _safe_float(val.get("call_count"), 0.0)
        puts = _safe_float(val.get("put_count"), 0.0)
        skew = (calls - puts) / max(calls + puts, 1.0)
        out[theme] = {
            "aggressive_score": round(_clamp(agg, 0.0, 99.5), 2),
            "conservative_score": round(_clamp(cons, 0.0, 99.5), 2),
            "count": _safe_int(val.get("count"), 0),
            "footprints": _safe_int(val.get("footprints"), 0),
            "tickers": sorted(set(val.get("tickers", []))),
            "call_put_skew": round(skew, 3),
        }
    return out


def _aggregate_theme_scores(
    theme_uoa: Dict[str, Dict[str, Any]],
    sector_rotation: List[Dict[str, Any]],
    cross_asset_flags: List[Dict[str, Any]],
    macro_filter: Dict[str, Any],
) -> List[Dict[str, Any]]:
    rotation_by_theme = {row["theme"]: row for row in sector_rotation}
    cross_by_theme: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"active_weight": 0.0, "possible_weight": 0.0, "active_ids": []})

    for flag in cross_asset_flags:
        weight = _safe_float(flag.get("weight"), 0.0)
        active = bool(flag.get("active"))
        for theme in flag.get("themes", []):
            c = cross_by_theme[theme]
            c["possible_weight"] += weight
            if active:
                c["active_weight"] += weight
                c["active_ids"].append(flag.get("id"))

    regime = macro_filter.get("regime", "MIXED")
    macro_filter_score = _safe_float((macro_filter.get("scores") or {}).get("macro_filter_score"), 50.0)
    macro_clarity = _safe_float((macro_filter.get("scores") or {}).get("clarity_score"), 50.0)

    rows: List[Dict[str, Any]] = []
    for theme in THEMES:
        meta = THEME_META.get(theme, {})
        u = theme_uoa.get(theme, {})
        r = rotation_by_theme.get(theme, {})
        c = cross_by_theme.get(theme, {})

        uoa_aggressive = _safe_float(u.get("aggressive_score"), 22.0)
        uoa_conservative = _safe_float(u.get("conservative_score"), 20.0)
        uoa_count = _safe_int(u.get("count"), 0)
        uoa_footprints = _safe_int(u.get("footprints"), 0)
        call_put_skew = _safe_float(u.get("call_put_skew"), 0.0)

        rotation_score = _safe_float(r.get("rotation_score"), 50.0)
        hist_edge = _safe_float((r.get("historical_validation") or {}).get("edge_score"), 50.0)

        active_weight = _safe_float(c.get("active_weight"), 0.0)
        possible_weight = max(_safe_float(c.get("possible_weight"), 0.0), 1.0)
        cross_score = _clamp((active_weight / possible_weight) * 100.0, 0.0, 100.0)

        macro_adj = 0.0
        if regime == "RISK_OFF":
            if theme in {"DEFENSE", "CRISIS_HEDGE", "USD_RATES", "ENERGY"}:
                macro_adj += 6.0
            if theme in {"AI_TECH", "CRYPTO_BETA"}:
                macro_adj -= 6.0
        elif regime == "RISK_ON":
            if theme in {"AI_TECH", "CRYPTO_BETA"}:
                macro_adj += 6.0
            if theme in {"DEFENSE", "CRISIS_HEDGE"}:
                macro_adj -= 5.0

        aggressive_score = _clamp(
            (0.52 * uoa_aggressive)
            + (0.23 * rotation_score)
            + (0.17 * cross_score)
            + (0.08 * macro_filter_score)
            + macro_adj,
            0.0,
            99.5,
        )
        conservative_score = _clamp(
            (0.25 * uoa_conservative)
            + (0.30 * rotation_score)
            + (0.30 * hist_edge)
            + (0.15 * cross_score)
            + (macro_adj * 0.65),
            0.0,
            99.5,
        )
        barbell = _clamp((aggressive_score * 0.46) + (conservative_score * 0.54), 0.0, 99.5)

        evidence_density = _clamp((uoa_count / 16.0) + (uoa_footprints / 10.0) + (active_weight / 30.0), 0.0, 2.5)
        stability_bonus = 8.0 if abs(aggressive_score - conservative_score) <= 16.0 else -4.0
        confidence = _clamp((macro_clarity * 0.38) + (hist_edge * 0.28) + (evidence_density * 16.0) + stability_bonus, 18.0, 99.0)

        rows.append(
            {
                "theme": theme,
                "sector": meta.get("sector"),
                "scenario": meta.get("scenario"),
                "uoa": {
                    "score": round((uoa_aggressive * 0.58) + (uoa_conservative * 0.42), 2),
                    "aggressive_score": round(uoa_aggressive, 2),
                    "conservative_score": round(uoa_conservative, 2),
                    "events_count": uoa_count,
                    "footprints_count": uoa_footprints,
                    "top_tickers": list(u.get("tickers", []))[:5],
                    "call_put_skew": round(call_put_skew, 3),
                },
                "rotation": {
                    "score": round(rotation_score, 2),
                    "state": r.get("state", "NEUTRAL"),
                    "relative_strength": r.get("relative_strength") or {},
                    "volume_ratio": r.get("volume_ratio"),
                    "benchmark_alpha": r.get("benchmark_alpha"),
                },
                "historical_validation": r.get("historical_validation") or {},
                "cross_asset": {
                    "score": round(cross_score, 2),
                    "active_flags": list(c.get("active_ids", [])),
                    "active_count": len(c.get("active_ids", [])),
                },
                "macro_filter_adjustment": round(macro_adj, 2),
                "aggressive_score": round(aggressive_score, 2),
                "conservative_score": round(conservative_score, 2),
                "barbell_score": round(barbell, 2),
                "composite_score": round(barbell, 2),
                "bucket": _bucket_from_score(barbell),
                "confidence": round(confidence, 2),
            }
        )

    rows.sort(key=lambda row: row.get("composite_score", 0.0), reverse=True)
    return rows


def _build_news_lag_model(theme_scores: List[Dict[str, Any]], now: datetime) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    for row in theme_scores:
        theme = str(row.get("theme"))
        base_lag = _safe_int(THEME_LAG_HOURS.get(theme, 18), 18)
        aggressive = _safe_float(row.get("aggressive_score"), 50.0)
        conservative = _safe_float(row.get("conservative_score"), 50.0)
        edge = _safe_float((row.get("historical_validation") or {}).get("edge_score"), 50.0)
        sample_days = _safe_int((row.get("historical_validation") or {}).get("sample_days"), 0)

        lead_multiplier = 0.72 + (aggressive / 100.0) * 0.52 + ((100.0 - conservative) / 100.0) * 0.18
        lead_multiplier += ((edge - 50.0) / 100.0) * 0.12
        lead_multiplier = _clamp(lead_multiplier, 0.45, 1.65)
        lead_hours = int(round(base_lag * lead_multiplier))
        lead_hours = max(4, min(96, lead_hours))

        edge_window = int(round(max(6.0, lead_hours * (0.48 + conservative / 240.0))))
        edge_window = max(6, min(72, edge_window))

        rows.append(
            {
                "theme": theme,
                "historical_avg_lead_hours": base_lag,
                "estimated_current_lead_hours": lead_hours,
                "edge_window_hours": edge_window,
                "estimated_first_positioning_ts": (now - timedelta(hours=lead_hours)).isoformat(),
                "estimated_news_visibility_ts": now.isoformat(),
                "calibration_sample_days": sample_days,
            }
        )

    avg_lag = sum(_safe_float(r.get("estimated_current_lead_hours"), 0.0) for r in rows) / max(len(rows), 1)
    return {
        "status": "calibrated",
        "average_estimated_lead_hours": round(avg_lag, 2),
        "by_theme": rows,
        "notes": [
            "Lag estimate is calibrated by score intensity and historical edge.",
            "Edge window quantifies probable narrative delay, not execution timing.",
        ],
    }


def _build_data_quality(
    now: datetime,
    history_map: Dict[str, Dict[str, List[float]]],
    uoa_watchlist: List[Dict[str, Any]],
    cross_asset_flags: List[Dict[str, Any]],
    warnings: List[str],
) -> Dict[str, Any]:
    required_hist = ("SPY", "QQQ", "XLE", "ITA", "GLD", "UUP", "BTC-USD", "^VIX", "CL=F", "TLT", "XLK")
    loaded_hist = [ticker for ticker in required_hist if history_map.get(ticker, {}).get("close")]
    missing_hist = [ticker for ticker in required_hist if ticker not in loaded_hist]

    option_tickers_with_data = sorted({str(row.get("ticker", "")) for row in uoa_watchlist if row.get("ticker")})
    option_cov = (len(option_tickers_with_data) / max(len(OPTIONS_UNIVERSE), 1)) * 100.0
    hist_cov = (len(loaded_hist) / max(len(required_hist), 1)) * 100.0

    latest_hist_ages: List[float] = []
    stale_assets: List[str] = []
    for ticker in loaded_hist:
        ts_list = history_map.get(ticker, {}).get("timestamps", [])
        if not ts_list:
            continue
        last_ts = _safe_int(ts_list[-1], 0)
        if last_ts <= 0:
            continue
        age_hours = max(0.0, (now.timestamp() - float(last_ts)) / 3600.0)
        latest_hist_ages.append(age_hours)
        if age_hours > 96.0:
            stale_assets.append(ticker)

    freshness_hours = _mean(latest_hist_ages) if latest_hist_ages else 999.0
    active_cross = sum(1 for row in cross_asset_flags if row.get("active"))
    footprints = sum(1 for row in uoa_watchlist if row.get("is_footprint"))
    warn_penalty = min(len(warnings) * 4.0, 25.0)

    quality_score = _clamp(
        (0.42 * hist_cov)
        + (0.26 * option_cov)
        + (0.16 * min(100.0, footprints * 2.6))
        + (0.16 * min(100.0, active_cross * 18.0))
        - warn_penalty
        - (8.0 if stale_assets else 0.0),
        0.0,
        100.0,
    )

    return {
        "score": round(quality_score, 2),
        "history_coverage_pct": round(hist_cov, 2),
        "options_coverage_pct": round(option_cov, 2),
        "history_tickers_loaded": len(loaded_hist),
        "history_tickers_required": len(required_hist),
        "missing_history_tickers": missing_hist,
        "option_tickers_with_data": option_tickers_with_data,
        "uoa_events": len(uoa_watchlist),
        "footprint_events": footprints,
        "cross_flags_active": active_cross,
        "avg_history_age_hours": round(freshness_hours, 2),
        "stale_assets": stale_assets,
        "warning_count": len(warnings),
    }


def _build_explainability(theme_scores: List[Dict[str, Any]], macro_filter: Dict[str, Any]) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    for row in theme_scores:
        uoa_aggressive = _safe_float((row.get("uoa") or {}).get("aggressive_score"), 0.0)
        uoa_conservative = _safe_float((row.get("uoa") or {}).get("conservative_score"), 0.0)
        rotation = _safe_float((row.get("rotation") or {}).get("score"), 0.0)
        cross = _safe_float((row.get("cross_asset") or {}).get("score"), 0.0)
        hist_edge = _safe_float((row.get("historical_validation") or {}).get("edge_score"), 0.0)
        macro_adj = _safe_float(row.get("macro_filter_adjustment"), 0.0)

        ag_layer = {
            "uoa": 0.52 * uoa_aggressive,
            "rotation": 0.23 * rotation,
            "cross_asset": 0.17 * cross,
            "macro": 0.08 * _safe_float((macro_filter.get("scores") or {}).get("macro_filter_score"), 50.0),
            "macro_adjustment": macro_adj,
        }
        cons_layer = {
            "uoa": 0.25 * uoa_conservative,
            "rotation": 0.30 * rotation,
            "historical_edge": 0.30 * hist_edge,
            "cross_asset": 0.15 * cross,
            "macro_adjustment": macro_adj * 0.65,
        }

        total = _safe_float(row.get("barbell_score"), 0.0)
        layer_sum = sum(ag_layer.values()) * 0.46 + sum(cons_layer.values()) * 0.54
        norm = total if total > 0 else max(layer_sum, 1e-9)
        rows.append(
            {
                "theme": row.get("theme"),
                "barbell_score": round(total, 2),
                "aggressive_score": row.get("aggressive_score"),
                "conservative_score": row.get("conservative_score"),
                "layers": {
                    "uoa_pct": round(_clamp((((ag_layer["uoa"] * 0.46) + (cons_layer["uoa"] * 0.54)) / norm) * 100.0, 0.0, 100.0), 2),
                    "rotation_pct": round(_clamp((((ag_layer["rotation"] * 0.46) + (cons_layer["rotation"] * 0.54)) / norm) * 100.0, 0.0, 100.0), 2),
                    "cross_asset_pct": round(_clamp((((ag_layer["cross_asset"] * 0.46) + (cons_layer["cross_asset"] * 0.54)) / norm) * 100.0, 0.0, 100.0), 2),
                    "historical_edge_pct": round(_clamp(((cons_layer["historical_edge"] * 0.54) / norm) * 100.0, 0.0, 100.0), 2),
                    "macro_pct": round(_clamp((((ag_layer["macro"] * 0.46) + ((cons_layer["macro_adjustment"] + ag_layer["macro_adjustment"]) * 0.5 * 0.54)) / norm) * 100.0, -100.0, 100.0), 2),
                },
                "raw_components": {
                    "aggressive": {k: round(v, 2) for k, v in ag_layer.items()},
                    "conservative": {k: round(v, 2) for k, v in cons_layer.items()},
                },
            }
        )

    rows.sort(key=lambda item: _safe_float(item.get("barbell_score"), 0.0), reverse=True)
    top = rows[:3]
    def _avg_layer(key: str) -> float:
        if not top:
            return 0.0
        return sum(_safe_float((x.get("layers") or {}).get(key), 0.0) for x in top) / len(top)
    return {
        "top_themes": rows[:6],
        "global_layer_mix": {
            "uoa_pct": round(_avg_layer("uoa_pct"), 2),
            "rotation_pct": round(_avg_layer("rotation_pct"), 2),
            "cross_asset_pct": round(_avg_layer("cross_asset_pct"), 2),
            "historical_edge_pct": round(_avg_layer("historical_edge_pct"), 2),
            "macro_pct": round(_avg_layer("macro_pct"), 2),
        },
    }


def _build_regime_timeline(
    history_map: Dict[str, Dict[str, List[float]]],
    now: datetime,
) -> Dict[str, Any]:
    spy = history_map.get("SPY") or {}
    qqq = history_map.get("QQQ") or {}
    vix = history_map.get("^VIX") or {}
    gold = history_map.get("GLD") or {}
    usd = history_map.get("UUP") or {}
    btc = history_map.get("BTC-USD") or {}

    spy_ts = [_safe_int(t, 0) for t in spy.get("timestamps", [])]
    spy_close = [_safe_float(v, 0.0) for v in spy.get("close", [])]
    if len(spy_ts) < 40 or len(spy_close) < 40:
        return {"status": "insufficient", "rows": [], "summary": {}}

    aligned_qqq = {int(ts): close for ts, close, _, _ in _align_to_benchmark(qqq, spy)}
    aligned_vix = {int(ts): close for ts, close, _, _ in _align_to_benchmark(vix, spy)}
    aligned_gold = {int(ts): close for ts, close, _, _ in _align_to_benchmark(gold, spy)}
    aligned_usd = {int(ts): close for ts, close, _, _ in _align_to_benchmark(usd, spy)}
    aligned_btc = {int(ts): close for ts, close, _, _ in _align_to_benchmark(btc, spy)}

    rows: List[Dict[str, Any]] = []
    for i in range(25, len(spy_ts)):
        ts = spy_ts[i]
        prev_5_ts = spy_ts[i - 5]
        prev_20_ts = spy_ts[i - 20]
        spy_now = spy_close[i]
        spy_5 = _safe_float(spy_close[i - 5], 0.0)
        spy_20 = _safe_float(spy_close[i - 20], 0.0)
        if spy_now <= 0 or spy_5 <= 0 or spy_20 <= 0:
            continue
        spy_r5 = (spy_now / spy_5) - 1.0
        spy_r20 = (spy_now / spy_20) - 1.0

        def _ret(aligned: Dict[int, float], curr_ts: int, prev_ts: int) -> float:
            curr = _safe_float(aligned.get(curr_ts), 0.0)
            prev = _safe_float(aligned.get(prev_ts), 0.0)
            if curr <= 0 or prev <= 0:
                return 0.0
            return (curr / prev) - 1.0

        qqq_r20 = _ret(aligned_qqq, ts, prev_20_ts)
        vix_r5 = _ret(aligned_vix, ts, prev_5_ts)
        gold_r20 = _ret(aligned_gold, ts, prev_20_ts)
        usd_r20 = _ret(aligned_usd, ts, prev_20_ts)
        btc_r20 = _ret(aligned_btc, ts, prev_20_ts)

        regime_score = (
            (spy_r20 * 220.0)
            + (qqq_r20 * 180.0)
            - (vix_r5 * 210.0)
            - (max(gold_r20 + usd_r20, 0.0) * 60.0)
            + (btc_r20 * 65.0)
            + (spy_r5 * 80.0)
        )

        if regime_score >= 6.0:
            regime = "RISK_ON"
        elif regime_score <= -6.0:
            regime = "RISK_OFF"
        else:
            regime = "MIXED"

        rows.append(
            {
                "date": datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat(),
                "regime": regime,
                "score": round(regime_score, 2),
                "spy_20d_pct": round(spy_r20 * 100.0, 2),
                "vix_5d_pct": round(vix_r5 * 100.0, 2),
            }
        )

    rows = rows[-90:]
    def _window_summary(days: int) -> Dict[str, Any]:
        chunk = rows[-days:] if rows else []
        if not chunk:
            return {"risk_on_days": 0, "risk_off_days": 0, "mixed_days": 0, "avg_score": 0.0, "dominant_regime": "MIXED"}
        on = sum(1 for r in chunk if r.get("regime") == "RISK_ON")
        off = sum(1 for r in chunk if r.get("regime") == "RISK_OFF")
        mixed = len(chunk) - on - off
        avg = _mean([_safe_float(r.get("score"), 0.0) for r in chunk])
        dominant = "RISK_ON" if on > max(off, mixed) else "RISK_OFF" if off > max(on, mixed) else "MIXED"
        return {
            "risk_on_days": on,
            "risk_off_days": off,
            "mixed_days": mixed,
            "avg_score": round(avg, 2),
            "dominant_regime": dominant,
        }

    return {
        "status": "active",
        "as_of": now.isoformat(),
        "rows": rows,
        "summary": {"7d": _window_summary(7), "30d": _window_summary(30), "90d": _window_summary(90)},
    }


def _build_alert_engine(
    now: datetime,
    theme_scores: List[Dict[str, Any]],
    cross_asset_flags: List[Dict[str, Any]],
    macro_filter: Dict[str, Any],
) -> Dict[str, Any]:
    active_cross_ids = {str(flag.get("id")) for flag in cross_asset_flags if flag.get("active")}
    stress = _safe_float((macro_filter.get("scores") or {}).get("stress_score"), 0.0)
    alerts: List[Dict[str, Any]] = []
    for row in theme_scores[:6]:
        theme = str(row.get("theme"))
        barbell = _safe_float(row.get("barbell_score"), 0.0)
        ag = _safe_float(row.get("aggressive_score"), 0.0)
        cons = _safe_float(row.get("conservative_score"), 0.0)
        cross_count = _safe_int((row.get("cross_asset") or {}).get("active_count"), 0)
        uoa_events = _safe_int((row.get("uoa") or {}).get("events_count"), 0)
        edge = _safe_float((row.get("historical_validation") or {}).get("edge_score"), 50.0)
        trigger = bool(barbell >= 62.0 and (cross_count >= 1 or uoa_events >= 6))

        if barbell >= 75.0 and trigger:
            severity = "HIGH"
        elif barbell >= 62.0 and trigger:
            severity = "MEDIUM"
        elif barbell >= 52.0:
            severity = "WATCH"
        else:
            severity = "LOW"

        if ag >= cons + 8.0:
            stance = "Aggressive lead: early footprint, monitor confirmation."
        elif cons >= ag + 8.0:
            stance = "Conservative lead: confirmed flow cluster."
        else:
            stance = "Balanced barbell: aggressive and conservative layers aligned."

        action = (
            "Escalate monitoring and keep scenario map active."
            if trigger
            else "Keep in watchlist, wait additional confluence."
        )

        alerts.append(
            {
                "theme": theme,
                "severity": severity,
                "triggered": trigger,
                "barbell_score": round(barbell, 2),
                "aggressive_score": round(ag, 2),
                "conservative_score": round(cons, 2),
                "cross_active_count": cross_count,
                "uoa_events": uoa_events,
                "historical_edge_score": round(edge, 2),
                "stance": stance,
                "action": action,
                "active_cross_flags": [flag for flag in (row.get("cross_asset") or {}).get("active_flags", []) if flag in active_cross_ids],
            }
        )

    triggered_count = sum(1 for alert in alerts if alert.get("triggered"))
    if stress >= 70.0:
        global_risk = "HIGH"
    elif stress >= 45.0:
        global_risk = "MEDIUM"
    else:
        global_risk = "NORMAL"

    return {
        "generated_at": now.isoformat(),
        "global_risk": global_risk,
        "triggered_count": triggered_count,
        "alerts": alerts,
    }


def _build_validation_lab(theme_scores: List[Dict[str, Any]]) -> Dict[str, Any]:
    buckets = [
        {"id": "STRONG", "label": "75+", "lo": 75.0, "hi": 100.0},
        {"id": "BUILDING", "label": "60-74.9", "lo": 60.0, "hi": 75.0},
        {"id": "EARLY", "label": "45-59.9", "lo": 45.0, "hi": 60.0},
        {"id": "NOISE", "label": "<45", "lo": -1.0, "hi": 45.0},
    ]

    rows: List[Dict[str, Any]] = []
    for bucket in buckets:
        bucket_rows = [
            row for row in theme_scores
            if bucket["lo"] <= _safe_float(row.get("barbell_score"), 0.0) < bucket["hi"]
        ]
        sample = len(bucket_rows)
        if sample <= 0:
            rows.append(
                {
                    "bucket": bucket["label"],
                    "themes": [],
                    "samples": 0,
                    "avg_barbell_score": 0.0,
                    "avg_confidence": 0.0,
                    "avg_edge_score": 0.0,
                    "accumulation_hit_rate_20d": 0.0,
                    "distribution_hit_rate_20d": 0.0,
                }
            )
            continue

        avg_barbell = _mean([_safe_float(row.get("barbell_score"), 0.0) for row in bucket_rows])
        avg_conf = _mean([_safe_float(row.get("confidence"), 0.0) for row in bucket_rows])
        avg_edge = _mean([_safe_float((row.get("historical_validation") or {}).get("edge_score"), 0.0) for row in bucket_rows])
        acc20 = _mean([_safe_float((row.get("historical_validation") or {}).get("accumulation_hit_rate_20d"), 0.0) for row in bucket_rows])
        dist20 = _mean([_safe_float((row.get("historical_validation") or {}).get("distribution_hit_rate_20d"), 0.0) for row in bucket_rows])
        rows.append(
            {
                "bucket": bucket["label"],
                "themes": [str(r.get("theme")) for r in bucket_rows],
                "samples": sample,
                "avg_barbell_score": round(avg_barbell, 2),
                "avg_confidence": round(avg_conf, 2),
                "avg_edge_score": round(avg_edge, 2),
                "accumulation_hit_rate_20d": round(acc20, 2),
                "distribution_hit_rate_20d": round(dist20, 2),
            }
        )

    return {"status": "active", "rows": rows}


def _build_theme_drilldown(
    theme_scores: List[Dict[str, Any]],
    uoa_watchlist: List[Dict[str, Any]],
    cross_asset_flags: List[Dict[str, Any]],
) -> Dict[str, Any]:
    by_theme_rows: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in uoa_watchlist:
        for theme in row.get("themes", []):
            by_theme_rows[str(theme)].append(row)
    for theme in list(by_theme_rows.keys()):
        by_theme_rows[theme].sort(key=lambda r: _safe_float(r.get("anomaly_score"), 0.0), reverse=True)

    output = []
    for row in theme_scores[:6]:
        theme = str(row.get("theme"))
        theme_uoa = by_theme_rows.get(theme, [])
        top_contracts = [
            {
                "ticker": item.get("ticker"),
                "side": item.get("option_side"),
                "anomaly_score": item.get("anomaly_score"),
                "quality_score": item.get("quality_score"),
                "dte": item.get("dte"),
                "expiry": item.get("expiry"),
                "block_premium_usd": (item.get("metrics") or {}).get("block_premium_usd"),
                "volume_oi_ratio": (item.get("metrics") or {}).get("volume_oi_ratio"),
                "is_footprint": bool(item.get("is_footprint")),
            }
            for item in theme_uoa[:6]
        ]
        linked_flags = [
            {
                "id": flag.get("id"),
                "label": flag.get("label"),
                "active": bool(flag.get("active")),
                "weight": flag.get("weight"),
            }
            for flag in cross_asset_flags
            if theme in (flag.get("themes") or [])
        ]
        output.append(
            {
                "theme": theme,
                "sector": row.get("sector"),
                "rotation_state": (row.get("rotation") or {}).get("state"),
                "barbell_score": row.get("barbell_score"),
                "aggressive_score": row.get("aggressive_score"),
                "conservative_score": row.get("conservative_score"),
                "uoa_events": len(theme_uoa),
                "footprints": sum(1 for item in theme_uoa if item.get("is_footprint")),
                "top_contracts": top_contracts,
                "linked_cross_flags": linked_flags,
            }
        )
    return {"status": "active", "themes": output}


def _first_weekday_of_month(year: int, month: int, weekday: int) -> date:
    d = date(year, month, 1)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d


def _nth_weekday_of_month(year: int, month: int, weekday: int, nth: int) -> date:
    first = _first_weekday_of_month(year, month, weekday)
    return first + timedelta(days=7 * (max(1, nth) - 1))


def _next_macro_calendar_estimates(now: datetime) -> List[Dict[str, Any]]:
    # Estimated windows to avoid stale hard-coded schedules.
    estimates: List[Tuple[str, date]] = []
    cursor = now.date()
    for shift in range(0, 3):
        year = cursor.year + ((cursor.month - 1 + shift) // 12)
        month = ((cursor.month - 1 + shift) % 12) + 1
        nfp = _first_weekday_of_month(year, month, 4)  # Friday
        cpi = _nth_weekday_of_month(year, month, 2, 2)  # Tuesday-ish estimate
        fomc = _nth_weekday_of_month(year, month, 2, 3)  # mid-month estimate
        estimates.extend([("US NFP (estimated)", nfp), ("US CPI (estimated)", cpi), ("FOMC Decision (estimated)", fomc)])

    output = []
    for name, d in sorted(estimates, key=lambda x: x[1]):
        if d < cursor:
            continue
        days_to = (d - cursor).days
        if days_to > 45:
            continue
        output.append({"event": name, "date": d.isoformat(), "days_to_event": days_to})
    return output[:9]


def _build_macro_event_overlay(now: datetime, macro_filter: Dict[str, Any], cross_asset_flags: List[Dict[str, Any]]) -> Dict[str, Any]:
    stress = _safe_float((macro_filter.get("scores") or {}).get("stress_score"), 0.0)
    clarity = _safe_float((macro_filter.get("scores") or {}).get("clarity_score"), 50.0)
    active_flags = [flag for flag in cross_asset_flags if flag.get("active")]
    active_weight = sum(_safe_float(flag.get("weight"), 0.0) for flag in active_flags)
    event_risk_score = _clamp((stress * 0.62) + (active_weight * 1.55) + ((100.0 - clarity) * 0.18), 0.0, 100.0)
    if event_risk_score >= 72.0:
        risk_level = "HIGH"
    elif event_risk_score >= 48.0:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    calendar = _next_macro_calendar_estimates(now)
    upcoming = []
    for item in calendar:
        dte = _safe_int(item.get("days_to_event"), 99)
        if dte <= 1:
            window = "IMMEDIATE"
        elif dte <= 5:
            window = "NEAR_TERM"
        else:
            window = "WATCH"
        upcoming.append({**item, "window": window})

    return {
        "status": "estimated",
        "as_of": now.isoformat(),
        "risk_score": round(event_risk_score, 2),
        "risk_level": risk_level,
        "calendar_estimated": True,
        "active_cross_flags": [{"id": f.get("id"), "label": f.get("label"), "weight": f.get("weight")} for f in active_flags],
        "upcoming_events": upcoming,
    }


def _build_lead_lag_radar(
    now: datetime,
    theme_scores: List[Dict[str, Any]],
    lag_model: Dict[str, Any],
) -> Dict[str, Any]:
    lag_map = {str(row.get("theme")): row for row in (lag_model.get("by_theme") or [])}
    rows: List[Dict[str, Any]] = []
    for row in theme_scores[:6]:
        theme = str(row.get("theme"))
        lag_row = lag_map.get(theme, {})
        hist_hours = _safe_float(lag_row.get("historical_avg_lead_hours"), _safe_float(THEME_LAG_HOURS.get(theme), 18.0))
        current_hours = _safe_float(lag_row.get("estimated_current_lead_hours"), hist_hours)
        delta_hours = current_hours - hist_hours
        edge_window = _safe_float(lag_row.get("edge_window_hours"), max(6.0, current_hours * 0.65))
        confidence = _safe_float(row.get("confidence"), 0.0)
        edge_score = _safe_float((row.get("historical_validation") or {}).get("edge_score"), 50.0)
        sample_days = _safe_float((row.get("historical_validation") or {}).get("sample_days"), 0.0)
        sample_norm = _clamp(sample_days / 260.0, 0.0, 1.0)

        confidence_score = _clamp((confidence * 0.62) + (edge_score * 0.28) + (sample_norm * 100.0 * 0.10), 0.0, 100.0)
        lead_strength = _clamp(
            (current_hours / 96.0) * 46.0
            + ((delta_hours + 36.0) / 72.0) * 24.0
            + (edge_window / 72.0) * 30.0,
            0.0,
            100.0,
        )
        rank_score = _clamp((lead_strength * 0.52) + (confidence_score * 0.48), 0.0, 100.0)

        if rank_score >= 72.0:
            timing_edge = "HIGH"
        elif rank_score >= 56.0:
            timing_edge = "MEDIUM"
        else:
            timing_edge = "LOW"

        rows.append(
            {
                "theme": theme,
                "rank_score": round(rank_score, 2),
                "timing_edge": timing_edge,
                "confidence_score": round(confidence_score, 2),
                "current_lead_hours": round(current_hours, 2),
                "historical_lead_hours": round(hist_hours, 2),
                "lead_delta_hours": round(delta_hours, 2),
                "edge_window_hours": round(edge_window, 2),
                "barbell_score": round(_safe_float(row.get("barbell_score"), 0.0), 2),
            }
        )

    rows.sort(key=lambda item: _safe_float(item.get("rank_score"), 0.0), reverse=True)
    top = rows[0] if rows else {}
    return {
        "status": "active",
        "generated_at": now.isoformat(),
        "average_current_lead_hours": round(
            _mean([_safe_float(item.get("current_lead_hours"), 0.0) for item in rows]),
            2,
        ) if rows else 0.0,
        "average_rank_score": round(
            _mean([_safe_float(item.get("rank_score"), 0.0) for item in rows]),
            2,
        ) if rows else 0.0,
        "top_theme": top.get("theme"),
        "top_rank_score": top.get("rank_score", 0.0),
        "rows": rows,
    }


def _build_signal_decay_monitor(
    now: datetime,
    theme_scores: List[Dict[str, Any]],
    lag_model: Dict[str, Any],
    macro_filter: Dict[str, Any],
) -> Dict[str, Any]:
    lag_map = {str(row.get("theme")): row for row in (lag_model.get("by_theme") or [])}
    stress = _safe_float((macro_filter.get("scores") or {}).get("stress_score"), 0.0)
    rows: List[Dict[str, Any]] = []
    for row in theme_scores[:6]:
        theme = str(row.get("theme"))
        lag_row = lag_map.get(theme, {})
        barbell = _safe_float(row.get("barbell_score"), 0.0)
        conservative = _safe_float(row.get("conservative_score"), 0.0)
        edge = _safe_float((row.get("historical_validation") or {}).get("edge_score"), 50.0)
        cross_count = _safe_float((row.get("cross_asset") or {}).get("active_count"), 0.0)
        uoa_events = _safe_float((row.get("uoa") or {}).get("events_count"), 0.0)
        lead_hours = _safe_float(lag_row.get("estimated_current_lead_hours"), _safe_float(THEME_LAG_HOURS.get(theme), 18.0))
        edge_window = _safe_float(lag_row.get("edge_window_hours"), max(6.0, lead_hours * 0.65))

        half_life_hours = _clamp(
            (lead_hours * 1.05)
            + (edge_window * 0.55)
            + (conservative * 0.38)
            + (edge * 0.26)
            + (cross_count * 3.4)
            + (uoa_events * 1.2)
            - (stress * 0.45),
            8.0,
            168.0,
        )
        decay_rate_daily = math.log(2.0) / max(half_life_hours / 24.0, 1e-6)
        strength_24h = barbell * math.exp(-math.log(2.0) * (24.0 / half_life_hours))
        strength_48h = barbell * math.exp(-math.log(2.0) * (48.0 / half_life_hours))
        strength_72h = barbell * math.exp(-math.log(2.0) * (72.0 / half_life_hours))

        if half_life_hours >= 72.0:
            decay_state = "STICKY"
        elif half_life_hours >= 42.0:
            decay_state = "MODERATE"
        else:
            decay_state = "FAST"

        rows.append(
            {
                "theme": theme,
                "decay_state": decay_state,
                "half_life_hours": round(half_life_hours, 2),
                "half_life_days": round(half_life_hours / 24.0, 2),
                "decay_rate_daily": round(decay_rate_daily, 4),
                "initial_signal_score": round(barbell, 2),
                "expected_score_24h": round(strength_24h, 2),
                "expected_score_48h": round(strength_48h, 2),
                "expected_score_72h": round(strength_72h, 2),
                "retest_window_hours": round(_clamp(half_life_hours * 0.78, 6.0, 120.0), 2),
            }
        )

    rows.sort(key=lambda item: _safe_float(item.get("half_life_hours"), 0.0), reverse=True)
    return {
        "status": "estimated",
        "generated_at": now.isoformat(),
        "macro_stress_score": round(stress, 2),
        "average_half_life_hours": round(
            _mean([_safe_float(item.get("half_life_hours"), 0.0) for item in rows]),
            2,
        ) if rows else 0.0,
        "rows": rows,
    }


def _build_regime_switch_detector(
    now: datetime,
    regime_timeline: Dict[str, Any],
    cross_asset_flags: List[Dict[str, Any]],
    macro_filter: Dict[str, Any],
) -> Dict[str, Any]:
    rows = list(regime_timeline.get("rows") or [])
    if len(rows) < 2:
        return {
            "status": "insufficient",
            "generated_at": now.isoformat(),
            "current_regime": None,
            "switch_state": "UNKNOWN",
            "flip_count_30d": 0,
            "flip_count_90d": 0,
            "instability_score": 0.0,
            "recent_flips": [],
        }

    def _trigger_from_flip(from_regime: str, to_regime: str, row: Dict[str, Any]) -> str:
        vix_5 = _safe_float(row.get("vix_5d_pct"), 0.0)
        spy_20 = _safe_float(row.get("spy_20d_pct"), 0.0)
        if to_regime == "RISK_OFF" and vix_5 > 0.0 and spy_20 < 0.0:
            return "VIX shock + equity compression"
        if to_regime == "RISK_ON" and vix_5 < 0.0 and spy_20 > 0.0:
            return "Vol compression + risk bid"
        if to_regime == "MIXED":
            return "Cross-asset disagreement"
        if from_regime == "MIXED":
            return "Regime resolution from mixed state"
        return "Cross-asset drift re-alignment"

    flips: List[Dict[str, Any]] = []
    for i in range(1, len(rows)):
        prev = rows[i - 1]
        cur = rows[i]
        prev_regime = str(prev.get("regime", "MIXED"))
        cur_regime = str(cur.get("regime", "MIXED"))
        if prev_regime == cur_regime:
            continue
        score_delta = _safe_float(cur.get("score"), 0.0) - _safe_float(prev.get("score"), 0.0)
        flips.append(
            {
                "date": cur.get("date"),
                "from_regime": prev_regime,
                "to_regime": cur_regime,
                "score_delta": round(score_delta, 2),
                "trigger": _trigger_from_flip(prev_regime, cur_regime, cur),
            }
        )

    cutoff_30 = now.date() - timedelta(days=30)
    cutoff_90 = now.date() - timedelta(days=90)
    flip_count_30 = 0
    flip_count_90 = 0
    for flip in flips:
        try:
            d = datetime.fromisoformat(str(flip.get("date"))).date()
        except Exception:
            continue
        if d >= cutoff_90:
            flip_count_90 += 1
        if d >= cutoff_30:
            flip_count_30 += 1

    active_cross_count = sum(1 for flag in cross_asset_flags if flag.get("active"))
    stress = _safe_float((macro_filter.get("scores") or {}).get("stress_score"), 0.0)
    instability_score = _clamp((flip_count_90 * 6.0) + (flip_count_30 * 14.0) + (active_cross_count * 2.5) + (stress * 0.22), 0.0, 100.0)
    if instability_score >= 68.0:
        switch_state = "VOLATILE"
    elif instability_score >= 45.0:
        switch_state = "TRANSITION"
    else:
        switch_state = "STABLE"

    latest_flip = flips[-1] if flips else None
    last_flip_days = None
    if latest_flip and latest_flip.get("date"):
        try:
            last_flip_days = (now.date() - datetime.fromisoformat(str(latest_flip.get("date"))).date()).days
        except Exception:
            last_flip_days = None

    return {
        "status": "active",
        "generated_at": now.isoformat(),
        "current_regime": rows[-1].get("regime"),
        "previous_regime": rows[-2].get("regime") if len(rows) >= 2 else None,
        "switch_state": switch_state,
        "instability_score": round(instability_score, 2),
        "flip_count_30d": flip_count_30,
        "flip_count_90d": flip_count_90,
        "last_flip_days_ago": last_flip_days,
        "recent_flips": flips[-14:],
    }


def _build_counterfactual_lab(
    now: datetime,
    theme_scores: List[Dict[str, Any]],
    macro_filter: Dict[str, Any],
) -> Dict[str, Any]:
    macro_score = _safe_float((macro_filter.get("scores") or {}).get("macro_filter_score"), 50.0)
    rows: List[Dict[str, Any]] = []
    for row in theme_scores[:6]:
        theme = str(row.get("theme"))
        uoa_ag = _safe_float((row.get("uoa") or {}).get("aggressive_score"), 22.0)
        uoa_cons = _safe_float((row.get("uoa") or {}).get("conservative_score"), 20.0)
        rot = _safe_float((row.get("rotation") or {}).get("score"), 50.0)
        hist_edge = _safe_float((row.get("historical_validation") or {}).get("edge_score"), 50.0)
        cross = _safe_float((row.get("cross_asset") or {}).get("score"), 0.0)
        macro_adj = _safe_float(row.get("macro_filter_adjustment"), 0.0)
        actual = _safe_float(row.get("barbell_score"), 0.0)

        ag_no_cross = _clamp((0.52 * uoa_ag) + (0.23 * rot) + (0.08 * macro_score) + macro_adj, 0.0, 99.5)
        cons_no_cross = _clamp((0.25 * uoa_cons) + (0.30 * rot) + (0.30 * hist_edge) + (macro_adj * 0.65), 0.0, 99.5)
        no_cross_barbell = _clamp((ag_no_cross * 0.46) + (cons_no_cross * 0.54), 0.0, 99.5)

        ag_no_uoa = _clamp((0.23 * rot) + (0.17 * cross) + (0.08 * macro_score) + macro_adj, 0.0, 99.5)
        cons_no_uoa = _clamp((0.30 * rot) + (0.30 * hist_edge) + (0.15 * cross) + (macro_adj * 0.65), 0.0, 99.5)
        no_uoa_barbell = _clamp((ag_no_uoa * 0.46) + (cons_no_uoa * 0.54), 0.0, 99.5)

        cross_lift = actual - no_cross_barbell
        dependency = _clamp((cross_lift / max(actual, 1.0)) * 100.0, -100.0, 100.0)
        bucket_actual = _bucket_from_score(actual)
        bucket_no_cross = _bucket_from_score(no_cross_barbell)

        if (bucket_actual != bucket_no_cross) and cross_lift >= 4.0:
            verdict = "CROSS_CRUCIAL"
        elif cross_lift >= 2.0:
            verdict = "CROSS_SUPPORTIVE"
        elif cross_lift <= -2.0:
            verdict = "CROSS_DILUTIVE"
        else:
            verdict = "NEUTRAL"

        rows.append(
            {
                "theme": theme,
                "actual_barbell_score": round(actual, 2),
                "counterfactual_no_cross_score": round(no_cross_barbell, 2),
                "counterfactual_no_uoa_score": round(no_uoa_barbell, 2),
                "cross_lift": round(cross_lift, 2),
                "cross_dependency_pct": round(dependency, 2),
                "bucket_actual": bucket_actual,
                "bucket_no_cross": bucket_no_cross,
                "verdict": verdict,
            }
        )

    rows.sort(key=lambda item: abs(_safe_float(item.get("cross_lift"), 0.0)), reverse=True)
    upgraded = sum(1 for item in rows if item.get("bucket_actual") != item.get("bucket_no_cross"))
    return {
        "status": "active",
        "generated_at": now.isoformat(),
        "themes_upgraded_by_cross": upgraded,
        "average_cross_lift": round(_mean([_safe_float(item.get("cross_lift"), 0.0) for item in rows]), 2) if rows else 0.0,
        "rows": rows,
    }


def _build_execution_risk_overlay(
    now: datetime,
    theme_scores: List[Dict[str, Any]],
    uoa_watchlist: List[Dict[str, Any]],
    macro_filter: Dict[str, Any],
) -> Dict[str, Any]:
    stress = _safe_float((macro_filter.get("scores") or {}).get("stress_score"), 0.0)
    by_theme: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in uoa_watchlist:
        for theme in row.get("themes", []):
            by_theme[str(theme)].append(row)

    rows: List[Dict[str, Any]] = []
    for score_row in theme_scores[:6]:
        theme = str(score_row.get("theme"))
        theme_rows = by_theme.get(theme, [])
        if theme_rows:
            avg_sweep = _mean([_safe_float((x.get("metrics") or {}).get("sweep_ratio"), 0.0) for x in theme_rows])
            avg_vol_oi = _mean([_safe_float((x.get("metrics") or {}).get("volume_oi_ratio"), 1.0) for x in theme_rows])
            avg_fill = _mean([_safe_float((x.get("metrics") or {}).get("aggressive_fill_pct"), 50.0) for x in theme_rows])
            avg_quality = _mean([_safe_float(x.get("quality_score", (x.get("metrics") or {}).get("quality_score")), 50.0) for x in theme_rows])
            avg_block = _mean([_safe_float((x.get("metrics") or {}).get("block_premium_usd"), 0.0) for x in theme_rows])
        else:
            avg_sweep = 0.0
            avg_vol_oi = 1.0
            avg_fill = 50.0
            avg_quality = 50.0
            avg_block = 0.0

        cross_count = _safe_float((score_row.get("cross_asset") or {}).get("active_count"), 0.0)
        urgency = _clamp((avg_sweep * 100.0) + (max(avg_vol_oi - 1.0, 0.0) * 30.0) + (max(avg_fill - 50.0, 0.0) * 0.45), 0.0, 100.0)
        slippage_bps = _clamp(
            4.0
            + (urgency * 0.22)
            + (stress * 0.11)
            + (cross_count * 1.8)
            + (max(0.0, 50.0 - avg_quality) * 0.16),
            2.5,
            120.0,
        )
        execution_risk = _clamp((slippage_bps * 0.72) + (urgency * 0.18) + (stress * 0.12), 0.0, 100.0)

        if execution_risk >= 72.0:
            liquidity_grade = "D"
            mode = "Scale-in passivo e size ridotta"
        elif execution_risk >= 56.0:
            liquidity_grade = "C"
            mode = "Entrata parziale con conferma liquidita"
        elif execution_risk >= 40.0:
            liquidity_grade = "B"
            mode = "Operativita controllata"
        else:
            liquidity_grade = "A"
            mode = "Friction bassa"

        rows.append(
            {
                "theme": theme,
                "execution_risk_score": round(execution_risk, 2),
                "estimated_slippage_bps": round(slippage_bps, 2),
                "impact_usd_per_100k": round(slippage_bps * 10.0, 2),
                "urgency_score": round(urgency, 2),
                "avg_volume_oi_ratio": round(avg_vol_oi, 2),
                "avg_sweep_ratio": round(avg_sweep, 3),
                "avg_aggressive_fill_pct": round(avg_fill, 2),
                "avg_block_premium_usd": round(avg_block, 2),
                "liquidity_grade": liquidity_grade,
                "recommended_mode": mode,
            }
        )

    rows.sort(key=lambda item: _safe_float(item.get("execution_risk_score"), 0.0), reverse=True)
    return {
        "status": "estimated",
        "generated_at": now.isoformat(),
        "macro_stress_score": round(stress, 2),
        "average_slippage_bps": round(
            _mean([_safe_float(item.get("estimated_slippage_bps"), 0.0) for item in rows]),
            2,
        ) if rows else 0.0,
        "high_risk_themes": sum(1 for item in rows if _safe_float(item.get("execution_risk_score"), 0.0) >= 72.0),
        "rows": rows,
    }


def _build_narrative_saturation_meter(
    now: datetime,
    theme_scores: List[Dict[str, Any]],
    deep_report: Dict[str, Any],
    macro_filter: Dict[str, Any],
) -> Dict[str, Any]:
    stress = _safe_float((macro_filter.get("scores") or {}).get("stress_score"), 0.0)
    theme_attention: Dict[str, float] = defaultdict(float)

    summary_texts = [str(x) for x in (deep_report.get("summary") or []) if x]
    for text in summary_texts:
        text_l = text.lower()
        for theme, keywords in THEME_KEYWORDS.items():
            hit = sum(1 for kw in keywords if kw in text_l)
            if hit > 0:
                theme_attention[theme] += float(hit)

    for signal in (deep_report.get("signals") or [])[:20]:
        asset = str(signal.get("asset", ""))
        mapped_themes = DEEP_ASSET_TO_THEME.get(asset, ("AI_TECH",))
        prob = _safe_float(signal.get("probability_score"), 50.0)
        sample = _safe_float(signal.get("sample_size"), 0.0)
        signal_weight = 0.4 + (prob / 180.0) + min(sample / 120.0, 0.55)
        blob = f"{signal.get('pattern', '')} {signal.get('summary', '')}".lower()
        for theme in mapped_themes:
            theme_attention[str(theme)] += signal_weight
            kw_hits = sum(1 for kw in THEME_KEYWORDS.get(str(theme), ()) if kw in blob)
            if kw_hits:
                theme_attention[str(theme)] += (kw_hits * 0.45)

    rows: List[Dict[str, Any]] = []
    for row in theme_scores[:6]:
        theme = str(row.get("theme"))
        positioning = _safe_float(row.get("barbell_score"), 0.0)
        attention_hits = _safe_float(theme_attention.get(theme), 0.0)
        media_score = _clamp((attention_hits * 11.5) + 14.0, 0.0, 100.0)
        saturation_gap = media_score - positioning

        if saturation_gap >= 12.0:
            state = "CROWDED"
        elif saturation_gap <= -12.0:
            state = "EARLY_UNDEROWNED"
        else:
            state = "BALANCED"

        crowding_risk = _clamp((media_score * 0.58) + (max(saturation_gap, 0.0) * 1.15) + (stress * 0.16), 0.0, 100.0)

        rows.append(
            {
                "theme": theme,
                "positioning_score": round(positioning, 2),
                "media_score": round(media_score, 2),
                "attention_hits": round(attention_hits, 2),
                "saturation_gap": round(saturation_gap, 2),
                "state": state,
                "crowding_risk_score": round(crowding_risk, 2),
                "attention_ratio": round(media_score / max(positioning, 1.0), 3),
            }
        )

    rows.sort(key=lambda item: _safe_float(item.get("crowding_risk_score"), 0.0), reverse=True)
    return {
        "status": "estimated",
        "generated_at": now.isoformat(),
        "crowded_themes": sum(1 for item in rows if item.get("state") == "CROWDED"),
        "underowned_themes": sum(1 for item in rows if item.get("state") == "EARLY_UNDEROWNED"),
        "rows": rows,
    }


def _build_historical_analysis_10y(
    now: datetime,
    history_map: Dict[str, Dict[str, List[float]]],
    theme_scores: List[Dict[str, Any]],
) -> Dict[str, Any]:
    lookback_1y = 252
    lookback_3y = 756
    lookback_5y = 1260
    lookback_10y = 2520

    spy = history_map.get("SPY") or {}
    vix = history_map.get("^VIX") or {}
    gold = history_map.get("GLD") or {}
    usd = history_map.get("UUP") or {}
    btc = history_map.get("BTC-USD") or {}

    ranked_themes = [str(row.get("theme", "")).upper() for row in (theme_scores or [])]
    theme_order: List[str] = []
    for theme in ranked_themes + list(THEMES):
        if theme in THEME_META and theme not in theme_order:
            theme_order.append(theme)

    theme_rows: List[Dict[str, Any]] = []
    statistical_tests: List[Dict[str, Any]] = []

    for theme in theme_order:
        proxy = str(THEME_META.get(theme, {}).get("proxy", ""))
        series = history_map.get(proxy) or {}
        closes = series.get("close") or []
        if len(closes) < 260:
            continue

        r_1y = _series_period_return(series, lookback_1y)
        r_3y = _series_period_return(series, lookback_3y)
        cagr_5y = _series_cagr(series, lookback_5y)
        cagr_10y = _series_cagr(series, lookback_10y)
        dd_10y = _series_max_drawdown(series, lookback_10y)

        daily_10y = _series_daily_returns(series, lookback_10y)
        vol_10y = _stddev(daily_10y) * math.sqrt(252.0) if daily_10y else 0.0
        win_1d = (sum(1 for x in daily_10y if x > 0) / len(daily_10y)) * 100.0 if daily_10y else 0.0

        ret_20d_10y = []
        src = [_safe_float(x, 0.0) for x in closes[-lookback_10y:]]
        for i in range(20, len(src)):
            prev = src[i - 20]
            cur = src[i]
            if prev > 0 and cur > 0:
                ret_20d_10y.append((cur / prev) - 1.0)
        win_20d = (sum(1 for x in ret_20d_10y if x > 0) / len(ret_20d_10y)) * 100.0 if ret_20d_10y else 0.0

        weekday_profile = _series_weekday_profile(series, lookback_10y)
        month_profile = _series_month_profile(series, lookback_10y)
        best_weekday = max(weekday_profile.items(), key=lambda kv: _safe_float((kv[1] or {}).get("mean_pct"), 0.0))
        worst_weekday = min(weekday_profile.items(), key=lambda kv: _safe_float((kv[1] or {}).get("mean_pct"), 0.0))
        best_month = max(month_profile.items(), key=lambda kv: _safe_float((kv[1] or {}).get("mean_pct"), 0.0))
        worst_month = min(month_profile.items(), key=lambda kv: _safe_float((kv[1] or {}).get("mean_pct"), 0.0))

        corr_spy_10y = _series_corr(series, spy, lookback_10y)
        corr_spy_1y = _series_corr(series, spy, lookback_1y)
        corr_vix_10y = _series_corr(series, vix, lookback_10y)
        corr_gold_10y = _series_corr(series, gold, lookback_10y)
        corr_usd_10y = _series_corr(series, usd, lookback_10y)
        corr_btc_5y = _series_corr(series, btc, lookback_5y)
        corr_spy_stats = _series_corr_with_stats(series, spy, lookback_10y)
        rolling_spy_corr = _series_rolling_corr(series, spy, lookback_10y, window=252, step=21)
        rolling_spy_std = _stddev(rolling_spy_corr)
        rolling_spy_latest = rolling_spy_corr[-1] if rolling_spy_corr else corr_spy_1y
        corr_stability_score = _clamp(
            100.0 - ((rolling_spy_std * 180.0) + (abs(corr_spy_1y - corr_spy_10y) * 90.0)),
            0.0,
            100.0,
        )
        if corr_stability_score >= 70.0:
            corr_stability_state = "STABLE"
        elif corr_stability_score >= 45.0:
            corr_stability_state = "TRANSITION"
        else:
            corr_stability_state = "UNSTABLE"

        daily_mean = _mean(daily_10y) if daily_10y else 0.0
        daily_std = _stddev(daily_10y)
        trend_t_stat = (daily_mean / (daily_std / math.sqrt(max(1, len(daily_10y))))) if daily_std > 1e-12 else 0.0
        trend_p = _two_tail_p_from_z(trend_t_stat)

        win_ratio = (sum(1 for x in daily_10y if x > 0.0) / max(1, len(daily_10y))) if daily_10y else 0.0
        win_rate_z = ((win_ratio - 0.5) / math.sqrt(0.25 / max(1, len(daily_10y)))) if daily_10y else 0.0
        win_rate_p = _two_tail_p_from_z(win_rate_z)

        tail_5 = _quantile(daily_10y, 0.05) * 100.0 if daily_10y else 0.0
        tail_95 = _quantile(daily_10y, 0.95) * 100.0 if daily_10y else 0.0

        vix_regime = _series_vs_vix_regime_test(series, vix, lookback_10y)
        vix_spread = _safe_float(vix_regime.get("spread_daily_pct"), 0.0)
        if abs(vix_spread) >= 0.10:
            regime_edge = "STRONG"
        elif abs(vix_spread) >= 0.04:
            regime_edge = "MODERATE"
        else:
            regime_edge = "WEAK"

        rel_1y_vs_10y = (r_1y * 100.0) - (cagr_10y * 100.0)
        if rel_1y_vs_10y >= 10.0:
            momentum_state = "HOT"
        elif rel_1y_vs_10y <= -10.0:
            momentum_state = "COLD"
        else:
            momentum_state = "BALANCED"

        theme_rows.append(
            {
                "theme": theme,
                "proxy": proxy,
                "samples_10y": len(daily_10y),
                "return_1y_pct": round(r_1y * 100.0, 2),
                "return_3y_pct": round(r_3y * 100.0, 2),
                "cagr_5y_pct": round(cagr_5y * 100.0, 2),
                "cagr_10y_pct": round(cagr_10y * 100.0, 2),
                "vol_10y_pct": round(vol_10y * 100.0, 2),
                "max_drawdown_10y_pct": round(dd_10y * 100.0, 2),
                "win_rate_1d_pct": round(win_1d, 2),
                "win_rate_20d_pct": round(win_20d, 2),
                "corr_spy_10y": round(corr_spy_10y, 4),
                "corr_spy_1y": round(corr_spy_1y, 4),
                "corr_vix_10y": round(corr_vix_10y, 4),
                "corr_gold_10y": round(corr_gold_10y, 4),
                "corr_usd_10y": round(corr_usd_10y, 4),
                "corr_btc_5y": round(corr_btc_5y, 4),
                "corr_spy_t_stat_10y": round(_safe_float(corr_spy_stats.get("t_stat"), 0.0), 3),
                "corr_spy_p_value_10y": round(_safe_float(corr_spy_stats.get("p_value"), 1.0), 4),
                "corr_spy_significance_10y": _corr_significance_label(
                    abs(corr_spy_10y),
                    _safe_float(corr_spy_stats.get("p_value"), 1.0),
                ),
                "corr_spy_rolling_latest_1y": round(rolling_spy_latest, 4),
                "corr_spy_rolling_std_1y": round(rolling_spy_std, 4),
                "corr_spy_stability_score": round(corr_stability_score, 2),
                "corr_spy_stability_state": corr_stability_state,
                "relative_1y_vs_10y_pct": round(rel_1y_vs_10y, 2),
                "momentum_state": momentum_state,
                "best_weekday": {"weekday_idx": int(best_weekday[0]), **(best_weekday[1] or {})},
                "worst_weekday": {"weekday_idx": int(worst_weekday[0]), **(worst_weekday[1] or {})},
                "best_month": {"month": int(best_month[0]), **(best_month[1] or {})},
                "worst_month": {"month": int(worst_month[0]), **(worst_month[1] or {})},
                "weekday_profile": weekday_profile,
                "month_profile": month_profile,
            }
        )
        statistical_tests.append(
            {
                "theme": theme,
                "proxy": proxy,
                "sample_days": len(daily_10y),
                "trend_t_stat_10y": round(trend_t_stat, 3),
                "trend_p_value_10y": round(trend_p, 4),
                "win_rate_z_10y": round(win_rate_z, 3),
                "win_rate_p_value_10y": round(win_rate_p, 4),
                "tail_5pct_daily_return_pct": round(tail_5, 3),
                "tail_95pct_daily_return_pct": round(tail_95, 3),
                "high_vix_daily_mean_pct": round(_safe_float(vix_regime.get("high_vix_daily_mean_pct"), 0.0), 4),
                "low_vix_daily_mean_pct": round(_safe_float(vix_regime.get("low_vix_daily_mean_pct"), 0.0), 4),
                "vix_regime_spread_daily_pct": round(vix_spread, 4),
                "vix_regime_spread_z": round(_safe_float(vix_regime.get("spread_z_score"), 0.0), 3),
                "vix_regime_spread_p_value": round(_safe_float(vix_regime.get("spread_p_value"), 1.0), 4),
                "regime_edge_state": regime_edge,
                "corr_stability_state": corr_stability_state,
            }
        )

    corr_pairs = [
        ("SPY", "QQQ"),
        ("SPY", "XLE"),
        ("SPY", "ITA"),
        ("SPY", "GLD"),
        ("SPY", "UUP"),
        ("SPY", "^VIX"),
        ("QQQ", "BTC-USD"),
        ("GLD", "UUP"),
        ("XLE", "CL=F"),
        ("TLT", "UUP"),
        ("BTC-USD", "^VIX"),
    ]
    corr_rows: List[Dict[str, Any]] = []
    correlation_tests: List[Dict[str, Any]] = []
    for a, b in corr_pairs:
        sa = history_map.get(a) or {}
        sb = history_map.get(b) or {}
        if not sa.get("close") or not sb.get("close"):
            continue
        c10_stats = _series_corr_with_stats(sa, sb, lookback_10y)
        c1_stats = _series_corr_with_stats(sa, sb, lookback_1y)
        c10 = _safe_float(c10_stats.get("corr"), 0.0)
        c1 = _safe_float(c1_stats.get("corr"), 0.0)
        corr_delta = c1 - c10
        p10 = _safe_float(c10_stats.get("p_value"), 1.0)
        rolling_corr = _series_rolling_corr(sa, sb, lookback_10y, window=252, step=21)
        rolling_std = _stddev(rolling_corr)
        rolling_latest = rolling_corr[-1] if rolling_corr else c1
        rolling_min = min(rolling_corr) if rolling_corr else c10
        rolling_max = max(rolling_corr) if rolling_corr else c10
        if abs(corr_delta) >= 0.35:
            drift_state = "STRUCTURAL_BREAK"
        elif abs(corr_delta) >= 0.20:
            drift_state = "REGIME_SHIFT"
        else:
            drift_state = "STABLE"
        significance = _corr_significance_label(abs(c10), p10)
        corr_rows.append(
            {
                "pair": f"{a} vs {b}",
                "corr_10y": round(c10, 4),
                "corr_1y": round(c1, 4),
                "corr_delta": round(corr_delta, 4),
                "sample_days_10y": _safe_int(c10_stats.get("sample_days"), 0),
                "t_stat_10y": round(_safe_float(c10_stats.get("t_stat"), 0.0), 3),
                "p_value_10y": round(p10, 4),
                "significance": significance,
                "rolling_corr_latest_1y": round(rolling_latest, 4),
                "drift_state": drift_state,
            }
        )
        correlation_tests.append(
            {
                "pair": f"{a} vs {b}",
                "sample_days_10y": _safe_int(c10_stats.get("sample_days"), 0),
                "corr_10y": round(c10, 4),
                "corr_1y": round(c1, 4),
                "corr_delta": round(corr_delta, 4),
                "t_stat_10y": round(_safe_float(c10_stats.get("t_stat"), 0.0), 3),
                "z_score_10y": round(_safe_float(c10_stats.get("z_score"), 0.0), 3),
                "p_value_10y": round(p10, 4),
                "significance": significance,
                "rolling_corr_latest_1y": round(rolling_latest, 4),
                "rolling_corr_min_1y": round(rolling_min, 4),
                "rolling_corr_max_1y": round(rolling_max, 4),
                "rolling_corr_std_1y": round(rolling_std, 4),
                "drift_state": drift_state,
            }
        )
    corr_rows.sort(key=lambda item: abs(_safe_float(item.get("corr_delta"), 0.0)), reverse=True)
    correlation_tests.sort(key=lambda item: abs(_safe_float(item.get("corr_delta"), 0.0)), reverse=True)

    theme_rows.sort(key=lambda item: _safe_float(item.get("cagr_10y_pct"), 0.0), reverse=True)
    statistical_tests.sort(key=lambda item: abs(_safe_float(item.get("trend_t_stat_10y"), 0.0)), reverse=True)
    significant_theme_tests = sum(
        1
        for row in statistical_tests
        if _safe_float(row.get("trend_p_value_10y"), 1.0) <= 0.05
        or _safe_float(row.get("win_rate_p_value_10y"), 1.0) <= 0.05
    )
    strong_corr_pairs = sum(
        1
        for row in correlation_tests
        if str(row.get("significance", "WEAK")) in ("VERY_STRONG", "STRONG")
    )
    day_name_map = {0: "MON", 1: "TUE", 2: "WED", 3: "THU", 4: "FRI"}
    month_name_map = {
        1: "JAN",
        2: "FEB",
        3: "MAR",
        4: "APR",
        5: "MAY",
        6: "JUN",
        7: "JUL",
        8: "AUG",
        9: "SEP",
        10: "OCT",
        11: "NOV",
        12: "DEC",
    }

    weekday_idx = int(now.weekday())
    effective_weekday_idx = weekday_idx if weekday_idx <= 4 else 0
    month_idx = int(now.month)
    weekend_proxy_mode = weekday_idx >= 5

    def _signal_from_mean(mean_pct: float, scale: str = "day") -> str:
        thresholds = {
            "day": 0.08,
            "week": 0.05,
            "month": 0.12,
        }
        th = thresholds.get(scale, 0.08)
        if mean_pct >= th:
            return "BULLISH"
        if mean_pct <= -th:
            return "BEARISH"
        return "NEUTRAL"

    playbook_today_rows: List[Dict[str, Any]] = []
    playbook_week_rows: List[Dict[str, Any]] = []
    playbook_month_rows: List[Dict[str, Any]] = []
    leaderboard_rows: List[Dict[str, Any]] = []

    for row in theme_rows:
        theme = str(row.get("theme", ""))
        proxy = str(row.get("proxy", ""))
        weekday_profile = row.get("weekday_profile") or {}
        month_profile = row.get("month_profile") or {}
        today_bucket = weekday_profile.get(str(effective_weekday_idx)) or {}
        month_bucket = month_profile.get(str(month_idx)) or {}

        today_mean = _safe_float(today_bucket.get("mean_pct"), 0.0)
        today_win = _safe_float(today_bucket.get("win_rate_pct"), 0.0)
        month_mean = _safe_float(month_bucket.get("mean_pct"), 0.0)
        month_win = _safe_float(month_bucket.get("win_rate_pct"), 0.0)

        week_means = [_safe_float((weekday_profile.get(str(i)) or {}).get("mean_pct"), 0.0) for i in range(5)]
        week_wins = [_safe_float((weekday_profile.get(str(i)) or {}).get("win_rate_pct"), 0.0) for i in range(5)]
        week_mean = _mean(week_means)
        week_win = _mean(week_wins)

        cagr_score = _clamp(50.0 + (_safe_float(row.get("cagr_10y_pct"), 0.0) * 3.2), 0.0, 100.0)
        win_score = _clamp(_safe_float(row.get("win_rate_1d_pct"), 50.0), 0.0, 100.0)
        stability = _clamp(_safe_float(row.get("corr_spy_stability_score"), 50.0), 0.0, 100.0)
        drawdown_safety = _clamp(100.0 - min(abs(_safe_float(row.get("max_drawdown_10y_pct"), 0.0)), 85.0), 0.0, 100.0)
        conviction = _clamp((0.34 * cagr_score) + (0.24 * win_score) + (0.22 * stability) + (0.20 * drawdown_safety), 0.0, 100.0)

        today_signal = _signal_from_mean(today_mean, "day")
        week_signal = _signal_from_mean(week_mean, "week")
        month_signal = _signal_from_mean(month_mean, "month")
        confidence = _clamp((abs(today_mean) * 290.0) + (abs(today_win - 50.0) * 1.15) + (conviction * 0.34), 0.0, 100.0)

        vol = _safe_float(row.get("vol_10y_pct"), 0.0)
        max_dd = abs(_safe_float(row.get("max_drawdown_10y_pct"), 0.0))
        if vol >= 28.0 or max_dd >= 40.0:
            risk_profile = "HIGH_BETA"
        elif vol >= 18.0 or max_dd >= 28.0:
            risk_profile = "BALANCED_RISK"
        else:
            risk_profile = "DEFENSIVE"

        if today_signal == "BULLISH" and conviction >= 66.0:
            action = "Bias long on pullbacks; monitor volatility regime."
        elif today_signal == "BEARISH" and conviction >= 66.0:
            action = "Prefer hedges/defensive exposure and tighter risk budget."
        elif week_signal == "BULLISH" and month_signal == "BULLISH":
            action = "Constructive swing bias; scale into strength selectively."
        elif week_signal == "BEARISH" and month_signal == "BEARISH":
            action = "Reduce gross exposure; prioritize asymmetric protection."
        else:
            action = "Mixed regime: keep optionality and wait for multi-layer confirmation."

        playbook_today_rows.append(
            {
                "theme": theme,
                "proxy": proxy,
                "effective_weekday_idx": effective_weekday_idx,
                "effective_weekday": day_name_map.get(effective_weekday_idx, "MON"),
                "today_mean_pct": round(today_mean, 4),
                "today_win_rate_pct": round(today_win, 2),
                "today_signal": today_signal,
                "week_signal": week_signal,
                "month_signal": month_signal,
                "confidence_score": round(confidence, 2),
                "conviction_score": round(conviction, 2),
                "risk_profile": risk_profile,
                "action": action,
            }
        )
        playbook_week_rows.append(
            {
                "theme": theme,
                "proxy": proxy,
                "week_mean_pct": round(week_mean, 4),
                "week_win_rate_pct": round(week_win, 2),
                "week_signal": week_signal,
                "best_weekday_idx": _safe_int((row.get("best_weekday") or {}).get("weekday_idx"), 0),
                "worst_weekday_idx": _safe_int((row.get("worst_weekday") or {}).get("weekday_idx"), 0),
                "conviction_score": round(conviction, 2),
            }
        )
        playbook_month_rows.append(
            {
                "theme": theme,
                "proxy": proxy,
                "month_idx": month_idx,
                "month_name": month_name_map.get(month_idx, "N/A"),
                "month_mean_pct": round(month_mean, 4),
                "month_win_rate_pct": round(month_win, 2),
                "month_signal": month_signal,
                "momentum_state": str(row.get("momentum_state", "BALANCED")),
                "conviction_score": round(conviction, 2),
            }
        )
        leaderboard_rows.append(
            {
                "theme": theme,
                "proxy": proxy,
                "conviction_score": round(conviction, 2),
                "risk_profile": risk_profile,
                "today_signal": today_signal,
                "week_signal": week_signal,
                "month_signal": month_signal,
                "today_mean_pct": round(today_mean, 4),
                "today_win_rate_pct": round(today_win, 2),
                "week_mean_pct": round(week_mean, 4),
                "month_mean_pct": round(month_mean, 4),
                "cagr_10y_pct": round(_safe_float(row.get("cagr_10y_pct"), 0.0), 2),
                "max_drawdown_10y_pct": round(_safe_float(row.get("max_drawdown_10y_pct"), 0.0), 2),
                "corr_spy_stability_state": row.get("corr_spy_stability_state"),
                "corr_spy_significance_10y": row.get("corr_spy_significance_10y"),
                "action": action,
            }
        )

    playbook_today_rows.sort(key=lambda item: (_safe_float(item.get("confidence_score"), 0.0), _safe_float(item.get("conviction_score"), 0.0)), reverse=True)
    playbook_week_rows.sort(key=lambda item: abs(_safe_float(item.get("week_mean_pct"), 0.0)), reverse=True)
    playbook_month_rows.sort(key=lambda item: abs(_safe_float(item.get("month_mean_pct"), 0.0)), reverse=True)
    leaderboard_rows.sort(key=lambda item: _safe_float(item.get("conviction_score"), 0.0), reverse=True)

    structural_break_pairs = sum(1 for row in correlation_tests if str(row.get("drift_state")) == "STRUCTURAL_BREAK")
    regime_shift_pairs = sum(1 for row in correlation_tests if str(row.get("drift_state")) == "REGIME_SHIFT")
    return {
        "status": "active",
        "generated_at": now.isoformat(),
        "lookback_years": 10,
        "theme_rows": theme_rows,
        "cross_asset_correlation": corr_rows[:16],
        "statistical_tests": statistical_tests[:16],
        "correlation_tests": correlation_tests[:16],
        "institutional_leaderboard": leaderboard_rows[:12],
        "calendar_playbook": {
            "generated_at": now.isoformat(),
            "weekday_idx_utc": weekday_idx,
            "effective_weekday_idx": effective_weekday_idx,
            "effective_weekday": day_name_map.get(effective_weekday_idx, "MON"),
            "month_idx_utc": month_idx,
            "month_name": month_name_map.get(month_idx, "N/A"),
            "weekend_proxy_mode": weekend_proxy_mode,
            "today": playbook_today_rows[:8],
            "week": playbook_week_rows[:8],
            "month": playbook_month_rows[:8],
            "summary": {
                "bullish_today_count": sum(1 for row in playbook_today_rows if row.get("today_signal") == "BULLISH"),
                "bearish_today_count": sum(1 for row in playbook_today_rows if row.get("today_signal") == "BEARISH"),
                "bullish_week_count": sum(1 for row in playbook_week_rows if row.get("week_signal") == "BULLISH"),
                "bearish_week_count": sum(1 for row in playbook_week_rows if row.get("week_signal") == "BEARISH"),
                "bullish_month_count": sum(1 for row in playbook_month_rows if row.get("month_signal") == "BULLISH"),
                "bearish_month_count": sum(1 for row in playbook_month_rows if row.get("month_signal") == "BEARISH"),
            },
        },
        "coverage": {
            "themes_covered": len(theme_rows),
            "min_samples_10y": min([_safe_int(r.get("samples_10y"), 0) for r in theme_rows], default=0),
            "max_samples_10y": max([_safe_int(r.get("samples_10y"), 0) for r in theme_rows], default=0),
            "statistical_tests_covered": len(statistical_tests),
            "correlation_pairs_covered": len(correlation_tests),
            "leaderboard_rows": len(leaderboard_rows),
            "playbook_rows": len(playbook_today_rows),
        },
        "summary": {
            "significant_theme_tests": significant_theme_tests,
            "strong_correlation_pairs": strong_corr_pairs,
            "structural_break_pairs": structural_break_pairs,
            "regime_shift_pairs": regime_shift_pairs,
            "max_corr_drift": round(
                max([abs(_safe_float(row.get("corr_delta"), 0.0)) for row in correlation_tests], default=0.0),
                4,
            ),
        },
    }


def _build_degraded_payload(
    now: datetime,
    multi_snapshot: Dict[str, Any],
    projections: List[Dict[str, Any]],
    reason: str,
) -> Dict[str, Any]:
    analyses = multi_snapshot.get("analyses") or {}
    spx_sign = _asset_direction_sign((analyses.get("SP500") or {}).get("direction"))
    nas_sign = _asset_direction_sign((analyses.get("NAS100") or {}).get("direction"))
    xau_sign = _asset_direction_sign((analyses.get("XAUUSD") or {}).get("direction"))
    eur_sign = _asset_direction_sign((analyses.get("EURUSD") or {}).get("direction"))
    usd_sign = -eur_sign

    growth_proxy = _direction_from_score(50.0 + (spx_sign + nas_sign) * 9.0)
    inflation_proxy = _direction_from_score(50.0 + (xau_sign + usd_sign) * 9.0)

    return {
        "status": "degraded",
        "generated_at": now.isoformat(),
        "summary": {
            "global_score": 0.0,
            "aggressive_score": 0.0,
            "conservative_score": 0.0,
            "barbell_score": 0.0,
            "state": "NO_CLEAR_CLUSTER",
            "top_theme": None,
            "top_theme_score": 0.0,
            "macro_regime": "MIXED",
            "active_cross_asset_flags": 0,
            "uoa_events": 0,
            "message": f"Institutional Radar Positioning degraded: {reason}",
        },
        "macro_filter": {
            "generated_at": now.isoformat(),
            "regime": "MIXED",
            "growth_proxy": growth_proxy,
            "inflation_proxy": inflation_proxy,
            "liquidity_tone": "TRANSITION",
            "vix": {"current": None, "change_5d_pct": None},
            "scores": {"macro_filter_score": 0.0, "clarity_score": 0.0, "stress_score": 0.0},
            "notes": ["Degraded mode due to data-provider issue."],
        },
        "theme_scores": [],
        "uoa_watchlist": [],
        "sector_rotation": [],
        "cross_asset_flags": [],
        "news_lag_model": {"status": "degraded", "average_estimated_lead_hours": 0.0, "by_theme": [], "notes": []},
        "data_quality": {
            "score": 0.0,
            "history_coverage_pct": 0.0,
            "options_coverage_pct": 0.0,
            "history_tickers_loaded": 0,
            "history_tickers_required": 0,
            "missing_history_tickers": [],
            "option_tickers_with_data": [],
            "uoa_events": 0,
            "footprint_events": 0,
            "cross_flags_active": 0,
            "avg_history_age_hours": None,
            "stale_assets": [],
            "warning_count": 1,
        },
        "explainability": {"top_themes": [], "global_layer_mix": {}},
        "regime_timeline": {"status": "degraded", "rows": [], "summary": {}},
        "alert_engine": {"generated_at": now.isoformat(), "global_risk": "UNKNOWN", "triggered_count": 0, "alerts": []},
        "validation_lab": {"status": "degraded", "rows": []},
        "theme_drilldown": {"status": "degraded", "themes": []},
        "macro_event_overlay": {
            "status": "degraded",
            "as_of": now.isoformat(),
            "risk_score": 0.0,
            "risk_level": "UNKNOWN",
            "calendar_estimated": True,
            "active_cross_flags": [],
            "upcoming_events": [],
        },
        "lead_lag_radar": {
            "status": "degraded",
            "generated_at": now.isoformat(),
            "average_current_lead_hours": 0.0,
            "average_rank_score": 0.0,
            "top_theme": None,
            "top_rank_score": 0.0,
            "rows": [],
        },
        "signal_decay_monitor": {
            "status": "degraded",
            "generated_at": now.isoformat(),
            "macro_stress_score": 0.0,
            "average_half_life_hours": 0.0,
            "rows": [],
        },
        "regime_switch_detector": {
            "status": "degraded",
            "generated_at": now.isoformat(),
            "current_regime": None,
            "switch_state": "UNKNOWN",
            "flip_count_30d": 0,
            "flip_count_90d": 0,
            "instability_score": 0.0,
            "recent_flips": [],
        },
        "counterfactual_lab": {
            "status": "degraded",
            "generated_at": now.isoformat(),
            "themes_upgraded_by_cross": 0,
            "average_cross_lift": 0.0,
            "rows": [],
        },
        "execution_risk_overlay": {
            "status": "degraded",
            "generated_at": now.isoformat(),
            "macro_stress_score": 0.0,
            "average_slippage_bps": 0.0,
            "high_risk_themes": 0,
            "rows": [],
        },
        "narrative_saturation_meter": {
            "status": "degraded",
            "generated_at": now.isoformat(),
            "crowded_themes": 0,
            "underowned_themes": 0,
            "rows": [],
        },
        "historical_analysis_10y": {
            "status": "degraded",
            "generated_at": now.isoformat(),
            "lookback_years": 10,
            "theme_rows": [],
            "cross_asset_correlation": [],
            "statistical_tests": [],
            "correlation_tests": [],
            "institutional_leaderboard": [],
            "calendar_playbook": {
                "generated_at": now.isoformat(),
                "weekday_idx_utc": now.weekday(),
                "effective_weekday_idx": 0,
                "effective_weekday": "MON",
                "month_idx_utc": now.month,
                "month_name": "N/A",
                "weekend_proxy_mode": True,
                "today": [],
                "week": [],
                "month": [],
                "summary": {
                    "bullish_today_count": 0,
                    "bearish_today_count": 0,
                    "bullish_week_count": 0,
                    "bearish_week_count": 0,
                    "bullish_month_count": 0,
                    "bearish_month_count": 0,
                },
            },
            "coverage": {
                "themes_covered": 0,
                "min_samples_10y": 0,
                "max_samples_10y": 0,
                "statistical_tests_covered": 0,
                "correlation_pairs_covered": 0,
                "leaderboard_rows": 0,
                "playbook_rows": 0,
            },
            "summary": {
                "significant_theme_tests": 0,
                "strong_correlation_pairs": 0,
                "structural_break_pairs": 0,
                "regime_shift_pairs": 0,
                "max_corr_drift": 0.0,
            },
        },
        "active_projection_assets": [p.get("asset") for p in (projections or [])[:6] if p.get("asset")],
        "data_coverage": {
            "history_period": HISTORY_RANGE,
            "history_tickers_loaded": 0,
            "options_tickers_scanned": 0,
            "warnings": [reason],
        },
        "methodology": {
            "layers": [],
            "composite_formula": "degraded",
            "thresholds": {},
            "scope": "Narrative positioning map only. No execution signals.",
        },
        "cache": {"hit": False, "age_seconds": 0, "ttl_seconds": CACHE_TTL_SECONDS},
    }


def build_smart_money_positioning(
    deep_report: Dict[str, Any],
    multi_snapshot: Dict[str, Any],
    projections: List[Dict[str, Any]],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)

    cache_ts = _CACHE.get("ts")
    cache_payload = _CACHE.get("payload")
    if isinstance(cache_ts, datetime) and cache_payload:
        age = (now - cache_ts).total_seconds()
        if age < CACHE_TTL_SECONDS:
            payload = copy.deepcopy(cache_payload)
            payload["cache"] = {"hit": True, "age_seconds": int(age), "ttl_seconds": CACHE_TTL_SECONDS}
            return payload

    warnings: List[str] = []
    signals = list(deep_report.get("signals") or [])
    overlay = deep_report.get("risk_exposure") or {}

    try:
        history_map = _download_history_map(MARKET_TICKERS, warnings)
        if not history_map:
            return _build_degraded_payload(now, multi_snapshot, projections, "unable to load historical market data")

        uoa_watchlist = _build_uoa_watchlist(history_map, now, warnings)
        uoa_watchlist = _inject_deep_signal_proxies(signals, uoa_watchlist)
        theme_uoa = _aggregate_uoa_by_theme(uoa_watchlist)

        sector_rotation = _build_sector_rotation(history_map)
        cross_asset_flags = _build_cross_asset_flags(history_map)
        macro_filter = _build_macro_filter(
            multi_snapshot=multi_snapshot,
            overlay=overlay,
            cross_asset_flags=cross_asset_flags,
            history_map=history_map,
            now=now,
        )

        theme_scores = _aggregate_theme_scores(
            theme_uoa=theme_uoa,
            sector_rotation=sector_rotation,
            cross_asset_flags=cross_asset_flags,
            macro_filter=macro_filter,
        )
        lag_model = _build_news_lag_model(theme_scores, now)
        data_quality = _build_data_quality(now, history_map, uoa_watchlist, cross_asset_flags, warnings)
        explainability = _build_explainability(theme_scores, macro_filter)
        regime_timeline = _build_regime_timeline(history_map, now)
        alert_engine = _build_alert_engine(now, theme_scores, cross_asset_flags, macro_filter)
        validation_lab = _build_validation_lab(theme_scores)
        theme_drilldown = _build_theme_drilldown(theme_scores, uoa_watchlist, cross_asset_flags)
        macro_event_overlay = _build_macro_event_overlay(now, macro_filter, cross_asset_flags)
        lead_lag_radar = _build_lead_lag_radar(now, theme_scores, lag_model)
        signal_decay_monitor = _build_signal_decay_monitor(now, theme_scores, lag_model, macro_filter)
        regime_switch_detector = _build_regime_switch_detector(now, regime_timeline, cross_asset_flags, macro_filter)
        counterfactual_lab = _build_counterfactual_lab(now, theme_scores, macro_filter)
        execution_risk_overlay = _build_execution_risk_overlay(now, theme_scores, uoa_watchlist, macro_filter)
        narrative_saturation_meter = _build_narrative_saturation_meter(now, theme_scores, deep_report, macro_filter)
        historical_analysis_10y = _build_historical_analysis_10y(now, history_map, theme_scores)

        top_theme = theme_scores[0] if theme_scores else {}
        top_three = theme_scores[:3]

        global_score = (
            sum(_safe_float(row.get("composite_score"), 0.0) for row in top_three) / max(len(top_three), 1)
            if top_three
            else 0.0
        )
        global_aggressive = (
            sum(_safe_float(row.get("aggressive_score"), 0.0) for row in top_three) / max(len(top_three), 1)
            if top_three
            else 0.0
        )
        global_conservative = (
            sum(_safe_float(row.get("conservative_score"), 0.0) for row in top_three) / max(len(top_three), 1)
            if top_three
            else 0.0
        )
        global_barbell = (
            sum(_safe_float(row.get("barbell_score"), 0.0) for row in top_three) / max(len(top_three), 1)
            if top_three
            else 0.0
        )

        if global_score >= 74:
            global_state = "INSTITUTIONAL_POSITIONING_STRONG"
        elif global_score >= 60:
            global_state = "POSITIONING_BUILDING"
        elif global_score >= 46:
            global_state = "EARLY_SIGNAL_CLUSTER"
        else:
            global_state = "NO_CLEAR_CLUSTER"

        active_flags = [row for row in cross_asset_flags if row.get("active")]
        active_projection_assets = [p.get("asset") for p in (projections or [])[:6] if p.get("asset")]

        summary = {
            "global_score": round(global_score, 2),
            "aggressive_score": round(global_aggressive, 2),
            "conservative_score": round(global_conservative, 2),
            "barbell_score": round(global_barbell, 2),
            "state": global_state,
            "top_theme": top_theme.get("theme"),
            "top_theme_score": top_theme.get("composite_score"),
            "macro_regime": macro_filter.get("regime"),
            "active_cross_asset_flags": len(active_flags),
            "uoa_events": len(uoa_watchlist),
            "message": (
                f"Smart money cluster su {top_theme.get('theme', 'N/A')} | "
                f"barbell {round(_safe_float(top_theme.get('barbell_score'), 0.0), 1)} "
                f"(agg {round(_safe_float(top_theme.get('aggressive_score'), 0.0), 1)} / "
                f"cons {round(_safe_float(top_theme.get('conservative_score'), 0.0), 1)}) "
                f"in regime macro {macro_filter.get('regime', 'MIXED')}."
            ),
        }

        payload = {
            "status": "active",
            "generated_at": now.isoformat(),
            "summary": summary,
            "macro_filter": macro_filter,
            "theme_scores": theme_scores,
            "uoa_watchlist": uoa_watchlist,
            "sector_rotation": sector_rotation,
            "cross_asset_flags": cross_asset_flags,
            "news_lag_model": lag_model,
            "data_quality": data_quality,
            "explainability": explainability,
            "regime_timeline": regime_timeline,
            "alert_engine": alert_engine,
            "validation_lab": validation_lab,
            "theme_drilldown": theme_drilldown,
            "macro_event_overlay": macro_event_overlay,
            "lead_lag_radar": lead_lag_radar,
            "signal_decay_monitor": signal_decay_monitor,
            "regime_switch_detector": regime_switch_detector,
            "counterfactual_lab": counterfactual_lab,
            "execution_risk_overlay": execution_risk_overlay,
            "narrative_saturation_meter": narrative_saturation_meter,
            "historical_analysis_10y": historical_analysis_10y,
            "active_projection_assets": active_projection_assets,
            "data_coverage": {
                "history_period": HISTORY_RANGE,
                "history_tickers_loaded": len(history_map),
                "options_tickers_scanned": len(OPTIONS_UNIVERSE),
                "uoa_events_total": len(uoa_watchlist),
                "warnings": warnings[:10],
            },
            "methodology": {
                "layers": [
                    "Live options anomaly clustering (CBOE chain: volume/OI, premium, urgency, moneyness)",
                    "Sector rotation with long-history validation (Yahoo chart daily history)",
                    "Cross-asset confirmation flags",
                    "Macro filter with deep-research overlay",
                    "Dual score aggregation (aggressive + conservative) with barbell composite",
                    "Lead-lag radar, decay monitor and regime-switch detector",
                    "Counterfactual cross-confirmation and execution friction overlay",
                    "Narrative saturation vs positioning gap monitor",
                    "Decade historical analysis (10Y) + cross-asset correlation drift",
                ],
                "composite_formula": (
                    "aggressive = 0.52*UOA_agg + 0.23*Rotation + 0.17*Cross + 0.08*Macro + adj; "
                    "conservative = 0.25*UOA_cons + 0.30*Rotation + 0.30*HistEdge + 0.15*Cross + adj*0.65; "
                    "barbell = 0.46*aggressive + 0.54*conservative"
                ),
                "thresholds": {
                    "strong_positioning": ">= 78",
                    "building_positioning": "60 - 77.99",
                    "early_accumulation": "45 - 59.99",
                    "noise": "< 45",
                },
                "scope": "Narrative positioning map only. No execution signals.",
            },
            "cache": {"hit": False, "age_seconds": 0, "ttl_seconds": CACHE_TTL_SECONDS},
        }

        _CACHE["ts"] = now
        _CACHE["payload"] = copy.deepcopy(payload)
        return payload
    except Exception as exc:
        return _build_degraded_payload(now, multi_snapshot, projections, f"runtime failure: {exc}")
