"""
Chiến lược Bền Bỉ (Persistent / Conservative Advisor - 3M Rebalance).
Target Audience: Khách hàng Thận trọng, nhà đầu tư NAV lớn / tổ chức.
Characteristics: Quarterly rebalancing (3 tháng / lần ~ 63 ngày giao dịch), minimal turnover,
negligible cost drag (0.5%/năm), excellent drawdown defense, Risk Parity allocation.
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class PersistentAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Chiến lược Bền Bỉ.
    Tần suất tái cấu trúc: 3 tháng / lần (63 ngày giao dịch).
    Phương pháp phân bổ: Risk Parity (Nghịch đảo biến động để cân bằng đóng góp rủi ro).
    """

    def __init__(self, name: str = "AI_Advisor_BenBi_3M", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": 0.05,
            "w_momentum_60d": 0.15,
            "w_trend_alignment": 0.25,    # Multi-quarter trend resilience
            "w_vol_breakout": 0.05,
            "w_relative_strength": 0.10,
            "w_low_volatility": 0.30,     # Very high preference for low-beta, low-volatility stability
            "w_mean_reversion": 0.00,
            "w_drawdown_recovery": 0.10   # Resilience during drawdowns
        }
        super().__init__(
            name=name,
            description="Chiến lược Bền Bỉ: Tần suất 3 tháng/lần, nhắm tới khách hàng Thận trọng và NAV lớn, tối ưu hóa chi phí giao dịch, bảo toàn vốn.",
            rebalance_days=63,  # 3 months / quarter
            portfolio_size=5,
            allocation_method=AllocationMethod.RISK_PARITY,
            genome=genome or default_genome
        )
