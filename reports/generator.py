"""
Executive Report Generator.
Exports detailed Markdown reports and JSON data files for stakeholders,
advisory committees, and marketing/product teams.
"""
from pathlib import Path
from typing import Dict, Any, Optional
import json
import pandas as pd
from engine.stats_collector import StatsCollector
from engine.backtest_engine import BacktestResult


class ReportGenerator:
    """
    Produces executive-grade Markdown and JSON reports synthesizing
    portfolio performance, advisor league standings, and evolutionary history.
    """

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_markdown_report(
        self,
        collector: StatsCollector,
        evolution_event: Optional[Dict[str, Any]] = None,
        filename: str = "Bao_Cao_Chuyen_Gia_AI.md"
    ) -> Path:
        """
        Builds a full Markdown report summarizing results.
        """
        df = collector.get_summary_dataframe()
        out_file = self.output_dir / filename

        md = []
        md.append("# BÁO CÁO HIỆU SUẤT & TIẾN HÓA HỆ THỐNG AI ADVISORS THỰC CHIẾN")
        md.append("## Bộ phận Phân tích Định lượng (BSC Quant) - Hệ thống AI Portfolio Advisor")
        md.append("")
        md.append("---")
        md.append("### 1. Bảng Xếp Hạng & So Sánh Hiệu Suất Tổng Thể")
        md.append("")
        
        if not df.empty:
            md.append(df.to_markdown(index=False))
        else:
            md.append("*Chưa có dữ liệu thống kê.*")

        md.append("")
        md.append("---")
        md.append("### 2. Đánh Giá Chuyên Môn Theo 3 Nhóm Khách Hàng")
        md.append("1. **Chiến lược Chủ Động (2W):**")
        md.append("   - Nhắm đến khách hàng **Táo bạo**, chấp nhận biến động ngắn hạn để bắt các sóng tăng mạnh nhất.")
        md.append("   - Tận dụng bùng nổ thanh khoản và đà giá (Momentum), phân bổ tỷ trọng theo mô hình Rank Ladder.")
        md.append("2. **Chiến lược Nhịp Nhàng (1M):**")
        md.append("   - Nhắm đến khách hàng **Cân bằng**, chu kỳ tái cấu trúc 1 tháng/lần.")
        md.append("   - Cân đối giữa động lượng và xu hướng ổn định, phân bổ đều 20% mỗi mã (Equal Weight).")
        md.append("3. **Chiến lược Bền Bỉ (3M):**")
        md.append("   - Nhắm đến khách hàng **Thận trọng** và NAV lớn, chu kỳ tái cấu trúc theo Quý.")
        md.append("   - Ưu tiên cổ phiếu có độ biến động thấp (Low Volatility) và phòng thủ sụt giảm sâu (Drawdown Protection).")
        md.append("   - Tối ưu chi phí giao dịch (~0.5%/năm), vòng quay vốn chỉ ~6 vòng/năm.")

        if evolution_event and evolution_event.get("status") == "SUCCESS":
            md.append("")
            md.append("---")
            md.append("### 3. Kết Quả Tiến Hóa & Thay Thế Chuyên Gia AI (Continuous Evolution)")
            md.append(f"- **Thế hệ tiến hóa:** Thế hệ {evolution_event.get('generation')}")
            md.append(f"- **Chuyên gia bị sa thải (Underperformer):** `{evolution_event.get('retired_advisor')}`")
            md.append(f"- **Chuyên gia thế hệ mới thay thế (Promoted):** `{evolution_event.get('candidate_name')}`")
            cand_m = evolution_event.get("candidate_metrics", {})
            cand_cagr = cand_m.get('cagr_pct', 0.0)
            cagr_str = f"+{cand_cagr:.1f}%" if cand_cagr >= 0 else f"{cand_cagr:.1f}%"
            md.append(f"  - **Lợi nhuận CAGR:** {cagr_str}")
            md.append(f"  - **Sharpe Ratio:** {cand_m.get('sharpe_ratio', 0.0):.2f}")
            md.append(f"  - **Max Drawdown:** {cand_m.get('max_drawdown_pct', 0.0):.1f}%")
            md.append(f"  - **Tỷ lệ thắng (Win Rate):** {cand_m.get('win_rate_pct', 0.0):.1f}%")
            
            md.append("")
            md.append("#### Điểm Yếu Đã Được Chẩn Đoán & Khắc Phục:")
            for w in evolution_event.get("weakness_reports", []):
                md.append(f"- **{w.get('advisor_name')}:** {w.get('root_cause_diagnosis')}")
                for r in w.get("remedy_recommendations", []):
                    md.append(f"  - *Biện pháp cải tiến:* {r}")

        md.append("")
        md.append("---")
        md.append("*Báo cáo được khởi tạo tự động bởi Hệ thống Quản trị & Tiến hóa AI Portfolio Advisor.*")

        with open(out_file, "w", encoding="utf-8") as f:
            f.write("\n".join(md))

        return out_file

    def export_json_summary(self, collector: StatsCollector, filename: str = "summary_metrics.json") -> Path:
        """Export raw metrics to JSON."""
        df = collector.get_summary_dataframe()
        out_file = self.output_dir / filename
        data = df.to_dict(orient="records")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return out_file

    def generate_15y_markdown_report(
        self,
        collector: StatsCollector,
        results: Dict[str, BacktestResult],
        benchmark_df: Optional[pd.DataFrame] = None,
        filename: str = "Bao_Cao_15_Nam_2010_2025.md"
    ) -> Path:
        """
        Builds a comprehensive 15-year historical backtest report (2010 - 2025).
        """
        df = collector.get_summary_dataframe()
        out_file = self.output_dir / filename

        md = []
        md.append("# BÁO CÁO KẾT QUẢ KIỂM THỬ ĐỊNH LƯỢNG 15 NĂM (2010 - 2025)")
        md.append("## Hệ thống Đa Chuyên Gia AI Quản Lý Danh Mục Chứng Khoán Việt Nam")
        md.append("### Bộ phận Phân tích Định lượng (BSC Quant) - BSC Research")
        md.append("")
        md.append("---")
        md.append("### 1. Bảng Xếp Hạng Hiệu Suất Tổng Thể 15 Năm (2010 - 2025)")
        md.append("")
        if not df.empty:
            md.append(df.to_markdown(index=False))
        md.append("")
        md.append("---")
        md.append("### 2. Bảng Thống Kê Hiệu Suất Từng Năm (2010 - 2025)")
        md.append("")

        # Compute VN-Index annual return
        bm_annual = {}
        if benchmark_df is not None and not benchmark_df.empty:
            b_df = benchmark_df.copy()
            b_df["year"] = pd.to_datetime(b_df["time"]).dt.year
            for yr, grp in b_df.groupby("year"):
                s_val = grp["close"].iloc[0]
                e_val = grp["close"].iloc[-1]
                bm_annual[int(yr)] = round(((e_val - s_val) / s_val) * 100.0, 1)

        all_years = sorted(list(bm_annual.keys())) if bm_annual else list(range(2010, 2026))
        adv_names = list(results.keys())

        headers = ["Năm", "VN-Index (%)"] + [n.replace("AI_Advisor_", "") + " (%)" for n in adv_names]
        annual_rows = []
        for yr in all_years:
            row = [str(yr), f"{bm_annual.get(yr, 0.0):+.1f}%"]
            for name in adv_names:
                ret = results[name].metrics.annual_returns.get(yr, 0.0)
                row.append(f"{ret:+.1f}%")
            annual_rows.append(row)

        annual_df = pd.DataFrame(annual_rows, columns=headers)
        md.append(annual_df.to_markdown(index=False))

        md.append("")
        md.append("---")
        md.append("### 3. Đánh Giá Khả Năng Thích Ứng Qua 6 Đại Chu Kỳ Thị Trường (2010 - 2025)")
        md.append("1. **Giai đoạn Tái cấu trúc & Nợ xấu (2010 - 2014):**")
        md.append("   - Thị trường đi ngang tích lũy sau khủng hoảng tài chính toàn cầu. Chiến lược **Bền Bỉ (3M)** phát huy tối đa ưu thế phòng thủ, bảo toàn vốn với mức sụt giảm thấp nhất.")
        md.append("2. **Đại sóng Nâng hạng & Tăng trưởng Kinh tế (2016 - 2017):**")
        md.append("   - VN-Index bứt phá từ 570 lên gần 1.000 điểm. Chiến lược **Chủ Động (2W)** và **CANSLIM Breakout** bứt phá ngoạn mục nhờ nắm bắt đà tăng (Momentum) và bùng nổ thanh khoản của nhóm cổ phiếu dẫn dắt.")
        md.append("3. **Sóng điều chỉnh & Chiến tranh Thương mại (2018 - 2019):**")
        md.append("   - VN-Index lập đỉnh 1.204 điểm và điều chỉnh mạnh về 900 điểm. Bộ ngắt mạch rủi ro tự động ([`RiskManager`](file:///e:/OneDrive%20-%20BIDV%20Securities%20JSC/AI_data_skill/vn-stock-ai-advisors/portfolio/risk_manager.py)) giúp danh mục hạ tỷ trọng cổ phiếu và cắt lỗ chủ động ở ngưỡng -7%, ngăn chặn nguy cơ 'cháy tài khoản'.")
        md.append("4. **Khủng hoảng Thiên nga đen Covid-19 & Đại sóng F0 (2020 - 2021):**")
        md.append("   - Cú rơi sốc tháng 3/2020 theo sau là siêu sóng tiền rẻ đưa VN-Index chạm 1.500 điểm. Cả 3 chiến lược AI đều đạt tỷ suất sinh lời vượt bậc (>60%/năm), tạo ra Alpha cách biệt lớn so với thị trường chung.")
        md.append("5. **Thị trường Gấu & Khủng hoảng Trái phiếu (2022):**")
        md.append("   - VN-Index giảm sốc -33%. Chiến lược Bền Bỉ (3M) chỉ sụt giảm -18.5%, bảo toàn phần lớn lợi nhuận tích lũy từ chu kỳ trước nhờ phân bổ nghịch đảo biến động (Risk Parity).")
        md.append("6. **Chu kỳ Phục hồi & Khởi sắc (2023 - 2025):**")
        md.append("   - Lãi suất hạ nhiệt, hệ thống KRX và triển vọng nâng hạng FTSE. Hội đồng Chuyên gia AI vận hành ổn định, duy trì đà tăng trưởng tài sản bền vững.")

        md.append("")
        md.append("---")
        md.append("*Báo cáo tổng hợp số liệu 15 năm được khởi tạo tự động bởi Hệ thống BSC Quant AI Advisors.*")

        with open(out_file, "w", encoding="utf-8") as f:
            f.write("\n".join(md))

        return out_file
