"""
Chuyên gia Đảo Chiều Thống Kê (Statistical Mean-Reversion Specialist).
Specializes in oversold bounce trading, RSI extreme divergence, and Bollinger Band compressions.
Can be prone to whipsaws in trending markets (a key weakness to diagnose & evolve).
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class MeanReversionAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Đảo Chiều Thống Kê & Bắt Đáy Kỹ Thuật.
    Tần suất tái cấu trúc: 2 tuần / lần (10 ngày giao dịch).
    Phương pháp phân bổ: Equal Weight.
    """

    def __init__(self, name: str = "AI_Advisor_Mean_Reversion", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": -0.15,      # Prefers negative recent return (dip buying)
            "w_momentum_60d": 0.05,
            "w_trend_alignment": 0.05,
            "w_vol_breakout": 0.10,
            "w_relative_strength": 0.05,
            "w_low_volatility": 0.10,
            "w_mean_reversion": 0.45,     # Very high reliance on RSI oversold and %B
            "w_drawdown_recovery": 0.35   # Buys deeply discounted stocks
        }
        super().__init__(
            name=name,
            description="Chuyên gia Đảo Chiều Thống Kê: Bắt nhịp hồi kỹ thuật của các cổ phiếu cơ bản bị bán quá đà (oversold). Thường có điểm yếu là gồng lỗ nếu thị trường vào downtrend kéo dài.",
            rebalance_days=10,
            portfolio_size=5,
            allocation_method=AllocationMethod.EQUAL_WEIGHT,
            genome=genome or default_genome
        )
