"""
Strength Extractor and Factor Attribution Engine.
Analyzes top-performing AI Advisors to isolate winning traits:
- Alpha generation drivers (Trend Alignment, RS Rating, Breakouts)
- Superior risk-adjusted returns (High Sharpe & Calmar)
- Resilient drawdown mitigation during market selloffs
"""
from dataclasses import dataclass
from typing import List, Dict, Any
import numpy as np
from engine.backtest_engine import BacktestResult
from advisors.base_advisor import BaseAdvisor


@dataclass
class StrengthProfile:
    advisor_name: str
    dominant_strengths: List[str]
    winning_genome_factors: Dict[str, float]
    proven_rebalance_days: int
    proven_allocation_method: str
    sharpe_ratio: float
    cagr_pct: float
    alpha_pct: float


class StrengthExtractor:
    """
    Isolates successful quantitative genes and operational rules from top-tier advisors.
    """

    def extract(self, advisor: BaseAdvisor, result: BacktestResult) -> StrengthProfile:
        m = result.metrics
        strengths = []

        if m.alpha_annual_pct > 20.0:
            strengths.append(f"Khả năng sinh Alpha xuất chúng (+{m.alpha_annual_pct:.1f}%/năm vượt VN-Index)")
        if m.sharpe_ratio > 1.2:
            strengths.append(f"Hiệu quả bù đắp rủi ro vượt bậc (Sharpe Ratio: {m.sharpe_ratio:.2f})")
        if abs(m.max_drawdown_pct) <= 21.5:
            strengths.append(f"Kiểm soát sụt giảm đỉnh cao (MDD chỉ {m.max_drawdown_pct:.1f}%)")
        if m.win_rate_pct >= 55.0:
            strengths.append(f"Xác suất sinh lời tin cậy (Win Rate: {m.win_rate_pct:.1f}%)")
        if m.profit_factor >= 1.6:
            strengths.append(f"Tỷ lệ Lời/Lỗ lý tưởng (Profit Factor: {m.profit_factor:.2f})")

        if not strengths:
            strengths.append("Hiệu suất ổn định, duy trì tăng trưởng danh mục khả quan.")

        # Identify top 3 highest weighted factors in the advisor's genome
        sorted_genome = sorted(advisor.genome.items(), key=lambda x: x[1], reverse=True)
        top_factors = dict(sorted_genome[:4])

        return StrengthProfile(
            advisor_name=advisor.name,
            dominant_strengths=strengths,
            winning_genome_factors=top_factors,
            proven_rebalance_days=advisor.rebalance_days,
            proven_allocation_method=advisor.allocation_method.value,
            sharpe_ratio=m.sharpe_ratio,
            cagr_pct=m.cagr_pct,
            alpha_pct=m.alpha_annual_pct
        )
