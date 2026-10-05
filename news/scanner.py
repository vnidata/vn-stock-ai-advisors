"""
Multi-source Financial News & Corporate Disclosure Scanner for Vietnam Market.
Polls live RSS feeds (CafeF, VnExpress, Vietstock), normalizes disclosures,
applies NLP classification, and builds actionable symbol sentiment profiles.
"""
import sys
import os
import re
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import xml.etree.ElementTree as ET
import requests

# Enable corporate truststore if available
try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

from .classifier import FinancialNewsClassifier

logger = logging.getLogger("NewsScanner")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

FEED_SOURCES = [
    {
        "name": "CafeF Thị Trường",
        "url": "https://cafef.vn/thi-truong-chung-khoan.rss",
        "type": "MARKET"
    },
    {
        "name": "CafeF Doanh Nghiệp (CBTT)",
        "url": "https://cafef.vn/doanh-nghiep.rss",
        "type": "CORPORATE_DISCLOSURE"
    },
    {
        "name": "CafeF Tài Chính Ngân Hàng",
        "url": "https://cafef.vn/tai-chinh-ngan-hang.rss",
        "type": "BANKING"
    },
    {
        "name": "VnExpress Kinh Doanh",
        "url": "https://vnexpress.net/rss/kinh-doanh.rss",
        "type": "MACRO_BUSINESS"
    }
]


class NewsScanner:
    """
    Ingests financial news feeds, extracts corporate announcements,
    and constructs Point-in-Time sentiment and risk profiles.
    """

    def __init__(self, cache_file: Optional[Path] = None):
        self.cache_file = cache_file or (Path(__file__).resolve().parent / "news_cache.json")
        self.classifier = FinancialNewsClassifier()

    def scan_all_feeds(self, limit_per_feed: int = 40) -> List[Dict[str, Any]]:
        """
        Polls all active RSS feeds and parses articles with NLP sentiment enrichment.
        Alias for fetch_live_news.
        """
        return self.fetch_live_news(limit_per_feed=limit_per_feed)

    def fetch_live_news(self, limit_per_feed: int = 40) -> List[Dict[str, Any]]:
        """
        Polls all active RSS feeds and parses articles with NLP sentiment enrichment.
        """
        all_articles = []
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*"
        }

        for feed in FEED_SOURCES:
            source_name = feed["name"]
            url = feed["url"]
            try:
                resp = requests.get(url, headers=headers, timeout=8)
                if resp.status_code != 200:
                    logger.warning("Feed %s returned status %d", source_name, resp.status_code)
                    continue

                root = ET.fromstring(resp.content)
                items = root.findall(".//item")
                count = 0

                for it in items:
                    title_elem = it.find("title")
                    link_elem = it.find("link")
                    pub_elem = it.find("pubDate")
                    desc_elem = it.find("description")

                    title = title_elem.text if title_elem is not None and title_elem.text else ""
                    link = link_elem.text if link_elem is not None and link_elem.text else ""
                    pub_date = pub_elem.text if pub_elem is not None and pub_elem.text else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    raw_desc = desc_elem.text if desc_elem is not None and desc_elem.text else ""

                    # Clean HTML tags from description
                    clean_desc = re.sub(r"<[^>]+>", "", raw_desc).strip()

                    # Analyze semantics
                    analyzed = self.classifier.analyze_news(
                        title=title,
                        description=clean_desc,
                        source=source_name
                    )
                    analyzed["link"] = link
                    analyzed["published_date"] = pub_date

                    all_articles.append(analyzed)
                    count += 1
                    if count >= limit_per_feed:
                        break

            except Exception as e:
                logger.warning("Failed to fetch feed %s (%s): %s", source_name, url, e)

        logger.info("Total live news articles gathered: %d", len(all_articles))
        return all_articles

    def aggregate_symbol_sentiment(
        self,
        articles: List[Dict[str, Any]],
        tracked_symbols: Optional[List[str]] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Groups articles by ticker symbol to compute net sentiment and identify Red Flags.
        """
        symbol_map: Dict[str, List[Dict[str, Any]]] = {}
        for a in articles:
            for sym in a.get("symbols", []):
                if sym not in symbol_map:
                    symbol_map[sym] = []
                symbol_map[sym].append(a)

        tracked = tracked_symbols or ["FPT", "HPG", "VCB", "MBB", "TCB", "ACB", "SSI", "VND", "VHM", "MWG", "MSN", "VNM", "DGC", "GAS", "GMD"]
        results: Dict[str, Dict[str, Any]] = {}

        for sym in tracked:
            news_items = symbol_map.get(sym, [])
            if not news_items:
                results[sym] = {
                    "symbol": sym,
                    "news_count": 0,
                    "net_sentiment": 0.0,
                    "status": "THÔNG TIN BÌNH ỔN",
                    "status_badge": "neutral",
                    "has_red_flag": False,
                    "has_catalyst": False,
                    "latest_headline": "Không có thông tin bất thường gần đây",
                    "re_eval_action": "SAFE_HOLD",
                    "action_desc": "Duy trì khuyến nghị định lượng gốc",
                    "sentiment_multiplier": 1.0
                }
                continue

            scores = [n["sentiment_score"] for n in news_items]
            has_red_flag = any(n["is_red_flag"] for n in news_items)
            has_catalyst = any(n["is_catalyst"] for n in news_items)

            # Red flags have overriding priority
            if has_red_flag:
                net_score = min(scores)
                status = "CẢNH BÁO BẤT THƯỜNG (RED FLAG)"
                status_badge = "neg-danger"
                re_eval_action = "VETO_REJECT"
                action_desc = "Phủ quyết / Loại bỏ khẩn cấp khỏi danh mục"
                multiplier = 0.0  # Force exclusion
            elif has_catalyst or (sum(scores) > 0.5):
                net_score = round(sum(scores) / len(scores), 2)
                status = "ĐỘNG LỰC TÍCH CỰC (CATALYST)"
                status_badge = "pos"
                re_eval_action = "STRONG_BUY_CATALYST"
                action_desc = "Ưu tiên giải ngân / Đón sóng thông tin"
                multiplier = 1.20  # +20% boost to score
            elif sum(scores) < -0.3:
                net_score = round(sum(scores) / len(scores), 2)
                status = "THÔNG TIN TIÊU CỰC"
                status_badge = "neg-light"
                re_eval_action = "MONITOR_CAUTION"
                action_desc = "Hạ tỷ trọng / Theo dõi chặt chẽ"
                multiplier = 0.70  # Penalty
            else:
                net_score = round(sum(scores) / len(scores), 2)
                status = "THÔNG TIN ỔN ĐỊNH"
                status_badge = "neutral"
                re_eval_action = "SAFE_HOLD"
                action_desc = "Duy trì tỷ trọng khuyến nghị"
                multiplier = 1.0

            results[sym] = {
                "symbol": sym,
                "news_count": len(news_items),
                "net_sentiment": net_score,
                "status": status,
                "status_badge": status_badge,
                "has_red_flag": has_red_flag,
                "has_catalyst": has_catalyst,
                "latest_headline": news_items[0]["title"],
                "re_eval_action": re_eval_action,
                "action_desc": action_desc,
                "sentiment_multiplier": multiplier,
                "related_news": [
                    {
                        "title": n["title"],
                        "date": n["published_date"],
                        "source": n["source"],
                        "category": n["category"],
                        "sentiment_score": n["sentiment_score"],
                        "sentiment_label": n["sentiment_label"],
                        "link": n.get("link", "")
                    }
                    for n in news_items[:5]
                ]
            }

        return results

    def build_full_intelligence_report(self, tracked_symbols: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Executes end-to-end scanning and builds comprehensive JSON payload for dashboard and advisors.
        """
        articles = self.fetch_live_news()
        symbol_summary = self.aggregate_symbol_sentiment(articles, tracked_symbols)

        # Count metrics
        red_flags_count = sum(1 for s in symbol_summary.values() if s["has_red_flag"])
        catalysts_count = sum(1 for s in symbol_summary.values() if s["has_catalyst"])
        total_scanned = len(articles)

        # Highlighted recent news
        sorted_articles = sorted(articles, key=lambda x: abs(x["sentiment_score"]), reverse=True)

        payload = {
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_news_scanned": total_scanned,
            "red_flags_detected": red_flags_count,
            "catalysts_detected": catalysts_count,
            "system_verdict": "AN TOÀN" if red_flags_count == 0 else f"CẢNH BÁO ({red_flags_count} MÃ RỦI RO BẤT THƯỜNG)",
            "symbols_sentiment": symbol_summary,
            "recent_articles": sorted_articles[:40]
        }

        # Cache locally
        try:
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning("Could not cache news intelligence: %s", e)

        return payload
