"""
Chuyên gia Dòng Tiền & Tăng Trưởng (CANSLIM / VSA Breakout Specialist).
Focuses on explosive volume surges (VSA), high Relative Strength (RS > 80),
and technical pivots near 52-week highs.
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class CanslimAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Dòng Tiền & Tăng Trưởng CANSLIM/VSA.
    Tần suất tái cấu trúc: 2 tuần / lần (10 ngày giao dịch).
    Phương pháp phân bổ: Equal Weight.
    """

    def __init__(self, name: str = "AI_Advisor_CANSLIM_Breakout", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": 0.20,
            "w_momentum_60d": 0.20,
            "w_trend_alignment": 0.20,
            "w_vol_breakout": 0.25,       # Heavy emphasis on institutional volume ignition
            "w_relative_strength": 0.15,  # Top leading RS leaders in market
            "w_low_volatility": 0.00,
            "w_mean_reversion": 0.00,
            "w_drawdown_recovery": 0.00
        }
        super().__init__(
            name=name,
            description="Chuyên gia CANSLIM/VSA: Săn đón điểm bùng nổ khối lượng, dẫn dắt chỉ số RS và cổ phiếu thiết lập đỉnh cao mới.",
            rebalance_days=10,
            portfolio_size=5,
            allocation_method=AllocationMethod.EQUAL_WEIGHT,
            genome=genome or default_genome
        )
