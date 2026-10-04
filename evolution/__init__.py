"""
Evolutionary Learning and Advisor Self-Improvement package.
Continuously diagnoses weaknesses in underperforming advisors,
extracts alpha traits from top performers, and breeds superior replacement advisors.
"""
from .weakness_analyzer import WeaknessAnalyzer, WeaknessReport
from .strength_extractor import StrengthExtractor, StrengthProfile
from .advisor_synthesizer import AdvisorSynthesizer
from .lifecycle_manager import AdvisorLifecycleManager

__all__ = [
    "WeaknessAnalyzer",
    "WeaknessReport",
    "StrengthExtractor",
    "StrengthProfile",
    "AdvisorSynthesizer",
    "AdvisorLifecycleManager"
]
