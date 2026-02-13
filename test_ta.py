from tradingview_ta import TA_Handler, Interval, Exchange

# Trying different screeners/exchanges
# Sometimes CFDs are under 'cfd' screener, sometimes 'forex'

targets = [
    # US100 - Nasdaq 100
    {"symbol": "US100", "screener": "cfd", "exchange": "CAPITALCOM"},
    {"symbol": "NAS100", "screener": "cfd", "exchange": "PEPPERSTONE"},

    # XAUUSD - Gold
    {"symbol": "XAUUSD", "screener": "forex", "exchange": "OANDA"},
    {"symbol": "XAUUSD", "screener": "cfd", "exchange": "FOREXCOM"},
    
    # SP500 
    {"symbol": "SPX500", "screener": "cfd", "exchange": "OANDA"},
    
    # VIX
    {"symbol": "VIX", "screener": "cfd", "exchange": "TVC"}, # TVC often has VIX
    
    # EURUSD
    {"symbol": "EURUSD", "screener": "forex", "exchange": "FXCM"},
]

print("Testing tradingview-ta fetches (Round 3)...")
for t in targets:
    try:
        handler = TA_Handler(
            symbol=t["symbol"],
            screener=t["screener"],
            exchange=t["exchange"],
            interval=Interval.INTERVAL_1_MINUTE
        )
        analysis = handler.get_analysis()
        if analysis:
             print(f"✅ {t['exchange']}:{t['symbol']} = {analysis.indicators['close']}")
        else:
             print(f"❌ {t['exchange']}:{t['symbol']} - No analysis returned")
    except Exception as e:
        print(f"❌ {t['exchange']}:{t['symbol']} - Error: {e}")
