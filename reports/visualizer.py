"""
Terminal visualizer and chart plotter.
Uses rich formatting for terminal dashboards and matplotlib for equity curves.
"""
import sys
from pathlib import Path
from typing import Dict, List, Optional
import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from engine.performance_metrics import AdvisorMetrics
from engine.backtest_engine import BacktestResult

console = Console(force_terminal=True, legacy_windows=False)


class TerminalVisualizer:
    """
    Renders high-impact visual tables and terminal UI for AI Advisor portfolios.
    """

    @staticmethod
    def print_leaderboard(summary_df: pd.DataFrame, title: str = "BẢNG XẾP HẠNG CHUYÊN GIA AI THỰC CHIẾN"):
        """Render a formatted leaderboard table."""
        if summary_df is None or summary_df.empty:
            console.print("[yellow]Không có dữ liệu bảng xếp hạng.[/yellow]")
            return

        table = Table(title=f"[bold green]{title}[/bold green]", show_header=True, header_style="bold cyan")
        
        # Add columns
        cols = [
            "Hạng", "Chuyên Gia AI", "Lợi Nhuận (%)", "CAGR (%)", "Alpha (%/năm)",
            "MDD (%)", "Sharpe", "Win Rate (%)", "Tỷ Lệ RR", "Vòng Quay (x/năm)", "Điểm CL"
        ]
        for c in cols:
            table.add_column(c, justify="center" if c not in ["Chuyên Gia AI"] else "left")

        for idx, row in summary_df.iterrows():
            rank_str = f"#{idx + 1}"
            if idx == 0:
                rank_str = "[bold gold1]🥇 #1[/bold gold1]"
            elif idx == 1:
                rank_str = "[bold bright_white]🥈 #2[/bold bright_white]"
            elif idx == 2:
                rank_str = "[bold orange3]🥉 #3[/bold orange3]"

            rr_val = row.get("RR Ratio", 1.0)
            table.add_row(
                rank_str,
                f"[bold]{row['Advisor Name']}[/bold]",
                f"[green]+{row['Total Return (%)']}%[/green]" if row['Total Return (%)'] >= 0 else f"[red]{row['Total Return (%)']}%[/red]",
                f"{row['CAGR (%)']}%",
                f"[bold green]+{row['Alpha vs VN-Index (%/y)']}%[/bold green]" if row['Alpha vs VN-Index (%/y)'] >= 0 else f"[red]{row['Alpha vs VN-Index (%/y)']}%[/red]",
                f"[red]{row['Max Drawdown (%)']}%[/red]",
                f"[cyan]{row['Sharpe']}[/cyan]",
                f"{row['Win Rate (%)']}%",
                f"[bold yellow]{rr_val:.2f}x[/bold yellow]",
                f"{row['Turnover (x/y)']}",
                f"[bold magenta]{row['Score']}[/bold magenta]"
            )

        console.print(table)

    @staticmethod
    def print_annual_returns_table(
        results: Dict[str, BacktestResult],
        benchmark_df: Optional[pd.DataFrame] = None
    ):
        """Render yearly breakdown table (2010 - 2025)."""
        table = Table(title="[bold yellow]HIỆU SUẤT TỪNG NĂM (2010 - 2025) - CÁC CHIẾN LƯỢC VS VN-INDEX[/bold yellow]")
        table.add_column("Năm", justify="center", style="bold white")
        table.add_column("VN-Index (%)", justify="center")

        adv_names = list(results.keys())
        for name in adv_names:
            short_name = name.replace("AI_Advisor_", "")
            table.add_column(f"{short_name} (%)", justify="center")

        # Compute VN-Index annual return
        bm_annual = {}
        if benchmark_df is not None and not benchmark_df.empty:
            b_df = benchmark_df.copy()
            b_df["year"] = pd.to_datetime(b_df["time"]).dt.year
            for yr, grp in b_df.groupby("year"):
                s_val = grp["close"].iloc[0]
                e_val = grp["close"].iloc[-1]
                bm_annual[int(yr)] = round(((e_val - s_val) / s_val) * 100.0, 1)

        # Collect all years
        all_years = sorted(list(bm_annual.keys()))
        if not all_years:
            all_years = list(range(2010, 2026))

        for yr in all_years:
            row_items = [str(yr)]
            bm_ret = bm_annual.get(yr, 0.0)
            bm_str = f"[green]+{bm_ret}%[/green]" if bm_ret >= 0 else f"[red]{bm_ret}%[/red]"
            row_items.append(bm_str)

            for name in adv_names:
                ret = results[name].metrics.annual_returns.get(yr, 0.0)
                color = "green" if ret >= 0 else "red"
                sign = "+" if ret >= 0 else ""
                row_items.append(f"[{color}]{sign}{ret}%[/{color}]")

            table.add_row(*row_items)

        console.print(table)

    @staticmethod
    def print_top5_recommendation(advisor_name: str, recommendation: Dict):
        """Render current Top 5 portfolio recommendation table."""
        table = Table(title=f"[bold cyan]DANH MỤC TOP 5 KHUYẾN NGHỊ - {advisor_name}[/bold cyan]")
        table.add_column("Mã CP", justify="center", style="bold yellow")
        table.add_column("Điểm Lượng Hóa", justify="center")
        table.add_column("Tỷ Trọng Phân Bổ (%)", justify="center", style="bold green")

        weights = recommendation.get("target_weights", {})
        scores = recommendation.get("scores", {})

        for sym, weight in weights.items():
            sc = scores.get(sym, 0.0)
            table.add_row(sym, f"{sc:.4f}", f"{weight * 100:.1f}%")

        console.print(table)

    @staticmethod
    def print_evolution_event(event_dict: Dict):
        """Print evolutionary autopsy, replacement and promotion event."""
        cand_m = event_dict.get('candidate_metrics', {})
        cagr_val = cand_m.get('cagr_pct', 0.0)
        cagr_str = f"+{cagr_val:.1f}%" if cagr_val >= 0 else f"{cagr_val:.1f}%"

        p = Panel(
            f"[bold red]TIẾN HÓA VÀ THAY THẾ CHUYÊN GIA (THẾ HỆ {event_dict.get('generation', 1)})[/bold red]\n"
            f"[bold]Nhóm dẫn đầu (Top Performers):[/bold] {', '.join(event_dict.get('top_performers', []))}\n"
            f"[bold]Nhóm yếu kém (Underperformers):[/bold] {', '.join(event_dict.get('underperformers', []))}\n\n"
            f"[bold yellow]Khắc phục điểm yếu:[/bold yellow] Chuyên gia sa thải: [red]{event_dict.get('retired_advisor')}[/red]\n"
            f"[bold green]Chuyên gia mới thay thế:[/bold green] [bold cyan]{event_dict.get('candidate_name')}[/bold cyan]\n"
            f"[bold]Kết quả Out-Of-Sample của tân chuyên gia:[/bold] "
            f"Sharpe: [cyan]{cand_m.get('sharpe_ratio', 0.0):.2f}[/cyan] | "
            f"CAGR: [green]{cagr_str}[/green] | "
            f"MDD: [red]{cand_m.get('max_drawdown_pct', 0.0):.1f}%[/red]",
            title="[bold blue]HỘI ĐỒNG TIẾN HÓA AI (GENETIC BREEDING & REPLACEMENT)[/bold blue]",
            border_style="blue"
        )
        console.print(p)

    @staticmethod
    def plot_equity_curves(
        results: Dict[str, BacktestResult],
        benchmark_df: Optional[pd.DataFrame],
        save_path: Optional[Path] = None
    ):
        """Plot comparative equity curves using matplotlib."""
        try:
            import matplotlib.pyplot as plt
            import matplotlib.dates as mdates

            plt.figure(figsize=(12, 6))
            
            for name, res in results.items():
                df = res.nav_series
                if not df.empty:
                    # Normalize to 100
                    base_nav = df["nav"].iloc[0]
                    norm = (df["nav"] / base_nav) * 100.0
                    plt.plot(df["time"], norm, label=name, linewidth=1.8)

            # Benchmark
            if benchmark_df is not None and not benchmark_df.empty:
                b_df = benchmark_df.copy().sort_values("time")
                base_b = b_df["close"].iloc[0]
                norm_b = (b_df["close"] / base_b) * 100.0
                plt.plot(b_df["time"], norm_b, label="VN-Index (Thị trường chung)", color="black", linestyle="--", linewidth=1.5, alpha=0.7)

            plt.title("ĐƯỜNG CONG TÀI SẢN (EQUITY CURVE) - CÁC CHUYÊN GIA AI VS VN-INDEX", fontsize=13, fontweight="bold")
            plt.xlabel("Thời gian", fontsize=10)
            plt.ylabel("Tăng trưởng NAV (Gốc = 100)", fontsize=10)
            plt.legend(loc="upper left")
            plt.grid(True, linestyle=":", alpha=0.6)
            plt.tight_layout()

            if save_path:
                save_path.parent.mkdir(parents=True, exist_ok=True)
                plt.savefig(save_path, dpi=300)
                console.print(f"[green]Đã lưu biểu đồ so sánh NAV tại:[/green] {save_path}")
            plt.close()
        except Exception as e:
            console.print(f"[yellow]Không thể vẽ biểu đồ do: {e}[/yellow]")
