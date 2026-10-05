"""
VN-Stock AI Advisors - Master CLI & Orchestration Engine.
Runs end-to-end data ingestion (VnStock), multi-advisor quantitative simulation,
performance evaluation, weakness autopsy, and evolutionary replacement breeding.
"""
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

# Force UTF-8 on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import argparse
import pandas as pd
from rich.console import Console

console = Console(force_terminal=True, legacy_windows=False)

# Project modules
from config.settings import get_default_config
from config.trading_rules import VietnamTradingRules
from data.vnstock_client import VnStockClient
from data.universe import StockUniverse
from data.indicators import TechnicalFeatureEngineer
from data.sample_splitter import SampleSplitter
from engine.backtest_engine import BacktestEngine
from engine.stats_collector import StatsCollector
from advisors.active_advisor import ActiveAdvisor
from advisors.harmony_advisor import HarmonyAdvisor
from advisors.persistent_advisor import PersistentAdvisor
from advisors.canslim_advisor import CanslimAdvisor
from advisors.mean_reversion_advisor import MeanReversionAdvisor
from evolution.lifecycle_manager import AdvisorLifecycleManager
from reports.visualizer import TerminalVisualizer
from reports.generator import ReportGenerator


def load_market_data(
    config,
    universe_symbols: List[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Tuple[Dict[str, pd.DataFrame], pd.DataFrame]:
    """
    Ingest OHLCV data from VnStock (or cache), calculate technical indicators,
    and align with VN-Index benchmark.
    """
    client = VnStockClient(cache_dir=config.data_cache_dir)
    st = start_date or config.periods.train_start
    ed = end_date or config.periods.oos_end
    console.print(f"[bold cyan]Đang tải và đồng bộ dữ liệu cho {len(universe_symbols)} mã CP + VNINDEX ({st} -> {ed})...[/bold cyan]")

    # 1. Fetch VN-Index benchmark
    bm_df = client.get_historical_quotes(
        symbol=config.benchmark_symbol,
        start_date=st,
        end_date=ed
    )
    bm_df = TechnicalFeatureEngineer.compute_features(bm_df)

    # 2. Fetch individual symbols and compute indicators
    market_data = {}
    for sym in universe_symbols:
        df = client.get_historical_quotes(
            symbol=sym,
            start_date=st,
            end_date=ed
        )
        if df is not None and len(df) > 30:
            df_feat = TechnicalFeatureEngineer.compute_features(df, benchmark_df=bm_df)
            market_data[sym] = df_feat

    console.print(f"[green]Đã sẵn sàng dữ liệu cho {len(market_data)} mã cổ phiếu đạt chuẩn.[/green]")
    return market_data, bm_df


def initialize_advisor_pool() -> List:
    """Create initial baseline pool of 5 diverse AI Advisors."""
    return [
        ActiveAdvisor(),            # 2W rebalance, Rank Ladder, aggressive momentum
        HarmonyAdvisor(),           # 1M rebalance, EQW, balanced trend
        PersistentAdvisor(),        # 3M rebalance, Risk Parity, low volatility/defensive
        CanslimAdvisor(),           # 2W rebalance, CANSLIM breakout volume
        MeanReversionAdvisor()      # 2W rebalance, oversold RSI dip buying (benchmark underperformer to test evolution)
    ]


def run_pipeline(fast_mode: bool = True):
    """Execute complete end-to-end multi-advisor simulation, evaluation, and evolution."""
    config = get_default_config()
    console.print(f"[bold magenta]=== KHỞI ĐỘNG HỆ THỐNG AI PORTFOLIO ADVISORS - BSC QUANT ===[/bold magenta]")
    
    # 1. Universe & Data Ingestion
    universe = StockUniverse()
    if fast_mode:
        # Top 15 liquid bluechip leaders across sectors for agile execution
        symbols = ["FPT", "HPG", "VCB", "MBB", "TCB", "ACB", "SSI", "VND", "VHM", "MWG", "MSN", "VNM", "DGC", "GAS", "GMD"]
        console.print("[yellow]Chế độ FAST MODE: Sử dụng rổ 15 mã bluechips đại diện thanh khoản cao nhất.[/yellow]")
    else:
        symbols = universe.get_base_universe()
        console.print(f"[cyan]Chế độ FULL MODE: Quét toàn bộ {len(symbols)} mã cổ phiếu cơ sở.[/cyan]")

    market_data, bm_df = load_market_data(config, symbols)

    # 2. Chronological Sample Splitter
    splitter = SampleSplitter(config.periods)
    train_data, val_data, oos_data = splitter.split_market_data(market_data)
    bm_train = splitter.split_dataframe(bm_df)["train"]
    bm_val = splitter.split_dataframe(bm_df)["val"]
    bm_oos = splitter.split_dataframe(bm_df)["oos"]

    console.print(f"\n[cyan]Phân tách mẫu dữ liệu chống rò rỉ tương lai (Challenge 3):[/cyan]")
    console.print(f"  • Huấn luyện (Train): {config.periods.train_start} -> {config.periods.train_end}")
    console.print(f"  • Kiểm định (Val):   {config.periods.val_start} -> {config.periods.val_end}")
    console.print(f"  • Thực chiến (OOS):  {config.periods.oos_start} -> {config.periods.oos_end}")

    # 3. Initialize Advisor Pool & Lifecycle Manager
    advisors = initialize_advisor_pool()
    lifecycle_manager = AdvisorLifecycleManager(initial_advisors=advisors)
    engine = BacktestEngine(initial_capital=config.initial_capital)
    collector = StatsCollector()

    # 4. Phase 1: Train & Validation Testing
    console.print(f"\n[bold yellow]>>> GIAI ĐOẠN 1: HUẤN LUYỆN & KIỂM ĐỊNH HIỆU SUẤT TRÊN TẬP DỮ LIỆU VAL...[/bold yellow]")
    eval_results = {}
    for adv in lifecycle_manager.active_advisors.values():
        res = engine.run(adv, val_data, bm_val)
        eval_results[adv.name] = res
        collector.add_result(res)

    summary_df = collector.get_summary_dataframe()
    TerminalVisualizer.print_leaderboard(summary_df, title="BẢNG XẾP HẠNG GIAI ĐOẠN KIỂM ĐỊNH (VALIDATION LEAGUE)")

    # 5. Phase 2: Evolutionary Autopsy & Breeding of Replacement Advisor
    console.print(f"\n[bold yellow]>>> GIAI ĐOẠN 2: CHẨN ĐOÁN ĐIỂM YẾU & TIẾN HÓA TẠO CHUYÊN GIA THAY THẾ...[/bold yellow]")
    evo_result = lifecycle_manager.run_evolution_cycle(
        training_results=eval_results,
        oos_data_dict=oos_data,
        oos_benchmark_df=bm_oos
    )
    TerminalVisualizer.print_evolution_event(evo_result)

    # 6. Phase 3: Out-of-Sample (OOS) Live Battle Simulation with Evolved League
    console.print(f"\n[bold yellow]>>> GIAI ĐOẠN 3: GIẢ LẬP THỰC CHIẾN NGOÀI MẪU (OUT-OF-SAMPLE) VỚI ĐỘI HÌNH MỚI...[/bold yellow]")
    oos_collector = StatsCollector()
    oos_results = {}
    for adv in lifecycle_manager.active_advisors.values():
        res = engine.run(adv, oos_data, bm_oos)
        oos_results[adv.name] = res
        oos_collector.add_result(res)

    oos_summary_df = oos_collector.get_summary_dataframe()
    TerminalVisualizer.print_leaderboard(oos_summary_df, title="BẢNG XẾP HẠNG THỰC CHIẾN NGOÀI MẪU (OOS BATTLE LEAGUE)")

    # 7. Print current Top 5 recommendations from the champion advisor
    top_champion_name = oos_summary_df["Advisor Name"].iloc[0]
    champion_advisor = lifecycle_manager.active_advisors[top_champion_name]
    latest_date = bm_oos["time"].iloc[-1]
    recommendation = champion_advisor.recommend_portfolio(latest_date, oos_data, bm_oos)
    TerminalVisualizer.print_top5_recommendation(top_champion_name, recommendation)

    # 8. Export Reports and Plots
    rep_gen = ReportGenerator(config.reports_dir)
    md_path = rep_gen.generate_markdown_report(oos_collector, evolution_event=evo_result)
    json_path = rep_gen.export_json_summary(oos_collector)
    chart_path = config.reports_dir / "equity_curve_comparison.png"
    TerminalVisualizer.plot_equity_curves(oos_results, bm_oos, save_path=chart_path)

    console.print(f"\n[bold green]✓ Báo cáo Markdown chi tiết đã xuất tại:[/bold green] {md_path}")
    console.print(f"[bold green]✓ Báo cáo JSON số liệu đã xuất tại:[/bold green] {json_path}")
    console.print(f"[bold magenta]=== HOÀN TẤT CHU TRÌNH ĐỊNH LƯỢNG & TIẾN HÓA CHUYÊN GIA AI ===[/bold magenta]")


def run_15y_backtest(fast_mode: bool = True):
    """Execute complete 15-year backtest simulation (2010 - 2025) across all key strategies."""
    config = get_default_config()
    console.print(f"[bold magenta]=== KIỂM THỬ ĐỊNH LƯỢNG 15 NĂM (2010 - 2025) THỊ TRƯỜNG CHỨNG KHOÁN VIỆT NAM ===[/bold magenta]")
    
    # 1. Universe & Data Ingestion (2010 - 2025)
    universe = StockUniverse()
    if fast_mode:
        symbols = ["FPT", "HPG", "VCB", "MBB", "TCB", "ACB", "SSI", "VND", "VHM", "MWG", "MSN", "VNM", "DGC", "GAS", "GMD"]
        console.print("[yellow]Chế độ FAST MODE: Rổ 15 mã bluechips trụ cột thanh khoản cao nhất.[/yellow]")
    else:
        symbols = universe.get_base_universe()
        console.print(f"[cyan]Chế độ FULL MODE: Quét toàn bộ {len(symbols)} mã cổ phiếu cơ sở.[/cyan]")

    market_data, bm_df = load_market_data(
        config=config,
        universe_symbols=symbols,
        start_date=config.periods.full_start,
        end_date=config.periods.full_end
    )

    # 2. Initialize Advisors for 15-year battle
    advisors = [
        ActiveAdvisor(),        # 2W rebalance, Rank Ladder, aggressive momentum
        HarmonyAdvisor(),       # 1M rebalance, EQW, balanced trend
        PersistentAdvisor(),    # 3M rebalance, Risk Parity, defensive
        CanslimAdvisor(),       # 2W rebalance, CANSLIM breakout volume
        MeanReversionAdvisor()  # 20D rebalance, RSI/BB oversold + trend alignment (Gen 2)
    ]

    engine = BacktestEngine(initial_capital=config.initial_capital)
    collector = StatsCollector()
    results = {}

    console.print(f"\n[bold yellow]>>> ĐANG MÔ PHỎNG CHI TIẾN 15 NĂM (~4.000 PHIÊN GIAO DỊCH 2010 - 2025)...[/bold yellow]")
    for adv in advisors:
        console.print(f"  • Chạy mô phỏng: [cyan]{adv.name}[/cyan] ({adv.description[:60]}...)")
        res = engine.run(adv, market_data, bm_df)
        results[adv.name] = res
        collector.add_result(res)

    # 3. Print 15-year Leaderboard & Annual Breakdown
    summary_df = collector.get_summary_dataframe()
    TerminalVisualizer.print_leaderboard(summary_df, title="BẢNG XẾP HẠNG TỔNG KẾT 15 NĂM (2010 - 2025)")
    TerminalVisualizer.print_annual_returns_table(results, bm_df)

    # 4. Export Reports & Plots
    rep_gen = ReportGenerator(config.reports_dir)
    md_path = rep_gen.generate_15y_markdown_report(collector, results, bm_df)
    json_path = rep_gen.export_json_summary(collector, filename="summary_metrics_15y.json")
    chart_path = config.reports_dir / "equity_curve_15y_2010_2025.png"
    TerminalVisualizer.plot_equity_curves(results, bm_df, save_path=chart_path)

    # 5. Export Web Data for GitHub Pages Dashboard (docs/data)
    docs_data_dir = config.project_root / "docs" / "data"
    docs_data_dir.mkdir(parents=True, exist_ok=True)
    
    # Save performance summary
    import json
    with open(docs_data_dir / "performance_15y.json", "w", encoding="utf-8") as f:
        json.dump(summary_df.to_dict(orient="records"), f, ensure_ascii=False, indent=2)

    # Save downsampled monthly equity curves for web chart
    chart_series = {}
    for name, res in results.items():
        df_nav = res.nav_series.copy()
        if not df_nav.empty:
            df_nav["month"] = pd.to_datetime(df_nav["time"]).dt.to_period("M").dt.to_timestamp()
            monthly = df_nav.groupby("month").last().reset_index()
            base_nav = monthly["nav"].iloc[0]
            chart_series[name] = [
                {"date": str(r["month"].date()), "nav": round(float(r["nav"] / base_nav * 100.0), 2)}
                for _, r in monthly.iterrows()
            ]

    # Benchmark monthly
    if bm_df is not None and not bm_df.empty:
        b_df = bm_df.copy()
        b_df["month"] = pd.to_datetime(b_df["time"]).dt.to_period("M").dt.to_timestamp()
        monthly_b = b_df.groupby("month").last().reset_index()
        base_b = monthly_b["close"].iloc[0]
        chart_series["VNINDEX"] = [
            {"date": str(r["month"].date()), "nav": round(float(r["close"] / base_b * 100.0), 2)}
            for _, r in monthly_b.iterrows()
        ]

    with open(docs_data_dir / "equity_curves.json", "w", encoding="utf-8") as f:
        json.dump(chart_series, f, ensure_ascii=False, indent=2)

    # Copy chart image to docs
    import shutil
    if chart_path.exists():
        shutil.copy(chart_path, config.project_root / "docs" / "equity_curve_15y.png")

    console.print(f"\n[bold green]✓ Đã xuất Báo cáo 15 Năm Markdown tại:[/bold green] {md_path}")
    console.print(f"[bold green]✓ Đã đồng bộ dữ liệu Web GitHub Pages tại:[/bold green] {docs_data_dir}")
    console.print(f"[bold magenta]=== HOÀN TẤT KIỂM THỬ 15 NĂM (2010 - 2025) ===[/bold magenta]")


def live_recommendation():
    """Quick generation of latest Top 5 recommendations for each customer profile."""
    config = get_default_config()
    universe = StockUniverse()
    symbols = ["FPT", "HPG", "VCB", "MBB", "TCB", "ACB", "SSI", "VND", "VHM", "MWG", "MSN", "VNM", "DGC", "GAS", "GMD"]
    market_data, bm_df = load_market_data(config, symbols)
    
    advisors = [ActiveAdvisor(), HarmonyAdvisor(), PersistentAdvisor()]
    latest_date = bm_df["time"].iloc[-1]
    
    for adv in advisors:
        rec = adv.recommend_portfolio(latest_date, market_data, bm_df)
        TerminalVisualizer.print_top5_recommendation(adv.name, rec)


def main():
    parser = argparse.ArgumentParser(description="VN-Stock AI Advisors Management & Evolution System")
    parser.add_argument("command", choices=["run-all", "run-15y", "live-advise", "test-data"], help="Command to execute")
    parser.add_argument("--full", action="store_true", help="Run in FULL mode using the complete universe")
    args = parser.parse_args()

    if args.command == "run-all":
        run_pipeline(fast_mode=not args.full)
    elif args.command == "run-15y":
        run_15y_backtest(fast_mode=not args.full)
    elif args.command == "live-advise":
        live_recommendation()
    elif args.command == "test-data":
        config = get_default_config()
        client = VnStockClient(cache_dir=config.data_cache_dir)
        df = client.get_historical_quotes("FPT", "2024-01-01", "2024-01-15")
        print("FPT Quotes:")
        print(df)


if __name__ == "__main__":
    main()
