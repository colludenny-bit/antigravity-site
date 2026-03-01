import json
import os
import uuid
import math
from itertools import combinations
from datetime import datetime, timezone
import logging

logger = logging.getLogger("local_vault_matrix")

# Base directory for the isolated Matrix data
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data_matrix")
PREDICTIONS_FILE = os.path.join(DATA_DIR, "predictions_v2.json")
EVALUATIONS_FILE = os.path.join(DATA_DIR, "evaluations_v2.json")
REQUIRED_TIMEFRAMES = ("t_5m", "t_15m", "t_30m", "t_1h", "t_2h", "t_4h", "t_24h", "t_5d")

def ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        logger.info(f"Created matrix data directory: {DATA_DIR}")
    
    # Initialize empty arrays if files don't exist
    for file_path in [PREDICTIONS_FILE, EVALUATIONS_FILE]:
        if not os.path.exists(file_path):
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump([], f)
            logger.info(f"Initialized empty JSON array in: {file_path}")

# Initialize on import
ensure_data_dir()

def _read_json(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error reading {filepath}: {e}")
        return []

def _write_json(filepath, data):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Error writing to {filepath}: {e}")
        return False

# ----- PREDICTIONS (SNAPSHOTS) -----

def save_matrix_snapshot(data: dict) -> str:
    """
    Saves a multidimensional snapshot (Context Vector).
    Required keys: asset, direction, entry_price, context
    """
    snapshots = _read_json(PREDICTIONS_FILE)
    
    snapshot_id = str(uuid.uuid4())
    snapshot_doc = {
        "id": snapshot_id,
        "asset": data.get("asset"),
        "direction": data.get("direction", "").upper(),
        "entry_price": data.get("entry_price"),
        "context": data.get("context", {}), # The full multidimensional vector
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "evaluated_flags": {
            "t_5m": False,
            "t_15m": False,
            "t_30m": False,
            "t_1h": False,
            "t_2h": False,
            "t_4h": False,
            "t_24h": False,
            "t_5d": False
        }
    }
    
    snapshots.append(snapshot_doc)
    _write_json(PREDICTIONS_FILE, snapshots)
    logger.info(f"Saved Matrix Snapshot {snapshot_id} for {snapshot_doc['asset']}")
    return snapshot_id

def get_unevaluated_snapshots() -> list:
    """
    Returns snapshots that haven't been fully evaluated across all timeframes.
    A snapshot is fully evaluated when all flags in evaluated_flags are True.
    """
    snapshots = _read_json(PREDICTIONS_FILE)
    unevaluated = []
    
    for s in snapshots:
        flags = s.get("evaluated_flags", {})
        # Backward compatibility: ensure all required timeframe flags exist.
        missing = False
        for tf in REQUIRED_TIMEFRAMES:
            if tf not in flags:
                flags[tf] = False
                missing = True
        if missing:
            s["evaluated_flags"] = flags
        # If any flag is still False, it needs evaluation
        if not all(flags.values()):
            unevaluated.append(s)
    # Persist normalized snapshots once to avoid legacy-loop mismatches.
    if snapshots:
        _write_json(PREDICTIONS_FILE, snapshots)
    return unevaluated

def mark_timeframe_evaluated(snapshot_id: str, timeframe_key: str):
    """Marks a specific timeframe (e.g., 't_15m') as evaluated for a snapshot"""
    snapshots = _read_json(PREDICTIONS_FILE)
    updated = False
    for s in snapshots:
        if s.get("id") == snapshot_id:
            s.setdefault("evaluated_flags", {})[timeframe_key] = True
            updated = True
            break
            
    if updated:
        _write_json(PREDICTIONS_FILE, snapshots)

# ----- EVALUATIONS (MFE/MAE RESULTS) -----

def save_matrix_evaluation(eval_data: dict) -> str:
    """
    Saves an MFE/MAE evaluation for a specific timeframe.
    eval_data must contain prediction_id, timeframe, mfe_pips, mae_pips, hit, etc.
    """
    evaluations = _read_json(EVALUATIONS_FILE)
    
    eval_id = str(uuid.uuid4())
    eval_doc = {
        "id": eval_id,
        "prediction_id": eval_data.get("prediction_id"),
        "timeframe": eval_data.get("timeframe"),
        "asset": eval_data.get("asset"),
        "direction": eval_data.get("direction"),
        "context": eval_data.get("context", {}), # Store context here too for fast queries
        "mfe_pips": eval_data.get("mfe_pips", 0),
        "mae_pips": eval_data.get("mae_pips", 0),
        "hit": eval_data.get("hit", False),
        "evaluated_at": datetime.now(timezone.utc).isoformat()
    }
    
    evaluations.append(eval_doc)
    _write_json(EVALUATIONS_FILE, evaluations)
    logger.info(f"Saved Matrix Evaluation {eval_data.get('timeframe')} for {eval_data.get('asset')}")
    return eval_id

def get_matrix_evaluations() -> list:
    return _read_json(EVALUATIONS_FILE)

FACTOR_KEYS = (
    ("cot_bias", "COT"),
    ("options_bias", "OPT"),
    ("macro_sentiment", "MACRO"),
    ("news_bias", "NEWS"),
    ("market_regime", "REGIME"),
    ("risk_bias", "RISK"),
    ("technical_bias", "TECH"),
    ("screening_bias", "SCREEN"),
)


def _normalize_factor_value(value):
    if value is None:
        return "UNKNOWN"
    normalized = str(value).strip().upper().replace(" ", "_")
    return normalized if normalized else "UNKNOWN"


def _factor_sign(value):
    normalized = _normalize_factor_value(value)
    if normalized in {"UNKNOWN", "N/A", "NONE", "NULL", "NEUTRAL", "MIXED", "RANGE", "LATERAL", "LATERALIZZA"}:
        return 0
    bullish_tokens = ("BULL", "RISK_ON", "UP", "LONG", "POSITIVE", "PROSEGUE", "EXPANSION", "LOW_RISK")
    bearish_tokens = ("BEAR", "RISK_OFF", "DOWN", "SHORT", "NEGATIVE", "DIMINUISCE", "CONTRACTION", "HIGH_RISK")
    if any(token in normalized for token in bullish_tokens):
        return 1
    if any(token in normalized for token in bearish_tokens):
        return -1
    return 0


def _wilson_lower_bound(hits, trades, z=1.96):
    if trades <= 0:
        return 0.0
    phat = hits / trades
    denom = 1.0 + (z * z / trades)
    center = phat + (z * z / (2.0 * trades))
    margin = z * math.sqrt((phat * (1.0 - phat) + (z * z / (4.0 * trades))) / trades)
    return max(0.0, (center - margin) / denom)


def _init_bucket(combo_size=0):
    return {
        "trades": 0,
        "hits": 0,
        "mfe_total": 0.0,
        "mae_total": 0.0,
        "outcome_sum": 0.0,
        "outcome_sq_sum": 0.0,
        "inverse_total": 0,
        "aligned_total": 0,
        "combo_size": combo_size,
    }


def _accumulate(container, key, hit, mfe, mae, combo_size=0, inverse_count=0, aligned_count=0):
    if key not in container:
        container[key] = _init_bucket(combo_size=combo_size)

    bucket = container[key]
    hit_i = 1 if hit else 0
    mfe_f = float(mfe or 0.0)
    mae_f = float(mae or 0.0)
    outcome = mfe_f if hit_i else -mae_f

    bucket["trades"] += 1
    bucket["hits"] += hit_i
    bucket["mfe_total"] += mfe_f
    bucket["mae_total"] += mae_f
    bucket["outcome_sum"] += outcome
    bucket["outcome_sq_sum"] += outcome * outcome
    bucket["inverse_total"] += max(0, int(inverse_count))
    bucket["aligned_total"] += max(0, int(aligned_count))


def _compute_metrics(bucket):
    trades = int(bucket.get("trades", 0))
    if trades <= 0:
        return None

    hits = int(bucket.get("hits", 0))
    p_hit = hits / float(trades)
    avg_mfe = bucket["mfe_total"] / float(trades)
    avg_mae = bucket["mae_total"] / float(trades)
    payoff_ratio = avg_mfe / max(avg_mae, 1e-9)
    expectancy = (p_hit * avg_mfe) - ((1.0 - p_hit) * avg_mae)

    mean_outcome = bucket["outcome_sum"] / float(trades)
    variance = max(0.0, (bucket["outcome_sq_sum"] / float(trades)) - (mean_outcome * mean_outcome))
    stdev = math.sqrt(variance)
    t_outcome = mean_outcome / ((stdev / math.sqrt(trades)) + 1e-9) if stdev > 0 else 0.0
    z_hit = (p_hit - 0.5) / math.sqrt(0.25 / float(trades))
    wilson_low = _wilson_lower_bound(hits, trades)
    alpha = 1.0 + hits
    beta = 1.0 + (trades - hits)
    bayes_mean = alpha / (alpha + beta)
    bayes_var = (alpha * beta) / (((alpha + beta) ** 2) * ((alpha + beta) + 1.0))
    bayes_std = math.sqrt(max(0.0, bayes_var))
    bayes_low = max(0.0, bayes_mean - (1.645 * bayes_std))

    aligned = bucket.get("aligned_total", 0)
    inverse = bucket.get("inverse_total", 0)
    decision_events = max(1, aligned + inverse)
    inverse_rate = inverse / float(decision_events)
    alignment_rate = aligned / float(decision_events)

    sample_weight = min(1.0, math.log1p(trades) / math.log1p(80.0))
    edge_norm = max(0.0, math.tanh(expectancy / (abs(avg_mae) + 1e-9)))
    payoff_norm = max(0.0, min(1.0, (payoff_ratio - 0.7) / 1.3))
    wilson_norm = max(0.0, min(1.0, (wilson_low - 0.4) / 0.35))
    bayes_norm = max(0.0, min(1.0, (bayes_low - 0.4) / 0.35))
    z_norm = max(0.0, min(1.0, (z_hit + 1.0) / 4.0))
    inverse_penalty = max(0.65, 1.0 - (inverse_rate * 0.6))
    efficiency = avg_mfe / max(avg_mfe + avg_mae, 1e-9)

    confluence_score = 100.0 * sample_weight * (
        (0.25 * wilson_norm)
        + (0.20 * bayes_norm)
        + (0.20 * payoff_norm)
        + (0.20 * edge_norm)
        + (0.15 * z_norm)
    ) * inverse_penalty

    return {
        "sample_size": trades,
        "win_rate": round(p_hit * 100.0, 2),
        "avg_mfe": round(avg_mfe, 2),
        "avg_mae": round(avg_mae, 2),
        "expectancy": round(expectancy, 4),
        "payoff_ratio": round(payoff_ratio, 4),
        "wilson_95_low": round(wilson_low * 100.0, 2),
        "bayes_mean": round(bayes_mean * 100.0, 2),
        "bayes_90_low": round(bayes_low * 100.0, 2),
        "z_hit": round(z_hit, 4),
        "t_outcome": round(t_outcome, 4),
        "excursion_efficiency": round(efficiency * 100.0, 2),
        "inverse_rate": round(inverse_rate * 100.0, 2),
        "alignment_rate": round(alignment_rate * 100.0, 2),
        "confluence_score": round(confluence_score, 2),
    }


def _finalize_bucket(bucket, sort_by="sample_size"):
    rows = []
    for key, data in bucket.items():
        metrics = _compute_metrics(data)
        if not metrics:
            continue
        row = {"pattern": key, **metrics}
        combo_size = int(data.get("combo_size", 0) or 0)
        if combo_size > 0:
            row["combo_size"] = combo_size
        rows.append(row)

    if sort_by == "score":
        rows.sort(key=lambda r: (r.get("confluence_score", 0.0), r.get("sample_size", 0)), reverse=True)
    else:
        rows.sort(key=lambda r: (r.get("sample_size", 0), r.get("confluence_score", 0.0)), reverse=True)
    return rows


def get_matrix_results() -> dict:
    """
    Compiles raw MFE/MAE evaluations into multi-layer confluence statistics:
    - base full-context patterns
    - 2-way and 3-way tab confluences
    - inverse-conflict setups (2 aligned + 1 opposite)
    """
    evals = get_matrix_evaluations()
    if not evals:
        return {}

    matrix = {}

    for e in evals:
        asset = e.get("asset", "UNK")
        tf = e.get("timeframe", "UNK")
        hit = bool(e.get("hit", False))
        mfe = float(e.get("mfe_pips", 0.0) or 0.0)
        mae = float(e.get("mae_pips", 0.0) or 0.0)
        ctx = e.get("context", {}) or {}

        if asset not in matrix:
            matrix[asset] = {}
        if tf not in matrix[asset]:
            matrix[asset][tf] = {
                "patterns": {},
                "confluence_2way": {},
                "confluence_3way": {},
                "confluence_4way": {},
                "inverse_conflicts": {},
            }

        tf_block = matrix[asset][tf]
        factors = []
        for field, label in FACTOR_KEYS:
            value = _normalize_factor_value(ctx.get(field, "UNKNOWN"))
            sign = _factor_sign(value)
            factors.append((label, value, sign))

        base_pattern = " | ".join([f"{label}={value}" for label, value, _ in factors])
        _accumulate(tf_block["patterns"], base_pattern, hit, mfe, mae)

        signed_factors = [(label, value, sign) for label, value, sign in factors if sign != 0]

        for combo_size, bucket_name in ((2, "confluence_2way"), (3, "confluence_3way"), (4, "confluence_4way")):
            if len(signed_factors) < combo_size:
                continue
            for combo in combinations(signed_factors, combo_size):
                labels = [entry[0] for entry in combo]
                combo_state = " | ".join([f"{entry[0]}={entry[1]}" for entry in combo])
                signs = [entry[2] for entry in combo]
                total_sign = sum(signs)
                majority = 1 if total_sign > 0 else -1 if total_sign < 0 else 0
                if majority == 0:
                    inverse_count = 0
                    aligned_count = 0
                else:
                    inverse_count = sum(1 for sign in signs if sign != majority)
                    aligned_count = sum(1 for sign in signs if sign == majority)

                combo_key = f"{'+'.join(labels)} :: {combo_state}"
                _accumulate(
                    tf_block[bucket_name],
                    combo_key,
                    hit,
                    mfe,
                    mae,
                    combo_size=combo_size,
                    inverse_count=inverse_count,
                    aligned_count=aligned_count,
                )

                if inverse_count > 0:
                    _accumulate(
                        tf_block["inverse_conflicts"],
                        combo_key,
                        hit,
                        mfe,
                        mae,
                        combo_size=combo_size,
                        inverse_count=inverse_count,
                        aligned_count=aligned_count,
                    )

    results = {}
    for asset, tf_map in matrix.items():
        results[asset] = {}
        for tf, tf_block in tf_map.items():
            patterns = _finalize_bucket(tf_block["patterns"], sort_by="sample_size")
            confluence_2way = _finalize_bucket(tf_block["confluence_2way"], sort_by="score")
            confluence_3way = _finalize_bucket(tf_block["confluence_3way"], sort_by="score")
            confluence_4way = _finalize_bucket(tf_block["confluence_4way"], sort_by="score")
            inverse_conflicts = _finalize_bucket(tf_block["inverse_conflicts"], sort_by="score")
            results[asset][tf] = {
                "patterns": patterns,
                "confluence_2way": confluence_2way,
                "confluence_3way": confluence_3way,
                "confluence_4way": confluence_4way,
                "inverse_conflicts": inverse_conflicts,
                "coverage": {
                    "patterns": len(patterns),
                    "confluence_2way": len(confluence_2way),
                    "confluence_3way": len(confluence_3way),
                    "confluence_4way": len(confluence_4way),
                    "inverse_conflicts": len(inverse_conflicts),
                },
            }

    return results
