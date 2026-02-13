from tradingview_ta import TA_Handler, Interval, Exchange
import time

def check(symbol, exchange, screener="cfd"):
    try:
        handler = TA_Handler(
            symbol=symbol,
            screener=screener,
            exchange=exchange,
            interval=Interval.INTERVAL_1_MINUTE
        )
        analysis = handler.get_analysis()
        if analysis:
            print(f"✅ WORKS: {exchange}:{symbol} ({screener}) -> {analysis.indicators['close']}")
            return True
    except Exception as e:
        print(f"❌ FAILED: {exchange}:{symbol} ({screener}) - {e}")
        pass
    return False

# Candidates to check
candidates = [
    # NAS100
    ("NAS100", "FOREXCOM", "cfd"),
    ("US100", "CAPITALCOM", "cfd"),
    ("NSXUSD", "FXCM", "cfd"),
    ("NAS100", "PEPPERSTONE", "cfd"),
    ("NAS100", "OANDA", "cfd"),
    ("NDX", "NASDAQ", "america"),
    
    # SP500
    ("SPX500", "FOREXCOM", "cfd"),
    ("SPX500", "OANDA", "cfd"),
    ("US500", "CAPITALCOM", "cfd"),
    ("SPX", "CBOE", "index"),
    ("SPX", "AMEX", "index"),

    # EURUSD
    ("EURUSD", "FXCM", "forex"),
    ("EURUSD", "FOREXCOM", "forex"),
    ("EURUSD", "OANDA", "forex"),
    
    # GOLD
    ("XAUUSD", "FOREXCOM", "cfd"),
    ("XAUUSD", "OANDA", "cfd"),
    ("GOLD", "TVC", "cfd")
]

print("🔍 Scanning for working symbols...")
for sym, ex, scr in candidates:
    check(sym, ex, scr)
    time.sleep(0.1)
