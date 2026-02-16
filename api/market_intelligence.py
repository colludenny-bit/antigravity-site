from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
from typing import Dict, List, Optional


ASSET_CONFIG = {
    "XAUUSD": {"base": 2346.0, "amp_pct": 0.0052, "speed": 1.7, "offset": 0.3},
    "NAS100": {"base": 21940.0, "amp_pct": 0.0041, "speed": 1.3, "offset": 1.1},
    "SP500": {"base": 6068.0, "amp_pct": 0.0032, "speed": 1.1, "offset": 2.0},
    "EURUSD": {"base": 1.0865, "amp_pct": 0.0027, "speed": 1.5, "offset": 2.6},
}


STRATEGY_CATALOG = [
    {
        "id": "volguard-mr",
        "aliases": [],
        "name": "VolGuard Mean-Reversion",
        "short_name": "VG",
        "win_rate": 72,
        "assets": ["SP500", "NAS100"],
        "trigger": "VIX low-vol + estensione ATR",
    },
    {
        "id": "gamma-magnet",
        "aliases": [],
        "name": "GammaMagnet Convergence",
        "short_name": "GM",
        "win_rate": 68,
        "assets": ["SP500", "NAS100"],
        "trigger": "Magnete gamma + call/put wall",
    },
    {
        "id": "strategy-1",
        "aliases": [],
        "name": "News Spike Reversion",
        "short_name": "S1",
        "win_rate": 62,
        "assets": ["XAUUSD", "EURUSD", "SP500"],
        "trigger": "Spike news + rejection range",
    },
    {
        "id": "rate-volatility",
        "aliases": ["rate-vol-alignment"],
        "name": "Rate-Volatility Alignment",
        "short_name": "RV",
        "win_rate": 62,
        "assets": ["EURUSD", "SP500", "NAS100"],
        "trigger": "Allineamento tassi e volatilita",
    },
    {
        "id": "strategy-2",
        "aliases": [],
        "name": "VIX Range Fade",
        "short_name": "S2",
        "win_rate": 58,
        "assets": ["NAS100", "SP500"],
        "trigger": "VIX stabile + fade estremi",
    },
    {
        "id": "multi-day-rejection",
        "aliases": ["multi-day-ra"],
        "name": "Multi-Day Rejection",
        "short_name": "MD",
        "win_rate": 56,
        "assets": ["XAUUSD", "SP500", "EURUSD"],
        "trigger": "Test weekly level + rejection",
    },
]


STRATEGY_ALIAS_MAP = {
    alias: item["id"]
    for item in STRATEGY_CATALOG
    for alias in item["aliases"]
}


EVENT_TEMPLATES = [
    {
        "title": "EU PMI Composite",
        "currency": "EUR",
        "impact": "medium",
        "hour_utc": 8,
        "minute_utc": 0,
        "forecast": "48.9",
        "previous": "48.6",
    },
    {
        "title": "US Core CPI m/m",
        "currency": "USD",
        "impact": "high",
        "hour_utc": 13,
        "minute_utc": 30,
        "forecast": "0.3%",
        "previous": "0.3%",
    },
    {
        "title": "US Retail Sales m/m",
        "currency": "USD",
        "impact": "high",
        "hour_utc": 15,
        "minute_utc": 0,
        "forecast": "0.2%",
        "previous": "-0.1%",
    },
    {
        "title": "FOMC Member Speech",
        "currency": "USD",
        "impact": "medium",
        "hour_utc": 17,
        "minute_utc": 30,
        "forecast": "-",
        "previous": "-",
    },
]


def canonical_strategy_id(strategy_id: str) -> str:
    return STRATEGY_ALIAS_MAP.get(strategy_id, strategy_id)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _to_phase(now: datetime) -> float:
    day_seconds = now.hour * 3600 + now.minute * 60 + now.second
    return (day_seconds / 86400.0) * 2 * math.pi


def _impact_rank(impact: str) -> int:
    if impact == "high":
        return 2
    if impact == "medium":
        return 1
    return 0


def _format_countdown(delta_seconds: float) -> str:
    if delta_seconds <= 0:
        return "Uscito"
    if delta_seconds < 3600:
        mins = int(delta_seconds // 60)
        return f"{mins}m"
    hours = int(delta_seconds // 3600)
    mins = int((delta_seconds % 3600) // 60)
    if mins == 0:
        return f"{hours}h"
    return f"{hours}h {mins}m"


def _event_actual_value(event: dict, now: datetime) -> str:
    seed = now.timetuple().tm_yday + event["hour_utc"] * 11 + event["minute_utc"]
    if "%" in event["forecast"]:
        base = float(event["forecast"].replace("%", "")) if event["forecast"] not in {"-", ""} else 0.2
        shift = ((seed % 7) - 3) * 0.05
        return f"{max(0.0, base + shift):.1f}%"
    if event["forecast"] in {"-", ""}:
        return "-"
    try:
        base = float(event["forecast"])
    except ValueError:
        return event["forecast"]
    shift = ((seed % 9) - 4) * 0.1
    return f"{base + shift:.1f}"


def build_news_briefing(now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    today = now.date()
    bucket_hour = (now.hour // 3) * 3
    bucket_start = datetime(today.year, today.month, today.day, bucket_hour, 0, tzinfo=timezone.utc)
    bucket_end = bucket_start + timedelta(hours=3)

    events = []
    for template in EVENT_TEMPLATES:
        event_dt = datetime(
            today.year,
            today.month,
            today.day,
            template["hour_utc"],
            template["minute_utc"],
            tzinfo=timezone.utc,
        )
        countdown_seconds = (event_dt - now).total_seconds()
        actual = _event_actual_value(template, now) if countdown_seconds <= 0 else None
        summary = (
            f"Evento {template['impact']} su {template['currency']}. "
            "Monitorare impatto su volatilita e direzionalita intraday."
        )
        if countdown_seconds <= 0:
            summary = (
                f"Dato pubblicato: {actual}. "
                "Valutare conferma o negazione del bias pre-release."
            )

        events.append(
            {
                "title": template["title"],
                "time": event_dt.strftime("%H:%M"),
                "impact": template["impact"],
                "currency": template["currency"],
                "forecast": template["forecast"],
                "previous": template["previous"],
                "actual": actual,
                "countdown": _format_countdown(countdown_seconds),
                "summary": summary,
                "timestamp": event_dt.isoformat(),
            }
        )

    events.sort(key=lambda item: item["timestamp"])

    upcoming = [
        e for e in events
        if e["actual"] is None and 0 <= (datetime.fromisoformat(e["timestamp"]) - now).total_seconds() <= 3 * 3600
    ]
    released = [
        e for e in events
        if e["actual"] is not None and 0 <= (now - datetime.fromisoformat(e["timestamp"])).total_seconds() <= 3 * 3600
    ]
    upcoming.sort(key=lambda e: (_impact_rank(e["impact"]) * -1, e["timestamp"]))
    released.sort(key=lambda e: (_impact_rank(e["impact"]) * -1, e["timestamp"]), reverse=True)

    morning_summary = (
        "Prima mattina: definire bias iniziale su calendario macro, VIX e livelli chiave."
        if now.hour < 10
        else "Sessione avviata: mantenere bias flessibile in base ai dati in uscita."
    )
    pre_release_summary = (
        f"Pre-release: focus su {upcoming[0]['title']} ({upcoming[0]['countdown']}). Ridurre size prima del dato."
        if upcoming
        else "Pre-release: nessun evento ad alto impatto nelle prossime 3 ore."
    )
    post_release_summary = (
        f"Post-release: {released[0]['title']} pubblicato ({released[0]['actual']}). Verificare conferma del movimento iniziale."
        if released
        else "Post-release: nessun dato appena pubblicato nel bucket corrente."
    )

    return {
        "generated_at": now.isoformat(),
        "bucket_start": bucket_start.isoformat(),
        "bucket_end": bucket_end.isoformat(),
        "summaries": {
            "morning": morning_summary,
            "pre_release": pre_release_summary,
            "post_release": post_release_summary,
            "three_hour": f"{pre_release_summary} {post_release_summary}",
        },
        "events": events,
    }


def build_multi_source_snapshot(now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    phase = _to_phase(now)

    vix_current = round(18.2 + 3.6 * math.sin(phase * 1.2), 2)
    vix_change = round(0.8 * math.cos(phase * 1.2), 2)
    if vix_current >= 21.5 or vix_change > 0.55:
        regime = "risk-off"
    elif vix_current <= 16.8 and vix_change < 0:
        regime = "risk-on"
    else:
        regime = "mixed"

    analyses: Dict[str, dict] = {}
    for symbol, cfg in ASSET_CONFIG.items():
        wave = math.sin(phase * cfg["speed"] + cfg["offset"])
        change_pct = round(wave * cfg["amp_pct"] * 100, 2)
        price = cfg["base"] * (1 + wave * cfg["amp_pct"])

        direction = "Up" if change_pct >= 0.12 else "Down" if change_pct <= -0.12 else "Neutral"
        confidence = int(_clamp(52 + abs(change_pct) * 22 + (3 if regime == "risk-on" else 0), 45, 92))
        impulse = "Prosegue" if abs(change_pct) > 0.35 else "Laterale" if abs(change_pct) < 0.15 else "Rallenta"

        if symbol == "XAUUSD":
            d1 = {"name": "Real Yield", "impact": "Bullish" if regime == "risk-off" else "Neutral"}
            d2 = {"name": "USD Flow", "impact": "Supportivo" if direction == "Up" else "Pressione"}
        elif symbol in {"NAS100", "SP500"}:
            d1 = {"name": "VIX Regime", "impact": "Positivo" if regime == "risk-on" else "Cautela"}
            d2 = {"name": "Macro News", "impact": "Confermativo" if direction != "Neutral" else "Misto"}
        else:
            d1 = {"name": "DXY Pulse", "impact": "Bullish" if direction == "Up" else "Bearish" if direction == "Down" else "Neutral"}
            d2 = {"name": "Rates Spread", "impact": "Stabile" if regime == "mixed" else "Direzionale"}

        rounding = 5 if symbol == "EURUSD" else 2
        analyses[symbol] = {
            "price": round(price, rounding),
            "direction": direction,
            "confidence": confidence,
            "impulse": impulse,
            "drivers": [d1, d2],
        }

    briefing = build_news_briefing(now)
    next_event = next((event for event in briefing["events"] if event["actual"] is None), None)
    if not next_event:
        next_event = {
            "event": "Nessun evento imminente",
            "title": "Nessun evento imminente",
            "countdown": "N/A",
            "time": now.strftime("%H:%M"),
        }
    else:
        next_event = {
            "event": next_event["title"],
            "title": next_event["title"],
            "countdown": next_event["countdown"],
            "time": next_event["time"],
        }

    return {
        "analyses": analyses,
        "vix": {"current": vix_current, "change": vix_change},
        "regime": regime,
        "next_event": next_event,
        "updated_at": now.isoformat(),
    }


def build_cot_snapshot(analyses: Dict[str, dict], now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    phase = _to_phase(now)
    data = {}

    for idx, symbol in enumerate(["NAS100", "SP500", "XAUUSD", "EURUSD"]):
        direction = analyses.get(symbol, {}).get("direction", "Neutral")
        strength = 5000 + int(abs(math.sin(phase + idx)) * 14000)
        base_long = 52000 + idx * 11000
        base_short = 47000 + idx * 9000

        if direction == "Up":
            long_val = base_long + strength
            short_val = base_short
            bias = "Bull"
        elif direction == "Down":
            long_val = base_long
            short_val = base_short + strength
            bias = "Bear"
        else:
            long_val = base_long + strength // 3
            short_val = base_short + strength // 3
            bias = "Neutral"

        ratio = long_val / max(1, long_val + short_val)
        base_conf = int(_clamp(40 + abs(ratio - 0.5) * 200, 38, 88))
        rolling = [
            {"label": "W-3", "value": int(_clamp(base_conf - 9, 25, 90)), "isCurrent": False},
            {"label": "W-2", "value": int(_clamp(base_conf - 4, 25, 90)), "isCurrent": False},
            {"label": "W-1", "value": int(_clamp(base_conf + 2, 25, 90)), "isCurrent": False, "isPrevious": True},
            {"label": "W-0", "value": int(_clamp(base_conf + 5, 25, 95)), "isCurrent": True},
        ]

        key = "managed_money" if symbol == "XAUUSD" else "asset_manager"
        data[symbol] = {
            "bias": bias,
            "categories": {
                key: {
                    "long": long_val,
                    "short": short_val,
                }
            },
            "rolling_bias": rolling,
        }

    return {"status": "success", "data": data, "updated_at": now.isoformat()}


def build_engine_cards(analyses: Dict[str, dict], cot_data: Dict[str, dict], now: Optional[datetime] = None) -> List[dict]:
    now = now or datetime.now(timezone.utc)
    cards = []
    for symbol in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
        analysis = analyses.get(symbol, {})
        direction = analysis.get("direction", "Neutral")
        cot_bias = cot_data.get(symbol, {}).get("bias", "Neutral")
        align_bonus = 6 if (direction == "Up" and cot_bias == "Bull") or (direction == "Down" and cot_bias == "Bear") else -4
        probability = int(_clamp((analysis.get("confidence", 52) + align_bonus), 40, 95))

        cards.append(
            {
                "asset": symbol,
                "direction": "UP" if direction == "Up" else "DOWN" if direction == "Down" else "NEUTRAL",
                "probability": probability,
                "impulse": analysis.get("impulse", "Laterale"),
                "drivers": [d["name"] for d in analysis.get("drivers", [])] + [f"COT {cot_bias}"],
                "scores": {
                    "macro": round(probability / 100, 2),
                    "news": round((probability - 5) / 100, 2),
                    "cot": round(0.62 if cot_bias == "Bull" else -0.62 if cot_bias == "Bear" else 0.0, 2),
                    "user_bias": round((probability - 50) / 100, 2),
                },
                "timestamp": now.isoformat(),
            }
        )

    return cards


def _trade_levels(price: float, bias: str, symbol: str) -> dict:
    rounding = 5 if symbol == "EURUSD" else 2
    if bias == "Long":
        entry_low = price * 0.998
        entry_high = price * 1.0003
        stop = price * 0.995
        tp1 = price * 1.0065
        tp2 = price * 1.011
        invalidation = "Close H1 sotto area di invalidazione."
    elif bias == "Short":
        entry_low = price * 0.9997
        entry_high = price * 1.002
        stop = price * 1.005
        tp1 = price * 0.9935
        tp2 = price * 0.989
        invalidation = "Close H1 sopra area di invalidazione."
    else:
        entry_low = price * 0.999
        entry_high = price * 1.001
        stop = price * 0.996
        tp1 = price * 1.004
        tp2 = price * 1.007
        invalidation = "Attendere break direzionale valido."

    return {
        "entry_zone": [round(entry_low, rounding), round(entry_high, rounding)],
        "stop_loss": round(stop, rounding),
        "take_profit_1": round(tp1, rounding),
        "take_profit_2": round(tp2, rounding),
        "invalidation": invalidation,
    }


def build_strategy_projections(
    analyses: Dict[str, dict],
    cot_data: Dict[str, dict],
    briefing: dict,
    now: Optional[datetime] = None,
) -> List[dict]:
    now = now or datetime.now(timezone.utc)
    upcoming_high_impact = [
        e for e in briefing.get("events", [])
        if e.get("actual") is None and e.get("impact") == "high" and e.get("countdown") != "Uscito"
    ]
    currency_risk = {event["currency"] for event in upcoming_high_impact}

    projections: List[dict] = []
    for strategy in STRATEGY_CATALOG:
        asset = next((s for s in strategy["assets"] if s in analyses), None)
        if not asset:
            continue

        analysis = analyses[asset]
        cot_bias = cot_data.get(asset, {}).get("bias", "Neutral")
        direction = analysis.get("direction", "Neutral")
        bias = "Long" if direction == "Up" else "Short" if direction == "Down" else "Neutral"

        alignment = 0
        if (bias == "Long" and cot_bias == "Bull") or (bias == "Short" and cot_bias == "Bear"):
            alignment = 7
        elif cot_bias != "Neutral" and bias != "Neutral":
            alignment = -6

        event_penalty = 0
        if ("USD" in currency_risk and asset in {"SP500", "NAS100", "XAUUSD", "EURUSD"}) or ("EUR" in currency_risk and asset == "EURUSD"):
            event_penalty = 5

        probability = int(_clamp(strategy["win_rate"] + (analysis.get("confidence", 55) - 55) * 0.35 + alignment - event_penalty, 38, 93))
        confidence = "Alta" if probability >= 70 else "Media" if probability >= 55 else "Bassa"
        levels = _trade_levels(float(analysis.get("price", 0)), bias, asset)

        scenario = (
            f"{asset} in {direction.upper()} con COT {cot_bias}. "
            f"Setup {strategy['short_name']} valido se il prezzo rispetta la zona d'ingresso."
        )
        if event_penalty > 0:
            scenario += " Attesa volatilita da news high-impact: size ridotta."

        projections.append(
            {
                "strategy_id": strategy["id"],
                "strategy_name": strategy["name"],
                "short_name": strategy["short_name"],
                "asset": asset,
                "bias": bias,
                "probability": probability,
                "confidence": confidence,
                "win_rate": strategy["win_rate"],
                "trigger": strategy["trigger"],
                "summary": scenario,
                "entry": {
                    "zone": levels["entry_zone"],
                    "condition": "Conferma su chiusura candle e volume coerente.",
                },
                "exit": {
                    "stop_loss": levels["stop_loss"],
                    "take_profit_1": levels["take_profit_1"],
                    "take_profit_2": levels["take_profit_2"],
                    "invalidation": levels["invalidation"],
                },
                "updated_at": now.isoformat(),
            }
        )

    projections.sort(key=lambda row: row["probability"], reverse=True)
    return projections
