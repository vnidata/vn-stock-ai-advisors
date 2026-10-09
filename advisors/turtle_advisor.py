"""
Chuyên gia Donchian Breakout (Turtle Trading System 2 - S2).
Trend-following trung hạn theo hộp Donchian 55 phiên, thoát lệnh khi thủng đáy 20 phiên,
quản trị rủi ro bằng biên độ 2N ATR(20) và quy mô vị thế theo Turtle Unit.
Tần suất giao dịch tối ưu: 6–7 lệnh/năm, triệt tiêu chi phí giao dịch trên HOSE.
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class TurtleAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Donchian Breakout (Turtle Trading System 2).
    Tần suất tái cấu trúc: Trung hạn (~45-60 ngày giao dịch / lệnh).
    Phương pháp phân bổ: Equal Weight / Inverse Volatility (Turtle Unit sizing).
    """

    def __init__(self, name: str = "AI_Advisor_Turtle_Donchian", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": 0.10,
            "w_momentum_60d": 0.20,       # Trend momentum on medium-term horizon
            "w_trend_alignment": 0.25,    # Donchian 55-day multi-barrier alignment
            "w_vol_breakout": 0.25,       # Breakout volume confirmation
            "w_relative_strength": 0.15,  # Top leading RS leaders in VN100
            "w_low_volatility": 0.00,
            "w_mean_reversion": 0.00,     # Zero mean reversion (anti-reversion)
            "w_drawdown_recovery": 0.05
        }
        super().__init__(
            name=name,
            description="Chuyên gia Donchian Breakout (Turtle S2): Phá vỡ hộp Donchian 55 ngày, thoát vị thế đáy 20 ngày, bảo vệ vốn 2N ATR(20), tối ưu hóa bằng Thuật toán Di truyền (GA).",
            rebalance_days=45,  # Medium term (~9 weeks)
            portfolio_size=5,
            allocation_method=AllocationMethod.EQUAL_WEIGHT,
            genome=genome or default_genome
        )
