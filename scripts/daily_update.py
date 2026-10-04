"""
Daily Automation Script for GitHub Actions CI/CD.
Fetches end-of-day market data, evaluates active AI Advisors,
generates latest Top 5 portfolio recommendations with current closing prices,
unrealized returns, technical signals, and updates GitHub Pages JSON feeds.
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


def get_technical_signal(df_feat: pd.DataFrame) -> str:
    """Generate concise Vietnamese technical signal description."""
    if df_feat.empty:
        return "Tích lũy ổn định"
    latest = df_feat.iloc[-1]
    rs = float(latest.get("rs_rating", 50.0))
    rsi = float(latest.get("rsi_14", 50.0))
    dist_sma20 = float(latest.get("dist_sma20", 0.0))
    vol_ratio = float(latest.get("vol_ratio", 1.0))

    if rs >= 75 and vol_ratio >= 1.3:
        return f"Dẫn dắt RS {rs:.0f} | Bùng nổ Vol"
    elif dist_sma20 > 0.03 and rsi < 70:
        return f"Xu hướng Tăng mạnh > MA20"
    elif rsi >= 70:
        return f"Tăng nóng | RSI {rsi:.0f}"
    elif rs >= 70:
        return f"Sức mạnh giá RS {rs:.0f}"
    elif dist_sma20 > 0:
        return "Giữ vững nền MA20"
    else:
        return "Tích lũy chờ dòng tiền"


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
    prev_prices = {}
    daily_changes = {}
    daily_volumes = {}

    gainers = 0
    losers = 0
    unchanged = 0

    for sym in symbols:
        df = client.get_historical_quotes(sym, start_date=lookback_start, end_date=today_str)
        if df is not None and len(df) > 20:
            df_feat = TechnicalFeatureEngineer.compute_features(df, benchmark_df=bm_df)
            market_data[sym] = df_feat
            curr_p = float(df_feat["close"].iloc[-1])
            prev_p = float(df_feat["close"].iloc[-2]) if len(df_feat) > 1 else curr_p
            chg = round(((curr_p - prev_p) / prev_p) * 100.0, 2)
            vol = int(df_feat["volume"].iloc[-1])

            current_prices[sym] = curr_p
            prev_prices[sym] = prev_p
            daily_changes[sym] = chg
            daily_volumes[sym] = vol

            if chg > 0.05:
                gainers += 1
            elif chg < -0.05:
                losers += 1
            else:
                unchanged += 1

    # 2. Ingest Financial News & Corporate Disclosures
    print("Scanning financial news, disclosures, and red flags via NewsScanner...")
    from news.scanner import NewsScanner
    news_scanner = NewsScanner()
    news_report = news_scanner.build_full_intelligence_report(tracked_symbols=symbols)
    news_sentiment_map = news_report.get("symbols_sentiment", {})

    # Export news intelligence to docs/data/news_intelligence.json
    news_intel_file = docs_data_dir / "news_intelligence.json"
    with open(news_intel_file, "w", encoding="utf-8") as f:
        json.dump(news_report, f, ensure_ascii=False, indent=2)
    print(f"Exported news intelligence feed to: {news_intel_file}")

    # 3. Evaluate Core Strategies with News Sentiment Re-evaluation
    advisors = [
        ActiveAdvisor(),
        HarmonyAdvisor(),
        PersistentAdvisor(),
        CanslimAdvisor()
    ]

    latest_timestamp = bm_df["time"].iloc[-1]
    strategy_recommendations = {}

    for adv in advisors:
        rec = adv.recommend_portfolio(
            as_of_date=latest_timestamp,
            market_data_dict=market_data,
            benchmark_df=bm_df,
            news_sentiment_dict=news_sentiment_map
        )
        weights = rec.get("target_weights", {})
        scores = rec.get("scores", {})
        news_notes = rec.get("news_re_eval_notes", {})
        cycle_days = adv.rebalance_days
        
        top5_list = []
        for sym, w in weights.items():
            price = current_prices.get(sym, 0.0)
            df_feat = market_data.get(sym)

            # Entry price at start of current cycle
            if df_feat is not None and len(df_feat) > cycle_days:
                entry_idx = max(0, len(df_feat) - cycle_days)
                entry_price = float(df_feat["close"].iloc[entry_idx])
            else:
                entry_price = price

            current_return = round(((price - entry_price) / entry_price) * 100.0, 2) if entry_price > 0 else 0.0
            stop_loss = round(entry_price * 0.955, 2)  # -4.5% tight stop loss
            target_tp = round(entry_price * 1.15, 2)   # +15% target profit
            signal = get_technical_signal(df_feat) if df_feat is not None else "Đang theo dõi"
            sym_news = news_sentiment_map.get(sym, {})

            top5_list.append({
                "symbol": sym,
                "weight_pct": round(w * 100.0, 1),
                "score": scores.get(sym, 0.0),
                "sector": SECTOR_MAP.get(sym, "Bluechip"),
                "entry_price": round(entry_price, 2),
                "current_price": round(price, 2),
                "daily_change_pct": daily_changes.get(sym, 0.0),
                "current_return_pct": current_return,
                "stop_loss": stop_loss,
                "target_price": target_tp,
                "volume": daily_volumes.get(sym, 0),
                "technical_signal": signal,
                "news_status": sym_news.get("status", "THÔNG TIN BÌNH ỔN"),
                "news_badge": sym_news.get("status_badge", "neutral"),
                "news_headline": sym_news.get("latest_headline", "Không có tin bất thường"),
                "news_action": sym_news.get("action_desc", "Duy trì khuyến nghị gốc"),
                "news_score": sym_news.get("net_sentiment", 0.0)
            })

        # Calculate current cycle portfolio return
        weighted_current_return = round(sum(item["current_return_pct"] * (item["weight_pct"] / 100.0) for item in top5_list), 2)
        winning_count = sum(1 for item in top5_list if item["current_return_pct"] > 0)
        total_weight = sum(item["weight_pct"] for item in top5_list)
        cash_ratio = round(max(0.0, 100.0 - total_weight), 1)

        strategy_recommendations[adv.name] = {
            "name": adv.name,
            "description": adv.description,
            "rebalance_days": adv.rebalance_days,
            "allocation_method": adv.allocation_method.value,
            "current_cycle_return_pct": weighted_current_return,
            "winning_picks": winning_count,
            "total_picks": len(top5_list),
            "cash_ratio_pct": cash_ratio,
            "top5": top5_list,
            "news_notes": news_notes
        }

    # 4. Generate structured Current Holdings, New Signals, and News Action Recommendations
    # 4A. Consolidated Current Holdings
    all_current_holdings = []
    for adv_name, s_data in strategy_recommendations.items():
        adv_clean = adv_name.replace("AI_Advisor_", "")
        for item in s_data.get("top5", []):
            sym = item["symbol"]
            ret = item["current_return_pct"]
            pnl_vnd = int(item["weight_pct"] * 10000000 * (ret / 100.0))  # Simulated PnL based on allocated capital

            if ret >= 10.0:
                status_text = "GẦN TARGET (+15%)"
                status_badge = "pos-bold"
                action_advice = "Sẵn sàng chốt lời từng phần / Nâng Trailing Stop"
            elif ret > 0:
                status_text = "ĐANG CÓ LÃI"
                status_badge = "pos"
                action_advice = "Tiếp tục nắm giữ theo xu hướng tăng"
            elif ret > -3.0:
                status_text = "TÍCH LŨY / HÒA VỐN"
                status_badge = "neutral"
                action_advice = "Giữ vị thế, quan sát hỗ trợ MA20"
            else:
                status_text = "CẢNH BÁO STOP LOSS"
                status_badge = "neg"
                action_advice = "Gần ngưỡng cắt lỗ -4.5%, sẵn sàng hạ tỷ trọng"

            all_current_holdings.append({
                "symbol": sym,
                "advisor": adv_name,
                "advisor_name": adv_clean,
                "sector": item["sector"],
                "weight_pct": item["weight_pct"],
                "entry_price": item["entry_price"],
                "current_price": item["current_price"],
                "daily_change_pct": item["daily_change_pct"],
                "current_return_pct": ret,
                "pnl_vnd": pnl_vnd,
                "holding_days": s_data.get("rebalance_days", 14),
                "stop_loss": item["stop_loss"],
                "target_price": item["target_price"],
                "status_text": status_text,
                "status_badge": status_badge,
                "action_advice": action_advice,
                "technical_signal": item["technical_signal"],
                "news_status": item["news_status"],
                "news_badge": item["news_badge"],
                "volume": item["volume"]
            })

    # 4B. Generate Actionable New Signals (Buy / Take Profit / Stop Loss / Switch)
    new_signals = []
    sig_id = 1
    # Buy signals for strong candidates
    for sym in symbols:
        sym_news = news_sentiment_map.get(sym, {})
        if sym_news.get("has_red_flag", False):
            continue
        df_feat = market_data.get(sym)
        if df_feat is None or df_feat.empty:
            continue
        latest = df_feat.iloc[-1]
        rs = float(latest.get("rs_rating", 50.0))
        vol_ratio = float(latest.get("vol_ratio", 1.0))
        dist_sma20 = float(latest.get("dist_sma20", 0.0))
        curr_p = current_prices.get(sym, 0.0)

        if rs >= 75 and dist_sma20 > -0.01:
            target_p = round(curr_p * 1.15, 2)
            sl_p = round(curr_p * 0.955, 2)
            reason_tech = f"RS rating {rs:.0f} dẫn dắt ngành | {'Bùng nổ Vol ' + str(round(vol_ratio, 1)) + 'x' if vol_ratio >= 1.2 else 'Bám sát trên MA20'}"
            advisor_rationale = "Tối ưu hóa tỷ lệ RR 3.3 : 1 (Mục tiêu +15% / Cắt lỗ -4.5%) - Điểm vào sóng tăng"

            new_signals.append({
                "id": f"SIG-BUY-{sig_id:02d}",
                "symbol": sym,
                "sector": SECTOR_MAP.get(sym, "Bluechip"),
                "signal_type": "MUA MỚI",
                "signal_badge": "buy",
                "recommended_advisor": "Chủ Động (2W) & CANSLIM",
                "signal_price": curr_p,
                "target_price": target_p,
                "target_return_pct": 15.0,
                "stop_loss": sl_p,
                "max_loss_pct": -4.5,
                "rr_ratio": "3.3 : 1",
                "recommended_weight_pct": 20.0,
                "technical_reason": reason_tech,
                "advisor_rationale": advisor_rationale,
                "news_status": sym_news.get("status", "THÔNG TIN BÌNH ỔN"),
                "news_badge": sym_news.get("status_badge", "neutral")
            })
            sig_id += 1

    # Take profit signals (return >= 12% or target profit reached)
    for h in all_current_holdings:
        if h["current_return_pct"] >= 10.0:
            new_signals.append({
                "id": f"SIG-TP-{sig_id:02d}",
                "symbol": h["symbol"],
                "sector": h["sector"],
                "signal_type": "CHỐT LỜI",
                "signal_badge": "profit",
                "recommended_advisor": h["advisor_name"],
                "signal_price": h["current_price"],
                "target_price": h["target_price"],
                "target_return_pct": h["current_return_pct"],
                "stop_loss": h["stop_loss"],
                "max_loss_pct": 0.0,
                "rr_ratio": "Đã đạt mục tiêu",
                "recommended_weight_pct": 0.0,
                "technical_reason": f"Lợi nhuận đạt +{h['current_return_pct']}% tiến sát mục tiêu chốt lời",
                "advisor_rationale": "Chủ động hiện thực hóa lợi nhuận, nâng tiền mặt về mức an toàn",
                "news_status": h["news_status"],
                "news_badge": h["news_badge"]
            })
            sig_id += 1

    # Stop loss signals (return <= -4.0%)
    for h in all_current_holdings:
        if h["current_return_pct"] <= -4.0:
            new_signals.append({
                "id": f"SIG-SL-{sig_id:02d}",
                "symbol": h["symbol"],
                "sector": h["sector"],
                "signal_type": "CẮT LỖ BẢO VỆ VỐN",
                "signal_badge": "stop",
                "recommended_advisor": h["advisor_name"],
                "signal_price": h["current_price"],
                "target_price": h["target_price"],
                "target_return_pct": h["current_return_pct"],
                "stop_loss": h["stop_loss"],
                "max_loss_pct": -4.5,
                "rr_ratio": "Bảo vệ vốn",
                "recommended_weight_pct": 0.0,
                "technical_reason": f"Hiệu suất suy giảm {h['current_return_pct']}%, chạm ngưỡng kỷ luật dừng lỗ",
                "advisor_rationale": "Cắt lỗ dứt khoát -4.5% để triệt tiêu nguy cơ sụt giảm tài sản lớn (Max DD)",
                "news_status": h["news_status"],
                "news_badge": h["news_badge"]
            })
            sig_id += 1

    # 4C. News Action Recommendations
    news_actions = {
        "catalysts": [],
        "red_flags": [],
        "cautions": [],
        "summary": {
            "total_catalysts": 0,
            "total_red_flags": 0,
            "total_cautions": 0
        }
    }
    for sym, s_info in news_sentiment_map.items():
        item = {
            "symbol": sym,
            "sector": SECTOR_MAP.get(sym, "Bluechip"),
            "net_sentiment": s_info.get("net_sentiment", 0.0),
            "sentiment_multiplier": s_info.get("sentiment_multiplier", 1.0),
            "status": s_info.get("status", "THÔNG TIN BÌNH ỔN"),
            "status_badge": s_info.get("status_badge", "neutral"),
            "latest_headline": s_info.get("latest_headline", "Không có tin bất thường"),
            "action_desc": s_info.get("action_desc", "Duy trì khuyến nghị gốc"),
            "news_count": s_info.get("news_count", 0),
            "re_eval_note": s_info.get("re_eval_note", "")
        }
        if s_info.get("has_red_flag", False) or s_info.get("sentiment_multiplier", 1.0) == 0.0:
            news_actions["red_flags"].append(item)
        elif s_info.get("has_catalyst", False) or s_info.get("sentiment_multiplier", 1.0) > 1.0:
            news_actions["catalysts"].append(item)
        else:
            news_actions["cautions"].append(item)

    news_actions["summary"]["total_catalysts"] = len(news_actions["catalysts"])
    news_actions["summary"]["total_red_flags"] = len(news_actions["red_flags"])
    news_actions["summary"]["total_cautions"] = len(news_actions["cautions"])

    # 5. Assemble Daily Summary JSON payload
    daily_payload = {
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S (UTC+7)"),
        "trading_date": latest_date_str,
        "vnindex": {
            "close": latest_bm_price,
            "change_pct": bm_change_pct,
            "regime": market_regime,
            "gainers": gainers,
            "losers": losers,
            "unchanged": unchanged
        },
        "news_radar": {
            "total_news_scanned": news_report.get("total_news_scanned", 0),
            "red_flags_detected": news_report.get("red_flags_detected", 0),
            "catalysts_detected": news_report.get("catalysts_detected", 0),
            "system_verdict": news_report.get("system_verdict", "AN TOÀN"),
            "last_scanned": news_report.get("last_updated", "")
        },
        "current_holdings": all_current_holdings,
        "new_signals": new_signals,
        "news_action_recommendations": news_actions,
        "universe_count": len(market_data),
        "strategies": strategy_recommendations
    }

    # Write to docs/data/daily_summary.json
    out_file = docs_data_dir / "daily_summary.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(daily_payload, f, ensure_ascii=False, indent=2)

    print(f"Successfully updated enhanced daily summary at: {out_file}")


if __name__ == "__main__":
    run_daily_update()
