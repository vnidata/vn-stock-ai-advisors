"""
Chuyên gia Đảo Chiều Thống Kê (Statistical Mean-Reversion Specialist - Gen 2 Optimized).
Specializes in oversold bounce trading combined with trend alignment & relative strength.
Gen 2: Khắc phục điểm yếu bắt đáy ngược xu hướng và turnover cao (20.5x/năm):
- Rút giảm tỷ trọng mean-reversion (0.45 -> 0.15) & drawdown recovery (0.35 -> 0.10)
- Tăng cường trend alignment (0.05 -> 0.25), relative strength (0.05 -> 0.25), low volatility (0.10 -> 0.15)
- Chuyển momentum 20d từ âm sang dương (-0.15 -> +0.10)
- Nâng chu kỳ rebalance từ 10 ngày lên 20 ngày nhằm giảm triệt để chi phí giao dịch.
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class MeanReversionAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI - Đảo Chiều Thống Kê & Bắt Đáy Kỹ Thuật (Gen 2 — Optimized).
    Tần suất tái cấu trúc: 4 tuần / lần (20 ngày giao dịch, tối ưu từ 10 ngày).
    Phương pháp phân bổ: Equal Weight.
    Khắc phục điểm yếu: Không bắt dao rơi ngược xu hướng, tăng tỷ trọng lọc RS & Trend, giảm số lệnh giao dịch thừa.
    """

    def __init__(self, name: str = "AI_Advisor_Mean_Reversion", genome: Optional[Dict[str, float]] = None):
        default_genome = {
            "w_momentum_20d": 0.10,       # Chuyển từ bắt đáy âm (-0.15) sang thuận đà dương (+0.10)
            "w_momentum_60d": 0.00,       # Đưa về 0.00
            "w_trend_alignment": 0.25,    # Tăng mạnh từ 0.05 -> 0.25 để đi theo xu hướng
            "w_vol_breakout": 0.00,       # Đưa về 0.00
            "w_relative_strength": 0.25,  # Tăng mạnh từ 0.05 -> 0.25 để chọn cổ phiếu dẫn dắt
            "w_low_volatility": 0.15,     # Tăng từ 0.10 -> 0.15 để phòng thủ giảm drawdown
            "w_mean_reversion": 0.15,     # Giảm mạnh từ 0.45 -> 0.15 tránh bắt đáy dao rơi
            "w_drawdown_recovery": 0.10   # Giảm từ 0.35 -> 0.10 tránh gồng lỗ
        }
        super().__init__(
            name=name,
            description="Chuyên gia Đảo Chiều Thống Kê (Gen 2 — Optimized): Chu kỳ 20 ngày, kết hợp bắt nhịp hồi oversold nhưng bắt buộc có sự xác nhận của Trend Alignment và Relative Strength, triệt tiêu rủi ro bắt dao rơi và giảm phí giao dịch.",
            rebalance_days=20,  # Kéo dài từ 10 ngày lên 20 ngày để giảm turnover
            portfolio_size=5,
            allocation_method=AllocationMethod.EQUAL_WEIGHT,
            genome=genome or default_genome
        )
