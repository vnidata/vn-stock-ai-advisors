"""
Performance metrics calculation engine.
Calculates key financial and statistical metrics:
- Total Return (%)
- Compound Annual Growth Rate (CAGR %)
- Alpha vs VN-Index (%/year)
- Portfolio Beta
- Maximum Drawdown (MDD %)
- Sharpe Ratio (annualized, Rf=5.0% for Vietnam interbank/deposit rates)
- Sortino Ratio
- Calmar Ratio
- Win Rate (%) & Profit Factor
- Annual Turnover Rate (vòng quay vốn / năm)
- Estimated Transaction Costs & Taxes (%/năm)
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
import numpy as np
import pandas as pd


@dataclass
class AdvisorMetrics:
    advisor_name: str
    total_return_pct: float
    cagr_pct: float
    alpha_annual_pct: float
    beta: float
    max_drawdown_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    win_rate_pct: float
    profit_factor: float
    turnover_per_year: float
    annual_cost_drag_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    start_date: str
    end_date: str
    final_nav: float
    annual_returns: Dict[int, float] = field(default_factory=dict)


class PerformanceCalculator:
    """
    Computes professional quantitative performance statistics from NAV series and trade logs.
    """

    @staticmethod
    def calculate(
        advisor_name: str,
        nav_df: pd.DataFrame,
        trade_history: List[Any],
        benchmark_df: Optional[pd.DataFrame] = None,
        initial_capital: float = 1_000_000_000.0,
        risk_free_rate: float = 0.05  # 5% annual risk-free rate for Vietnam
    ) -> AdvisorMetrics:
        """
        Calculates all portfolio metrics.
        """
        if nav_df is None or nav_df.empty or len(nav_df) < 2:
            return AdvisorMetrics(
                advisor_name=advisor_name,
                total_return_pct=0.0, cagr_pct=0.0, alpha_annual_pct=0.0, beta=1.0,
                max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0, calmar_ratio=0.0,
                win_rate_pct=0.0, profit_factor=0.0, turnover_per_year=0.0, annual_cost_drag_pct=0.0,
                total_trades=0, winning_trades=0, losing_trades=0,
                start_date="", end_date="", final_nav=initial_capital
            )

        nav_df = nav_df.sort_values("time").reset_index(drop=True)
        navs = nav_df["nav"].values
        start_date = str(nav_df["time"].iloc[0].date())
        end_date = str(nav_df["time"].iloc[-1].date())
        days_span = (nav_df["time"].iloc[-1] - nav_df["time"].iloc[0]).days
        years_span = max(days_span / 365.25, 0.05)

        # 1. Total Return & CAGR
        final_nav = navs[-1]
        total_return = (final_nav - initial_capital) / initial_capital
        cagr = (final_nav / initial_capital) ** (1.0 / years_span) - 1.0

        # 2. Daily Returns & Volatility
        daily_ret = nav_df["daily_return"].values
        daily_rf = (1.0 + risk_free_rate) ** (1.0 / 250) - 1.0
        excess_daily_ret = daily_ret - daily_rf
        mean_excess = np.mean(excess_daily_ret)
        std_ret = np.std(daily_ret, ddof=1) if len(daily_ret) > 1 else 1e-4

        # Sharpe Ratio
        sharpe = (mean_excess / (std_ret + 1e-9)) * np.sqrt(250) if std_ret > 0 else 0.0

        # Downside Deviation & Sortino Ratio
        downside_ret = daily_ret[daily_ret < 0]
        downside_std = np.std(downside_ret, ddof=1) if len(downside_ret) > 1 else 1e-4
        sortino = (mean_excess / (downside_std + 1e-9)) * np.sqrt(250) if downside_std > 0 else 0.0

        # 3. Maximum Drawdown (MDD)
        peak = np.maximum.accumulate(navs)
        drawdowns = (navs - peak) / (peak + 1e-9)
        max_dd = np.min(drawdowns)

        # Calmar Ratio
        calmar = cagr / abs(max_dd) if abs(max_dd) > 1e-4 else 0.0

        # 4. Benchmark Comparison (Alpha & Beta vs VN-Index)
        alpha_annual = 0.0
        beta = 1.0
        if benchmark_df is not None and not benchmark_df.empty:
            bm_df = benchmark_df.copy().sort_values("time").set_index("time")
            aligned_bm = nav_df.set_index("time").join(bm_df[["close"]], rsuffix="_bm")
            aligned_bm["bm_ret"] = aligned_bm["close"].pct_change().fillna(0)
            
            # Benchmark total return and CAGR
            if len(aligned_bm) > 10:
                bm_start_val = aligned_bm["close"].iloc[0]
                bm_end_val = aligned_bm["close"].iloc[-1]
                bm_total_ret = (bm_end_val - bm_start_val) / (bm_start_val + 1e-9)
                bm_cagr = (bm_end_val / bm_start_val) ** (1.0 / years_span) - 1.0 if bm_start_val > 0 else 0.0
                
                # Covariance & Beta
                cov_mat = np.cov(aligned_bm["daily_return"].values, aligned_bm["bm_ret"].values)
                var_bm = cov_mat[1, 1]
                if var_bm > 1e-8:
                    beta = float(cov_mat[0, 1] / var_bm)
                
                # Alpha (Excess annual return over benchmark)
                alpha_annual = cagr - bm_cagr

        # 5. Trade Statistics (Win Rate, Profit Factor)
        sell_trades = [t for t in trade_history if t.action == "SELL"]
        total_trades = len(sell_trades)
        winning_trades = len([t for t in sell_trades if t.realized_pnl > 0])
        losing_trades = len([t for t in sell_trades if t.realized_pnl <= 0])
        win_rate = (winning_trades / total_trades) if total_trades > 0 else 0.0

        gross_profits = sum(t.realized_pnl for t in sell_trades if t.realized_pnl > 0)
        gross_losses = abs(sum(t.realized_pnl for t in sell_trades if t.realized_pnl < 0))
        profit_factor = (gross_profits / gross_losses) if gross_losses > 0 else (gross_profits if gross_profits > 0 else 1.0)

        # 6. Turnover & Cost Drag
        total_trade_volume = sum(t.gross_value for t in trade_history)
        avg_nav = np.mean(navs) if len(navs) > 0 else initial_capital
        turnover_per_year = (total_trade_volume / avg_nav) / years_span if years_span > 0 else 0.0

        total_costs = sum(t.fees + t.tax for t in trade_history)
        annual_cost_drag = (total_costs / avg_nav) / years_span if years_span > 0 else 0.0

        # 7. Annual Returns Breakdown
        annual_returns = {}
        temp_nav = nav_df.copy()
        temp_nav["year"] = pd.to_datetime(temp_nav["time"]).dt.year
        for yr, grp in temp_nav.groupby("year"):
            start_val = grp["nav"].iloc[0]
            end_val = grp["nav"].iloc[-1]
            ret = ((end_val - start_val) / start_val) * 100.0 if start_val > 0 else 0.0
            annual_returns[int(yr)] = round(float(ret), 1)

        return AdvisorMetrics(
            advisor_name=advisor_name,
            total_return_pct=float(total_return * 100.0),
            cagr_pct=float(cagr * 100.0),
            alpha_annual_pct=float(alpha_annual * 100.0),
            beta=float(beta),
            max_drawdown_pct=float(max_dd * 100.0),
            sharpe_ratio=float(sharpe),
            sortino_ratio=float(sortino),
            calmar_ratio=float(calmar),
            win_rate_pct=float(win_rate * 100.0),
            profit_factor=float(profit_factor),
            turnover_per_year=float(turnover_per_year),
            annual_cost_drag_pct=float(annual_cost_drag * 100.0),
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
            start_date=start_date,
            end_date=end_date,
            final_nav=float(final_nav),
            annual_returns=annual_returns
        )
