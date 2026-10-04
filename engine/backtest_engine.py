"""
Core Event-Driven Backtesting Engine.
Simulates daily execution on the Vietnam Stock Market with realistic settlement (T+2),
commissions, taxes, slippage, and portfolio rebalancing mechanics.
"""
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
import pandas as pd
import numpy as np
from portfolio.position_tracker import PositionTracker, TradeRecord
from portfolio.risk_manager import RiskManager
from portfolio.allocation import PortfolioAllocator, AllocationMethod
from config.trading_rules import VietnamTradingRules
from .performance_metrics import PerformanceCalculator, AdvisorMetrics


@dataclass
class BacktestResult:
    advisor_name: str
    metrics: AdvisorMetrics
    nav_series: pd.DataFrame
    trades: List[TradeRecord]
    portfolio_history: List[Dict[str, Any]]


class BacktestEngine:
    """
    Executes chronological simulation for an AI Advisor across designated historical periods.
    Guarantees strict causal information flow without forward-looking data leakage.
    """

    def __init__(
        self,
        initial_capital: float = 1_000_000_000.0,
        rules: Optional[VietnamTradingRules] = None,
        enable_risk_manager: bool = True
    ):
        self.initial_capital = initial_capital
        self.rules = rules or VietnamTradingRules()
        self.enable_risk_manager = enable_risk_manager

    def run(
        self,
        advisor: Any,
        market_data_dict: Dict[str, pd.DataFrame],
        benchmark_df: Optional[pd.DataFrame] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> BacktestResult:
        """
        Execute full backtest loop for the specified advisor.
        """
        tracker = PositionTracker(self.initial_capital, self.rules)
        risk_manager = RiskManager() if self.enable_risk_manager else None

        # 1. Determine common timeline of trading days
        all_dates = set()
        for df in market_data_dict.values():
            if "time" in df.columns:
                all_dates.update(pd.to_datetime(df["time"]))

        if benchmark_df is not None and "time" in benchmark_df.columns:
            all_dates.update(pd.to_datetime(benchmark_df["time"]))

        trading_days = sorted(list(all_dates))

        # Filter timeline by start/end date
        if start_date:
            trading_days = [d for d in trading_days if d >= pd.to_datetime(start_date)]
        if end_date:
            trading_days = [d for d in trading_days if d <= pd.to_datetime(end_date)]

        if not trading_days:
            raise ValueError("No valid trading days found in the specified date range.")

        days_since_rebalance = advisor.rebalance_days  # Force rebalance on first day
        rebalance_cycle = advisor.rebalance_days
        portfolio_snapshots = []

        # 2. Daily simulation loop
        for current_date in trading_days:
            # Build current price map
            current_prices = {}
            for sym, df in market_data_dict.items():
                row = df[df["time"] == current_date]
                if not row.empty:
                    current_prices[sym] = float(row["close"].iloc[0])

            # Check if current day is a rebalance day
            if days_since_rebalance >= rebalance_cycle:
                # Advise new Top 5 portfolio
                recommendation = advisor.recommend_portfolio(
                    as_of_date=current_date,
                    market_data_dict=market_data_dict,
                    benchmark_df=benchmark_df
                )
                
                target_weights = recommendation.get("target_weights", {})
                target_symbols = list(target_weights.keys())

                # A. Liquidate positions no longer recommended (if T+2 passed)
                for held_sym in list(tracker.positions.keys()):
                    if held_sym not in target_symbols:
                        price = current_prices.get(held_sym, tracker.positions[held_sym].current_price)
                        tracker.execute_sell(
                            date=current_date,
                            symbol=held_sym,
                            shares_to_sell=None,
                            current_price=price,
                            reason="EXIT_TARGET_BASKET"
                        )

                # B. Calculate rebalance cash allocations
                current_nav = tracker.get_nav(current_prices)
                for sym, weight in target_weights.items():
                    price = current_prices.get(sym, 0.0)
                    if price <= 0:
                        continue

                    target_dollar_val = current_nav * weight
                    current_pos_val = tracker.positions[sym].market_value if sym in tracker.positions else 0.0

                    if target_dollar_val > current_pos_val:
                        # Buy delta
                        buy_budget = target_dollar_val - current_pos_val
                        tracker.execute_buy(
                            date=current_date,
                            symbol=sym,
                            target_amount=buy_budget,
                            current_price=price,
                            reason="REBALANCE_TARGET_TOP5"
                        )
                    elif current_pos_val > target_dollar_val * 1.2:
                        # Trim position if overweight > 20%
                        excess_shares = int((current_pos_val - target_dollar_val) / price)
                        tracker.execute_sell(
                            date=current_date,
                            symbol=sym,
                            shares_to_sell=excess_shares,
                            current_price=price,
                            reason="TRIM_OVERWEIGHT"
                        )

                days_since_rebalance = 0
                portfolio_snapshots.append({
                    "date": current_date,
                    "recommended_top5": target_symbols,
                    "target_weights": target_weights
                })
            else:
                days_since_rebalance += 1

            # 3. Risk Management Checks (Stop-loss & Trailing profit on non-rebalance ticks)
            if risk_manager:
                risk_triggers = risk_manager.check_position_stops(current_date, tracker, current_prices)
                for sym, reason in risk_triggers:
                    price = current_prices.get(sym, 0.0)
                    if price > 0:
                        tracker.execute_sell(
                            date=current_date,
                            symbol=sym,
                            shares_to_sell=None,
                            current_price=price,
                            reason=reason
                        )

            # 4. Mark to market and end-of-day update
            tracker.update_day(current_date, current_prices)

        # 3. Compute final metrics
        nav_series = tracker.get_nav_series()
        metrics = PerformanceCalculator.calculate(
            advisor_name=advisor.name,
            nav_df=nav_series,
            trade_history=tracker.trade_history,
            benchmark_df=benchmark_df,
            initial_capital=self.initial_capital
        )

        return BacktestResult(
            advisor_name=advisor.name,
            metrics=metrics,
            nav_series=nav_series,
            trades=tracker.trade_history,
            portfolio_history=portfolio_snapshots
        )
