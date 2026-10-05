"""
Script to download and update historical data for 15 US Mega-Caps + SPY benchmark.
Caches to data/cache/international/{symbol}.csv.
"""
import sys
from pathlib import Path
from datetime import datetime

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Force UTF-8 encoding
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from data.international_client import (
    InternationalStockClient,
    INTERNATIONAL_BENCHMARK,
    INTERNATIONAL_UNIVERSE
)


def run_international_download():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting International Data Pipeline...")
    client = InternationalStockClient(force_refresh=True)

    all_symbols = [INTERNATIONAL_BENCHMARK] + INTERNATIONAL_UNIVERSE
    start_date = "2010-01-01"
    end_date = datetime.now().strftime("%Y-%m-%d")

    print(f"Target Universe ({len(all_symbols)} symbols): {', '.join(all_symbols)}")
    print(f"Time Range: {start_date} -> {end_date}")
    print(f"Cache Location: {client.cache_dir}\n")

    results = []
    for i, sym in enumerate(all_symbols, 1):
        print(f"[{i:02d}/{len(all_symbols):02d}] Fetching {sym}...", end=" ", flush=True)
        try:
            df = client.get_historical_quotes(sym, start_date=start_date, end_date=end_date)
            if df is not None and not df.empty:
                s_date = df["time"].iloc[0].strftime("%Y-%m-%d")
                e_date = df["time"].iloc[-1].strftime("%Y-%m-%d")
                close_p = float(df["close"].iloc[-1])
                vol = int(df["volume"].iloc[-1])
                print(f"DONE! Rows: {len(df):<5} | Range: {s_date} -> {e_date} | Close: ${close_p:,.2f}")
                results.append({
                    "symbol": sym,
                    "rows": len(df),
                    "start": s_date,
                    "end": e_date,
                    "latest_close": close_p,
                    "latest_volume": vol,
                    "status": "SUCCESS"
                })
            else:
                print("FAILED (empty dataframe)")
                results.append({
                    "symbol": sym,
                    "rows": 0,
                    "start": "N/A",
                    "end": "N/A",
                    "latest_close": 0.0,
                    "latest_volume": 0,
                    "status": "EMPTY"
                })
        except Exception as e:
            print(f"ERROR: {e}")
            results.append({
                "symbol": sym,
                "rows": 0,
                "start": "N/A",
                "end": "N/A",
                "latest_close": 0.0,
                "latest_volume": 0,
                "status": f"ERROR: {e}"
            })

    print("\n" + "=" * 80)
    print("DOWNLOAD SUMMARY TABLE")
    print("=" * 80)
    print(f"{'No.':<4} {'Symbol':<8} {'Rows':<6} {'Start Date':<12} {'End Date':<12} {'Latest Close':<14} {'Status':<10}")
    print("-" * 80)
    for idx, r in enumerate(results, 1):
        p_str = f"${r['latest_close']:,.2f}" if r['latest_close'] > 0 else "N/A"
        print(f"{idx:<4} {r['symbol']:<8} {r['rows']:<6} {r['start']:<12} {r['end']:<12} {p_str:<14} {r['status']:<10}")
    print("=" * 80)


if __name__ == "__main__":
    run_international_download()
