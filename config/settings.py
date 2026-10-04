"""
Global system configuration and operational parameters.
Supports customization for backtest periods, universe filters, and advisor pools.
"""
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any

# Root project directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent

@dataclass
class PeriodConfig:
    """Chronological sample splitting configuration covering 15 years (2010 - 2025)."""
    full_start: str = "2010-01-01"
    full_end: str = "2025-12-31"
    
    # 3-Phase chronological split
    train_start: str = "2010-01-01"
    train_end: str = "2021-12-31"
    val_start: str = "2022-01-01"
    val_end: str = "2023-12-31"
    oos_start: str = "2024-01-01"
    oos_end: str = "2025-12-31"

@dataclass
class SystemConfig:
    """Master configuration class for the AI Portfolio Advisor platform."""
    project_name: str = "VN-Stock-AI-Advisors"
    project_root: Path = PROJECT_ROOT
    data_cache_dir: Path = PROJECT_ROOT / "data" / "cache"
    reports_dir: Path = PROJECT_ROOT / "reports" / "output"
    models_dir: Path = PROJECT_ROOT / "models" / "saved"
    
    # Financial constants
    initial_capital: float = 1_000_000_000.0  # 1 Billion VND
    benchmark_symbol: str = "VNINDEX"
    portfolio_size: int = 5                  # Fixed Top 5 stocks as per quant design
    
    # Chronological periods
    periods: PeriodConfig = field(default_factory=PeriodConfig)
    
    # Universe screening
    universe_size: int = 50                  # Top liquid symbols in consideration (20-100)
    min_avg_daily_volume: float = 200_000    # Minimum 200k shares/day
    min_avg_daily_turnover: float = 5_000_000_000.0  # 5 Billion VND/day
    
    # Rebalance cycles (trading days)
    cycle_active_2w: int = 10                # 2 weeks
    cycle_harmony_1m: int = 21               # 1 month
    cycle_persistent_3m: int = 63            # 3 months / quarter
    
    # Evolutionary settings
    evaluation_rolling_window_days: int = 120 # 6 months performance review
    underperformer_bottom_pct: float = 0.25   # Bottom 25% marked for replacement
    top_performer_top_pct: float = 0.25       # Top 25% used for genetic breeding
    mutation_rate: float = 0.15               # 15% trait mutation rate
    
    def __post_init__(self):
        self.data_cache_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)

def get_default_config() -> SystemConfig:
    """Return default configured system instance."""
    return SystemConfig()
