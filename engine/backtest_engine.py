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
from portfolio.risk_manager import RiskManager, RiskParameters
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
        enable_risk_manager: bool = True,
        risk_params: Optional[RiskParameters] = None
    ):
        self.initial_capital = initial_capital
        self.rules = rules or VietnamTradingRules()
        self.enable_risk_manager = enable_risk_manager
        self.risk_params = risk_params

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
        risk_manager = RiskManager(self.risk_params) if self.enable_risk_manager else None

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

        # Precompute price lookup map for O(1) access
        price_lookup: Dict[str, Dict[Any, float]] = {}
        for sym, df in market_data_dict.items():
            if "time" in df.columns and "close" in df.columns:
                price_lookup[sym] = dict(zip(pd.to_datetime(df["time"]), df["close"].astype(float)))

        # 2. Daily simulation loop
        for current_date in trading_days:
            # Build current price map in O(1)
            current_prices = {
                sym: price_lookup[sym][current_date]
                for sym in price_lookup
                if current_date in price_lookup[sym]
            }

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
                eligible_pool = recommendation.get("eligible_pool", target_symbols)

                # A. Hysteresis Buffer Zone & Super-Runner Immunity:
                # 1. Stocks in eligible_pool (Top conviction) are retained
                # 2. Super-Runners (unrealized gain >= +20% and price >= SMA20) are protected from rebalance liquidation
                retained_held = []
                to_liquidate = []

                for s, pos in tracker.positions.items():
                    price = current_prices.get(s, pos.current_price)
                    gain = (price - pos.entry_price) / (pos.entry_price + 1e-9)

                    is_super_runner = False
                    if gain >= 0.20 and s in market_data_dict:
                        df_s = market_data_dict[s]
                        if "sma_20" in df_s.columns:
                            times = df_s["time"].values
                            t_target = np.datetime64(pd.to_datetime(current_date))
                            idx = int(np.searchsorted(times, t_target))
                            if idx > 0 and price >= float(df_s["sma_20"].iloc[idx - 1]):
                                is_super_runner = True

                    if s in eligible_pool or is_super_runner:
                        retained_held.append(s)
                    else:
                        to_liquidate.append(s)

                for held_sym in to_liquidate:
                    price = current_prices.get(held_sym, tracker.positions[held_sym].current_price)
                    tracker.execute_sell(
                        date=current_date,
                        symbol=held_sym,
                        shares_to_sell=None,
                        current_price=price,
                        reason="EXIT_TARGET_BASKET"
                    )

                # Fill available portfolio slots with highest ranked new candidates
                max_pos = advisor.portfolio_size
                slots_needed = max(0, max_pos - len(retained_held))
                new_additions = [s for s in target_symbols if s not in retained_held][:slots_needed]
                active_symbols = retained_held + new_additions

                # Re-calculate weights for active_symbols
                if active_symbols:
                    symbol_vols = {}
                    for s in active_symbols:
                        v = 0.25
                        if s in market_data_dict and "volatility_20d" in market_data_dict[s].columns:
                            times = market_data_dict[s]["time"].values
                            t_target = np.datetime64(pd.to_datetime(current_date))
                            idx = int(np.searchsorted(times, t_target))
                            if idx > 0:
                                v = float(market_data_dict[s]["volatility_20d"].iloc[idx - 1])
                        symbol_vols[s] = v

                    active_weights = advisor.allocator.allocate(
                        selected_symbols=active_symbols,
                        volatility_dict=symbol_vols
                    )
                else:
                    active_weights = {}

                # B. Execute rebalance with tolerance band (avoid micro-churn)
                current_nav = tracker.get_nav(current_prices)
                for sym, weight in active_weights.items():
                    price = current_prices.get(sym, 0.0)
                    if price <= 0:
                        continue

                    target_dollar_val = current_nav * weight
                    current_pos_val = tracker.positions[sym].market_value if sym in tracker.positions else 0.0

                    if sym not in tracker.positions:
                        # New position entry: enter with target budget
                        if target_dollar_val > 0:
                            tracker.execute_buy(
                                date=current_date,
                                symbol=sym,
                                target_amount=target_dollar_val,
                                current_price=price,
                                reason="REBALANCE_TARGET_TOP5"
                            )
                    elif target_dollar_val > current_pos_val * 1.25:
                        # Significantly underweight by > 25%: top up position
                        buy_budget = target_dollar_val - current_pos_val
                        tracker.execute_buy(
                            date=current_date,
                            symbol=sym,
                            target_amount=buy_budget,
                            current_price=price,
                            reason="REBALANCE_TARGET_TOP5"
                        )
                    elif current_pos_val > target_dollar_val * 1.30:
                        # Significantly overweight by > 30%: trim excess
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
                    "recommended_top5": active_symbols,
                    "target_weights": active_weights
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
