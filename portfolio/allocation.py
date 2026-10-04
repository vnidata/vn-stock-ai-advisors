"""
Portfolio allocation strategies for Top 5 selected stocks.
Supports Equal Weight (EQW), Risk Parity (Inverse Volatility), and Rank Ladder.
Follows the quantitative framework outlined in the research documentation.
"""
from enum import Enum
from typing import List, Dict, Tuple, Optional
import numpy as np
import pandas as pd


class AllocationMethod(str, Enum):
    EQUAL_WEIGHT = "EQW"
    RISK_PARITY = "RiskParity"
    RANK_LADDER = "RankLadder"


class PortfolioAllocator:
    """
    Computes optimal target weights for selected Top N (default 5) equities.
    Guarantees cash buffer and individual asset concentration caps.
    """

    def __init__(
        self,
        method: AllocationMethod = AllocationMethod.EQUAL_WEIGHT,
        cash_buffer: float = 0.02,
        max_weight_per_asset: float = 0.30
    ):
        self.method = method
        self.cash_buffer = cash_buffer
        self.max_weight = max_weight_per_asset

    def allocate(
        self,
        selected_symbols: List[str],
        volatility_dict: Optional[Dict[str, float]] = None,
        scores_dict: Optional[Dict[str, float]] = None
    ) -> Dict[str, float]:
        """
        Calculates target weights for selected symbols.
        Returns a dictionary: {symbol: target_weight_fraction}.
        Total sum of weights <= (1.0 - cash_buffer).
        """
        n = len(selected_symbols)
        if n == 0:
            return {}

        investable_capital_ratio = 1.0 - self.cash_buffer

        if self.method == AllocationMethod.EQUAL_WEIGHT or n == 1:
            raw_weight = investable_capital_ratio / n
            weights = {s: min(raw_weight, self.max_weight) for s in selected_symbols}

        elif self.method == AllocationMethod.RANK_LADDER:
            # Rank 1 gets highest weight, down to Rank 5
            # Ladder template for 5 stocks: [0.28, 0.23, 0.19, 0.16, 0.14]
            ladder_template = [0.28, 0.23, 0.19, 0.16, 0.14]
            if n > len(ladder_template):
                ladder_template = np.linspace(0.30, 0.10, n).tolist()
            else:
                ladder_template = ladder_template[:n]
            
            total_sum = sum(ladder_template)
            normalized = [w / total_sum * investable_capital_ratio for w in ladder_template]
            weights = {selected_symbols[i]: min(normalized[i], self.max_weight) for i in range(n)}

        elif self.method == AllocationMethod.RISK_PARITY:
            # Inverse volatility weighting
            vols = []
            for s in selected_symbols:
                v = volatility_dict.get(s, 0.25) if volatility_dict else 0.25
                v = max(v, 0.05)  # Avoid division by zero
                vols.append(v)
            
            inv_vols = [1.0 / v for v in vols]
            sum_inv = sum(inv_vols)
            raw_weights = [(iv / sum_inv) * investable_capital_ratio for iv in inv_vols]
            weights = {selected_symbols[i]: min(raw_weights[i], self.max_weight) for i in range(n)}
        else:
            raw_weight = investable_capital_ratio / n
            weights = {s: min(raw_weight, self.max_weight) for s in selected_symbols}

        # Normalize final weights to make sure they do not exceed investable capital
        current_sum = sum(weights.values())
        if current_sum > investable_capital_ratio:
            scale = investable_capital_ratio / current_sum
            weights = {k: v * scale for k, v in weights.items()}

        return weights
