from tvDatafeed import TvDatafeed, Interval

# Initialize with no login (guest mode)
tv = TvDatafeed()

results = {}

# User requested symbols
symbols = [
    ("US100", "CAPITALCOM"),
    ("XAUUSD", "OANDA"),
    ("SP500", "SPCFD"),  # Checking if this exists, user said "sp500 spcfd"
    ("VIX", "CAPITALCOM"),
    ("EURUSD", "FXCM")
]

print("Testing tvDatafeed fetches...")
for symbol, exchange in symbols:
    try:
        data = tv.get_hist(symbol=symbol, exchange=exchange, interval=Interval.in_1_minute, n_bars=1)
        if data is not None and not data.empty:
            price = data['close'].iloc[-1]
            print(f"✅ {exchange}:{symbol} = {price}")
            results[symbol] = price
        else:
            print(f"❌ {exchange}:{symbol} - No data found")
    except Exception as e:
        print(f"⚠️ {exchange}:{symbol} - Error: {e}")

print("\nSummary:")
print(results)
