"""
Advisor Lifecycle Manager.
Oversees the active advisor pool, retires chronically underperforming advisors,
validates new candidate advisors in Out-Of-Sample (OOS) live conditions,
and orchestrates evolutionary replacement cycles.
"""
from typing import List, Dict, Tuple, Any, Optional
import pandas as pd
from advisors.base_advisor import BaseAdvisor
from engine.backtest_engine import BacktestEngine, BacktestResult
from engine.stats_collector import StatsCollector
from .weakness_analyzer import WeaknessAnalyzer, WeaknessReport
from .strength_extractor import StrengthExtractor, StrengthProfile
from .advisor_synthesizer import AdvisorSynthesizer


class AdvisorLifecycleManager:
    """
    Guarantees continuous self-optimization of the AI Advisor ecosystem.
    Underperformers are gracefully retired and replaced by synthesized successors.
    """

    def __init__(self, initial_advisors: Optional[List[BaseAdvisor]] = None):
        self.active_advisors: Dict[str, BaseAdvisor] = {}
        self.retired_advisors: Dict[str, Dict[str, Any]] = {}
        self.generation_counter: int = 1
        self.weakness_analyzer = WeaknessAnalyzer()
        self.strength_extractor = StrengthExtractor()
        self.synthesizer = AdvisorSynthesizer()

        if initial_advisors:
            for adv in initial_advisors:
                self.active_advisors[adv.name] = adv

    def register_advisor(self, advisor: BaseAdvisor):
        """Add an advisor to active league."""
        self.active_advisors[advisor.name] = advisor

    def run_evolution_cycle(
        self,
        training_results: Dict[str, BacktestResult],
        oos_data_dict: Dict[str, pd.DataFrame],
        oos_benchmark_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Any]:
        """
        Executes a complete evolutionary promotion/demotion round:
        1. Identifies top & bottom performers.
        2. Conducts weakness autopsy and strength factor extraction.
        3. Synthesizes a new candidate advisor.
        4. Validates candidate vs underperformer on Out-Of-Sample data.
        5. Performs retirement and promotion if validated.
        """
        collector = StatsCollector()
        for res in training_results.values():
            collector.add_result(res)

        top_names, under_names = collector.identify_cohorts(top_ratio=0.25, bottom_ratio=0.25)
        if not top_names or not under_names:
            return {"status": "INSUFFICIENT_ADVISORS", "message": "Not enough advisors to run evolutionary cycle."}

        # 1. Forensic Diagnosis of Underperformers
        weakness_reports: List[WeaknessReport] = []
        for uname in under_names:
            if uname in training_results:
                rep = self.weakness_analyzer.analyze(training_results[uname], oos_benchmark_df)
                weakness_reports.append(rep)

        # 2. Extract winning traits from Top Performers
        top_advisors = [self.active_advisors[t] for t in top_names if t in self.active_advisors]
        strength_profiles: List[StrengthProfile] = []
        for tadv in top_advisors:
            prof = self.strength_extractor.extract(tadv, training_results[tadv.name])
            strength_profiles.append(prof)

        # 3. Synthesize candidate replacement
        candidate = self.synthesizer.synthesize_replacement(
            top_advisors=top_advisors,
            weakness_reports=weakness_reports,
            strength_profiles=strength_profiles,
            generation_idx=self.generation_counter + 1
        )

        # 4. Out-of-Sample (OOS) Battle Validation
        # Test both candidate and the worst underperformer on unseen OOS data
        engine = BacktestEngine()
        candidate_oos_res = engine.run(candidate, oos_data_dict, oos_benchmark_df)

        worst_underperformer_name = under_names[-1]
        worst_underperformer = self.active_advisors.get(worst_underperformer_name)

        under_oos_res = None
        if worst_underperformer:
            under_oos_res = engine.run(worst_underperformer, oos_data_dict, oos_benchmark_df)

        # Evaluation Decision: Does candidate exhibit better risk-adjusted quality or drawdown control?
        candidate_sharpe = candidate_oos_res.metrics.sharpe_ratio
        under_sharpe = under_oos_res.metrics.sharpe_ratio if under_oos_res else -999.0
        candidate_mdd = abs(candidate_oos_res.metrics.max_drawdown_pct)
        under_mdd = abs(under_oos_res.metrics.max_drawdown_pct) if under_oos_res else 999.0

        # Promotion is granted if candidate achieves higher Sharpe OR significantly better Max Drawdown protection
        promotion_granted = (
            candidate_sharpe >= under_sharpe or
            candidate_mdd < under_mdd or
            candidate_oos_res.metrics.cagr_pct > (under_oos_res.metrics.cagr_pct if under_oos_res else 0.0)
        )

        if promotion_granted and worst_underperformer:
            # Retire underperformer
            self.retired_advisors[worst_underperformer_name] = {
                "advisor": worst_underperformer,
                "reason": weakness_reports[-1].root_cause_diagnosis if weakness_reports else "Structural Underperformance",
                "retired_at_generation": self.generation_counter
            }
            del self.active_advisors[worst_underperformer_name]

            # Promote candidate
            self.active_advisors[candidate.name] = candidate
            self.generation_counter += 1

        return {
            "status": "SUCCESS",
            "generation": self.generation_counter,
            "top_performers": top_names,
            "underperformers": under_names,
            "weakness_reports": [w.__dict__ for w in weakness_reports],
            "strength_profiles": [s.__dict__ for s in strength_profiles],
            "candidate_name": candidate.name,
            "candidate_metrics": candidate_oos_res.metrics.__dict__,
            "retired_advisor": worst_underperformer_name if promotion_granted else None,
            "promotion_granted": promotion_granted
        }
