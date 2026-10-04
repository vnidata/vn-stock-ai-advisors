"""
Statistics Collector and Multi-Advisor League Leaderboard.
Collects backtest results across all advisors, constructs benchmarked comparison matrices,
ranks advisors by risk-adjusted alpha, and identifies top performers vs underperformers.
"""
from typing import List, Dict, Any, Tuple
import pandas as pd
from .performance_metrics import AdvisorMetrics
from .backtest_engine import BacktestResult


class StatsCollector:
    """
    Orchestrates the evaluation of multiple AI Advisors, providing unified comparative
    analytics and league ranking.
    """

    def __init__(self):
        self.results: Dict[str, BacktestResult] = {}

    def add_result(self, result: BacktestResult):
        """Add backtest result for an advisor."""
        self.results[result.advisor_name] = result

    def get_summary_dataframe(self) -> pd.DataFrame:
        """
        Produce a formatted DataFrame summarizing all advisor performance metrics.
        """
        rows = []
        for name, res in self.results.items():
            m = res.metrics
            rows.append({
                "Advisor Name": m.advisor_name,
                "Total Return (%)": round(m.total_return_pct, 1),
                "CAGR (%)": round(m.cagr_pct, 1),
                "Alpha vs VN-Index (%/y)": round(m.alpha_annual_pct, 1),
                "Beta": round(m.beta, 2),
                "Max Drawdown (%)": round(m.max_drawdown_pct, 1),
                "Sharpe": round(m.sharpe_ratio, 2),
                "Sortino": round(m.sortino_ratio, 2),
                "Calmar": round(m.calmar_ratio, 2),
                "Win Rate (%)": round(m.win_rate_pct, 1),
                "Profit Factor": round(m.profit_factor, 2),
                "Turnover (x/y)": round(m.turnover_per_year, 1),
                "Cost Drag (%/y)": round(m.annual_cost_drag_pct, 2),
                "Trades": m.total_trades,
                "Final NAV (M VND)": round(m.final_nav / 1_000_000, 1)
            })

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows)
        # Compute composite quality score = Sharpe * 0.4 + Calmar * 0.3 + (Alpha/10) * 0.3
        df["Score"] = (
            (df["Sharpe"] * 0.40) +
            (df["Calmar"] * 0.30) +
            ((df["Alpha vs VN-Index (%/y)"] / 10.0) * 0.30)
        ).round(2)

        return df.sort_values(by="Score", ascending=False).reset_index(drop=True)

    def identify_cohorts(
        self, top_ratio: float = 0.25, bottom_ratio: float = 0.25
    ) -> Tuple[List[str], List[str]]:
        """
        Classifies advisors into:
        - Top Performers (Top cohort for genetic breeding and factor extraction)
        - Underperformers (Bottom cohort for weakness diagnosis and replacement)
        """
        df = self.get_summary_dataframe()
        if df.empty:
            return [], []

        n = len(df)
        top_count = max(1, int(n * top_ratio))
        bottom_count = max(1, int(n * bottom_ratio))

        top_performers = df["Advisor Name"].head(top_count).tolist()
        underperformers = df["Advisor Name"].tail(bottom_count).tolist()

        return top_performers, underperformers
