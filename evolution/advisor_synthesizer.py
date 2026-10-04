"""
Advisor Synthesizer and Genetic Evolutionary Breeder.
Performs:
1. Genetic Crossover between top-performing parents.
2. Inoculation against diagnosed weaknesses of underperformers.
3. Parameter mutation for continuous exploration.
4. Generates a new Generation of elite candidate AI Advisors.
"""
import random
from typing import List, Dict, Optional
from advisors.base_advisor import BaseAdvisor
from advisors.dynamic_advisor import DynamicAdvisor
from portfolio.allocation import AllocationMethod
from .weakness_analyzer import WeaknessReport
from .strength_extractor import StrengthProfile


class AdvisorSynthesizer:
    """
    Creates next-generation AI Advisors that inherit top alpha traits
    while structurally suppressing past points of failure.
    """

    def __init__(self, mutation_rate: float = 0.15):
        self.mutation_rate = mutation_rate

    def synthesize_replacement(
        self,
        top_advisors: List[BaseAdvisor],
        weakness_reports: List[WeaknessReport],
        strength_profiles: List[StrengthProfile],
        generation_idx: int = 1
    ) -> DynamicAdvisor:
        """
        Synthesize a replacement advisor:
        - Crosses genes from two top performers (or self-mutates the best if only one available).
        - Inoculates against collective weaknesses.
        - Returns a brand new DynamicAdvisor.
        """
        if not top_advisors:
            raise ValueError("Cannot synthesize advisor without at least one top advisor.")

        # Step 1: Select parents
        parent_a = top_advisors[0]
        parent_b = top_advisors[1] if len(top_advisors) > 1 else top_advisors[0]

        # Step 2: Genetic Crossover of factor weights
        child_genome = {}
        for factor in parent_a.genome.keys():
            gene_a = parent_a.genome.get(factor, 0.1)
            gene_b = parent_b.genome.get(factor, 0.1)
            # Weighted average with random crossover blend
            blend = random.uniform(0.3, 0.7)
            child_genome[factor] = (gene_a * blend) + (gene_b * (1.0 - blend))

        # Step 3: Inoculate against diagnosed weaknesses
        all_penalize = []
        all_boost = []
        for w in weakness_reports:
            all_penalize.extend(w.penalize_factors)
            all_boost.extend(w.boost_factors)

        # Dampen penalize factors by 30-50%
        for pf in set(all_penalize):
            if pf in child_genome:
                child_genome[pf] = max(0.02, child_genome[pf] * 0.6)

        # Boost protective factors by 25-40%
        for bf in set(all_boost):
            if bf in child_genome:
                child_genome[bf] = child_genome[bf] * 1.35

        # Step 4: Controlled Mutation
        for factor in child_genome.keys():
            if random.random() < self.mutation_rate:
                noise = (random.random() - 0.5) * 0.10
                child_genome[factor] = max(0.01, child_genome[factor] + noise)

        # Step 5: Determine optimal rebalance cycle & allocation method
        # If parent A or B used 1M or 3M with lower turnover, favor it
        rebalance_candidates = [parent_a.rebalance_days, parent_b.rebalance_days]
        # If weaknesses complained about turnover, force at least 21 days (1M)
        turnover_issue = any("chi phí" in f.lower() or "turnover" in f.lower() for w in weakness_reports for f in w.primary_flaws)
        if turnover_issue:
            chosen_rebalance = 21  # 1 month
        else:
            chosen_rebalance = random.choice(rebalance_candidates)

        # Determine allocation method
        if parent_a.allocation_method == AllocationMethod.RANK_LADDER or parent_b.allocation_method == AllocationMethod.RANK_LADDER:
            chosen_alloc = AllocationMethod.RANK_LADDER
        else:
            chosen_alloc = AllocationMethod.EQUAL_WEIGHT

        # Generate unique identifier
        child_id = random.randint(100, 999)
        new_name = f"AI_Advisor_Evolved_Gen{generation_idx}_{child_id}"
        lineage = f"{parent_a.name} x {parent_b.name}"

        child_advisor = DynamicAdvisor(
            name=new_name,
            generation=generation_idx,
            rebalance_days=chosen_rebalance,
            allocation_method=chosen_alloc,
            genome=child_genome,
            parent_lineage=lineage
        )

        return child_advisor
