"""
Generate comprehensive trade history for all AI Advisors (2010 - 2025).
Pairs buy and sell executions into structured round-trip trades with
precise PnL, return %, holding days, and exit reasons.
"""
import sys
from pathlib import Path
import json
import pandas as pd
from typing import Dict, List, Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from config.settings import get_default_config
from data.vnstock_client import VnStockClient
from data.universe import SECTOR_MAP
from data.indicators import TechnicalFeatureEngineer
from engine.backtest_engine import BacktestEngine
from advisors.active_advisor import ActiveAdvisor
from advisors.harmony_advisor import HarmonyAdvisor
from advisors.persistent_advisor import PersistentAdvisor
from advisors.canslim_advisor import CanslimAdvisor


VIETNAMESE_REASONS = {
    "STOP_LOSS": "Cắt Lỗ Vi Phạm (-4.5%)",
    "TRAILING_STOP": "Chốt Lời Trailing Stop",
    "TAKE_PROFIT": "Chốt Lời Mục Tiêu (+15%)",
    "REBALANCE_TARGET_TOP5": "Tái Cơ Cấu Danh Mục Top 5",
    "EXIT_TARGET_BASKET": "Đảo Danh Mục Chu Kỳ Mới",
    "TRIM_OVERWEIGHT": "Hạ Tỷ Trọng Vượt Mức",
    "MARKET_CRASH_DEFENSE": "Thoát Phòng Thủ Thị Trường Gấu",
    "REBALANCE": "Tái Cơ Cấu Định Kỳ"
}


def map_reason(raw_reason: str) -> str:
    r = str(raw_reason).upper()
    if "STOP_LOSS" in r:
        return "Cắt Lỗ Vi Phạm (-4.5%)"
    elif "TRAILING" in r:
        return "Chốt Lời Trailing Stop"
    elif "TAKE_PROFIT" in r:
        return "Chốt Lời Mục Tiêu (+15%)"
    elif "EXIT_TARGET" in r:
        return "Đảo Danh Mục Chu Kỳ Mới"
    elif "REBALANCE" in r:
        return "Tái Cơ Cấu Danh Mục Top 5"
    elif "TRIM" in r:
        return "Hạ Tỷ Trọng Vượt Mức"
    elif "MARKET_CRASH" in r:
        return "Thoát Phòng Thủ Thị Trường Gấu"
    else:
        return "Tái Cơ Cấu Định Kỳ"


def pair_round_trip_trades(trade_records: List[Any], advisor_name: str) -> List[Dict[str, Any]]:
    """
    Pairs raw buy/sell TradeRecords into completed round-trip trades using FIFO matching.
    """
    inventory: Dict[str, List[Dict[str, Any]]] = {}
    completed_trades: List[Dict[str, Any]] = []
    trade_counter = 1

    for tr in trade_records:
        sym = tr.symbol
        if sym not in inventory:
            inventory[sym] = []

        if tr.action == "BUY":
            inventory[sym].append({
                "date": tr.date,
                "price": tr.price,
                "shares": tr.shares,
                "fees": tr.fees
            })
        elif tr.action == "SELL":
            shares_to_close = tr.shares
            sell_date = tr.date
            sell_price = tr.price
            sell_reason = map_reason(tr.reason)

            while shares_to_close > 0 and inventory[sym]:
                lot = inventory[sym][0]
                matched_shares = min(shares_to_close, lot["shares"])

                buy_date = lot["date"]
                buy_price = lot["price"]
                holding_days = (pd.to_datetime(sell_date) - pd.to_datetime(buy_date)).days
                if holding_days < 0:
                    holding_days = 1

                # Return % after fees & tax
                gross_ret = (sell_price - buy_price) / buy_price
                # Approximate 0.35% round-trip cost
                net_ret = round((gross_ret - 0.0035) * 100.0, 2)
                pnl_vnd = int(matched_shares * (sell_price - buy_price) * 1000 - (matched_shares * sell_price * 1000 * 0.0035))

                completed_trades.append({
                    "id": f"TRD-{trade_counter:04d}",
                    "advisor": advisor_name,
                    "symbol": sym,
                    "sector": SECTOR_MAP.get(sym, "Bluechip"),
                    "entry_date": str(pd.to_datetime(buy_date).date()),
                    "exit_date": str(pd.to_datetime(sell_date).date()),
                    "entry_price": round(buy_price, 2),
                    "exit_price": round(sell_price, 2),
                    "shares": matched_shares,
                    "return_pct": net_ret,
                    "pnl_vnd": pnl_vnd,
                    "holding_days": holding_days,
                    "exit_reason": sell_reason
                })
                trade_counter += 1

                lot["shares"] -= matched_shares
                shares_to_close -= matched_shares
                if lot["shares"] <= 0:
                    inventory[sym].pop(0)

    return completed_trades


def generate_all_trades_history():
    print("Loading data for trade history generator...")
    config = get_default_config()
    client = VnStockClient(cache_dir=config.data_cache_dir)
    bm_df = client.get_historical_quotes(config.benchmark_symbol, start_date="2010-01-01", end_date="2025-12-31")
    bm_df = TechnicalFeatureEngineer.compute_features(bm_df)

    symbols = ["FPT", "HPG", "VCB", "MBB", "TCB", "ACB", "SSI", "VND", "VHM", "MWG", "MSN", "VNM", "DGC", "GAS", "GMD"]
    market_data = {}
    for sym in symbols:
        df = client.get_historical_quotes(sym, start_date="2010-01-01", end_date="2025-12-31")
        if df is not None and len(df) > 30:
            market_data[sym] = TechnicalFeatureEngineer.compute_features(df, benchmark_df=bm_df)

    advisors = [
        PersistentAdvisor(),
        HarmonyAdvisor(),
        ActiveAdvisor(),
        CanslimAdvisor()
    ]

    engine = BacktestEngine(initial_capital=config.initial_capital)
    all_trades: List[Dict[str, Any]] = []
    strategies_stats: Dict[str, Any] = {}

    for adv in advisors:
        print(f"Running simulation for {adv.name}...")
        res = engine.run(adv, market_data, bm_df)
        trades = pair_round_trip_trades(res.trades, adv.name)
        all_trades.extend(trades)

        # Compute stats for this strategy
        if trades:
            wins = [t for t in trades if t["return_pct"] > 0]
            losses = [t for t in trades if t["return_pct"] <= 0]
            win_rate = round(len(wins) / len(trades) * 100.0, 1) if trades else 0.0
            avg_win = round(sum(t["return_pct"] for t in wins) / len(wins), 2) if wins else 0.0
            avg_loss = round(sum(t["return_pct"] for t in losses) / len(losses), 2) if losses else 0.0
            gross_win_vnd = sum(t["pnl_vnd"] for t in wins)
            gross_loss_vnd = abs(sum(t["pnl_vnd"] for t in losses))
            pf = round(gross_win_vnd / gross_loss_vnd, 2) if gross_loss_vnd > 0 else 2.0
            avg_hold = round(sum(t["holding_days"] for t in trades) / len(trades), 1)

            strategies_stats[adv.name] = {
                "total_trades": len(trades),
                "win_trades": len(wins),
                "loss_trades": len(losses),
                "win_rate": win_rate,
                "profit_factor": pf,
                "avg_win_pct": avg_win,
                "avg_loss_pct": avg_loss,
                "avg_holding_days": avg_hold,
                "total_pnl_vnd": sum(t["pnl_vnd"] for t in trades)
            }

    # Sort trades descending by exit_date
    all_trades.sort(key=lambda x: x["exit_date"], reverse=True)

    # Re-index IDs cleanly
    for idx, t in enumerate(all_trades):
        t["id"] = f"TRD-{idx + 1:04d}"

    # Overall stats
    total_t = len(all_trades)
    total_w = sum(1 for t in all_trades if t["return_pct"] > 0)
    overall_win_rate = round(total_w / total_t * 100.0, 1) if total_t > 0 else 0.0

    output_payload = {
        "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_trades": total_t,
        "overall_win_rate": overall_win_rate,
        "strategies_stats": strategies_stats,
        "trades": all_trades
    }

    docs_data_dir = config.project_root / "docs" / "data"
    docs_data_dir.mkdir(parents=True, exist_ok=True)
    out_file = docs_data_dir / "trades_history.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated {len(all_trades)} trades to: {out_file}")


if __name__ == "__main__":
    generate_all_trades_history()
