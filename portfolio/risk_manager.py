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
    stop_loss_pct: float = -0.045               # -4.5% tight stop loss
    trailing_stop_activation_pct: float = 0.15 # Activate trailing stop at +15% profit
    trailing_stop_callback_pct: float = 0.04   # Sell if drops 4% from high watermark
    max_portfolio_drawdown_limit: float = -0.15 # -15% portfolio emergency cashout
    bear_regime_cash_target: float = 0.50      # Keep 50% cash when VN-Index is in bear downtrend


class RiskManager:
    """
    Evaluates individual positions and overarching portfolio health on every tick.
    Emits defensive actions when risk boundaries are breached.
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
        Scan all open positions for stop-loss and trailing take-profit triggers.
        Returns a list of (symbol, reason) to be liquidated.
        """
        triggers = []
        for symbol, pos in tracker.positions.items():
            price = current_prices.get(symbol, pos.current_price)
            if price <= 0:
                continue

            # Update high watermark for trailing stop
            if symbol not in self.peak_prices or price > self.peak_prices[symbol]:
                self.peak_prices[symbol] = price

            # 1. Hard Stop Loss Check
            pnl_pct = (price - pos.entry_price) / (pos.entry_price + 1e-9)
            if pnl_pct <= self.params.stop_loss_pct:
                triggers.append((symbol, f"STOP_LOSS ({pnl_pct*100:.1f}%)"))
                continue

            # 2. Trailing Stop Profit Check
            peak = self.peak_prices[symbol]
            peak_gain = (peak - pos.entry_price) / (pos.entry_price + 1e-9)
            if peak_gain >= self.params.trailing_stop_activation_pct:
                drop_from_peak = (price - peak) / (peak + 1e-9)
                if drop_from_peak <= -self.params.trailing_stop_callback_pct:
                    triggers.append((symbol, f"TRAILING_PROFIT (Peak +{peak_gain*100:.1f}%, Pullback {drop_from_peak*100:.1f}%)"))

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
