"""
Risk Management Engine.
Enforces Stop-Loss, Trailing Stop-Profit, and Macro Market Regime Circuit Breakers.
Protects advisors from severe drawdowns during VN-Index bear phases (e.g. 2022).
"""
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional, Any
import pandas as pd
from .position_tracker import PositionTracker


@dataclass
class RiskParameters:
    market: str = "VN"                          # "VN" or "US"
    stop_loss_pct: float = -0.060               # -6.0% chuẩn hóa theo biên độ HOSE (+/-7%), US dùng -4.5%
    breakeven_trigger_pct: float = 0.055        # Kích hoạt chốt hòa vốn khi lãi đạt +5.5%
    breakeven_floor_pct: float = 0.007          # Đưa stop-loss lên +0.7% (bảo toàn lãi tối thiểu sau phí thuế)
    # Tầng 1: Thu hoạch đà tăng sớm (+12% -> +25%)
    trailing_tier1_activation_pct: float = 0.12 # Kích hoạt trailing stop khi lãi đạt +12%
    trailing_tier1_callback_pct: float = 0.045  # Chốt lời nếu điều chỉnh 4.5% từ đỉnh
    trailing_tier1_floor_pct: float = 0.060     # Khóa sàn lãi tối thiểu +6.0%
    # Tầng 2: Nuôi xu hướng tăng trưởng (+25% -> +50%)
    trailing_tier2_activation_pct: float = 0.25 # Kích hoạt trailing stop khi lãi đạt +25%
    trailing_tier2_callback_pct: float = 0.075  # Nới biên độ điều chỉnh 7.5% cho siêu cổ phiếu bứt phá
    trailing_tier2_floor_pct: float = 0.150     # Khóa sàn lãi tối thiểu +15.0%
    # Tầng 3: Siêu sóng Super-Runner (>= +50%)
    trailing_tier3_activation_pct: float = 0.50 # Kích hoạt cho các siêu cổ phiếu tăng > 50%
    trailing_tier3_callback_pct: float = 0.120  # Biên độ rung lắc 12% để gồng hết chu kỳ lớn
    trailing_tier3_floor_pct: float = 0.350     # Khóa sàn lãi tối thiểu +35.0%
    max_portfolio_drawdown_limit: float = -0.15 # -15% portfolio emergency cashout
    bear_regime_cash_target: float = 0.50      # Keep 50% cash when benchmark is in bear downtrend

    # HOSE-optimized ATR & Position Risk Parameters
    stop_loss_atr_mult: float = 2.0             # 1.8–2.2x ATR(14) tối ưu cho biến động HOSE (+/-7%)
    trailing_atr_mult: float = 2.0              # Trailing stop theo 2.0x ATR hoặc EMA 15
    risk_per_trade_nav_pct: float = 0.007       # 0.5%–0.8% NAV rủi ro mỗi vị thế
    max_portfolio_risk_pct: float = 0.045       # Tổng rủi ro mở đồng thời <= 4.0%–5.0% NAV (tối đa 5–7 vị thế)
    time_stop_sessions: int = 30                # Time-stop 25–30 phiên nếu không bứt phá
    min_liquidity_shares_20d: int = 1_000_000   # Thanh khoản tối thiểu 1–2 triệu CP/phiên hoặc 20–30 tỷ ₫
    min_liquidity_value_vnd: float = 20_000_000_000

    def __post_init__(self):
        if self.market.upper() in ["US", "INTERNATIONAL"] and self.stop_loss_pct == -0.060:
            self.stop_loss_pct = -0.045  # Tighter stop-loss for US stocks (no +/-7% daily floor)
            self.stop_loss_atr_mult = 1.5


class RiskManager:
    """
    Evaluates individual positions and overarching portfolio health on every tick.
    Enforces Hard Stop-Loss, Breakeven Protection, and 3-Tier Asymmetric Payoff Trailing Profit.
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

            # 1. 3-Tier Asymmetric Payoff Trailing Take-Profit
            if peak_gain >= self.params.trailing_tier3_activation_pct:
                drop_from_peak = (price - peak) / (peak + 1e-9)
                if drop_from_peak <= -self.params.trailing_tier3_callback_pct and price > pos.entry_price * (1.0 + self.params.trailing_tier3_floor_pct):
                    triggers.append((symbol, f"TRAILING_PROFIT_T3_SUPER_RUNNER (Peak +{peak_gain*100:.1f}%, Pullback {drop_from_peak*100:.1f}%)"))
                    continue
            elif peak_gain >= self.params.trailing_tier2_activation_pct:
                drop_from_peak = (price - peak) / (peak + 1e-9)
                if drop_from_peak <= -self.params.trailing_tier2_callback_pct and price > pos.entry_price * (1.0 + self.params.trailing_tier2_floor_pct):
                    triggers.append((symbol, f"TRAILING_PROFIT_T2_RUNNER (Peak +{peak_gain*100:.1f}%, Pullback {drop_from_peak*100:.1f}%)"))
                    continue
            elif peak_gain >= self.params.trailing_tier1_activation_pct:
                drop_from_peak = (price - peak) / (peak + 1e-9)
                if drop_from_peak <= -self.params.trailing_tier1_callback_pct and price > pos.entry_price * (1.0 + self.params.trailing_tier1_floor_pct):
                    triggers.append((symbol, f"TRAILING_PROFIT_T1_MOMENTUM (Peak +{peak_gain*100:.1f}%, Pullback {drop_from_peak*100:.1f}%)"))
                    continue

            # 2. Breakeven Stop Protection (Once gain >= +5.5%, stop-loss is raised to +0.7% to guarantee win)
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

    @staticmethod
    def calculate_dynamic_entry_brackets(
        entry_price: float,
        atr_14: float = 0.0,
        support_price: Optional[float] = None,
        resistance_price: Optional[float] = None,
        min_rr: float = 2.85,
        atr_multiplier: float = 2.0
    ) -> Dict[str, Any]:
        """
        Calculates dynamic, volatility-adjusted Stop Loss, Target Price, and Asymmetric Reward:Risk Ratio.
        - Stop Loss adapts to 1.8–2.2x ATR (default 2.0x ATR) and swing support (strictly between -3.8% and -6.8% for HOSE).
        - Take Profit targets asymmetric payoff (minimum R:R 2.85:1, expanded if resistance pivot allows).
        """
        if entry_price <= 0:
            return {
                "entry_price": entry_price,
                "stop_loss": round(entry_price * 0.955, 2),
                "max_loss_pct": -4.5,
                "target_price": round(entry_price * 1.15, 2),
                "target_return_pct": 15.0,
                "rr_ratio": 3.33,
                "rr_string": "3.3 : 1"
            }

        # 1. Volatility Risk Distance (HOSE-optimized: 2.0x ATR)
        vol_risk = max(atr_14 * atr_multiplier, entry_price * 0.042)

        # 2. Dynamic Stop Loss anchored to Key Support
        if support_price is not None and 0 < support_price < entry_price:
            support_sl = support_price * 0.990  # 1.0% below swing low to avoid wick shakeout
            sl_price = max(entry_price * 0.932, min(entry_price * 0.962, support_sl))
        else:
            sl_price = max(entry_price * 0.932, entry_price - vol_risk)

        sl_price = round(sl_price, 2)
        risk_distance = max(0.01, entry_price - sl_price)
        max_loss_pct = round(((sl_price - entry_price) / entry_price) * 100.0, 2)

        # 3. Dynamic Take Profit & Asymmetric Payoff
        base_target = entry_price + (risk_distance * min_rr)
        if resistance_price is not None and resistance_price > entry_price:
            breakout_target = resistance_price * 1.05  # Blue sky breakout target
            target_price = max(base_target, breakout_target)
        else:
            target_price = base_target

        target_price = max(target_price, entry_price * 1.12)  # Minimum +12% target
        target_price = round(target_price, 2)
        target_return_pct = round(((target_price - entry_price) / entry_price) * 100.0, 2)
        rr_ratio = round((target_price - entry_price) / risk_distance, 2)

        return {
            "entry_price": round(entry_price, 2),
            "stop_loss": sl_price,
            "max_loss_pct": max_loss_pct,
            "target_price": target_price,
            "target_return_pct": target_return_pct,
            "rr_ratio": rr_ratio,
            "rr_string": f"{rr_ratio:.1f} : 1"
        }
