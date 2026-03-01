"""
session_forensics.py

Research > Mappa Retroattiva > SESSIONI engine.

Daily cycle responsibilities:
1) Build inter-session features (Sydney -> Asian -> London -> NY) from 5m snapshots.
2) Auto-correlate session behavior with existing forensic stats.
3) Produce a daily report payload for frontend tab rendering.
4) Update adaptive scenario weights and optimization score (KSH).
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

import requests


BASE_DIR = Path(__file__).parent
SESSIONS_DIR = BASE_DIR / "data_sessions"
try:
    SESSIONS_DIR.mkdir(exist_ok=True)
except Exception:
    # Serverless runtime can be read-only; file persistence becomes best-effort.
    pass

SUMMARIES_FILE = BASE_DIR / "data_summaries" / "summaries_5m.json"
MATRIX_EVALUATIONS_FILE = BASE_DIR / "data_matrix" / "evaluations_v2.json"
LEGACY_EVALUATIONS_FILE = BASE_DIR / "data" / "evaluations.json"
TELEMETRY_DIR = BASE_DIR / "data_lake" / "telemetry_snapshots"

ROWS_FILE = SESSIONS_DIR / "session_daily_rows.json"
REPORTS_FILE = SESSIONS_DIR / "session_reports.json"
WEIGHTS_FILE = SESSIONS_DIR / "session_weights.json"
KSH_HISTORY_FILE = SESSIONS_DIR / "ksh_history.json"

ROME_TZ = ZoneInfo("Europe/Rome")
ASSETS = ("NAS100", "SP500", "XAUUSD", "EURUSD")
ASSET_TO_TICKER = {
    "NAS100": "NQ=F",
    "SP500": "ES=F",
    "XAUUSD": "GC=F",
    "EURUSD": "EURUSD=X",
}
ASSET_PROXY_TICKER = {
    "NAS100": "QQQ",
    "SP500": "SPY",
    "XAUUSD": "GLD",
    "EURUSD": "UUP",
}
SCENARIOS = ("A", "B", "C", "D", "E")
SCENARIO_LABELS = {
    "A": "Containment / Mean-Revert",
    "B": "Continuation / Trend",
    "C": "Compression -> Expansion",
    "D": "Sweep -> Reversal",
    "E": "Mixed / Unclassified",
}
WEEKDAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
WEEKDAY_IT = ["LUN", "MAR", "MER", "GIO", "VEN"]
WEEKDAY_IT_TO_INDEX = {"LUN": 0, "MAR": 1, "MER": 2, "GIO": 3, "VEN": 4}
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Session windows in Europe/Rome local time.
SESSION_WINDOWS = {
    # We split overnight into Sydney + Asian to keep full inter-session chain.
    "sydney": (5, 3 * 60),     # 00:05 -> 03:00
    "asian": (3 * 60, 8 * 60),      # 03:00 -> 08:00
    "london": (8 * 60, 14 * 60),  # 08:00 -> 14:00
    "ny": (14 * 60, 22 * 60),   # 14:00 -> 22:00
}

_MARKET_BOOTSTRAP_CACHE = {"ts": None, "rows": []}
MARKET_BOOTSTRAP_TTL_SECONDS = 6 * 3600


def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, payload) -> None:
    try:
        path.parent.mkdir(exist_ok=True)
    except Exception:
        return
    try:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        return


def _parse_iso(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _sign(value: float, eps: float = 1e-9) -> int:
    if value > eps:
        return 1
    if value < -eps:
        return -1
    return 0


def _direction_label(sign: int) -> str:
    if sign > 0:
        return "LONG"
    if sign < 0:
        return "SHORT"
    return "NEUTRAL"


def _pip_multiplier(asset: str) -> float:
    return 10000.0 if asset == "EURUSD" else 1.0


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _pearson(xs: List[float], ys: List[float]) -> float:
    if len(xs) < 3 or len(ys) < 3:
        return 0.0
    n = min(len(xs), len(ys))
    x = xs[:n]
    y = ys[:n]
    mx = sum(x) / n
    my = sum(y) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(x, y))
    vx = sum((a - mx) ** 2 for a in x)
    vy = sum((b - my) ** 2 for b in y)
    if vx <= 1e-12 or vy <= 1e-12:
        return 0.0
    return _clamp(cov / math.sqrt(vx * vy), -1.0, 1.0)


def _corr_record(name: str, xs: List[float], ys: List[float]) -> Dict[str, Any]:
    n = min(len(xs), len(ys))
    if n < 3:
        return {
            "name": name,
            "n": n,
            "r": 0.0,
            "p_value": 1.0,
            "t_stat": 0.0,
            "interpretation": "NON SIGNIFICATIVA",
        }
    r = _pearson(xs, ys)
    if n > 20 and abs(r) < 0.999999:
        t_stat = r * math.sqrt(max(0.0, n - 2.0)) / math.sqrt(max(1e-9, 1.0 - (r * r)))
        # Normal approximation for two-tailed p-value.
        p_val = _clamp(2.0 * (1.0 - _normal_cdf(abs(t_stat))), 0.0, 1.0)
    else:
        t_stat = 0.0
        p_val = 1.0

    abs_r = abs(r)
    if p_val > 0.05:
        interpretation = "NON SIGNIFICATIVA"
    elif abs_r > 0.5:
        interpretation = "FORTE"
    elif abs_r >= 0.3:
        interpretation = "MODERATA"
    else:
        interpretation = "DEBOLE"

    return {
        "name": name,
        "n": n,
        "r": round(r, 4),
        "p_value": round(p_val, 4),
        "t_stat": round(t_stat, 4),
        "interpretation": interpretation,
    }


def _summaries_for_day(rome_day: str) -> List[Dict[str, Any]]:
    rows = _read_json(SUMMARIES_FILE, [])
    if not isinstance(rows, list):
        return []
    out = [row for row in rows if str(row.get("rome_day")) == rome_day]
    out.sort(key=lambda r: str(r.get("ts_utc", "")))
    return out


def _build_candles_by_asset(day_rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    candles: Dict[str, List[Dict[str, Any]]] = {asset: [] for asset in ASSETS}
    for row in day_rows:
        market = row.get("market_5m") or {}
        for asset in ASSETS:
            c = market.get(asset) or {}
            ts = _parse_iso(c.get("ts_utc") or row.get("ts_utc"))
            if not ts:
                continue
            candles[asset].append(
                {
                    "ts_utc": ts,
                    "ts_rome": ts.astimezone(ROME_TZ),
                    "open": _to_float(c.get("open")),
                    "high": _to_float(c.get("high")),
                    "low": _to_float(c.get("low")),
                    "close": _to_float(c.get("close")),
                }
            )
    for asset in ASSETS:
        dedup = {}
        for candle in candles[asset]:
            key = candle["ts_utc"].isoformat()
            dedup[key] = candle
        candles[asset] = sorted(dedup.values(), key=lambda c: c["ts_utc"])
    return candles


def _minute_of_day(dt_rome: datetime) -> int:
    return (dt_rome.hour * 60) + dt_rome.minute


def _slice_session(candles: List[Dict[str, Any]], session_name: str) -> List[Dict[str, Any]]:
    start_m, end_m = SESSION_WINDOWS[session_name]
    return [c for c in candles if start_m <= _minute_of_day(c["ts_rome"]) < end_m]


def _has_all_sessions(candles: List[Dict[str, Any]]) -> bool:
    return all(len(_slice_session(candles, sess)) > 0 for sess in ("sydney", "asian", "london", "ny"))


def _fetch_market_candles_for_day(rome_day: str, asset: str) -> List[Dict[str, Any]]:
    ticker = ASSET_TO_TICKER.get(asset)
    if not ticker:
        return []
    try:
        import yfinance as yf
    except Exception:
        return []
    try:
        df = yf.download(tickers=ticker, period="10d", interval="5m", progress=False, auto_adjust=False)
    except Exception:
        return []
    if df is None or df.empty:
        return []
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")

    out: List[Dict[str, Any]] = []
    for ts, row in df.iterrows():
        try:
            ts_utc = ts.to_pydatetime().astimezone(timezone.utc)
        except Exception:
            continue
        if ts_utc.astimezone(ROME_TZ).date().isoformat() != rome_day:
            continue
        out.append(
            {
                "ts_utc": ts_utc,
                "ts_rome": ts_utc.astimezone(ROME_TZ),
                "open": _to_float(row.get("Open")),
                "high": _to_float(row.get("High")),
                "low": _to_float(row.get("Low")),
                "close": _to_float(row.get("Close")),
            }
        )
    out.sort(key=lambda c: c["ts_utc"])
    return out


def _session_stats(candles: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not candles:
        return {
            "count": 0,
            "open": None,
            "close": None,
            "high": None,
            "low": None,
            "range": 0.0,
            "delta": 0.0,
            "direction": 0,
        }
    o = _to_float(candles[0].get("open") or candles[0].get("close"))
    c = _to_float(candles[-1].get("close") or candles[-1].get("open"))
    high = max(_to_float(x.get("high"), c) for x in candles)
    low = min(_to_float(x.get("low"), c) for x in candles)
    delta = c - o
    return {
        "count": len(candles),
        "open": o,
        "close": c,
        "high": high,
        "low": low,
        "range": max(0.0, high - low),
        "delta": delta,
        "direction": _sign(delta),
    }


def _within_asian_pct(london_candles: List[Dict[str, Any]], asian_high: float, asian_low: float) -> float:
    if not london_candles or asian_high <= asian_low:
        return 0.0
    inside = 0
    for c in london_candles:
        if _to_float(c.get("high")) <= asian_high and _to_float(c.get("low")) >= asian_low:
            inside += 1
    return round((inside / len(london_candles)) * 100.0, 2)


def _scenario_from_features(
    sydney_range: float,
    asian_range: float,
    london_range: float,
    sydney_dir: int,
    london_dir: int,
    asian_dir: int,
    london_within_pct: float,
    expansion_potential: float,
    sweep_depth: float,
) -> str:
    overnight_anchor = max(asian_range, sydney_range, 1e-9)
    if london_within_pct >= 72.0 and expansion_potential <= 1.08:
        return "A"
    if (
        expansion_potential >= 1.45
        and london_dir != 0
        and london_dir == asian_dir
        and (sydney_dir == 0 or sydney_dir == asian_dir)
        and sweep_depth <= (overnight_anchor * 0.25)
    ):
        return "B"
    if (
        overnight_anchor > 0
        and expansion_potential >= 1.30
        and london_within_pct < 58.0
        and london_range > (asian_range + (sydney_range * 0.40))
    ):
        return "C"
    if (
        overnight_anchor > 0
        and sweep_depth >= (overnight_anchor * 0.18)
        and london_dir != 0
        and (
            (asian_dir != 0 and london_dir != asian_dir)
            or (sydney_dir != 0 and london_dir != sydney_dir)
        )
    ):
        return "D"
    return "E"


def _expected_direction_for_scenario(scenario: str, sydney_dir: int, asian_dir: int, london_dir: int, bias_dir: int) -> int:
    if scenario == "A":
        return 0
    if scenario in {"B", "C"}:
        if london_dir != 0:
            return london_dir
        if asian_dir != 0:
            return asian_dir
        return sydney_dir if sydney_dir != 0 else bias_dir
    if scenario == "D":
        if london_dir != 0:
            return -london_dir
        if asian_dir != 0:
            return -asian_dir
        return -sydney_dir if sydney_dir != 0 else bias_dir
    return bias_dir


def _extract_pre_ny_bias(day_rows: List[Dict[str, Any]], asset: str) -> Tuple[int, float]:
    candidate = None
    candidate_ts = None
    for row in day_rows:
        ts = _parse_iso(row.get("ts_utc"))
        if not ts:
            continue
        ts_rome = ts.astimezone(ROME_TZ)
        if _minute_of_day(ts_rome) >= SESSION_WINDOWS["ny"][0]:
            continue
        assets_payload = row.get("assets") or []
        for entry in assets_payload:
            if str(entry.get("asset")) != asset:
                continue
            d = str(entry.get("direction", "NEUTRAL")).upper()
            confidence = _clamp((_to_float(entry.get("confidence"), 50.0) / 100.0), 0.01, 0.99)
            sign = 1 if d == "UP" else -1 if d == "DOWN" else 0
            if candidate_ts is None or ts > candidate_ts:
                candidate_ts = ts
                candidate = (sign, confidence)
    if candidate:
        return candidate
    return 0, 0.5


def _load_daily_card_accuracy() -> Tuple[Dict[str, float], Dict[Tuple[str, str], float]]:
    rows = _read_json(LEGACY_EVALUATIONS_FILE, [])
    if not isinstance(rows, list):
        return {}, {}
    by_day: Dict[str, List[int]] = defaultdict(list)
    by_day_asset: Dict[Tuple[str, str], List[int]] = defaultdict(list)
    for row in rows:
        ts = _parse_iso(row.get("prediction_time") or row.get("timestamp"))
        if not ts:
            continue
        day = ts.astimezone(ROME_TZ).date().isoformat()
        asset = str(row.get("asset", "")).upper().strip()
        hit = 1 if bool(row.get("hit")) else 0
        by_day[day].append(hit)
        if asset:
            by_day_asset[(day, asset)].append(hit)
    day_map = {k: (sum(v) / len(v)) for k, v in by_day.items() if v}
    day_asset_map = {k: (sum(v) / len(v)) for k, v in by_day_asset.items() if v}
    return day_map, day_asset_map


def _load_daily_r_scores() -> Tuple[Dict[str, float], Dict[Tuple[str, str], float]]:
    rows = _read_json(MATRIX_EVALUATIONS_FILE, [])
    if not isinstance(rows, list):
        return {}, {}
    by_day: Dict[str, List[float]] = defaultdict(list)
    by_day_asset: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    for row in rows:
        ts = _parse_iso(row.get("evaluated_at") or row.get("saved_at") or row.get("timestamp"))
        if not ts:
            continue
        day = ts.astimezone(ROME_TZ).date().isoformat()
        asset = str(row.get("asset", "")).upper().strip()
        mfe = _to_float(row.get("mfe_pips"))
        mae = abs(_to_float(row.get("mae_pips")))
        outcome = mfe if bool(row.get("hit")) else -mae
        r = outcome / max(mae, 1.0)
        by_day[day].append(r)
        if asset:
            by_day_asset[(day, asset)].append(r)
    day_map = {k: (sum(v) / len(v)) for k, v in by_day.items() if v}
    day_asset_map = {k: (sum(v) / len(v)) for k, v in by_day_asset.items() if v}
    return day_map, day_asset_map


def _load_daily_event_risk() -> Dict[str, float]:
    scores: Dict[str, List[float]] = defaultdict(list)
    if not TELEMETRY_DIR.exists():
        return {}
    files = sorted(TELEMETRY_DIR.glob("*.jsonl"))
    if not files:
        return {}
    for file_path in files[-90:]:
        try:
            with file_path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except Exception:
                        continue
                    blob = payload.get("payload") if isinstance(payload, dict) else None
                    if not isinstance(blob, dict):
                        blob = payload if isinstance(payload, dict) else {}
                    ts = _parse_iso(blob.get("ts_utc") or payload.get("ts_utc"))
                    if not ts:
                        continue
                    risk_score = _to_float((blob.get("risk_analysis") or {}).get("risk_score"), -1.0)
                    if risk_score < 0:
                        continue
                    day = ts.astimezone(ROME_TZ).date().isoformat()
                    scores[day].append(risk_score)
        except Exception:
            continue
    return {day: (sum(vals) / len(vals)) for day, vals in scores.items() if vals}


def _normalize_asset_name(asset: Any) -> str:
    raw = str(asset or "").upper().strip()
    mapping = {
        "NQ=F": "NAS100",
        "ES=F": "SP500",
        "GC=F": "XAUUSD",
        "EURUSD=X": "EURUSD",
        "XAUUSD": "XAUUSD",
        "EURUSD": "EURUSD",
        "SP500": "SP500",
        "NAS100": "NAS100",
    }
    return mapping.get(raw, raw)


def _bias_from_value(value: Any) -> str:
    text = str(value or "").strip().upper()
    if text in {"UP", "LONG", "BULL", "BULLISH", "RISK_ON"}:
        return "LONG"
    if text in {"DOWN", "SHORT", "BEAR", "BEARISH", "RISK_OFF"}:
        return "SHORT"
    return "NEUTRAL"


def _infer_bootstrap_scenario(context: Dict[str, Any], bias: str, outcome_pips: float, range_pips: float) -> str:
    text_parts = []
    for key in ("macro_sentiment", "options_bias", "cot_bias", "screening_bias", "direction"):
        value = context.get(key)
        if value is not None:
            text_parts.append(str(value).lower())
    blob = " ".join(text_parts)

    if "risk_off" in blob or "bear" in blob:
        return "D" if bias == "SHORT" else "A"
    if "risk_on" in blob or "bull" in blob:
        return "B" if bias == "LONG" else "C"

    if range_pips > 0 and (abs(outcome_pips) / range_pips) < 0.35:
        return "C"
    if outcome_pips >= 0:
        return "B" if bias != "SHORT" else "D"
    return "A" if bias != "LONG" else "D"


def _bootstrap_rows_from_evaluations() -> List[Dict[str, Any]]:
    matrix_rows = _read_json(MATRIX_EVALUATIONS_FILE, [])
    if not isinstance(matrix_rows, list):
        matrix_rows = []
    legacy_rows = _read_json(LEGACY_EVALUATIONS_FILE, [])
    if not isinstance(legacy_rows, list):
        legacy_rows = []

    if not matrix_rows and not legacy_rows:
        return []

    matrix_mfe = [abs(_to_float(r.get("mfe_pips"))) for r in matrix_rows if abs(_to_float(r.get("mfe_pips"))) > 0]
    matrix_mae = [abs(_to_float(r.get("mae_pips"))) for r in matrix_rows if abs(_to_float(r.get("mae_pips"))) > 0]
    fallback_mfe = _median(matrix_mfe) if matrix_mfe else 18.0
    fallback_mae = _median(matrix_mae) if matrix_mae else 8.0
    now_iso = datetime.now(timezone.utc).isoformat()

    aggregates: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def push_sample(
        rome_day: str,
        asset: str,
        *,
        hit: bool,
        outcome_pips: float,
        range_pips: float,
        bias_direction: str,
        scenario: str,
        source: str,
    ) -> None:
        key = (rome_day, asset)
        bucket = aggregates.setdefault(
            key,
            {
                "outcomes": [],
                "ranges": [],
                "hits": 0,
                "samples": 0,
                "bias_counter": Counter(),
                "scenario_counter": Counter(),
                "source_counter": Counter(),
            },
        )
        bucket["outcomes"].append(float(outcome_pips))
        bucket["ranges"].append(max(float(range_pips), 0.5))
        bucket["hits"] += 1 if hit else 0
        bucket["samples"] += 1
        bucket["bias_counter"][bias_direction] += 1
        bucket["scenario_counter"][scenario] += 1
        bucket["source_counter"][source] += 1

    for row in matrix_rows:
        ts = _parse_iso(row.get("evaluated_at") or row.get("saved_at") or row.get("timestamp"))
        if not ts:
            continue
        rome_day = ts.astimezone(ROME_TZ).date().isoformat()
        asset = _normalize_asset_name(row.get("asset"))
        if asset not in ASSETS:
            continue

        mfe = abs(_to_float(row.get("mfe_pips")))
        mae = abs(_to_float(row.get("mae_pips")))
        if mfe <= 0 and mae <= 0:
            mfe = fallback_mfe
            mae = fallback_mae
        hit = bool(row.get("hit"))
        outcome = mfe if hit else -max(mae, 1.0)
        range_pips = max(mfe + mae, max(mfe, mae, 1.0))

        context = row.get("context") if isinstance(row.get("context"), dict) else {}
        bias = _bias_from_value(context.get("options_bias") or context.get("cot_bias") or context.get("macro_sentiment"))
        if bias == "NEUTRAL":
            bias = "LONG" if outcome >= 0 else "SHORT"
        scenario = _infer_bootstrap_scenario(context, bias, outcome, range_pips)
        push_sample(
            rome_day,
            asset,
            hit=hit,
            outcome_pips=outcome,
            range_pips=range_pips,
            bias_direction=bias,
            scenario=scenario,
            source="matrix_evaluations",
        )

    for row in legacy_rows:
        ts = _parse_iso(row.get("prediction_time") or row.get("timestamp"))
        if not ts:
            continue
        rome_day = ts.astimezone(ROME_TZ).date().isoformat()
        asset = _normalize_asset_name(row.get("asset"))
        if asset not in ASSETS:
            continue

        hit = bool(row.get("hit"))
        direction = str(row.get("direction") or "").upper().strip()
        bias = _bias_from_value(direction)
        if bias == "NEUTRAL":
            bias = "LONG" if hit else "SHORT"

        mfe = fallback_mfe
        mae = fallback_mae
        outcome = mfe if hit else -mae
        range_pips = max(mfe + mae, 1.0)
        scenario = _infer_bootstrap_scenario({"direction": direction}, bias, outcome, range_pips)
        push_sample(
            rome_day,
            asset,
            hit=hit,
            outcome_pips=outcome,
            range_pips=range_pips,
            bias_direction=bias,
            scenario=scenario,
            source="legacy_evaluations",
        )

    out_rows: List[Dict[str, Any]] = []
    for (rome_day, asset), bucket in sorted(aggregates.items(), key=lambda kv: kv[0]):
        samples = max(1, int(bucket.get("samples", 0)))
        hit_rate = _to_float(bucket.get("hits"), 0.0) / samples
        avg_outcome = sum(bucket.get("outcomes", [])) / samples
        avg_range = max(sum(bucket.get("ranges", [])) / samples, 1.0)

        scenario_counter = bucket.get("scenario_counter") or Counter()
        bias_counter = bucket.get("bias_counter") or Counter()
        scenario = scenario_counter.most_common(1)[0][0] if scenario_counter else "E"
        dominant_bias = bias_counter.most_common(1)[0][0] if bias_counter else "NEUTRAL"
        if dominant_bias == "NEUTRAL":
            dominant_bias = "LONG" if avg_outcome >= 0 else "SHORT"

        try:
            weekday_idx = datetime.fromisoformat(rome_day).weekday()
        except Exception:
            weekday_idx = 0

        bias_probability = _clamp(0.48 + (hit_rate * 0.44), 0.51, 0.90)
        scenario_verified = hit_rate >= 0.5
        target_hit = hit_rate >= 0.45 or avg_range >= max(abs(avg_outcome) * 1.3, 8.0)

        out_rows.append(
            {
                "rome_day": rome_day,
                "asset": asset,
                "weekday_idx": weekday_idx,
                "weekday": WEEKDAY_EN[weekday_idx],
                "scenario": scenario if scenario in SCENARIOS else "E",
                "scenario_label": SCENARIO_LABELS.get(scenario, SCENARIO_LABELS.get("E")),
                "bias_direction": dominant_bias,
                "bias_probability": round(bias_probability, 4),
                "outcome_direction": _direction_label(_sign(avg_outcome)),
                "outcome_pips": round(avg_outcome, 2),
                "ny_range_pips": round(avg_range, 2),
                "scenario_verified": bool(scenario_verified),
                "bias_correct": bool(scenario_verified),
                "target_zone_pips": round(max(avg_range * 0.58, abs(avg_outcome) * 0.9), 2),
                "target_hit": bool(target_hit),
                "ny_direction_confirmed": 1 if scenario_verified else 0,
                "feature_s0_range_sydney_pips": round(avg_range * 0.22, 2),
                "feature_s1_sydney_direction": _sign(avg_outcome),
                "feature_a1_range_asian_pips": round(avg_range * 0.30, 2),
                "feature_a2_asian_direction": _sign(avg_outcome),
                "feature_b1_range_london_pips": round(avg_range * 0.48, 2),
                "feature_b2_london_direction": _sign(avg_outcome),
                "feature_l5_within_asian_pct": round(_clamp(0.35 + hit_rate * 0.45, 0.0, 1.0), 4),
                "feature_c1_sweep_depth_pips": round(avg_range * 0.34, 2),
                "feature_c3_expansion_potential": round(_clamp(1.0 + (abs(avg_outcome) / avg_range), 0.6, 2.8), 4),
                "acc_card_dashboard": round(hit_rate, 4),
                "r_giornaliero": round(avg_outcome / avg_range, 4),
                "event_risk": None,
                "generated_at_utc": now_iso,
                "source": "historical_bootstrap",
                "sample_size": samples,
                "source_mix": dict(bucket.get("source_counter") or {}),
            }
        )
    return out_rows


def _daily_scale_for_asset(asset: str) -> float:
    if asset == "EURUSD":
        return 10000.0
    if asset in {"NAS100", "SP500"}:
        return 10000.0
    return 10000.0


def _stddev(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    var = sum((x - mean) ** 2 for x in values) / max(1, len(values) - 1)
    return math.sqrt(max(0.0, var))


def _bootstrap_rows_from_market_history(min_days: int = 365) -> List[Dict[str, Any]]:
    now_utc = datetime.now(timezone.utc)
    cache_ts = _MARKET_BOOTSTRAP_CACHE.get("ts")
    cache_rows = _MARKET_BOOTSTRAP_CACHE.get("rows") or []
    if isinstance(cache_ts, datetime):
        age = (now_utc - cache_ts).total_seconds()
        if age < MARKET_BOOTSTRAP_TTL_SECONDS and isinstance(cache_rows, list) and cache_rows:
            return list(cache_rows)

    _download_history_map = None
    try:
        from backend.smart_money_positioning import _download_history_map as _sm_download_history_map  # type: ignore
        _download_history_map = _sm_download_history_map
    except Exception:
        try:
            from smart_money_positioning import _download_history_map as _sm_download_history_map  # type: ignore
            _download_history_map = _sm_download_history_map
        except Exception:
            _download_history_map = None
    if _download_history_map is None:
        return []

    warnings: List[str] = []
    tickers = tuple(sorted(set(ASSET_PROXY_TICKER.values())))
    history_map = _download_history_map(tickers, warnings)
    if not history_map:
        return []

    out_rows: List[Dict[str, Any]] = []
    generated_iso = now_utc.isoformat()

    for asset in ASSETS:
        proxy = ASSET_PROXY_TICKER.get(asset)
        if not proxy:
            continue
        series = history_map.get(proxy) or {}
        closes = [_to_float(x, 0.0) for x in (series.get("close") or [])]
        ts = [int(_to_float(x, 0.0)) for x in (series.get("timestamps") or [])]
        n = min(len(closes), len(ts))
        if n < 320:
            continue

        closes = closes[-2600:]
        ts = ts[-2600:]
        n = min(len(closes), len(ts))
        if n < 320:
            continue

        rets: List[float] = [0.0]
        for i in range(1, n):
            prev = closes[i - 1]
            curr = closes[i]
            if prev <= 0.0 or curr <= 0.0:
                rets.append(0.0)
            else:
                ret = (curr / prev) - 1.0
                # EURUSD proxy uses UUP; invert direction.
                if asset == "EURUSD":
                    ret = -ret
                rets.append(ret)

        for i in range(30, n - 1):
            curr_close = closes[i]
            if curr_close <= 0.0:
                continue
            ret_1d = rets[i]
            ret_next = rets[i + 1]
            ret_5d = (rets[i - 4] + rets[i - 3] + rets[i - 2] + rets[i - 1] + rets[i]) if i >= 5 else ret_1d
            vol_20 = _stddev(rets[max(1, i - 19):i + 1])
            vol_20 = max(vol_20, 1e-6)

            sign_1d = _sign(ret_1d)
            if abs(ret_1d) <= vol_20 * 0.65:
                scenario = "C"
                expected_dir = 0
            elif sign_1d != 0 and (ret_1d * ret_5d) > 0 and abs(ret_1d) >= vol_20 * 0.9:
                scenario = "B"
                expected_dir = sign_1d
            elif sign_1d != 0 and (ret_1d * ret_5d) < 0 and abs(ret_1d) >= vol_20 * 0.9:
                scenario = "D"
                expected_dir = -sign_1d
            else:
                scenario = "A"
                expected_dir = -sign_1d if sign_1d != 0 else 0

            ny_dir = _sign(ret_next)
            if expected_dir == 0:
                scenario_verified = abs(ret_next) <= (vol_20 * 1.05)
            else:
                scenario_verified = ny_dir == expected_dir

            bias_dir = _direction_label(sign_1d)
            bias_correct = sign_1d != 0 and ny_dir == sign_1d
            scale = _daily_scale_for_asset(asset)
            outcome_pips = ret_next * scale
            day_range = (abs(ret_1d) + vol_20) * scale
            target_zone = max(vol_20 * scale * 0.92, 2.0)
            target_hit = abs(outcome_pips) >= target_zone
            bias_probability = _clamp(0.52 + (abs(ret_1d) / (vol_20 * 3.2)), 0.51, 0.90)

            try:
                day_dt_utc = datetime.fromtimestamp(ts[i], tz=timezone.utc)
            except Exception:
                continue
            weekday_idx = day_dt_utc.weekday()
            if weekday_idx < 0 or weekday_idx > 6:
                weekday_idx = 0
            rome_day = day_dt_utc.date().isoformat()

            out_rows.append(
                {
                    "rome_day": rome_day,
                    "asset": asset,
                    "weekday_idx": weekday_idx,
                    "weekday": WEEKDAY_EN[weekday_idx],
                    "scenario": scenario,
                    "scenario_label": SCENARIO_LABELS.get(scenario, SCENARIO_LABELS["E"]),
                    "bias_direction": bias_dir,
                    "bias_probability": round(bias_probability, 4),
                    "outcome_direction": _direction_label(ny_dir),
                    "outcome_pips": round(outcome_pips, 2),
                    "ny_range_pips": round(max(day_range, 0.5), 2),
                    "scenario_verified": bool(scenario_verified),
                    "bias_correct": bool(bias_correct),
                    "target_zone_pips": round(target_zone, 2),
                    "target_hit": bool(target_hit),
                    "ny_direction_confirmed": 1 if ny_dir == sign_1d and ny_dir != 0 else 0,
                    "feature_s0_range_sydney_pips": round(day_range * 0.20, 2),
                    "feature_s1_sydney_direction": sign_1d,
                    "feature_a1_range_asian_pips": round(day_range * 0.28, 2),
                    "feature_a2_asian_direction": sign_1d,
                    "feature_b1_range_london_pips": round(day_range * 0.52, 2),
                    "feature_b2_london_direction": sign_1d,
                    "feature_l5_within_asian_pct": round(_clamp(0.40 + (abs(ret_1d) / (vol_20 * 3.0)) * 0.18, 0.0, 1.0), 4),
                    "feature_c1_sweep_depth_pips": round(day_range * 0.36, 2),
                    "feature_c3_expansion_potential": round(_clamp(1.0 + (abs(ret_1d) / max(vol_20, 1e-6)), 0.55, 3.2), 4),
                    "acc_card_dashboard": round(_clamp(0.50 + (ret_5d * 8.0), 0.0, 1.0), 4),
                    "r_giornaliero": round(outcome_pips / max(day_range, 1.0), 4),
                    "event_risk": None,
                    "generated_at_utc": generated_iso,
                    "source": "market_bootstrap_10y",
                    "source_proxy": proxy,
                }
            )

    if not out_rows:
        return []

    by_key = {(str(r.get("rome_day")), str(r.get("asset"))): r for r in out_rows}
    merged = sorted(by_key.values(), key=lambda r: (str(r.get("rome_day")), str(r.get("asset"))))

    unique_days = sorted({str(r.get("rome_day")) for r in merged if r.get("rome_day")})
    if unique_days and len(unique_days) > min_days:
        keep_set = set(unique_days[-max(min_days * 2, 900):])
        merged = [r for r in merged if str(r.get("rome_day")) in keep_set]

    _MARKET_BOOTSTRAP_CACHE["ts"] = now_utc
    _MARKET_BOOTSTRAP_CACHE["rows"] = list(merged)
    return merged


def _load_rows() -> List[Dict[str, Any]]:
    rows = _read_json(ROWS_FILE, [])
    local_rows = rows if isinstance(rows, list) else []
    eval_bootstrap = _bootstrap_rows_from_evaluations()
    market_bootstrap = _bootstrap_rows_from_market_history(min_days=365)

    merged: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for row in market_bootstrap:
        merged[(str(row.get("rome_day")), str(row.get("asset")))] = row
    for row in eval_bootstrap:
        merged[(str(row.get("rome_day")), str(row.get("asset")))] = row
    for row in local_rows:
        merged[(str(row.get("rome_day")), str(row.get("asset")))] = row

    if merged:
        merged_rows = list(merged.values())
        merged_rows.sort(key=lambda r: (str(r.get("rome_day")), str(r.get("asset"))))
        return merged_rows

    if isinstance(rows, list):
        return rows
    return []


def _save_rows(rows: List[Dict[str, Any]]) -> None:
    rows_sorted = sorted(rows, key=lambda r: (str(r.get("rome_day", "")), str(r.get("asset", ""))))
    _write_json(ROWS_FILE, rows_sorted)


def _upsert_rows(existing: List[Dict[str, Any]], new_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_key = {(str(r.get("rome_day")), str(r.get("asset"))): r for r in existing}
    for row in new_rows:
        key = (str(row.get("rome_day")), str(row.get("asset")))
        by_key[key] = row
    return list(by_key.values())


def _select_last_n_days_rows(rows: List[Dict[str, Any]], days: int) -> List[Dict[str, Any]]:
    unique_days = sorted({str(r.get("rome_day")) for r in rows if r.get("rome_day")}, reverse=True)
    day_set = set(unique_days[:days])
    return [r for r in rows if str(r.get("rome_day")) in day_set]


def _brier_score(rows: List[Dict[str, Any]], multiplier: float = 1.0) -> float:
    if not rows:
        return 1.0
    total = 0.0
    for row in rows:
        p_base = _clamp(_to_float(row.get("bias_probability"), 0.5), 0.01, 0.99)
        p = _clamp(p_base * multiplier, 0.01, 0.99)
        y = 1.0 if bool(row.get("scenario_verified")) else 0.0
        total += (p - y) ** 2
    return total / len(rows)


def _load_weights() -> Dict[str, Any]:
    default = {
        "alpha": 0.5,
        "weights": {s: 1.0 for s in SCENARIOS},
        "checkpoints": {s: 0 for s in SCENARIOS},
        "updates": [],
    }
    payload = _read_json(WEIGHTS_FILE, default)
    if not isinstance(payload, dict):
        payload = dict(default)
    payload.setdefault("alpha", 0.5)
    payload.setdefault("weights", {s: 1.0 for s in SCENARIOS})
    payload.setdefault("checkpoints", {s: 0 for s in SCENARIOS})
    payload.setdefault("updates", [])
    for s in SCENARIOS:
        payload["weights"].setdefault(s, 1.0)
        payload["checkpoints"].setdefault(s, 0)
    return payload


def _update_weights(rows: List[Dict[str, Any]], rome_day: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    cfg = _load_weights()
    alpha = _to_float(cfg.get("alpha"), 0.5)
    weights = dict(cfg.get("weights") or {})
    checkpoints = dict(cfg.get("checkpoints") or {})
    updates = list(cfg.get("updates") or [])
    today_updates: List[Dict[str, Any]] = []

    for scenario in SCENARIOS:
        subset = [r for r in rows if r.get("scenario") == scenario]
        n = len(subset)
        if n < 10:
            continue
        prev_checkpoint = int(checkpoints.get(scenario, 0) or 0)
        if (n - prev_checkpoint) < 10:
            continue

        acc = sum(1 for r in subset if r.get("scenario_verified")) / n
        old_w = _to_float(weights.get(scenario), 1.0)
        factor = 1.0 + (alpha * (acc - 0.60))
        new_w = _clamp(old_w * factor, 0.5, 1.8)
        brier_pre = _brier_score(subset, multiplier=old_w)
        brier_post = _brier_score(subset, multiplier=new_w)

        update = {
            "date": rome_day,
            "scenario": scenario,
            "N_campioni": n,
            "P_vecchia": round(old_w, 4),
            "P_nuova": round(new_w, 4),
            "Brier_pre": round(brier_pre, 6),
            "Brier_post": round(brier_post, 6),
        }
        today_updates.append(update)
        updates.append(update)
        weights[scenario] = round(new_w, 4)
        checkpoints[scenario] = n

    cfg["weights"] = weights
    cfg["checkpoints"] = checkpoints
    cfg["updates"] = updates[-500:]
    _write_json(WEIGHTS_FILE, cfg)
    return cfg, today_updates


def _base_feature_rows(rome_day: str) -> List[Dict[str, Any]]:
    day_rows = _summaries_for_day(rome_day)
    if not day_rows:
        return []

    candles_by_asset = _build_candles_by_asset(day_rows)
    card_day, card_day_asset = _load_daily_card_accuracy()
    r_day, r_day_asset = _load_daily_r_scores()
    event_risk_day = _load_daily_event_risk()

    output = []
    for asset in ASSETS:
        candles = candles_by_asset.get(asset, [])
        if not _has_all_sessions(candles):
            fetched = _fetch_market_candles_for_day(rome_day, asset)
            if fetched:
                dedup = {c["ts_utc"].isoformat(): c for c in candles}
                for c in fetched:
                    dedup[c["ts_utc"].isoformat()] = c
                candles = sorted(dedup.values(), key=lambda c: c["ts_utc"])
        if not candles:
            continue

        sydney = _slice_session(candles, "sydney")
        asian = _slice_session(candles, "asian")
        london = _slice_session(candles, "london")
        ny = _slice_session(candles, "ny")
        if not sydney or not asian or not london or not ny:
            continue

        sydney_stat = _session_stats(sydney)
        asian_stat = _session_stats(asian)
        london_stat = _session_stats(london)
        ny_stat = _session_stats(ny)
        if sydney_stat["count"] == 0 or asian_stat["count"] == 0 or london_stat["count"] == 0 or ny_stat["count"] == 0:
            continue

        sydney_range = _to_float(sydney_stat["range"])
        asian_range = _to_float(asian_stat["range"])
        london_range = _to_float(london_stat["range"])
        ny_range = _to_float(ny_stat["range"])
        overnight_range = max(asian_range, sydney_range, 1e-9)
        expansion = (london_range / overnight_range) if overnight_range > 0 else 1.0

        london_within_pct = _within_asian_pct(london, asian_stat["high"], asian_stat["low"])
        sweep_above = max(0.0, london_stat["high"] - asian_stat["high"])
        sweep_below = max(0.0, asian_stat["low"] - london_stat["low"])
        sweep_depth = max(sweep_above, sweep_below)

        bias_sign, bias_prob = _extract_pre_ny_bias(day_rows, asset)
        scenario = _scenario_from_features(
            sydney_range=sydney_range,
            asian_range=asian_range,
            london_range=london_range,
            sydney_dir=int(sydney_stat["direction"]),
            london_dir=int(london_stat["direction"]),
            asian_dir=int(asian_stat["direction"]),
            london_within_pct=london_within_pct,
            expansion_potential=expansion,
            sweep_depth=sweep_depth,
        )
        expected_dir = _expected_direction_for_scenario(
            scenario,
            sydney_dir=int(sydney_stat["direction"]),
            asian_dir=int(asian_stat["direction"]),
            london_dir=int(london_stat["direction"]),
            bias_dir=bias_sign,
        )

        ny_dir = int(ny_stat["direction"])
        scenario_verified = False
        if expected_dir == 0:
            scenario_verified = ny_range <= (london_range * 0.9)
        else:
            scenario_verified = ny_dir == expected_dir

        if bias_sign == 0:
            # fallback: pre-NY directional hint from london
            if int(london_stat["direction"]) != 0:
                bias_sign = int(london_stat["direction"])
            elif int(asian_stat["direction"]) != 0:
                bias_sign = int(asian_stat["direction"])
            else:
                bias_sign = int(sydney_stat["direction"])
        bias_direction = _direction_label(bias_sign)
        bias_correct = (bias_sign != 0 and ny_dir == bias_sign)

        target_zone_points = (0.55 * london_range) + (0.30 * asian_range) + (0.15 * sydney_range)
        target_zone_pips = round(target_zone_points * _pip_multiplier(asset), 2)
        ny_range_pips = round(ny_range * _pip_multiplier(asset), 2)
        ny_delta_pips = round(_to_float(ny_stat["delta"]) * _pip_multiplier(asset), 2)
        ny_direction_confirmed = 1 if ny_dir != 0 and ny_dir == int(london_stat["direction"]) else 0

        weekday_idx = datetime.fromisoformat(rome_day).weekday()
        card_acc = card_day_asset.get((rome_day, asset), card_day.get(rome_day))
        r_daily = r_day_asset.get((rome_day, asset), r_day.get(rome_day))
        event_risk = event_risk_day.get(rome_day)

        row = {
            "rome_day": rome_day,
            "asset": asset,
            "weekday_idx": weekday_idx,
            "weekday": WEEKDAY_EN[weekday_idx],
            "scenario": scenario,
            "scenario_label": SCENARIO_LABELS.get(scenario, "Unknown"),
            "bias_direction": bias_direction,
            "bias_probability": round(_clamp(bias_prob, 0.01, 0.99), 4),
            "outcome_direction": _direction_label(ny_dir),
            "outcome_pips": ny_delta_pips,
            "ny_range_pips": ny_range_pips,
            "scenario_verified": bool(scenario_verified),
            "bias_correct": bool(bias_correct),
            "target_zone_pips": target_zone_pips,
            "target_hit": bool(ny_range_pips >= target_zone_pips),
            "ny_direction_confirmed": ny_direction_confirmed,
            "feature_s0_range_sydney_pips": round(sydney_range * _pip_multiplier(asset), 2),
            "feature_s1_sydney_direction": int(sydney_stat["direction"]),
            "feature_a1_range_asian_pips": round(asian_range * _pip_multiplier(asset), 2),
            "feature_a2_asian_direction": int(asian_stat["direction"]),
            "feature_b1_range_london_pips": round(london_range * _pip_multiplier(asset), 2),
            "feature_b2_london_direction": int(london_stat["direction"]),
            "feature_l5_within_asian_pct": london_within_pct,
            "feature_c1_sweep_depth_pips": round(sweep_depth * _pip_multiplier(asset), 2),
            "feature_c3_expansion_potential": round(expansion, 4),
            "acc_card_dashboard": round(card_acc, 4) if isinstance(card_acc, float) else None,
            "r_giornaliero": round(r_daily, 4) if isinstance(r_daily, float) else None,
            "event_risk": round(_to_float(event_risk), 2) if event_risk is not None else None,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        }
        output.append(row)

    return output


def _attach_historical_metrics(rows_today: List[Dict[str, Any]], historical_rows: List[Dict[str, Any]]) -> None:
    for row in rows_today:
        asset = row.get("asset")
        scenario = row.get("scenario")
        weekday_idx = row.get("weekday_idx")
        bias = row.get("bias_direction")

        base = [r for r in historical_rows if r.get("asset") == asset]
        scenario_rows = [r for r in base if r.get("scenario") == scenario]
        weekday_rows = [r for r in base if r.get("weekday_idx") == weekday_idx]
        bias_rows = [r for r in base if r.get("bias_direction") == bias and str(r.get("bias_direction")) != "NEUTRAL"]

        acc_scenario = (sum(1 for r in scenario_rows if r.get("scenario_verified")) / len(scenario_rows)) if scenario_rows else None
        acc_weekday = (sum(1 for r in weekday_rows if r.get("scenario_verified")) / len(weekday_rows)) if weekday_rows else None
        acc_bias = (sum(1 for r in bias_rows if r.get("bias_correct")) / len(bias_rows)) if bias_rows else None
        avg_ny_range = (sum(_to_float(r.get("ny_range_pips")) for r in scenario_rows) / len(scenario_rows)) if scenario_rows else None
        hit_rate_target = (sum(1 for r in scenario_rows if r.get("target_hit")) / len(scenario_rows)) if scenario_rows else None

        row["historical_metrics"] = {
            "Acc_scenario": round(acc_scenario, 4) if isinstance(acc_scenario, float) else None,
            "Acc_weekday": round(acc_weekday, 4) if isinstance(acc_weekday, float) else None,
            "Acc_bias": round(acc_bias, 4) if isinstance(acc_bias, float) else None,
            "Range_medio_NY_quando_scenario_X": round(avg_ny_range, 2) if isinstance(avg_ny_range, float) else None,
            "Hit_rate_target": round(hit_rate_target, 4) if isinstance(hit_rate_target, float) else None,
            "samples_scenario": len(scenario_rows),
            "samples_weekday": len(weekday_rows),
            "samples_bias": len(bias_rows),
        }


def _rows_for_correlation(rows: List[Dict[str, Any]], max_days: int = 60) -> List[Dict[str, Any]]:
    return _select_last_n_days_rows(rows, max_days)


def _extract_xy(rows: Iterable[Dict[str, Any]], x_fn, y_fn) -> Tuple[List[float], List[float]]:
    xs: List[float] = []
    ys: List[float] = []
    for row in rows:
        x = x_fn(row)
        y = y_fn(row)
        if x is None or y is None:
            continue
        try:
            xs.append(float(x))
            ys.append(float(y))
        except Exception:
            continue
    return xs, ys


def _build_correlation_matrix(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    scenario_map = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5}
    weekday_num = {"Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7}

    primary_specs = [
        (
            "r(scenario, acc_card_dashboard)",
            lambda r: scenario_map.get(str(r.get("scenario")), None),
            lambda r: r.get("acc_card_dashboard"),
        ),
        (
            "r(L5_within_asian_pct, R_giornaliero)",
            lambda r: r.get("feature_l5_within_asian_pct"),
            lambda r: r.get("r_giornaliero"),
        ),
        (
            "r(C3_expansion_potential, NY_range)",
            lambda r: r.get("feature_c3_expansion_potential"),
            lambda r: r.get("ny_range_pips"),
        ),
        (
            "r(A1_range_asian, bias_accuracy)",
            lambda r: r.get("feature_a1_range_asian_pips"),
            lambda r: 1 if r.get("bias_correct") else 0,
        ),
        (
            "r(weekday, scenario_type)",
            lambda r: weekday_num.get(str(r.get("weekday")), None),
            lambda r: scenario_map.get(str(r.get("scenario")), None),
        ),
        (
            "r(event_risk, scenario_verified)",
            lambda r: r.get("event_risk"),
            lambda r: 1 if r.get("scenario_verified") else 0,
        ),
        (
            "r(sweep_depth, NY_direction_confirmed)",
            lambda r: r.get("feature_c1_sweep_depth_pips"),
            lambda r: r.get("ny_direction_confirmed"),
        ),
    ]

    extra_specs = [
        (
            "r(Sydney_range, NY_range)",
            lambda r: r.get("feature_s0_range_sydney_pips"),
            lambda r: r.get("ny_range_pips"),
        ),
        (
            "r(Sydney_direction, bias_accuracy)",
            lambda r: r.get("feature_s1_sydney_direction"),
            lambda r: 1 if r.get("bias_correct") else 0,
        ),
        (
            "r(bias_probability, bias_correct)",
            lambda r: r.get("bias_probability"),
            lambda r: 1 if r.get("bias_correct") else 0,
        ),
        (
            "r(card_accuracy, scenario_verified)",
            lambda r: r.get("acc_card_dashboard"),
            lambda r: 1 if r.get("scenario_verified") else 0,
        ),
        (
            "r(event_risk, ny_range)",
            lambda r: r.get("event_risk"),
            lambda r: r.get("ny_range_pips"),
        ),
        (
            "r(expansion_potential, bias_correct)",
            lambda r: r.get("feature_c3_expansion_potential"),
            lambda r: 1 if r.get("bias_correct") else 0,
        ),
        (
            "r(r_giornaliero, ny_range)",
            lambda r: r.get("r_giornaliero"),
            lambda r: r.get("ny_range_pips"),
        ),
    ]

    primary: List[Dict[str, Any]] = []
    for name, x_fn, y_fn in primary_specs:
        xs, ys = _extract_xy(rows, x_fn, y_fn)
        primary.append(_corr_record(name, xs, ys))

    extra: List[Dict[str, Any]] = []
    for name, x_fn, y_fn in extra_specs:
        xs, ys = _extract_xy(rows, x_fn, y_fn)
        extra.append(_corr_record(name, xs, ys))

    total = len(primary) + len(extra)
    significant = sum(1 for row in (primary + extra) if row.get("p_value", 1.0) <= 0.05)
    return {
        "primary": primary,
        "extra": extra,
        "total_correlations": total,
        "significant_correlations": significant,
        "significant_ratio": round((significant / total), 4) if total > 0 else 0.0,
    }


def _build_scenario_weekday_matrix(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    scenarios = ["A", "B", "C", "D"]
    matrix_rows = []
    for scenario in scenarios:
        cells = []
        for day_it in WEEKDAY_IT:
            idx = WEEKDAY_IT_TO_INDEX[day_it]
            bucket = [r for r in rows if r.get("scenario") == scenario and int(r.get("weekday_idx", 9)) == idx]
            n = len(bucket)
            if n < 5:
                cells.append(
                    {
                        "day": day_it,
                        "value_pct": None,
                        "sample_size": n,
                        "display": "N/A (campione basso)",
                        "state": "na",
                    }
                )
                continue
            acc = sum(1 for r in bucket if r.get("scenario_verified")) / n
            pct = round(acc * 100.0, 1)
            state = "high" if pct > 70.0 else "low" if pct < 45.0 else "mid"
            cells.append(
                {
                    "day": day_it,
                    "value_pct": pct,
                    "sample_size": n,
                    "display": f"{pct}%",
                    "state": state,
                }
            )
        matrix_rows.append({"scenario": scenario, "cells": cells})
    return {"days": WEEKDAY_IT, "rows": matrix_rows}


def _build_bias_asset_matrix(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    biases = ["LONG", "SHORT", "NEUTRAL"]
    matrix_rows = []
    for bias in biases:
        cells = []
        for asset in ASSETS:
            bucket = [r for r in rows if r.get("bias_direction") == bias and r.get("asset") == asset]
            n = len(bucket)
            if n < 3:
                cells.append(
                    {
                        "asset": asset,
                        "value_pct": None,
                        "sample_size": n,
                        "display": "N/A",
                        "state": "na",
                    }
                )
                continue
            acc = sum(1 for r in bucket if r.get("bias_correct")) / n
            pct = round(acc * 100.0, 1)
            state = "high" if pct > 70.0 else "low" if pct < 45.0 else "mid"
            cells.append(
                {
                    "asset": asset,
                    "value_pct": pct,
                    "sample_size": n,
                    "display": f"{pct}%",
                    "state": state,
                }
            )
        matrix_rows.append({"bias": bias, "cells": cells})
    return {"assets": list(ASSETS), "rows": matrix_rows}


def _quantile(values: List[float], q: float) -> Optional[float]:
    if not values:
        return None
    sorted_vals = sorted(values)
    idx = int(_clamp(q, 0.0, 1.0) * (len(sorted_vals) - 1))
    return sorted_vals[idx]


def _build_insights(rows: List[Dict[str, Any]], correlation_matrix: Dict[str, Any]) -> List[str]:
    insights: List[str] = []
    if not rows:
        return insights

    baseline_verified = sum(1 for r in rows if r.get("scenario_verified")) / len(rows)

    # Insight 1: top scenario-day edge (if enough sample)
    best = None
    for scenario in ("A", "B", "C", "D"):
        for w_idx in range(5):
            bucket = [r for r in rows if r.get("scenario") == scenario and int(r.get("weekday_idx", -1)) == w_idx]
            if len(bucket) < 5:
                continue
            acc = sum(1 for r in bucket if r.get("scenario_verified")) / len(bucket)
            lift = acc - baseline_verified
            if not best or lift > best["lift"]:
                best = {
                    "scenario": scenario,
                    "weekday": WEEKDAY_IT[w_idx],
                    "acc": acc,
                    "n": len(bucket),
                    "lift": lift,
                }
    if best:
        insights.append(
            "INSIGHT 1: "
            f"{best['weekday']} con Scenario {best['scenario']} ha accuracy {best['acc']*100:.1f}% "
            f"vs baseline {baseline_verified*100:.1f}% (N={best['n']}). "
            f"AZIONE: boost confidence Scenario {best['scenario']} in {best['weekday']} di +{max(2, int(best['lift']*100))}%."
        )

    # Insight 2: sweep-depth threshold
    sweep_vals = [_to_float(r.get("feature_c1_sweep_depth_pips")) for r in rows if r.get("feature_c1_sweep_depth_pips") is not None]
    q70 = _quantile(sweep_vals, 0.70)
    q30 = _quantile(sweep_vals, 0.30)
    if q70 is not None and q30 is not None and q70 > q30:
        high = [r for r in rows if _to_float(r.get("feature_c1_sweep_depth_pips")) >= q70]
        low = [r for r in rows if _to_float(r.get("feature_c1_sweep_depth_pips")) <= q30]
        if high and low:
            high_acc = sum(1 for r in high if r.get("bias_correct")) / len(high)
            low_acc = sum(1 for r in low if r.get("bias_correct")) / len(low)
            insights.append(
                "INSIGHT 2: "
                f"Quando sweep_depth >= {q70:.1f} pips, la conferma bias e {high_acc*100:.1f}% "
                f"vs {low_acc*100:.1f}% con sweep <= {q30:.1f} pips. "
                "AZIONE: alza filtro di sweep quality e riduci segnali sotto soglia."
            )

    # Insight 3: event risk segmentation
    risk_vals = [_to_float(r.get("event_risk")) for r in rows if r.get("event_risk") is not None]
    rq70 = _quantile(risk_vals, 0.70)
    rq30 = _quantile(risk_vals, 0.30)
    if rq70 is not None and rq30 is not None and rq70 > rq30:
        hi_risk = [r for r in rows if _to_float(r.get("event_risk")) >= rq70]
        lo_risk = [r for r in rows if _to_float(r.get("event_risk")) <= rq30]
        if hi_risk and lo_risk:
            hi_ok = sum(1 for r in hi_risk if r.get("scenario_verified")) / len(hi_risk)
            lo_ok = sum(1 for r in lo_risk if r.get("scenario_verified")) / len(lo_risk)
            insights.append(
                "INSIGHT 3: "
                f"In regime macro-risk alto (>= {rq70:.1f}) scenario_verified = {hi_ok*100:.1f}% "
                f"vs {lo_ok*100:.1f}% in risk basso (<= {rq30:.1f}). "
                "AZIONE: applica de-rating automatico in giornate high-impact."
            )

    # Insight 4+: strongest significant correlations
    ranked = sorted(
        [c for c in (correlation_matrix.get("primary", []) + correlation_matrix.get("extra", [])) if c.get("p_value", 1.0) <= 0.05],
        key=lambda c: abs(_to_float(c.get("r"))),
        reverse=True,
    )
    for idx, c in enumerate(ranked[:2], start=4):
        insights.append(
            f"INSIGHT {idx}: {c.get('name')} mostra r={_to_float(c.get('r')):.2f}, "
            f"p={_to_float(c.get('p_value')):.3f} ({c.get('interpretation')}). "
            "AZIONE: integra questa relazione nel weighting dinamico e monitora drift settimanale."
        )

    return insights[:5]


def _compute_ksh(rows: List[Dict[str, Any]], correlation_matrix: Dict[str, Any], rome_day: str) -> Dict[str, Any]:
    # Group by day.
    by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_day[str(row.get("rome_day"))].append(row)

    days_sorted = sorted(by_day.keys(), reverse=True)
    recent_days = days_sorted[:20]
    recent_rows = [r for d in recent_days for r in by_day[d]]
    if not recent_rows:
        return {
            "value": 0.0,
            "status": "collecting",
            "components": {},
            "sparkline": [],
            "interpretation": "Dati insufficienti per calcolare KSH.",
        }

    day_acc = []
    day_r = []
    for d in recent_days:
        bucket = by_day[d]
        if not bucket:
            continue
        day_acc.append(sum(1 for r in bucket if r.get("scenario_verified")) / len(bucket))
        day_r.append(sum(_to_float(r.get("outcome_pips")) for r in bucket) / len(bucket))

    acc_mean = sum(day_acc) / len(day_acc) if day_acc else 0.0
    brier = _brier_score(recent_rows, multiplier=1.0)
    if len(day_r) >= 2:
        mean_r = sum(day_r) / len(day_r)
        var_r = sum((x - mean_r) ** 2 for x in day_r) / max(1, len(day_r) - 1)
        stdev_r = math.sqrt(max(0.0, var_r))
        sharpe = mean_r / (stdev_r + 1e-9)
    else:
        sharpe = 0.0
    sharpe_norm = _clamp((math.tanh(sharpe / 2.0) + 1.0) / 2.0, 0.0, 1.0)

    corr_ratio = _to_float(correlation_matrix.get("significant_ratio"), 0.0)
    comp_acc = acc_mean * 40.0
    comp_brier = (1.0 - _clamp(brier, 0.0, 1.0)) * 30.0
    comp_sharpe = sharpe_norm * 20.0
    comp_corr = corr_ratio * 10.0
    ksh = round(_clamp(comp_acc + comp_brier + comp_sharpe + comp_corr, 0.0, 100.0), 2)

    if ksh > 75:
        status = "green"
        interpretation = "Sistema calibrato e affidabile."
    elif ksh >= 55:
        status = "yellow"
        interpretation = "Sistema funzionante, margini di ottimizzazione."
    else:
        status = "red"
        interpretation = "Regime change probabile: rivalutare pesi e soglie."

    # Update historical KSH series.
    hist = _read_json(KSH_HISTORY_FILE, [])
    if not isinstance(hist, list):
        hist = []
    index = {str(item.get("rome_day")): i for i, item in enumerate(hist)}
    row = {
        "rome_day": rome_day,
        "value": ksh,
        "status": status,
        "components": {
            "acc_component": round(comp_acc, 2),
            "brier_component": round(comp_brier, 2),
            "sharpe_component": round(comp_sharpe, 2),
            "corr_component": round(comp_corr, 2),
            "acc_media_ultimi_20gg": round(acc_mean, 4),
            "brier_score": round(brier, 6),
            "sharpe_p_raw": round(sharpe, 4),
            "correlation_ratio": round(corr_ratio, 4),
        },
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    if rome_day in index:
        hist[index[rome_day]] = row
    else:
        hist.append(row)
    hist = sorted(hist, key=lambda item: str(item.get("rome_day")))
    _write_json(KSH_HISTORY_FILE, hist[-500:])
    sparkline = [{"rome_day": item.get("rome_day"), "value": item.get("value")} for item in hist[-30:]]

    return {
        "value": ksh,
        "status": status,
        "components": row["components"],
        "sparkline": sparkline,
        "interpretation": interpretation,
    }


def _build_daily_summary(rows_today: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows_today:
        return {
            "assets_covered": 0,
            "verified_rate_pct": 0.0,
            "avg_ny_range_pips": 0.0,
            "scenario_distribution": {},
        }
    verified = sum(1 for r in rows_today if r.get("scenario_verified"))
    avg_range = sum(_to_float(r.get("ny_range_pips")) for r in rows_today) / len(rows_today)
    scen = Counter(str(r.get("scenario")) for r in rows_today)
    return {
        "assets_covered": len(rows_today),
        "verified_rate_pct": round((verified / len(rows_today)) * 100.0, 2),
        "avg_ny_range_pips": round(avg_range, 2),
        "scenario_distribution": dict(scen),
    }


def _median(values: List[float]) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    mid = n // 2
    if n % 2 == 1:
        return sorted_vals[mid]
    return (sorted_vals[mid - 1] + sorted_vals[mid]) / 2.0


def _scenario_entropy(rows: List[Dict[str, Any]]) -> float:
    if not rows:
        return 0.0
    counter = Counter(str(r.get("scenario")) for r in rows if r.get("scenario"))
    total = sum(counter.values())
    if total <= 0:
        return 0.0
    entropy = 0.0
    for n in counter.values():
        p = n / total
        if p > 0:
            entropy -= p * math.log(p, 2)
    max_entropy = math.log(max(len(counter), 1), 2) if counter else 1.0
    if max_entropy <= 0:
        return 0.0
    return _clamp(entropy / max_entropy, 0.0, 1.0)


def _window_stats(rows: List[Dict[str, Any]], days_label: str) -> Dict[str, Any]:
    if not rows:
        return {
            "label": days_label,
            "samples": 0,
            "days": 0,
            "assets_covered": 0,
            "verified_rate_pct": 0.0,
            "bias_accuracy_pct": 0.0,
            "target_hit_rate_pct": 0.0,
            "avg_outcome_pips": 0.0,
            "median_outcome_pips": 0.0,
            "avg_ny_range_pips": 0.0,
            "positive_outcome_rate_pct": 0.0,
            "scenario_entropy_pct": 0.0,
            "scenario_distribution": {},
        }

    samples = len(rows)
    unique_days = len({str(r.get("rome_day")) for r in rows if r.get("rome_day")})
    assets_covered = len({str(r.get("asset")) for r in rows if r.get("asset")})

    verified = sum(1 for r in rows if r.get("scenario_verified"))
    bias_ok = sum(1 for r in rows if r.get("bias_correct"))
    target_hit = sum(1 for r in rows if r.get("target_hit"))
    outcomes = [_to_float(r.get("outcome_pips")) for r in rows]
    ranges = [_to_float(r.get("ny_range_pips")) for r in rows]
    positive = sum(1 for x in outcomes if x > 0)
    scen = Counter(str(r.get("scenario")) for r in rows if r.get("scenario"))

    return {
        "label": days_label,
        "samples": samples,
        "days": unique_days,
        "assets_covered": assets_covered,
        "verified_rate_pct": round((verified / samples) * 100.0, 2),
        "bias_accuracy_pct": round((bias_ok / samples) * 100.0, 2),
        "target_hit_rate_pct": round((target_hit / samples) * 100.0, 2),
        "avg_outcome_pips": round(sum(outcomes) / samples, 2),
        "median_outcome_pips": round(_median(outcomes), 2),
        "avg_ny_range_pips": round(sum(ranges) / samples, 2),
        "positive_outcome_rate_pct": round((positive / samples) * 100.0, 2),
        "scenario_entropy_pct": round(_scenario_entropy(rows) * 100.0, 2),
        "scenario_distribution": dict(scen),
    }


def _build_historical_stats(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    ordered_rows = sorted(
        [r for r in rows if r.get("rome_day")],
        key=lambda r: (str(r.get("rome_day")), str(r.get("asset"))),
    )
    windows = {
        "7d": _window_stats(_select_last_n_days_rows(ordered_rows, 7), "Ultimi 7 giorni"),
        "30d": _window_stats(_select_last_n_days_rows(ordered_rows, 30), "Ultimi 30 giorni"),
        "90d": _window_stats(_select_last_n_days_rows(ordered_rows, 90), "Ultimi 90 giorni"),
        "all": _window_stats(ordered_rows, "Storico completo"),
    }

    scenario_board: List[Dict[str, Any]] = []
    for scenario in SCENARIOS:
        bucket = [r for r in ordered_rows if str(r.get("scenario")) == scenario]
        if not bucket:
            scenario_board.append(
                {
                    "scenario": scenario,
                    "label": SCENARIO_LABELS.get(scenario, "Unknown"),
                    "samples": 0,
                    "verified_rate_pct": 0.0,
                    "bias_accuracy_pct": 0.0,
                    "avg_outcome_pips": 0.0,
                    "target_hit_rate_pct": 0.0,
                }
            )
            continue
        n = len(bucket)
        scenario_board.append(
            {
                "scenario": scenario,
                "label": SCENARIO_LABELS.get(scenario, "Unknown"),
                "samples": n,
                "verified_rate_pct": round((sum(1 for r in bucket if r.get("scenario_verified")) / n) * 100.0, 2),
                "bias_accuracy_pct": round((sum(1 for r in bucket if r.get("bias_correct")) / n) * 100.0, 2),
                "avg_outcome_pips": round(sum(_to_float(r.get("outcome_pips")) for r in bucket) / n, 2),
                "target_hit_rate_pct": round((sum(1 for r in bucket if r.get("target_hit")) / n) * 100.0, 2),
            }
        )
    scenario_board.sort(key=lambda r: (r.get("verified_rate_pct", 0.0), r.get("samples", 0)), reverse=True)

    asset_board: List[Dict[str, Any]] = []
    for asset in ASSETS:
        bucket = [r for r in ordered_rows if str(r.get("asset")) == asset]
        if not bucket:
            asset_board.append(
                {
                    "asset": asset,
                    "samples": 0,
                    "verified_rate_pct": 0.0,
                    "bias_accuracy_pct": 0.0,
                    "avg_outcome_pips": 0.0,
                    "avg_ny_range_pips": 0.0,
                }
            )
            continue
        n = len(bucket)
        asset_board.append(
            {
                "asset": asset,
                "samples": n,
                "verified_rate_pct": round((sum(1 for r in bucket if r.get("scenario_verified")) / n) * 100.0, 2),
                "bias_accuracy_pct": round((sum(1 for r in bucket if r.get("bias_correct")) / n) * 100.0, 2),
                "avg_outcome_pips": round(sum(_to_float(r.get("outcome_pips")) for r in bucket) / n, 2),
                "avg_ny_range_pips": round(sum(_to_float(r.get("ny_range_pips")) for r in bucket) / n, 2),
            }
        )
    asset_board.sort(key=lambda r: (r.get("verified_rate_pct", 0.0), r.get("samples", 0)), reverse=True)

    by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in ordered_rows:
        by_day[str(row.get("rome_day"))].append(row)
    trend_rows: List[Dict[str, Any]] = []
    for day in sorted(by_day.keys()):
        bucket = by_day[day]
        n = len(bucket)
        if n <= 0:
            continue
        trend_rows.append(
            {
                "rome_day": day,
                "samples": n,
                "verified_rate_pct": round((sum(1 for r in bucket if r.get("scenario_verified")) / n) * 100.0, 2),
                "bias_accuracy_pct": round((sum(1 for r in bucket if r.get("bias_correct")) / n) * 100.0, 2),
                "avg_outcome_pips": round(sum(_to_float(r.get("outcome_pips")) for r in bucket) / n, 2),
                "avg_ny_range_pips": round(sum(_to_float(r.get("ny_range_pips")) for r in bucket) / n, 2),
            }
        )

    ksh_rows = _read_json(KSH_HISTORY_FILE, [])
    ksh_map = {str(item.get("rome_day")): _to_float(item.get("value")) for item in ksh_rows if isinstance(item, dict)}
    for row in trend_rows:
        day = str(row.get("rome_day"))
        if day in ksh_map:
            row["ksh"] = round(ksh_map[day], 2)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "windows": windows,
        "scenario_leaderboard": scenario_board,
        "asset_leaderboard": asset_board,
        "daily_trend": trend_rows[-120:],
    }


def _playbook_direction(avg_outcome: float, verified_rate_pct: float) -> str:
    if avg_outcome > 0 and verified_rate_pct >= 52.0:
        return "LONG_BIAS"
    if avg_outcome < 0 and verified_rate_pct >= 52.0:
        return "SHORT_BIAS"
    return "NEUTRAL"


def _playbook_confidence(samples: int, verified_rate_pct: float, abs_outcome: float) -> float:
    sample_term = _clamp(samples / 260.0, 0.0, 1.0) * 34.0
    hit_term = _clamp(abs(verified_rate_pct - 50.0) / 30.0, 0.0, 1.0) * 28.0
    outcome_term = _clamp(abs_outcome / 35.0, 0.0, 1.0) * 18.0
    return _clamp(38.0 + sample_term + hit_term + outcome_term, 0.0, 95.0)


def _build_operational_playbook(rows: List[Dict[str, Any]], rome_day: str) -> Dict[str, Any]:
    if not rows:
        return {"generated_at": datetime.now(timezone.utc).isoformat(), "today": [], "week": [], "month": []}

    try:
        ref_day = datetime.fromisoformat(rome_day).date()
    except Exception:
        ref_day = datetime.now(ROME_TZ).date()
    ref_weekday = ref_day.weekday()
    if ref_weekday <= 4:
        today_weekday = ref_weekday
        monday = ref_day - timedelta(days=ref_weekday)
    else:
        # Weekend: shift operational plan to next trading week (Monday-Friday).
        today_weekday = 0
        monday = ref_day + timedelta(days=(7 - ref_weekday))
    month_num = ref_day.month

    by_asset = {asset: [r for r in rows if str(r.get("asset")) == asset] for asset in ASSETS}

    today_rows: List[Dict[str, Any]] = []
    month_rows: List[Dict[str, Any]] = []
    for asset in ASSETS:
        aset_rows = by_asset.get(asset, [])
        day_bucket = [r for r in aset_rows if int(_to_float(r.get("weekday_idx"), -1)) == today_weekday]
        month_bucket = []
        for r in aset_rows:
            d = str(r.get("rome_day", ""))
            try:
                if datetime.fromisoformat(d).month == month_num:
                    month_bucket.append(r)
            except Exception:
                continue

        def _pack_bucket(bucket: List[Dict[str, Any]], label: str) -> Dict[str, Any]:
            n = len(bucket)
            if n <= 0:
                return {
                    "asset": asset,
                    "label": label,
                    "bias": "NEUTRAL",
                    "confidence": 0.0,
                    "samples": 0,
                    "verified_rate_pct": 0.0,
                    "avg_outcome_pips": 0.0,
                    "bias_accuracy_pct": 0.0,
                }
            verified = (sum(1 for r in bucket if r.get("scenario_verified")) / n) * 100.0
            bias_acc = (sum(1 for r in bucket if r.get("bias_correct")) / n) * 100.0
            avg_outcome = sum(_to_float(r.get("outcome_pips")) for r in bucket) / n
            bias = _playbook_direction(avg_outcome, verified)
            confidence = _playbook_confidence(n, verified, abs(avg_outcome))
            return {
                "asset": asset,
                "label": label,
                "bias": bias,
                "confidence": round(confidence, 2),
                "samples": n,
                "verified_rate_pct": round(verified, 2),
                "avg_outcome_pips": round(avg_outcome, 2),
                "bias_accuracy_pct": round(bias_acc, 2),
            }

        today_rows.append(_pack_bucket(day_bucket, WEEKDAY_EN[today_weekday]))
        month_rows.append(_pack_bucket(month_bucket, MONTH_NAMES[month_num - 1]))

    week_rows: List[Dict[str, Any]] = []
    for shift in range(5):
        w_idx = shift
        day_date = monday + timedelta(days=shift)
        asset_signals = []
        for asset in ASSETS:
            aset_rows = by_asset.get(asset, [])
            bucket = [r for r in aset_rows if int(_to_float(r.get("weekday_idx"), -1)) == w_idx]
            n = len(bucket)
            if n <= 0:
                asset_signals.append(
                    {
                        "asset": asset,
                        "bias": "NEUTRAL",
                        "confidence": 0.0,
                        "samples": 0,
                        "avg_outcome_pips": 0.0,
                        "verified_rate_pct": 0.0,
                    }
                )
                continue
            verified = (sum(1 for r in bucket if r.get("scenario_verified")) / n) * 100.0
            avg_outcome = sum(_to_float(r.get("outcome_pips")) for r in bucket) / n
            bias = _playbook_direction(avg_outcome, verified)
            conf = _playbook_confidence(n, verified, abs(avg_outcome))
            asset_signals.append(
                {
                    "asset": asset,
                    "bias": bias,
                    "confidence": round(conf, 2),
                    "samples": n,
                    "avg_outcome_pips": round(avg_outcome, 2),
                    "verified_rate_pct": round(verified, 2),
                }
            )
        long_count = sum(1 for s in asset_signals if s.get("bias") == "LONG_BIAS")
        short_count = sum(1 for s in asset_signals if s.get("bias") == "SHORT_BIAS")
        if long_count > short_count:
            aggregate = "LONG_TILT"
        elif short_count > long_count:
            aggregate = "SHORT_TILT"
        else:
            aggregate = "MIXED"
        week_rows.append(
            {
                "date": day_date.isoformat(),
                "weekday": WEEKDAY_EN[w_idx],
                "aggregate_bias": aggregate,
                "asset_signals": asset_signals,
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "today": today_rows,
        "week": week_rows,
        "month": month_rows,
    }


def _upsert_report(report: Dict[str, Any]) -> None:
    reports = _read_json(REPORTS_FILE, [])
    if not isinstance(reports, list):
        reports = []
    day = str(report.get("rome_day"))
    idx = None
    for i, row in enumerate(reports):
        if str(row.get("rome_day")) == day:
            idx = i
            break
    if idx is None:
        reports.append(report)
    else:
        reports[idx] = report
    reports = sorted(reports, key=lambda item: str(item.get("rome_day")))
    _write_json(REPORTS_FILE, reports[-180:])


def _default_collecting_payload(rome_day: str, reason: str = "Dati sessioni insufficienti.") -> Dict[str, Any]:
    rows = _load_rows()
    historical_stats = _build_historical_stats(rows)
    playbook = _build_operational_playbook(rows, rome_day)
    return {
        "status": "collecting",
        "rome_day": rome_day,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "message": reason,
        "daily_report": {"rows": [], "summary": {}},
        "auto_analysis": {"insights": [], "weight_updates": []},
        "correlation_matrix": {"primary": [], "extra": [], "total_correlations": 0, "significant_correlations": 0, "significant_ratio": 0.0},
        "matrices": {"scenario_weekday": {"days": WEEKDAY_IT, "rows": []}, "bias_asset": {"assets": list(ASSETS), "rows": []}},
        "health_score": {"value": 0.0, "status": "collecting", "components": {}, "sparkline": [], "interpretation": reason},
        "weights": {"weights": {s: 1.0 for s in SCENARIOS}, "alpha": 0.5},
        "historical_stats": historical_stats,
        "operational_playbook": playbook,
    }


def run_daily_session_cycle(target_rome_day: Optional[str] = None) -> Dict[str, Any]:
    now_rome = datetime.now(ROME_TZ)
    if target_rome_day:
        day = datetime.fromisoformat(target_rome_day).date()
    else:
        day = now_rome.date()
    rome_day = day.isoformat()

    rows_today = _base_feature_rows(rome_day)
    if not rows_today:
        payload = _default_collecting_payload(rome_day, reason="Nessun dato 5m disponibile per sessioni complete (Sydney/Asian/London/NY).")
        _upsert_report(payload)
        return payload

    existing_rows = _load_rows()
    all_rows = _upsert_rows(existing_rows, rows_today)
    _save_rows(all_rows)

    historical_reference = [r for r in all_rows if str(r.get("rome_day")) < rome_day]
    _attach_historical_metrics(rows_today, historical_reference[-1000:])

    recent_60_rows = _rows_for_correlation(all_rows, max_days=60)
    correlation_matrix = _build_correlation_matrix(recent_60_rows)
    weights_payload, today_weight_updates = _update_weights(all_rows, rome_day=rome_day)
    ksh = _compute_ksh(all_rows, correlation_matrix, rome_day=rome_day)
    insights = _build_insights(recent_60_rows, correlation_matrix)

    scenario_weekday_matrix = _build_scenario_weekday_matrix(recent_60_rows)
    bias_asset_matrix = _build_bias_asset_matrix(recent_60_rows)
    summary = _build_daily_summary(rows_today)
    historical_stats = _build_historical_stats(all_rows)
    operational_playbook = _build_operational_playbook(all_rows, rome_day)

    payload = {
        "status": "active",
        "rome_day": rome_day,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "daily_report": {
            "rows": rows_today,
            "summary": summary,
        },
        "auto_analysis": {
            "insights": insights,
            "weight_updates": today_weight_updates,
            "notes": [
                "Auto-ciclo completato: sessioni lette, correlate e pesate.",
                "Pesi scenario aggiornati ogni 10 nuovi campioni per scenario.",
                "Correlazioni p-value <= 0.05 entrano nella quota KSH.",
            ],
        },
        "correlation_matrix": correlation_matrix,
        "matrices": {
            "scenario_weekday": scenario_weekday_matrix,
            "bias_asset": bias_asset_matrix,
        },
        "health_score": ksh,
        "weights": {
            "alpha": _to_float(weights_payload.get("alpha"), 0.5),
            "weights": weights_payload.get("weights", {}),
            "recent_updates": list(weights_payload.get("updates", []))[-20:],
        },
        "historical_stats": historical_stats,
        "operational_playbook": operational_playbook,
    }

    _upsert_report(payload)
    return payload


def get_latest_session_report() -> Dict[str, Any]:
    reports = _read_json(REPORTS_FILE, [])
    if isinstance(reports, list) and reports:
        latest = sorted(reports, key=lambda item: str(item.get("rome_day")), reverse=True)[0]
        if isinstance(latest, dict):
            historical = latest.get("historical_stats")
            needs_backfill = (
                not isinstance(historical, dict)
                or not isinstance(historical.get("windows"), dict)
                or len(historical.get("windows") or {}) == 0
                or _to_float(((historical.get("windows") or {}).get("all") or {}).get("samples"), 0.0) < 120.0
            )
            if needs_backfill:
                rows = _load_rows()
                latest["historical_stats"] = _build_historical_stats(rows)
                latest["operational_playbook"] = _build_operational_playbook(rows, str(latest.get("rome_day") or datetime.now(ROME_TZ).date().isoformat()))
            elif "operational_playbook" not in latest:
                rows = _load_rows()
                latest["operational_playbook"] = _build_operational_playbook(rows, str(latest.get("rome_day") or datetime.now(ROME_TZ).date().isoformat()))
            return latest
    # Fallback: build for current day.
    return run_daily_session_cycle()


def get_session_report_history(limit: int = 30) -> List[Dict[str, Any]]:
    reports = _read_json(REPORTS_FILE, [])
    if not isinstance(reports, list):
        return []
    safe = max(1, min(int(limit or 30), 365))
    ordered = sorted(reports, key=lambda item: str(item.get("rome_day")), reverse=True)
    return ordered[:safe]
