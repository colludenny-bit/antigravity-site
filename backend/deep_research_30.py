"""
deep_research_30.py

Deep Research 3.0 analytics engine.
Builds high-density statistical signal packs from Matrix evaluations with:
- probability-ranked confluences
- diversification and hedge candidates
- macro/risk/news/seasonality exposure overlay
- weekly/monthly temporal bias maps
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from itertools import combinations
from typing import Dict, List, Tuple

import local_vault_matrix


ASSET_UNIVERSE = ("NAS100", "SP500", "XAUUSD", "EURUSD")
SIGNAL_MIN_SAMPLE = 4
SIGNAL_TOP_LIMIT = 20
RECENT_CONTEXT_DAYS = 14
OUTCOME_CORRELATION_DAYS = 60

FACTOR_LABEL_TO_FIELD = {
    "COT": "cot_bias",
    "OPT": "options_bias",
    "MACRO": "macro_sentiment",
    "NEWS": "news_bias",
    "REGIME": "market_regime",
    "RISK": "risk_bias",
    "TECH": "technical_bias",
    "SCREEN": "screening_bias",
}

FACTOR_FIELDS = (
    "cot_bias",
    "options_bias",
    "macro_sentiment",
    "news_bias",
    "market_regime",
    "risk_bias",
    "technical_bias",
    "screening_bias",
)

WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

_CACHE = {"generated_at": None, "payload": None}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _safe_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _normalize_factor_value(value) -> str:
    if value is None:
        return "UNKNOWN"
    normalized = str(value).strip().upper().replace(" ", "_")
    return normalized if normalized else "UNKNOWN"


def _factor_sign(value) -> int:
    normalized = _normalize_factor_value(value)
    if normalized in {"UNKNOWN", "NEUTRAL", "MIXED", "NONE", "N/A", "NULL", "LATERAL"}:
        return 0
    bullish_tokens = ("BULL", "RISK_ON", "UP", "LONG", "POSITIVE", "DOVISH", "LOW_RISK", "EXPANSION")
    bearish_tokens = ("BEAR", "RISK_OFF", "DOWN", "SHORT", "NEGATIVE", "HAWKISH", "HIGH_RISK", "CONTRACTION")
    if any(token in normalized for token in bullish_tokens):
        return 1
    if any(token in normalized for token in bearish_tokens):
        return -1
    return 0


def _bias_from_score(score: float, bullish_label: str = "BULLISH", bearish_label: str = "BEARISH") -> str:
    if score >= 0.15:
        return bullish_label
    if score <= -0.15:
        return bearish_label
    return "NEUTRAL"


def _parse_iso(ts_value: str | None) -> datetime | None:
    if not ts_value:
        return None
    try:
        return datetime.fromisoformat(str(ts_value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def _eval_timestamp(row: Dict) -> datetime | None:
    return _parse_iso(row.get("evaluated_at") or row.get("saved_at") or row.get("timestamp"))


def _outcome_value(row: Dict) -> float:
    mfe = _safe_float(row.get("mfe_pips"), 0.0)
    mae = _safe_float(row.get("mae_pips"), 0.0)
    return mfe if bool(row.get("hit")) else -mae


def _infer_pattern_bias(pattern: str) -> str:
    text = str(pattern or "").upper()
    bull = sum(token in text for token in ("BULL", "RISK_ON", "UP", "LONG", "DOVISH", "LOW_RISK"))
    bear = sum(token in text for token in ("BEAR", "RISK_OFF", "DOWN", "SHORT", "HAWKISH", "HIGH_RISK"))
    if bull > bear:
        return "BULLISH"
    if bear > bull:
        return "BEARISH"
    return "NEUTRAL"


def _parse_pattern_factors(pattern: str) -> Dict[str, str]:
    parsed: Dict[str, str] = {}
    for part in str(pattern or "").split("|"):
        if "=" not in part:
            continue
        left, right = part.split("=", 1)
        label = left.strip().upper()
        if label in FACTOR_LABEL_TO_FIELD:
            parsed[FACTOR_LABEL_TO_FIELD[label]] = _normalize_factor_value(right.strip())
    return parsed


def _stability_score(sample_size: int) -> float:
    if sample_size <= 0:
        return 0.0
    return _clamp(math.log1p(sample_size) / math.log1p(140.0), 0.0, 1.0)


def _probability_score(row: Dict, bucket_multiplier: float = 1.0) -> Tuple[float, float]:
    sample_size = int(row.get("sample_size", 0) or 0)
    win_rate = _safe_float(row.get("win_rate"), 0.0) / 100.0
    wilson = _safe_float(row.get("wilson_95_low"), 0.0) / 100.0
    bayes = _safe_float(row.get("bayes_90_low"), 0.0) / 100.0
    payoff_ratio = _safe_float(row.get("payoff_ratio"), 0.0)
    expectancy = _safe_float(row.get("expectancy"), 0.0)
    avg_mae = abs(_safe_float(row.get("avg_mae"), 1.0))
    inverse_rate = _safe_float(row.get("inverse_rate"), 0.0) / 100.0

    payoff_norm = _clamp((payoff_ratio - 0.7) / 1.4, 0.0, 1.0)
    edge_norm = _clamp(0.5 + (math.tanh(expectancy / max(avg_mae, 1.0)) / 2.0), 0.0, 1.0)
    sample_norm = _stability_score(sample_size)
    inverse_penalty = _clamp(1.0 - (inverse_rate * 0.7), 0.6, 1.0)

    quality = (
        (0.28 * win_rate)
        + (0.21 * wilson)
        + (0.21 * bayes)
        + (0.15 * payoff_norm)
        + (0.15 * edge_norm)
    )
    probability = 100.0 * bucket_multiplier * sample_norm * inverse_penalty * quality
    return round(_clamp(probability, 0.0, 99.9), 2), round(sample_norm * 100.0, 2)


def _pearson_correlation(xs: List[float], ys: List[float]) -> float:
    if len(xs) < 3 or len(ys) < 3:
        return 0.0
    n = min(len(xs), len(ys))
    x = xs[:n]
    y = ys[:n]
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    cov = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
    var_x = sum((a - mean_x) ** 2 for a in x)
    var_y = sum((b - mean_y) ** 2 for b in y)
    if var_x <= 1e-12 or var_y <= 1e-12:
        return 0.0
    return _clamp(cov / math.sqrt(var_x * var_y), -1.0, 1.0)


def _bucket_pair_key(asset: str, tf: str, f1: str, v1: str, f2: str, v2: str) -> Tuple[str, str, str, str, str, str]:
    if f1 <= f2:
        return asset, tf, f1, v1, f2, v2
    return asset, tf, f2, v2, f1, v1


def _build_factor_pair_stats(evaluations: List[Dict]) -> Tuple[Dict, Dict]:
    baseline = defaultdict(lambda: {"n": 0, "hits": 0, "outcome_sum": 0.0})
    pairs = defaultdict(lambda: {"n": 0, "hits": 0, "outcome_sum": 0.0})

    for row in evaluations:
        asset = row.get("asset")
        tf = row.get("timeframe")
        if not asset or not tf:
            continue
        hit = 1 if bool(row.get("hit")) else 0
        outcome = _outcome_value(row)

        base_key = (asset, tf)
        baseline[base_key]["n"] += 1
        baseline[base_key]["hits"] += hit
        baseline[base_key]["outcome_sum"] += outcome

        ctx = row.get("context") or {}
        factor_values = []
        for field in FACTOR_FIELDS:
            value = _normalize_factor_value(ctx.get(field))
            factor_values.append((field, value))

        for (f1, v1), (f2, v2) in combinations(factor_values, 2):
            pair_key = _bucket_pair_key(asset, tf, f1, v1, f2, v2)
            pairs[pair_key]["n"] += 1
            pairs[pair_key]["hits"] += hit
            pairs[pair_key]["outcome_sum"] += outcome

    return baseline, pairs


def _enrich_signal_correlations(signal: Dict, baseline: Dict, pairs: Dict) -> List[Dict]:
    factors = _parse_pattern_factors(signal.get("pattern"))
    if len(factors) < 2:
        return []

    asset = signal.get("asset")
    tf = signal.get("timeframe")
    base_key = (asset, tf)
    base = baseline.get(base_key)
    if not base or base.get("n", 0) <= 0:
        return []

    base_wr = (base["hits"] / base["n"]) * 100.0
    correlations = []

    for f1, f2 in combinations(sorted(factors.keys()), 2):
        pair_key = _bucket_pair_key(asset, tf, f1, factors[f1], f2, factors[f2])
        data = pairs.get(pair_key)
        if not data or data.get("n", 0) < SIGNAL_MIN_SAMPLE:
            continue
        pair_n = data["n"]
        pair_wr = (data["hits"] / pair_n) * 100.0
        pair_exp = data["outcome_sum"] / pair_n
        lift = pair_wr - base_wr
        strength = _clamp((pair_n / 50.0), 0.0, 1.0)
        correlations.append({
            "pair": f"{f1}+{f2}",
            "values": f"{factors[f1]} x {factors[f2]}",
            "sample_size": pair_n,
            "win_rate": round(pair_wr, 2),
            "lift_wr": round(lift, 2),
            "expectancy": round(pair_exp, 3),
            "strength": round(strength * 100.0, 2),
        })

    correlations.sort(key=lambda row: (row["lift_wr"], row["sample_size"]), reverse=True)
    return correlations[:3]


def _build_signals(matrix_results: Dict, evaluations: List[Dict]) -> List[Dict]:
    baseline, pairs = _build_factor_pair_stats(evaluations)
    candidates: List[Dict] = []
    bucket_priorities = (
        ("confluence_4way", 1.18),
        ("confluence_3way", 1.10),
        ("confluence_2way", 1.00),
        ("patterns", 0.92),
    )

    for asset, tf_map in matrix_results.items():
        if not isinstance(tf_map, dict):
            continue
        for tf, payload in tf_map.items():
            if not isinstance(payload, dict):
                continue
            for bucket_name, multiplier in bucket_priorities:
                rows = payload.get(bucket_name) or []
                if not isinstance(rows, list):
                    continue
                for row in rows:
                    sample_size = int(row.get("sample_size", 0) or 0)
                    if sample_size < SIGNAL_MIN_SAMPLE:
                        continue
                    probability, stability = _probability_score(row, bucket_multiplier=multiplier)
                    candidate = {
                        "asset": asset,
                        "timeframe": tf,
                        "bucket": bucket_name,
                        "pattern": row.get("pattern", ""),
                        "bias": _infer_pattern_bias(row.get("pattern", "")),
                        "sample_size": sample_size,
                        "win_rate": round(_safe_float(row.get("win_rate"), 0.0), 2),
                        "confluence_score": round(_safe_float(row.get("confluence_score"), 0.0), 2),
                        "probability_score": probability,
                        "stability_score": stability,
                        "expectancy": round(_safe_float(row.get("expectancy"), 0.0), 4),
                        "payoff_ratio": round(_safe_float(row.get("payoff_ratio"), 0.0), 4),
                        "avg_mfe": round(_safe_float(row.get("avg_mfe"), 0.0), 2),
                        "avg_mae": round(_safe_float(row.get("avg_mae"), 0.0), 2),
                        "wilson_95_low": round(_safe_float(row.get("wilson_95_low"), 0.0), 2),
                        "bayes_90_low": round(_safe_float(row.get("bayes_90_low"), 0.0), 2),
                        "inverse_rate": round(_safe_float(row.get("inverse_rate"), 0.0), 2),
                    }
                    candidate["correlations"] = _enrich_signal_correlations(candidate, baseline, pairs)
                    candidate["summary"] = (
                        f"{asset} {tf.replace('t_', '')}: probabilita {candidate['probability_score']}% "
                        f"con WR {candidate['win_rate']}% su {sample_size} casi."
                    )
                    candidates.append(candidate)

    candidates.sort(
        key=lambda row: (
            row.get("probability_score", 0.0),
            row.get("confluence_score", 0.0),
            row.get("sample_size", 0),
        ),
        reverse=True,
    )

    unique = []
    seen = set()
    for row in candidates:
        key = (row["asset"], row["timeframe"], row["pattern"], row["bucket"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
        if len(unique) >= SIGNAL_TOP_LIMIT:
            break
    return unique


def _build_temporal_bias(evaluations: List[Dict]) -> Tuple[List[Dict], List[Dict], float]:
    now = datetime.now(timezone.utc)
    weekly_bucket = defaultdict(lambda: defaultdict(lambda: {"n": 0, "hits": 0, "outcome_sum": 0.0}))
    monthly_bucket = defaultdict(lambda: defaultdict(lambda: {"n": 0, "hits": 0, "outcome_sum": 0.0}))

    for row in evaluations:
        asset = row.get("asset")
        if asset not in ASSET_UNIVERSE:
            continue
        ts = _eval_timestamp(row)
        if not ts:
            continue
        weekday = WEEKDAY_NAMES[ts.weekday()]
        month = MONTH_NAMES[ts.month - 1]
        hit = 1 if bool(row.get("hit")) else 0
        outcome = _outcome_value(row)

        weekly_bucket[asset][weekday]["n"] += 1
        weekly_bucket[asset][weekday]["hits"] += hit
        weekly_bucket[asset][weekday]["outcome_sum"] += outcome

        monthly_bucket[asset][month]["n"] += 1
        monthly_bucket[asset][month]["hits"] += hit
        monthly_bucket[asset][month]["outcome_sum"] += outcome

    weekly_result: List[Dict] = []
    monthly_result: List[Dict] = []
    seasonality_components = []

    current_weekday = WEEKDAY_NAMES[now.weekday()]
    current_month = MONTH_NAMES[now.month - 1]

    for asset in ASSET_UNIVERSE:
        day_rows = []
        for day in WEEKDAY_NAMES:
            stat = weekly_bucket[asset][day]
            n = stat["n"]
            wr = (stat["hits"] / n) * 100.0 if n > 0 else 0.0
            exp = stat["outcome_sum"] / n if n > 0 else 0.0
            day_rows.append({"bucket": day, "sample_size": n, "win_rate": round(wr, 2), "expectancy": round(exp, 3)})

        month_rows = []
        for month in MONTH_NAMES:
            stat = monthly_bucket[asset][month]
            n = stat["n"]
            wr = (stat["hits"] / n) * 100.0 if n > 0 else 0.0
            exp = stat["outcome_sum"] / n if n > 0 else 0.0
            month_rows.append({"bucket": month, "sample_size": n, "win_rate": round(wr, 2), "expectancy": round(exp, 3)})

        best_day = max(day_rows, key=lambda row: (row["win_rate"], row["sample_size"]))
        best_month = max(month_rows, key=lambda row: (row["win_rate"], row["sample_size"]))
        curr_day = next((row for row in day_rows if row["bucket"] == current_weekday), {"win_rate": 50.0, "sample_size": 0})
        curr_month = next((row for row in month_rows if row["bucket"] == current_month), {"win_rate": 50.0, "sample_size": 0})

        day_conf = _clamp((curr_day["win_rate"] - 50.0) / 50.0, -1.0, 1.0)
        month_conf = _clamp((curr_month["win_rate"] - 50.0) / 50.0, -1.0, 1.0)
        seasonality_components.append((day_conf + month_conf) / 2.0)

        weekly_result.append({
            "asset": asset,
            "bias": _bias_from_score(day_conf),
            "current_bucket": current_weekday,
            "current_win_rate": round(curr_day.get("win_rate", 0.0), 2),
            "sample_size": int(curr_day.get("sample_size", 0)),
            "best_bucket": best_day["bucket"],
            "best_win_rate": best_day["win_rate"],
            "best_sample_size": best_day["sample_size"],
            "table": day_rows,
        })

        monthly_result.append({
            "asset": asset,
            "bias": _bias_from_score(month_conf),
            "current_bucket": current_month,
            "current_win_rate": round(curr_month.get("win_rate", 0.0), 2),
            "sample_size": int(curr_month.get("sample_size", 0)),
            "best_bucket": best_month["bucket"],
            "best_win_rate": best_month["win_rate"],
            "best_sample_size": best_month["sample_size"],
            "table": month_rows,
        })

    seasonality_score = sum(seasonality_components) / len(seasonality_components) if seasonality_components else 0.0
    return weekly_result, monthly_result, seasonality_score


def _build_asset_series(evaluations: List[Dict]) -> Dict[str, Dict[str, float]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=OUTCOME_CORRELATION_DAYS)
    accumulator = defaultdict(lambda: defaultdict(list))

    for row in evaluations:
        asset = row.get("asset")
        if asset not in ASSET_UNIVERSE:
            continue
        ts = _eval_timestamp(row)
        if not ts or ts < cutoff:
            continue
        bucket = ts.replace(minute=0, second=0, microsecond=0).isoformat()
        accumulator[asset][bucket].append(_outcome_value(row))

    series = {}
    for asset, bucket_map in accumulator.items():
        series[asset] = {k: (sum(v) / len(v)) for k, v in bucket_map.items() if v}
    return series


def _build_pairwise_correlations(evaluations: List[Dict]) -> Dict[Tuple[str, str], Dict]:
    series = _build_asset_series(evaluations)
    pair_corr = {}
    assets = [asset for asset in ASSET_UNIVERSE if asset in series]
    for a, b in combinations(assets, 2):
        common_keys = sorted(set(series[a].keys()) & set(series[b].keys()))
        xs = [series[a][key] for key in common_keys]
        ys = [series[b][key] for key in common_keys]
        corr = _pearson_correlation(xs, ys)
        pair_corr[(a, b)] = {
            "correlation": round(corr, 4),
            "shared_points": len(common_keys),
        }
    return pair_corr


def _correlation_lookup(pair_corr: Dict[Tuple[str, str], Dict], a: str, b: str) -> Dict:
    key = (a, b) if (a, b) in pair_corr else (b, a)
    return pair_corr.get(key, {"correlation": 0.0, "shared_points": 0})


def _build_diversification(signals: List[Dict], evaluations: List[Dict], conflict_index: float) -> List[Dict]:
    top_signal_by_asset = {}
    for signal in signals:
        asset = signal.get("asset")
        if asset not in ASSET_UNIVERSE:
            continue
        if asset not in top_signal_by_asset:
            top_signal_by_asset[asset] = signal

    pair_corr = _build_pairwise_correlations(evaluations)
    output = []
    for base_asset in ASSET_UNIVERSE:
        base_signal = top_signal_by_asset.get(base_asset)
        if not base_signal:
            continue

        best = None
        for hedge_asset in ASSET_UNIVERSE:
            if hedge_asset == base_asset:
                continue
            hedge_signal = top_signal_by_asset.get(hedge_asset)
            if not hedge_signal:
                continue

            corr_meta = _correlation_lookup(pair_corr, base_asset, hedge_asset)
            corr = _safe_float(corr_meta.get("correlation"), 0.0)
            shared_points = int(corr_meta.get("shared_points", 0))
            decorrelation = round((1.0 - abs(corr)) * 100.0, 2)
            combined_wr = round((base_signal["win_rate"] * 0.55) + (hedge_signal["win_rate"] * 0.45), 2)

            coverage_confidence = round(
                _clamp(
                    (0.45 * decorrelation)
                    + (0.35 * min(base_signal["probability_score"], hedge_signal["probability_score"]))
                    + (0.20 * (100.0 - conflict_index)),
                    0.0,
                    99.9,
                ),
                2,
            )

            relation = "counter_hedge" if base_signal["bias"] != hedge_signal["bias"] else "parallel_diversifier"
            row = {
                "base_asset": base_asset,
                "hedge_asset": hedge_asset,
                "correlation": round(corr, 4),
                "shared_points": shared_points,
                "decorrelation_score": decorrelation,
                "combined_win_rate": combined_wr,
                "coverage_confidence": coverage_confidence,
                "relation": relation,
                "base_signal": {
                    "timeframe": base_signal["timeframe"],
                    "bias": base_signal["bias"],
                    "win_rate": base_signal["win_rate"],
                    "probability_score": base_signal["probability_score"],
                },
                "hedge_signal": {
                    "timeframe": hedge_signal["timeframe"],
                    "bias": hedge_signal["bias"],
                    "win_rate": hedge_signal["win_rate"],
                    "probability_score": hedge_signal["probability_score"],
                },
            }
            if not best or row["coverage_confidence"] > best["coverage_confidence"]:
                best = row

        if best:
            best["summary"] = (
                f"{best['base_asset']} + {best['hedge_asset']} | corr {best['correlation']} "
                f"| copertura {best['coverage_confidence']}% | WR combinato {best['combined_win_rate']}%"
            )
            output.append(best)

    output.sort(key=lambda row: row["coverage_confidence"], reverse=True)
    return output


def _build_context_overlay(evaluations: List[Dict], signals: List[Dict], seasonality_score: float) -> Dict:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=RECENT_CONTEXT_DAYS)

    weighted = defaultdict(float)
    weighted_total = defaultdict(float)

    for row in evaluations:
        ts = _eval_timestamp(row)
        if not ts or ts < cutoff:
            continue
        age_hours = max(1.0, (now - ts).total_seconds() / 3600.0)
        recency_weight = _clamp(math.exp(-age_hours / 220.0), 0.2, 1.0)
        context = row.get("context") or {}
        for field in ("macro_sentiment", "news_bias", "market_regime", "risk_bias"):
            sign = _factor_sign(context.get(field))
            if sign == 0:
                continue
            weighted[field] += sign * recency_weight
            weighted_total[field] += recency_weight

    macro_score = weighted["macro_sentiment"] / weighted_total["macro_sentiment"] if weighted_total["macro_sentiment"] > 0 else 0.0
    news_score = weighted["news_bias"] / weighted_total["news_bias"] if weighted_total["news_bias"] > 0 else 0.0
    regime_score = weighted["market_regime"] / weighted_total["market_regime"] if weighted_total["market_regime"] > 0 else 0.0
    risk_score = weighted["risk_bias"] / weighted_total["risk_bias"] if weighted_total["risk_bias"] > 0 else 0.0

    # Fed proxy: regime + macro + news + inverse risk map
    fed_proxy_score = (0.45 * macro_score) + (0.30 * news_score) + (0.20 * regime_score) - (0.15 * risk_score)
    fed_proxy_bias = _bias_from_score(fed_proxy_score, bullish_label="DOVISH", bearish_label="HAWKISH")

    signal_strength = sum(signal["probability_score"] for signal in signals[:8]) / max(1, len(signals[:8]))
    mean_inverse = sum(signal.get("inverse_rate", 0.0) for signal in signals[:8]) / max(1, len(signals[:8]))

    sign_inputs = [macro_score, news_score, regime_score, -risk_score, seasonality_score]
    sign_states = [1 if value > 0.1 else -1 if value < -0.1 else 0 for value in sign_inputs]
    nonzero = [state for state in sign_states if state != 0]
    mismatches = 0
    total_pairs = 0
    for a, b in combinations(nonzero, 2):
        total_pairs += 1
        if a != b:
            mismatches += 1
    disagreement_ratio = (mismatches / total_pairs) if total_pairs > 0 else 0.0

    conflict_index = _clamp((0.7 * disagreement_ratio * 100.0) + (0.3 * mean_inverse), 0.0, 100.0)
    aggression_index = _clamp(signal_strength - (0.55 * conflict_index) + (seasonality_score * 15.0), 0.0, 100.0)
    recommended_exposure = _clamp(30.0 + (0.95 * aggression_index), 20.0, 140.0)

    if recommended_exposure >= 105:
        profile = "OVERWEIGHT"
    elif recommended_exposure >= 70:
        profile = "BALANCED"
    else:
        profile = "DEFENSIVE"

    core_pct = _clamp(recommended_exposure * 0.55, 15.0, 70.0)
    tactical_pct = _clamp(recommended_exposure * 0.30, 5.0, 35.0)
    hedge_pct = _clamp(100.0 - core_pct - tactical_pct, 10.0, 60.0)

    return {
        "market_state": {
            "macro_bias": _bias_from_score(macro_score),
            "news_bias": _bias_from_score(news_score),
            "risk_bias": _bias_from_score(-risk_score, bullish_label="RISK_ON", bearish_label="RISK_OFF"),
            "regime_bias": _bias_from_score(regime_score),
            "fed_proxy_bias": fed_proxy_bias,
            "seasonality_bias": _bias_from_score(seasonality_score),
        },
        "scores": {
            "macro_score": round(macro_score, 4),
            "news_score": round(news_score, 4),
            "risk_score": round(risk_score, 4),
            "regime_score": round(regime_score, 4),
            "fed_proxy_score": round(fed_proxy_score, 4),
            "seasonality_score": round(seasonality_score, 4),
            "signal_strength": round(signal_strength, 2),
            "conflict_index": round(conflict_index, 2),
            "aggression_index": round(aggression_index, 2),
        },
        "recommended_exposure_pct": round(recommended_exposure, 2),
        "profile": profile,
        "positioning_bands": [
            {"name": "Core Trend", "allocation_pct": round(core_pct, 2)},
            {"name": "Tactical Alpha", "allocation_pct": round(tactical_pct, 2)},
            {"name": "Hedge Overlay", "allocation_pct": round(hedge_pct, 2)},
        ],
        "notes": [
            "Il profilo aumenta quando segnali probabilistici e macro-regime sono allineati.",
            "Il conflict index alza automaticamente la quota hedge e riduce l'aggressivita.",
            "Bias Fed e seasonality entrano come overlay dinamico, non come trigger singolo.",
        ],
    }


def _build_summary(signals: List[Dict], diversification: List[Dict], overlay: Dict) -> List[str]:
    best_signal = signals[0] if signals else None
    best_hedge = diversification[0] if diversification else None
    lines = []
    if best_signal:
        lines.append(
            f"Top confluence: {best_signal['asset']} {best_signal['timeframe']} con probabilita "
            f"{best_signal['probability_score']}% e WR {best_signal['win_rate']}%."
        )
    if best_hedge:
        lines.append(
            f"Miglior copertura: {best_hedge['base_asset']} / {best_hedge['hedge_asset']} "
            f"(confidence {best_hedge['coverage_confidence']}%, corr {best_hedge['correlation']})."
        )
    lines.append(
        f"Esposizione consigliata: {overlay.get('recommended_exposure_pct', 0)}% "
        f"({overlay.get('profile', 'BALANCED')})."
    )
    return lines


def build_deep_research_report(force_refresh: bool = False) -> Dict:
    now = datetime.now(timezone.utc)
    cached_at = _CACHE.get("generated_at")
    if (
        not force_refresh
        and cached_at
        and isinstance(cached_at, datetime)
        and (now - cached_at).total_seconds() < 60
        and _CACHE.get("payload")
    ):
        return _CACHE["payload"]

    evaluations = local_vault_matrix.get_matrix_evaluations()
    matrix_results = local_vault_matrix.get_matrix_results()

    if not evaluations or not matrix_results:
        payload = {
            "status": "collecting",
            "generated_at": now.isoformat(),
            "meta": {
                "evaluations_count": len(evaluations),
                "signals_count": 0,
            },
            "signals": [],
            "diversification": [],
            "risk_exposure": {},
            "weekly_bias": [],
            "monthly_bias": [],
            "summary": [
                "Deep Research 3.0 in raccolta: attendere accumulo MFE/MAE multi-timeframe.",
            ],
        }
        _CACHE["generated_at"] = now
        _CACHE["payload"] = payload
        return payload

    signals = _build_signals(matrix_results, evaluations)
    weekly_bias, monthly_bias, seasonality_score = _build_temporal_bias(evaluations)
    overlay = _build_context_overlay(evaluations, signals, seasonality_score=seasonality_score)
    diversification = _build_diversification(
        signals,
        evaluations,
        conflict_index=_safe_float(overlay.get("scores", {}).get("conflict_index"), 0.0),
    )
    summary = _build_summary(signals, diversification, overlay)

    payload = {
        "status": "active",
        "generated_at": now.isoformat(),
        "meta": {
            "evaluations_count": len(evaluations),
            "signals_count": len(signals),
            "signal_min_sample": SIGNAL_MIN_SAMPLE,
            "context_window_days": RECENT_CONTEXT_DAYS,
            "correlation_window_days": OUTCOME_CORRELATION_DAYS,
        },
        "signals": signals,
        "diversification": diversification,
        "risk_exposure": overlay,
        "weekly_bias": weekly_bias,
        "monthly_bias": monthly_bias,
        "summary": summary,
    }

    _CACHE["generated_at"] = now
    _CACHE["payload"] = payload
    return payload
