"""
Base AI Advisor class defining the standard interface for all portfolio managers.
Provides standardized factor scoring, Point-in-Time safety, and genetic representation.
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
import copy
import random
import numpy as np
import pandas as pd
from portfolio.allocation import PortfolioAllocator, AllocationMethod
from data.universe import StockUniverse


class BaseAdvisor(ABC):
    """
    Abstract AI Portfolio Advisor base class.
    Every advisor possesses a 'genome' (factor weighting matrix and execution parameters)
    that can be analyzed, adapted, and genetically bred to eliminate weaknesses.
    """

    def __init__(
        self,
        name: str,
        description: str,
        rebalance_days: int = 21,
        portfolio_size: int = 5,
        allocation_method: AllocationMethod = AllocationMethod.EQUAL_WEIGHT,
        genome: Optional[Dict[str, float]] = None
    ):
        self.name = name
        self.description = description
        self.rebalance_days = rebalance_days
        self.portfolio_size = portfolio_size
        self.allocation_method = allocation_method
        self.allocator = PortfolioAllocator(method=allocation_method)
        self.universe_manager = StockUniverse()

        # Quantitative factor genome
        # Default balanced weights across factor categories
        self.genome: Dict[str, float] = genome or {
            "w_momentum_20d": 0.20,
            "w_momentum_60d": 0.15,
            "w_trend_alignment": 0.20,
            "w_vol_breakout": 0.15,
            "w_relative_strength": 0.15,
            "w_low_volatility": 0.05,
            "w_mean_reversion": 0.05,
            "w_drawdown_recovery": 0.05
        }
        self.normalize_genome()

    def normalize_genome(self):
        """Ensure factor weights sum to 1.0."""
        total = sum(self.genome.values())
        if total > 0:
            self.genome = {k: v / total for k, v in self.genome.items()}

    def score_symbol(
        self,
        symbol: str,
        df: pd.DataFrame,
        as_of_date: pd.Timestamp,
        benchmark_df: Optional[pd.DataFrame] = None
    ) -> float:
        """
        Point-in-Time quantitative scoring function for a single stock.
        Uses strictly past data prior to as_of_date.
        """
        # High-performance Point-in-Time indexing via searchsorted
        times = df["time"].values
        target = np.datetime64(pd.to_datetime(as_of_date))
        idx = int(np.searchsorted(times, target))
        if idx < 30:
            return -999.0

        latest = df.iloc[idx - 1]
        
        # Strict Conviction Gate 1: Macro Market Regime Check
        if benchmark_df is not None and not benchmark_df.empty:
            bm_times = benchmark_df["time"].values
            bm_idx = int(np.searchsorted(bm_times, target))
            if bm_idx > 50:
                bm_latest = benchmark_df.iloc[bm_idx - 1]
                bm_close = bm_latest["close"]
                bm_sma50 = bm_latest.get("sma_50", bm_close)
                bm_sma20 = bm_latest.get("sma_20", bm_close)
                if bm_close < bm_sma50 and bm_sma20 < bm_sma50:
                    # Bear regime: Only allow top leaders with RS > 75 and price > SMA50
                    if latest.get("rs_rating", 50.0) < 75.0 or latest.get("close", 0) < latest.get("sma_50", 99999):
                        return -999.0

        # Strict Conviction Gate 2: Quality & Trend Direction
        # Avoid crashing stocks or severe breakdowns below SMA50
        dist_sma50 = latest.get("dist_sma50", 0.0)
        rsi_14 = latest.get("rsi_14", 50.0)
        rs_rating_raw = latest.get("rs_rating", 50.0)

        if dist_sma50 < -0.04 or rsi_14 < 42.0 or rs_rating_raw < 52.0:
            return -999.0

        # 1. Momentum factors
        roc_20 = latest.get("roc_20", 0.0)
        roc_60 = latest.get("roc_60", 0.0)
        
        # 2. Trend Alignment (Price > SMA20 > SMA50 > SMA200)
        trend_align = latest.get("bullish_alignment", 0.0)
        dist_sma20 = latest.get("dist_sma20", 0.0)

        # 3. Volume Flow / Breakout
        vol_ratio = latest.get("vol_ratio", 1.0)
        obv_trend = latest.get("obv_trend", 0.0)

        # 4. Relative Strength vs VN-Index
        rs_rating = rs_rating_raw / 100.0  # Normalize to [0, 1]

        # 5. Low Volatility factor (Lower volatility = higher score)
        vol_20d = latest.get("volatility_20d", 0.30)
        low_vol_score = 1.0 / (1.0 + vol_20d)

        # 6. Mean Reversion factor (RSI oversold bounce)
        mean_rev_score = (50.0 - rsi_14) / 50.0 if rsi_14 < 45 else 0.0

        # 7. Drawdown Recovery (Proximity to 52w high)
        dist_52w = latest.get("dist_52w_high", -0.20)
        dd_score = 1.0 + max(dist_52w, -0.50)

        # Weighted combination from genome
        g = self.genome
        score = (
            g.get("w_momentum_20d", 0.0) * roc_20 +
            g.get("w_momentum_60d", 0.0) * roc_60 +
            g.get("w_trend_alignment", 0.0) * (trend_align + dist_sma20) +
            g.get("w_vol_breakout", 0.0) * (vol_ratio * 0.5 + obv_trend * 0.5) +
            g.get("w_relative_strength", 0.0) * rs_rating +
            g.get("w_low_volatility", 0.0) * low_vol_score +
            g.get("w_mean_reversion", 0.0) * mean_rev_score +
            g.get("w_drawdown_recovery", 0.0) * dd_score
        )
        return float(score)

    def recommend_portfolio(
        self,
        as_of_date: pd.Timestamp,
        market_data_dict: Dict[str, pd.DataFrame],
        benchmark_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Any]:
        """
        Evaluate universe and produce Top 5 stock recommendations + target weights.
        """
        # Step 1: Point-in-time liquidity filter (Top 30 liquid stocks)
        liquid_pool = self.universe_manager.filter_liquid_universe(
            market_data_dict=market_data_dict,
            as_of_date=as_of_date,
            top_n=30
        )

        # Step 2: Score all candidate equities in the liquid pool
        symbol_scores = {}
        symbol_vols = {}

        for sym in liquid_pool:
            if sym not in market_data_dict or sym == "VNINDEX":
                continue
            df = market_data_dict[sym]
            score = self.score_symbol(sym, df, as_of_date, benchmark_df)
            if score > -900:
                symbol_scores[sym] = score
                times = df["time"].values
                target = np.datetime64(pd.to_datetime(as_of_date))
                idx = int(np.searchsorted(times, target))
                past_vol = float(df["volatility_20d"].iloc[idx - 1]) if ("volatility_20d" in df.columns and idx > 0) else 0.25
                symbol_vols[sym] = past_vol

        # Step 3: Select Top N (default 5) with positive conviction
        sorted_symbols = sorted(symbol_scores.keys(), key=lambda s: symbol_scores[s], reverse=True)
        qualified_symbols = [s for s in sorted_symbols if symbol_scores[s] > 0.0]
        top_symbols = qualified_symbols[:self.portfolio_size]
        eligible_pool = qualified_symbols[:max(8, self.portfolio_size + 3)]

        # Step 4: Allocate capital weights
        target_weights = self.allocator.allocate(
            selected_symbols=top_symbols,
            volatility_dict=symbol_vols,
            scores_dict={s: symbol_scores[s] for s in top_symbols}
        )

        return {
            "advisor_name": self.name,
            "as_of_date": as_of_date,
            "top_symbols": top_symbols,
            "eligible_pool": eligible_pool,
            "scores": {s: round(symbol_scores[s], 4) for s in top_symbols},
            "target_weights": target_weights
        }

    def clone(self, new_name: Optional[str] = None) -> "BaseAdvisor":
        """Deep copy of the advisor."""
        cloned = copy.deepcopy(self)
        if new_name:
            cloned.name = new_name
        return cloned

    def mutate_genome(self, mutation_rate: float = 0.15) -> "BaseAdvisor":
        """
        Perturbs the factor weighting genome slightly to explore better parameter spaces.
        """
        for factor in self.genome.keys():
            if random.random() < 0.5:
                delta = (random.random() - 0.5) * 2.0 * mutation_rate
                self.genome[factor] = max(0.01, self.genome[factor] + delta)
        self.normalize_genome()
        return self
