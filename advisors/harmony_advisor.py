"""
Chiến lược Nhịp Nhàng (Harmony / Balanced Advisor - 1M Rebalance).
Target Audience: Khách hàng Cân bằng.
Characteristics: Rebalances monthly (1 tháng / lần ~ 21 ngày giao dịch), balances momentum
with trend stability and risk, uses Equal Weighting (EQW).
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class HarmonyAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Chiến lược Nhịp Nhàng.
    Tần suất tái cấu trúc: 1 tháng / lần (21 ngày giao dịch).
    Phương pháp phân bổ: Equal Weight (EQW - Tỷ trọng đều 20% mỗi mã).
    """

    def __init__(self, name: str = "AI_Advisor_NhipNhang_1M", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": 0.15,
            "w_momentum_60d": 0.20,       # Emphasizes intermediate-term momentum
            "w_trend_alignment": 0.25,    # High weight on sustained moving average trends
            "w_vol_breakout": 0.10,
            "w_relative_strength": 0.15,
            "w_low_volatility": 0.05,
            "w_mean_reversion": 0.05,
            "w_drawdown_recovery": 0.05
        }
        super().__init__(
            name=name,
            description="Chiến lược Nhịp Nhàng: Tần suất ~5 tuần/lần, nhắm tới khách hàng Cân bằng, duy trì tăng trưởng ổn định và hạn chế biến động thái quá.",
            rebalance_days=25,  # ~5 weeks (25 trading days)
            portfolio_size=5,
            allocation_method=AllocationMethod.EQUAL_WEIGHT,
            genome=genome or default_genome
        )
