"""
Financial News Classifier & NLP Sentiment Engine for Vietnam Stock Market.
Detects mentioned stock symbols, classifies news category (Earnings, CBTT, Red Flags, Macro),
and calculates quantified Sentiment & Catalyst Impact scores (-1.0 to +1.0).
Identifies severe abnormal news triggers (Veto / Red Flags) to protect portfolios from black swans.
"""
import re
from typing import Dict, List, Tuple, Any, Optional

# Ticker to company entity keywords dictionary
TICKER_ENTITY_MAP: Dict[str, List[str]] = {
    "FPT": ["fpt", "tập đoàn fpt", "trương gia bình", "fpt software", "fpt telecom", "fpt retail", "frt"],
    "HPG": ["hpg", "hòa phát", "thép hòa phát", "trần đình long", "thép dung quất", "hòa phát dung quất"],
    "VCB": ["vcb", "vietcombank", "ngân hàng ngoại thương"],
    "MBB": ["mbb", "mbbank", "ngân hàng quân đội", "mb bank"],
    "TCB": ["tcb", "techcombank", "ngân hàng kỹ thương", "hồ hùng anh"],
    "ACB": ["acb", "ngân hàng á châu", "trần hùng huy"],
    "SSI": ["ssi", "chứng khoán ssi", "nguyễn duy hưng"],
    "VND": ["vnd", "vndirect", "chứng khoán vndirect", "phạm minh hương"],
    "VHM": ["vhm", "vinhomes"],
    "VIC": ["vic", "vingroup", "phạm nhật vượng", "vinfast"],
    "MWG": ["mwg", "thế giới di động", "bách hóa xanh", "điện máy xanh", "nguyễn đức tài", "era blue"],
    "MSN": ["msn", "masan", "tập đoàn masan", "nguyễn đăng quang", "wincommerce", "winmart", "masan consumer"],
    "VNM": ["vnm", "vinamilk", "sữa việt nam", "mai kiều liên"],
    "DGC": ["dgc", "hóa chất đức giang", "đức giang", "đào hữu huyền", "phốt pho vàng"],
    "GAS": ["gas", "pv gas", "tổng công ty khí việt nam", "khí việt nam"],
    "GMD": ["gmd", "gemadept", "cảng gemalink", "cảng nam đình vũ"],
    "STB": ["stb", "sacombank", "dương công minh"],
    "CTG": ["ctg", "vietinbank", "ngân hàng công thương"],
    "BID": ["bid", "bidv", "ngân hàng đầu tư và phát triển"],
    "VPB": ["vpb", "vpbank", "ngô chí dũng", "fe credit"],
    "VRE": ["vre", "vincom retail"],
    "PVD": ["pvd", "khoan dầu khí", "pv drilling"],
    "PVS": ["pvs", "dịch vụ kỹ thuật dầu khí", "ptsc"],
    "VCI": ["vci", "vietcap", "chứng khoán bản việt"],
    "HCM": ["hcm", "hsc", "chứng khoán tp.hcm"],
    "KDH": ["kdh", "nhà khang điền", "khang điền"],
    "NLG": ["nlg", "nam long", "tập đoàn nam long"]
}

# Red Flag / Abnormal News Keywords (Serious Negative / Black Swan Risk)
RED_FLAG_KEYWORDS: List[Tuple[str, float]] = [
    ("khởi tố", -1.0),
    ("bắt tạm giam", -1.0),
    ("bị bắt", -1.0),
    ("vi phạm hình sự", -1.0),
    ("sai phạm nghiêm trọng", -0.9),
    ("thanh tra", -0.7),
    ("điều tra", -0.7),
    ("hủy niêm yết", -1.0),
    ("đình chỉ giao dịch", -0.9),
    ("vào diện kiểm soát", -0.8),
    ("bị kiểm soát", -0.8),
    ("diện cảnh báo", -0.6),
    ("hạn chế giao dịch", -0.7),
    ("cắt margin", -0.6),
    ("cắt ký quỹ", -0.6),
    ("chậm nộp bctc", -0.6),
    ("từ chối đưa ý kiến", -0.9),
    ("ý kiến ngoại trừ", -0.7),
    ("nghi ngờ khả năng hoạt động liên tục", -0.9),
    ("thao túng giá", -0.9),
    ("xử phạt vi phạm", -0.5),
    ("phạt tiền", -0.4),
    ("vỡ nợ", -1.0),
    ("chậm thanh toán trái phiếu", -0.8),
    ("trễ hạn gốc lãi", -0.8),
    ("lỗ kỷ lục", -0.7),
    ("lỗ ròng", -0.5),
    ("sụt giảm nghiêm trọng", -0.5),
    ("cháy nổ", -0.7),
    ("ngừng hoạt động", -0.8)
]

# Positive Catalyst Keywords (Strong Growth & Bullish Triggers)
CATALYST_KEYWORDS: List[Tuple[str, float]] = [
    ("lợi nhuận tăng trưởng", 0.7),
    ("lãi kỷ lục", 0.9),
    ("vượt kế hoạch", 0.8),
    ("lãi nghìn tỷ", 0.7),
    ("lợi nhuận đột biến", 0.8),
    ("tăng trưởng mạnh", 0.6),
    ("trúng thầu", 0.8),
    ("hợp đồng khủng", 0.8),
    ("đơn hàng lớn", 0.7),
    ("ký kết hợp tác", 0.5),
    ("trả cổ tức tiền mặt", 0.7),
    ("cổ tức cao", 0.6),
    ("chia thưởng cổ phiếu", 0.5),
    ("tạm ứng cổ tức", 0.6),
    ("mua lại cổ phiếu", 0.7),
    ("cổ đông lớn mua vào", 0.7),
    ("đăng ký mua", 0.7),
    ("mua tiếp", 0.6),
    ("lãnh đạo đăng ký mua", 0.7),
    ("khối ngoại gom mạnh", 0.6),
    ("khối ngoại mua ròng", 0.5),
    ("khởi công", 0.6),
    ("khánh thành nhà máy", 0.7),
    ("đưa vào vận hành", 0.6),
    ("mở rộng công suất", 0.6),
    ("tuyển 6.000", 0.6),
    ("mở rộng mạng lưới", 0.6),
    ("nâng hạng thị trường", 0.8),
    ("nới room ngoại", 0.7),
    ("m&a thành công", 0.7),
    ("mua lại thành công", 0.6),
    ("xuất khẩu tăng vọt", 0.6)
]

# Neutral / Regular Corporate Disclosure Keywords
DISCLOSURE_KEYWORDS: List[str] = [
    "đại hội cổ đông", "nghị quyết hđqt", "thông báo ngày đăng ký cuối cùng",
    "báo cáo tài chính", "giải trình biến động", "công bố thông tin",
    "giao dịch cổ phiếu", "kết quả phát hành", "bổ nhiệm", "miễn nhiệm"
]


class FinancialNewsClassifier:
    """
    Intelligent NLP Classifier for Vietnamese Stock News & Disclosures.
    """

    @classmethod
    def match_symbols(cls, text: str) -> List[str]:
        """Detect stock symbols mentioned in headline or body text."""
        matched = set()
        clean_text = text.lower()

        # Direct token word boundary matching for ticker
        for ticker, aliases in TICKER_ENTITY_MAP.items():
            # Check standalone ticker (e.g. "FPT", "(FPT)", "FPT:")
            pattern = rf"(?:\b|\(){ticker.lower()}(?:\b|\)|\:|\,)"
            if re.search(pattern, clean_text):
                matched.add(ticker)
                continue

            # Check corporate name aliases
            for alias in aliases:
                if alias in clean_text:
                    matched.add(ticker)
                    break

        # Match explicit ticker phrases: "Cổ phiếu VPG", "mã SHS", "cổ phiếu HDB", "(MWG)"
        excluded_words = {"USD", "VND", "EUR", "GDP", "CPI", "FED", "ETF", "NAV", "IPO", "EOD", "EPS", "ROE", "ROA", "BCTC", "HOSE", "HNX", "UPCOM"}
        explicit_matches = re.findall(r"(?:cổ phiếu|mã|cp|chứng khoán)\s+([A-Za-z]{3})\b", text, flags=re.IGNORECASE)
        for m in explicit_matches:
            cand = m.upper()
            if cand not in excluded_words:
                matched.add(cand)

        parentheses_matches = re.findall(r"\(([A-Za-z]{3})\)", text)
        for m in parentheses_matches:
            cand = m.upper()
            if cand not in excluded_words:
                matched.add(cand)

        return sorted(list(matched))

    @classmethod
    def analyze_news(cls, title: str, description: str = "", source: str = "CafeF") -> Dict[str, Any]:
        """
        Complete semantic analysis of a financial news item.
        """
        full_text = f"{title} {description}".lower()
        symbols = cls.match_symbols(title + " " + description)

        # 1. Search for Red Flag triggers
        red_flag_score = 0.0
        red_flag_hits = []
        for kw, score in RED_FLAG_KEYWORDS:
            if kw in full_text:
                red_flag_hits.append(kw)
                if score < red_flag_score:
                    red_flag_score = score

        # 2. Search for Catalyst triggers
        catalyst_score = 0.0
        catalyst_hits = []
        for kw, score in CATALYST_KEYWORDS:
            if kw in full_text:
                catalyst_hits.append(kw)
                if score > catalyst_score:
                    catalyst_score = score

        # 3. Determine primary category
        is_red_flag = len(red_flag_hits) > 0 and red_flag_score <= -0.5
        is_catalyst = len(catalyst_hits) > 0 and catalyst_score >= 0.5

        if is_red_flag:
            category = "CẢNH BÁO RỦI RO / BẤT THƯỜNG"
            sentiment_score = red_flag_score
        elif is_catalyst:
            category = "ĐỘNG LỰC TĂNG TRƯỞNG (CATALYST)"
            sentiment_score = catalyst_score
        elif any(d in full_text for d in DISCLOSURE_KEYWORDS):
            category = "CÔNG BỐ THÔNG TIN ĐỊNH KỲ"
            sentiment_score = 0.1 if catalyst_score > 0 else (-0.1 if red_flag_score < 0 else 0.0)
        elif any(m in full_text for m in ["lãi suất", "tỷ giá", "lạm phát", "fed", "ngân hàng nhà nước", "gdp", "vĩ mô"]):
            category = "VĨ MÔ & CHÍNH SÁCH TIỀN TỆ"
            sentiment_score = 0.1 if "giảm lãi suất" in full_text or "tăng trưởng" in full_text else 0.0
        else:
            category = "THỊ TRƯỜNG CHỨNG KHOÁN"
            sentiment_score = round(catalyst_score + red_flag_score, 2)

        # Bounds clipping
        sentiment_score = max(-1.0, min(1.0, sentiment_score))

        # 4. Human-readable sentiment label
        if sentiment_score >= 0.5:
            sentiment_label = "TÍCH CỰC MẠNH"
            sentiment_badge = "pos"
        elif sentiment_score > 0.1:
            sentiment_label = "TÍCH CỰC"
            sentiment_badge = "pos-light"
        elif sentiment_score <= -0.5:
            sentiment_label = "CẢNH BÁO NGUY HIỂM"
            sentiment_badge = "neg-danger"
        elif sentiment_score < -0.1:
            sentiment_label = "TIÊU CỰC"
            sentiment_badge = "neg-light"
        else:
            sentiment_label = "TRUNG TÍNH"
            sentiment_badge = "neutral"

        # 5. Strategic AI Recommendation Action
        if is_red_flag:
            re_eval_action = "VETO_REJECT" if red_flag_score <= -0.8 else "EMERGENCY_SELL"
            action_desc = "Loại bỏ / Phủ quyết lập tức khỏi danh mục (Red Flag)"
        elif sentiment_score >= 0.6:
            re_eval_action = "STRONG_BUY_CATALYST"
            action_desc = "Ưu tiên giải ngân / Đón sóng thông tin hỗ trợ"
        elif sentiment_score >= 0.2:
            re_eval_action = "POSITIVE_BOOST"
            action_desc = "Cộng điểm khuyến nghị (+15% Conviction)"
        elif sentiment_score <= -0.3:
            re_eval_action = "MONITOR_CAUTION"
            action_desc = "Đưa vào diện giám sát chặt chẽ / Hạ tỷ trọng"
        else:
            re_eval_action = "SAFE_HOLD"
            action_desc = "Thông tin bình ổn / Duy trì chiến lược"

        return {
            "title": title.strip(),
            "description": description.strip(),
            "source": source,
            "symbols": symbols,
            "category": category,
            "sentiment_score": round(sentiment_score, 2),
            "sentiment_label": sentiment_label,
            "sentiment_badge": sentiment_badge,
            "is_red_flag": is_red_flag,
            "is_catalyst": is_catalyst,
            "triggers_found": red_flag_hits + catalyst_hits,
            "re_eval_action": re_eval_action,
            "action_desc": action_desc
        }
