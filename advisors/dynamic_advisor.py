"""
Dynamic Evolved Advisor.
Instantiated programmatically by the Evolutionary Synthesis Engine.
Holds a mutated/hybrid genome combining strengths of elite advisors while inoculating against weaknesses.
"""
from typing import Optional, Dict
from portfolio.allocation import AllocationMethod
from .base_advisor import BaseAdvisor


class DynamicAdvisor(BaseAdvisor):
    """
    Chuyên gia Tư vấn AI Thế hệ Mới (Evolved Generation).
    Được tạo tự động sau quá trình phân tích điểm yếu (Weakness Diagnosis)
    và lai ghép đặc tính tốt (Genetic Crossover & Inoculation).
    """

    def __init__(
        self,
        name: str,
        generation: int = 1,
        rebalance_days: int = 21,
        allocation_method: AllocationMethod = AllocationMethod.RANK_LADDER,
        genome: Optional[Dict[str, float]] = None,
        parent_lineage: Optional[str] = None
    ):
        self.generation = generation
        self.parent_lineage = parent_lineage or "Root_Seed"
        super().__init__(
            name=name,
            description=f"Chuyên gia AI Thế Hệ {generation} (Dòng dõi: {self.parent_lineage}). Tối ưu hóa điểm yếu của thế hệ tiền nhiệm, kết hợp sức mạnh động lượng và kiểm soát rủi ro giảm sâu.",
            rebalance_days=rebalance_days,
            portfolio_size=5,
            allocation_method=allocation_method,
            genome=genome
        )
