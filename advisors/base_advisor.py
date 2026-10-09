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
        times = pd.to_datetime(df["time"]).values
        target = np.datetime64(pd.to_datetime(as_of_date))
        idx = int(np.searchsorted(times, target))
        if idx < 30:
            return -999.0

        latest = df.iloc[idx - 1]
        
        # Strict Conviction Gate 1: Macro Market Regime Check
        if benchmark_df is not None and not benchmark_df.empty:
            bm_times = pd.to_datetime(benchmark_df["time"]).values
            bm_idx = int(np.searchsorted(bm_times, target))
            if bm_idx > 50:
                bm_latest = benchmark_df.iloc[bm_idx - 1]
                bm_close = bm_latest["close"]
                bm_sma50 = bm_latest.get("sma_50", bm_close)
                bm_sma20 = bm_latest.get("sma_20", bm_close)
                is_bear = (bm_close < bm_sma50 and bm_close < bm_sma20) or (bm_close < bm_sma50 and bm_sma20 < bm_sma50)
                if is_bear:
                    # Bear regime:
                    # For Mean Reversion, allow oversold recovery setups with reasonable liquidity
                    if "Mean_Reversion" in self.name:
                        if latest.get("rs_rating", 50.0) < 35.0 or latest.get("close", 0) <= 0:
                            return -999.0
                    else:
                        # Trend/Growth: Only allow resilient leaders holding above/near SMA50 with solid RS
                        if latest.get("rs_rating", 50.0) < 48.0 or latest.get("close", 0) < latest.get("sma_50", 99999) * 0.98:
                            return -999.0

        # Strict Conviction Gate 2: Quality & Trend Direction
        # Avoid crashing stocks, severe breakdowns, or weak RS
        dist_sma50 = latest.get("dist_sma50", 0.0)
        dist_sma20 = latest.get("dist_sma20", 0.0)
        rsi_14 = latest.get("rsi_14", 50.0)
        rs_rating_raw = latest.get("rs_rating", 50.0)
        dist_52w = latest.get("dist_52w_high", -0.20)

        if "Mean_Reversion" in self.name:
            # Mean Reversion: focuses on oversold pullback/bounce setups, not penalized for low RSI
            if dist_52w < -0.45 or latest.get("close", 0.0) <= 0.0 or rs_rating_raw < 35.0:
                return -999.0
        else:
            # Trend, Momentum, and Growth advisors gating
            if dist_sma50 < -0.05 or dist_sma20 < -0.03 or rsi_14 < 42.0 or rs_rating_raw < 48.0:
                return -999.0

        # Standardized Factor Scoring Engine (normalized to balanced [0.0, 1.0] scale)
        # Eliminates factor scale mismatch so genome weights reflect true intended contribution.

        # 1. Momentum factors (normalized to [-1.0, 1.0])
        roc_20 = latest.get("roc_20", 0.0)
        roc_60 = latest.get("roc_60", 0.0)
        norm_mom_20 = float(np.clip(roc_20 / 0.15, -1.0, 1.0))
        norm_mom_60 = float(np.clip(roc_60 / 0.30, -1.0, 1.0))

        # 2. Trend Alignment (Price > SMA20 > SMA50 > SMA200)
        trend_align = float(latest.get("bullish_alignment", 0.0))
        norm_trend = float(0.6 * trend_align + 0.4 * np.clip(dist_sma20 / 0.08, -1.0, 1.0))

        # 3. Volume Flow / Breakout (with VSA effort vs result & pocket pivot)
        vol_ratio = float(latest.get("vol_ratio", 1.0))
        obv_trend = float(latest.get("obv_trend", 0.0))
        pocket_pivot = float(latest.get("pocket_pivot", 0.0))
        norm_vol = float(np.clip((vol_ratio - 1.0) / 1.5, -0.5, 1.0))
        vol_score = float(0.5 * norm_vol + 0.3 * obv_trend + 0.2 * pocket_pivot)

        # 4. Relative Strength vs VN-Index (normalized to [0.0, 1.0])
        rs_score = float(np.clip(rs_rating_raw / 100.0, 0.0, 1.0))

        # 5. Low Volatility factor (Lower volatility = higher score in [0.0, 1.0])
        vol_20d = float(latest.get("volatility_20d", 0.30))
        low_vol_score = float(np.clip(1.0 - (vol_20d / 0.50), 0.0, 1.0))

        # 6. Mean Reversion factor (RSI oversold bounce + positive momentum slope)
        rsi_slope = float(latest.get("rsi_slope_5d", 0.0))
        if rsi_14 < 45.0:
            mean_rev_score = float(np.clip((45.0 - rsi_14) / 25.0 + (0.2 if rsi_slope > 0 else 0.0), 0.0, 1.0))
        else:
            mean_rev_score = 0.0

        # 7. Drawdown Recovery (Proximity to 52w high)
        dd_score = float(np.clip(1.0 + (dist_52w / 0.35), 0.0, 1.0))

        # Weighted combination from genome
        g = self.genome
        score = (
            g.get("w_momentum_20d", 0.0) * norm_mom_20 +
            g.get("w_momentum_60d", 0.0) * norm_mom_60 +
            g.get("w_trend_alignment", 0.0) * norm_trend +
            g.get("w_vol_breakout", 0.0) * vol_score +
            g.get("w_relative_strength", 0.0) * rs_score +
            g.get("w_low_volatility", 0.0) * low_vol_score +
            g.get("w_mean_reversion", 0.0) * mean_rev_score +
            g.get("w_drawdown_recovery", 0.0) * dd_score
        )
        return float(score)

    def recommend_portfolio(
        self,
        as_of_date: pd.Timestamp,
        market_data_dict: Dict[str, pd.DataFrame],
        benchmark_df: Optional[pd.DataFrame] = None,
        news_sentiment_dict: Optional[Dict[str, Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Evaluate universe, re-evaluate news sentiment/disclosures/red flags,
        and produce Top 5 stock recommendations + target weights.
        """
        # Step 1: Point-in-time liquidity filter (Top 30 liquid stocks)
        liquid_pool = self.universe_manager.filter_liquid_universe(
            market_data_dict=market_data_dict,
            as_of_date=as_of_date,
            top_n=30
        )

        # Step 2: Score all candidate equities in the liquid pool with News Re-evaluation
        symbol_scores = {}
        symbol_vols = {}
        news_re_eval_notes = {}

        for sym in liquid_pool:
            if sym not in market_data_dict or sym == "VNINDEX":
                continue
            df = market_data_dict[sym]
            score = self.score_symbol(sym, df, as_of_date, benchmark_df)
            if score <= -900:
                continue

            # News Sentiment & Red Flag Re-evaluation Gate
            if news_sentiment_dict and sym in news_sentiment_dict:
                news_info = news_sentiment_dict[sym]
                # 1. Red Flag Veto Check: abnormal news / legal / audit disqualification
                if news_info.get("has_red_flag") or news_info.get("re_eval_action") in ["VETO_REJECT", "EMERGENCY_SELL"]:
                    news_re_eval_notes[sym] = "BỊ PHỦ QUYẾT: Xuất hiện tin tức bất thường / rủi ro nghiêm trọng"
                    continue  # Veto: Disqualify from recommendation basket!

                # 2. Catalyst Boost Check
                mult = news_info.get("sentiment_multiplier", 1.0)
                if mult != 1.0:
                    score = score * mult
                    news_re_eval_notes[sym] = f"ĐIỀU CHỈNH TIN TỨC: Hệ số {mult:.2f}x ({news_info.get('status', '')})"

            symbol_scores[sym] = score
            times = pd.to_datetime(df["time"]).values
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

        confidence_scores = {
            s: self.calculate_confidence_score(s, market_data_dict[s], as_of_date)
            for s in top_symbols if s in market_data_dict
        }

        return {
            "advisor_name": self.name,
            "as_of_date": as_of_date,
            "top_symbols": top_symbols,
            "eligible_pool": eligible_pool,
            "scores": {s: round(symbol_scores[s], 4) for s in top_symbols},
            "confidence_scores": confidence_scores,
            "target_weights": target_weights,
            "news_re_eval_notes": news_re_eval_notes
        }

    def calculate_confidence_score(
        self,
        symbol: str,
        df: pd.DataFrame,
        as_of_date: pd.Timestamp
    ) -> int:
        """
        Calculates an institutional-grade, multi-layer AI Confidence Score (0 - 100%)
        evaluating 4 core pillars (25% each):
        1. Trend Structure (Bullish Alignment, MA20/MA50 relationship)
        2. Volume & Institutional Accumulation (Vol Breakout, Pocket Pivot, OBV Trend)
        3. Relative Strength (RS Rating vs VN-Index benchmark)
        4. Setup Quality & Momentum Acceleration (Bollinger Squeeze, MACD Slope, RSI Momentum)
        """
        times = pd.to_datetime(df["time"]).values
        target = np.datetime64(pd.to_datetime(as_of_date))
        idx = int(np.searchsorted(times, target))
        if idx < 5:
            return 75
        latest = df.iloc[idx - 1]

        # Pillar 1: Trend Quality & Alignment (max 25 pts)
        p1 = 5.0  # baseline
        c = float(latest.get("close", 0.0))
        s20 = float(latest.get("sma_20", 0.0))
        s50 = float(latest.get("sma_50", 0.0))
        if c > s20:
            p1 += 7.0
        if c > s50:
            p1 += 6.0
        if s20 > s50:
            p1 += 4.0
        if latest.get("bullish_alignment", 0.0) == 1.0:
            p1 += 3.0
        p1 = min(25.0, p1)

        # Pillar 2: Volume & Institutional Flow (max 25 pts)
        p2 = 8.0  # baseline for liquid universe
        vol_ratio = float(latest.get("vol_ratio", 1.0))
        if vol_ratio >= 1.3:
            p2 += 8.0
        elif vol_ratio >= 1.0:
            p2 += 5.0
        elif vol_ratio >= 0.8:
            p2 += 3.0
        if latest.get("pocket_pivot", 0) == 1:
            p2 += 5.0
        if latest.get("obv_trend", 0) == 1:
            p2 += 4.0
        p2 = min(25.0, p2)

        # Pillar 3: Relative Strength vs Benchmark (max 25 pts)
        rs = float(latest.get("rs_rating", 50.0))
        if rs >= 80:
            p3 = 25.0
        elif rs >= 70:
            p3 = 22.0
        elif rs >= 60:
            p3 = 19.0
        elif rs >= 50:
            p3 = 16.0
        elif rs >= 40:
            p3 = 13.0
        else:
            p3 = 9.0

        # Pillar 4: Setup Pattern & Momentum Acceleration (max 25 pts)
        p4 = 8.0  # baseline technical setup
        if latest.get("bb_squeeze", 0) == 1:
            p4 += 6.0  # Volatility contraction setup
        if float(latest.get("macd_hist_slope", 0.0)) > 0:
            p4 += 4.0  # MACD momentum accelerating
        rsi = float(latest.get("rsi_14", 50.0))
        rsi_slope = float(latest.get("rsi_slope_5d", 0.0))
        if (35.0 <= rsi <= 65.0) or rsi_slope > 0:
            p4 += 4.0  # RSI expansion or healthy range
        dist_supp = float(latest.get("dist_support", 0.05))
        if 0.0 <= dist_supp <= 0.05:
            p4 += 3.0  # Low risk near 20d support
        p4 = min(25.0, p4)

        total_confidence = int(round(p1 + p2 + p3 + p4))
        return max(60, min(96, total_confidence))

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
