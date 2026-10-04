"""
Weakness Analyzer and Post-Mortem Autopsy Engine.
Diagnoses operational and statistical flaws in underperforming AI Advisors:
- High turnover cost drag
- Fatal drawdowns in market pullbacks (cháy tài khoản hoặc sụt giảm sâu)
- False breakout traps
- Falling knife catching (mua bắt đáy cổ phiếu gãy trend)
- Asymmetric risk/reward ratios
"""
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
from engine.backtest_engine import BacktestResult


@dataclass
class WeaknessReport:
    advisor_name: str
    primary_flaws: List[str]
    root_cause_diagnosis: str
    remedy_recommendations: List[str]
    penalize_factors: List[str]
    boost_factors: List[str]
    metrics_summary: Dict[str, float]


class WeaknessAnalyzer:
    """
    Performs forensic inspection on underperforming advisors to identify systematic vulnerabilities.
    """

    def analyze(self, result: BacktestResult, benchmark_df: Optional[pd.DataFrame] = None) -> WeaknessReport:
        m = result.metrics
        trades = result.trades
        flaws = []
        penalize = []
        boost = []
        remedies = []

        # 1. Check Maximum Drawdown
        if m.max_drawdown_pct < -22.0:
            flaws.append(f"Mức sụt giảm tối đa nghiêm trọng (MDD: {m.max_drawdown_pct:.1f}% > -22%)")
            penalize.extend(["w_mean_reversion", "w_momentum_20d"])
            boost.extend(["w_low_volatility", "w_trend_alignment"])
            remedies.append("Tăng cường tỷ trọng Low Volatility và chỉ mở vị thế khi xu hướng MA50/MA200 giữ vững.")

        # 2. Check Turnover & Cost Drag
        if m.turnover_per_year > 25.0 or m.annual_cost_drag_pct > 2.5:
            flaws.append(f"Bào mòn chi phí do giao dịch quá mức (Turnover: {m.turnover_per_year:.1f}x, Phí/năm: {m.annual_cost_drag_pct:.2f}%)")
            remedies.append("Kéo dài chu kỳ tái cấu trúc (chuyển từ 2W sang 1M hoặc 3M) để tối ưu chi phí.")

        # 3. Check Win Rate & Profit Factor
        if m.win_rate_pct < 45.0:
            flaws.append(f"Tỷ lệ thắng thấp (Win Rate: {m.win_rate_pct:.1f}% < 45%)")
            boost.append("w_relative_strength")
            remedies.append("Yêu cầu lọc khắt khe hơn theo Sức mạnh giá tương đối (RS Rating > 75).")

        if m.profit_factor < 1.1:
            flaws.append(f"Hệ số Lời/Lỗ kém (Profit Factor: {m.profit_factor:.2f} < 1.10)")
            remedies.append("Siết chặt quy tắc cắt lỗ chủ động (Stop-Loss -7%) và nâng ngưỡng chốt lời từng phần.")

        # 4. Check Negative Alpha vs Benchmark
        if m.alpha_annual_pct < 0.0:
            flaws.append(f"Thua kém chỉ số thị trường (Alpha âm: {m.alpha_annual_pct:.1f}%/năm)")
            penalize.append("w_mean_reversion")
            boost.extend(["w_trend_alignment", "w_momentum_60d"])
            remedies.append("Loại bỏ chiến lược bắt đáy ngược xu hướng (falling knives), chuyển hướng bám sát dòng tiền lớn.")

        # Fallback if no critical flaws triggered
        if not flaws:
            flaws.append("Hiệu suất trung bình, chưa bộc lộ ưu thế Alpha vượt trội so với VN-Index.")
            remedies.append("Tinh chỉnh tối ưu lại ma trận trọng số và ngưỡng cắt lỗ linh hoạt theo ATR.")

        # Diagnostic summary text
        root_cause = (
            f"Chuyên gia {m.advisor_name} gặp vấn đề cốt lõi: " +
            "; ".join(flaws)
        )

        return WeaknessReport(
            advisor_name=m.advisor_name,
            primary_flaws=flaws,
            root_cause_diagnosis=root_cause,
            remedy_recommendations=remedies,
            penalize_factors=list(set(penalize)),
            boost_factors=list(set(boost)),
            metrics_summary={
                "total_return": m.total_return_pct,
                "cagr": m.cagr_pct,
                "alpha": m.alpha_annual_pct,
                "mdd": m.max_drawdown_pct,
                "sharpe": m.sharpe_ratio,
                "win_rate": m.win_rate_pct,
                "turnover": m.turnover_per_year
            }
        )
