"""
Chiến lược Nhịp Nhàng (Harmony / Balanced Advisor - Gen 2 Optimized).
Target Audience: Khách hàng Cân bằng.
Characteristics: Rebalances bi-weekly to monthly (15 ngày giao dịch), balances momentum
with trend stability and risk, uses Equal Weighting (EQW).
Gen 2: Tăng phản ứng ngắn hạn (w_momentum_20d=0.25, w_vol_breakout=0.20, w_relative_strength=0.20),
giảm độ trễ MA (w_trend_alignment=0.15, w_momentum_60d=0.10), loại bỏ mean reversion & drawdown recovery.
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class HarmonyAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Chiến lược Nhịp Nhàng (Gen 2 — Optimized).
    Tần suất tái cấu trúc: 15 ngày giao dịch (~3 tuần/lần, tối ưu từ 25 ngày).
    Phương pháp phân bổ: Equal Weight (EQW - Tỷ trọng đều 20% mỗi mã).
    Khắc phục điểm yếu: Khắc phục độ trễ MA mua đỉnh, tăng độ nhạy đà tăng trưởng và dòng tiền.
    """

    def __init__(self, name: str = "AI_Advisor_NhipNhang_1M", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": 0.25,       # Tăng tốc độ phản ứng với sóng ngắn hạn (Gen 1: 0.15)
            "w_momentum_60d": 0.10,       # Giảm phụ thuộc momentum trung hạn (Gen 1: 0.20)
            "w_trend_alignment": 0.15,    # Giảm bớt độ trễ MA tránh mua đỉnh (Gen 1: 0.25)
            "w_vol_breakout": 0.20,       # Nâng cao độ tin cậy điểm nổ thanh khoản (Gen 1: 0.10)
            "w_relative_strength": 0.20,  # Tập trung cổ phiếu dẫn dắt RS cao (Gen 1: 0.15)
            "w_low_volatility": 0.10,     # Bổ sung kiểm soát rủi ro biến động (Gen 1: 0.05)
            "w_mean_reversion": 0.00,     # Loại bỏ bắt đáy yếu (Gen 1: 0.05)
            "w_drawdown_recovery": 0.00   # Loại bỏ gồng lỗ giảm giá (Gen 1: 0.05)
        }
        super().__init__(
            name=name,
            description="Chiến lược Nhịp Nhàng (Gen 2 — Optimized): Chu kỳ 15 ngày, tối ưu hóa tỷ trọng phản ứng nhanh (20d momentum, RS, vol breakout), khắc phục độ trễ mua đỉnh và cắt giảm drawdown.",
            rebalance_days=15,  # Rút ngắn từ 25 ngày xuống 15 ngày
            portfolio_size=5,
            allocation_method=AllocationMethod.EQUAL_WEIGHT,
            genome=genome or default_genome
        )
