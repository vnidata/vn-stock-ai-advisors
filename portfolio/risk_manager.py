"""
Risk Management Engine.
Enforces Stop-Loss, Trailing Stop-Profit, and Macro Market Regime Circuit Breakers.
Protects advisors from severe drawdowns during VN-Index bear phases (e.g. 2022).
"""
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
import pandas as pd
from .position_tracker import PositionTracker


@dataclass
class RiskParameters:
    stop_loss_pct: float = -0.060               # -6.0% chuẩn hóa theo biên độ HOSE (+/-7%)
    breakeven_trigger_pct: float = 0.055        # Kích hoạt chốt hòa vốn khi lãi đạt +5.5%
    breakeven_floor_pct: float = 0.005          # Đưa stop-loss lên +0.5% (bù trừ phí giao dịch & thuế)
    trailing_tier1_activation_pct: float = 0.10 # Tầng 1: Kích hoạt trailing stop khi lãi đạt +10%
    trailing_tier1_callback_pct: float = 0.035  # Chốt lời nếu điều chỉnh 3.5% từ đỉnh
    trailing_tier2_activation_pct: float = 0.18 # Tầng 2: Kích hoạt trailing stop khi lãi đạt +18%
    trailing_tier2_callback_pct: float = 0.045  # Chốt lời nếu điều chỉnh 4.5% từ đỉnh
    max_portfolio_drawdown_limit: float = -0.15 # -15% portfolio emergency cashout
    bear_regime_cash_target: float = 0.50      # Keep 50% cash when VN-Index is in bear downtrend


class RiskManager:
    """
    Evaluates individual positions and overarching portfolio health on every tick.
    Enforces Hard Stop-Loss, Breakeven Protection, and Multi-Tier Trailing Profit.
    """

    def __init__(self, params: Optional[RiskParameters] = None):
        self.params = params or RiskParameters()
        self.peak_prices: Dict[str, float] = {}

    def check_position_stops(
        self,
        date: pd.Timestamp,
        tracker: PositionTracker,
        current_prices: Dict[str, float]
    ) -> List[Tuple[str, str]]:
        """
        Scan all open positions for stop-loss, breakeven protection, and trailing take-profit triggers.
        Returns a list of (symbol, reason) to be liquidated.
        """
        triggers = []
        # Clean up stale peak prices for closed positions
        active_symbols = set(tracker.positions.keys())
        for s in list(self.peak_prices.keys()):
            if s not in active_symbols:
                del self.peak_prices[s]

        for symbol, pos in tracker.positions.items():
            price = current_prices.get(symbol, pos.current_price)
            if price <= 0:
                continue

            # High watermark MUST be anchored to this position's entry price
            if symbol not in self.peak_prices:
                self.peak_prices[symbol] = max(pos.entry_price, price)
            else:
                self.peak_prices[symbol] = max(self.peak_prices[symbol], price)

            peak = self.peak_prices[symbol]
            peak_gain = (peak - pos.entry_price) / (pos.entry_price + 1e-9)
            pnl_pct = (price - pos.entry_price) / (pos.entry_price + 1e-9)

            # 1. Multi-Tier Trailing Take-Profit
            if peak_gain >= self.params.trailing_tier2_activation_pct:
                drop_from_peak = (price - peak) / (peak + 1e-9)
                if drop_from_peak <= -self.params.trailing_tier2_callback_pct and price > pos.entry_price * 1.10:
                    triggers.append((symbol, f"TRAILING_PROFIT_T2 (Peak +{peak_gain*100:.1f}%, Pullback {drop_from_peak*100:.1f}%)"))
                    continue
            elif peak_gain >= self.params.trailing_tier1_activation_pct:
                drop_from_peak = (price - peak) / (peak + 1e-9)
                if drop_from_peak <= -self.params.trailing_tier1_callback_pct and price > pos.entry_price * 1.04:
                    triggers.append((symbol, f"TRAILING_PROFIT_T1 (Peak +{peak_gain*100:.1f}%, Pullback {drop_from_peak*100:.1f}%)"))
                    continue

            # 2. Breakeven Stop Protection (Once gain >= +5.5%, stop-loss is raised to +0.5% to guarantee win)
            effective_stop = self.params.stop_loss_pct
            if peak_gain >= self.params.breakeven_trigger_pct:
                effective_stop = self.params.breakeven_floor_pct

            if pnl_pct <= effective_stop:
                if effective_stop > 0:
                    triggers.append((symbol, f"BREAKEVEN_STOP (+{pnl_pct*100:.1f}%)"))
                else:
                    triggers.append((symbol, f"STOP_LOSS ({pnl_pct*100:.1f}%)"))
                continue

        return triggers

    def detect_market_regime(self, benchmark_df: pd.DataFrame, current_date: pd.Timestamp) -> str:
        """
        Detect macro market regime (BULL, BEAR, SIDEWAYS) using VN-Index.
        - BULL: Close > SMA20 and SMA20 > SMA50
        - BEAR: Close < SMA50 and Close < SMA20
        - SIDEWAYS: Intertwined
        """
        if benchmark_df is None or benchmark_df.empty:
            return "BULL"

        past_bm = benchmark_df[benchmark_df["time"] <= current_date]
        if len(past_bm) < 50:
            return "BULL"

        tail = past_bm.tail(50)
        close = tail["close"].iloc[-1]
        sma_20 = tail["close"].tail(20).mean()
        sma_50 = tail["close"].mean()

        if close > sma_20 and sma_20 >= sma_50:
            return "BULL"
        elif close < sma_50 and close < sma_20:
            return "BEAR"
        else:
            return "SIDEWAYS"
