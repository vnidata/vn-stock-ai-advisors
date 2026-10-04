"""
Chiến lược Chủ Động (Active Advisor - 2W Rebalance).
Target Audience: Khách hàng Táo bạo.
Characteristics: High trading frequency (2 tuần / lần), aggressive momentum & trend-following,
utilizes Rank Ladder allocation, captures explosive breakouts.
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class ActiveAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Chiến lược Chủ Động.
    Tần suất tái cấu trúc: 2 tuần / lần (10 ngày giao dịch).
    Phương pháp phân bổ: Rank Ladder (ưu tiên tỷ trọng cao nhất cho mã tiềm năng số 1).
    """

    def __init__(self, name: str = "AI_Advisor_ChuDong_2W", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": 0.30,       # Very high short-term momentum
            "w_momentum_60d": 0.15,
            "w_trend_alignment": 0.20,    # Strong trend confirmation
            "w_vol_breakout": 0.20,       # High volume surge / liquidity ignition
            "w_relative_strength": 0.15,  # Top RS rating leaders
            "w_low_volatility": 0.00,     # Willing to take high volatility
            "w_mean_reversion": 0.00,
            "w_drawdown_recovery": 0.00
        }
        super().__init__(
            name=name,
            description="Chiến lược Chủ Động: Tần suất 2 tuần/lần, nhắm tới khách hàng Táo bạo, tối đa hóa Alpha qua đà tăng trưởng và bùng nổ thanh khoản.",
            rebalance_days=10,  # 2 weeks
            portfolio_size=5,
            allocation_method=AllocationMethod.RANK_LADDER,
            genome=genome or default_genome
        )
