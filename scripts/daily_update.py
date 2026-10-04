"""
Daily Automation Script for GitHub Actions CI/CD.
Fetches end-of-day market data, evaluates active AI Advisors,
generates latest Top 5 portfolio recommendations, and updates GitHub Pages JSON feeds.
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime
import pandas as pd

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

from config.settings import get_default_config
from data.vnstock_client import VnStockClient
from data.universe import StockUniverse, SECTOR_MAP
from data.indicators import TechnicalFeatureEngineer
from portfolio.risk_manager import RiskManager
from advisors.active_advisor import ActiveAdvisor
from advisors.harmony_advisor import HarmonyAdvisor
from advisors.persistent_advisor import PersistentAdvisor
from advisors.canslim_advisor import CanslimAdvisor


def run_daily_update():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting daily AI Advisor update...")
    config = get_default_config()
    docs_data_dir = config.project_root / "docs" / "data"
    docs_data_dir.mkdir(parents=True, exist_ok=True)

    universe = StockUniverse()
    symbols = ["FPT", "HPG", "VCB", "MBB", "TCB", "ACB", "SSI", "VND", "VHM", "MWG", "MSN", "VNM", "DGC", "GAS", "GMD"]

    # 1. Fetch latest market data
    client = VnStockClient(cache_dir=config.data_cache_dir, force_refresh=True)
    today_str = datetime.now().strftime("%Y-%m-%d")
    lookback_start = "2023-01-01"

    print("Fetching benchmark data for VN-Index...")
    bm_df = client.get_historical_quotes(config.benchmark_symbol, start_date=lookback_start, end_date=today_str)
    bm_df = TechnicalFeatureEngineer.compute_features(bm_df)

    latest_bm_price = float(bm_df["close"].iloc[-1]) if not bm_df.empty else 1250.0
    prev_bm_price = float(bm_df["close"].iloc[-2]) if len(bm_df) > 1 else latest_bm_price
    bm_change_pct = round(((latest_bm_price - prev_bm_price) / prev_bm_price) * 100.0, 2)
    latest_date_str = str(bm_df["time"].iloc[-1].date()) if not bm_df.empty else today_str

    # Detect Market Regime
    risk_manager = RiskManager()
    market_regime = risk_manager.detect_market_regime(bm_df, bm_df["time"].iloc[-1])

    # Fetch individual symbols
    print("Fetching equity universe data...")
    market_data = {}
    current_prices = {}
    for sym in symbols:
        df = client.get_historical_quotes(sym, start_date=lookback_start, end_date=today_str)
        if df is not None and len(df) > 20:
            df_feat = TechnicalFeatureEngineer.compute_features(df, benchmark_df=bm_df)
            market_data[sym] = df_feat
            current_prices[sym] = float(df_feat["close"].iloc[-1])

    # 2. Evaluate Core Strategies
    advisors = [
        ActiveAdvisor(),
        HarmonyAdvisor(),
        PersistentAdvisor(),
        CanslimAdvisor()
    ]

    latest_timestamp = bm_df["time"].iloc[-1]
    strategy_recommendations = {}

    for adv in advisors:
        rec = adv.recommend_portfolio(latest_timestamp, market_data, bm_df)
        weights = rec.get("target_weights", {})
        scores = rec.get("scores", {})
        
        top5_list = []
        for sym, w in weights.items():
            price = current_prices.get(sym, 0.0)
            stop_loss = round(price * 0.93, 2)  # -7% stop loss
            target_tp = round(price * 1.15, 2)  # +15% target profit
            top5_list.append({
                "symbol": sym,
                "weight_pct": round(w * 100.0, 1),
                "score": scores.get(sym, 0.0),
                "sector": SECTOR_MAP.get(sym, "Bluechip"),
                "current_price": price,
                "stop_loss": stop_loss,
                "target_price": target_tp
            })

        strategy_recommendations[adv.name] = {
            "name": adv.name,
            "description": adv.description,
            "rebalance_days": adv.rebalance_days,
            "allocation_method": adv.allocation_method.value,
            "top5": top5_list
        }

    # 3. Assemble Daily Summary JSON payload
    daily_payload = {
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S (UTC+7)"),
        "trading_date": latest_date_str,
        "vnindex": {
            "close": latest_bm_price,
            "change_pct": bm_change_pct,
            "regime": market_regime
        },
        "universe_count": len(market_data),
        "strategies": strategy_recommendations
    }

    # Write to docs/data/daily_summary.json
    out_file = docs_data_dir / "daily_summary.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(daily_payload, f, ensure_ascii=False, indent=2)

    print(f"Successfully updated daily summary at: {out_file}")


if __name__ == "__main__":
    run_daily_update()
