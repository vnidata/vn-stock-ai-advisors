"""
AlphaQuant AI - Institutional QA & Comprehensive End-to-End System Test Suite
Covers: HTML DOM verification, JSON schema validation, Risk rules, and Quantitative invariants.
"""

import os
import json
import glob
import re
import pytest
from bs4 import BeautifulSoup

import sys
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
DOCS_DIR = os.path.join(ROOT_DIR, "docs")
DATA_DIR = os.path.join(DOCS_DIR, "data")
INDEX_HTML = os.path.join(DOCS_DIR, "index.html")
APP_JS = os.path.join(DOCS_DIR, "app.js")
STYLE_CSS = os.path.join(DOCS_DIR, "style.css")


@pytest.fixture(scope="module")
def html_soup():
    assert os.path.exists(INDEX_HTML), f"index.html not found at {INDEX_HTML}"
    with open(INDEX_HTML, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
    return soup


@pytest.fixture(scope="module")
def daily_summary_vn():
    fpath = os.path.join(DATA_DIR, "daily_summary.json")
    assert os.path.exists(fpath), f"daily_summary.json not found at {fpath}"
    with open(fpath, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def daily_summary_us():
    fpath = os.path.join(DATA_DIR, "daily_summary_us.json")
    assert os.path.exists(fpath), f"daily_summary_us.json not found at {fpath}"
    with open(fpath, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def trades_history():
    fpath = os.path.join(DATA_DIR, "trades_history.json")
    assert os.path.exists(fpath), f"trades_history.json not found at {fpath}"
    with open(fpath, "r", encoding="utf-8") as f:
        return json.load(f)


# ==============================================================================
# TEST SUITE 1: DOM ARCHITECTURE & USER INTERFACE ELEMENTS
# ==============================================================================

class TestDOMArchitecture:
    """Verifies all required navigation, controls, modals, and container elements exist."""

    def test_essential_header_elements(self, html_soup):
        assert html_soup.find(id="live-clock") is not None
        assert html_soup.find(id="clock-time") is not None
        assert html_soup.find(id="btn-refresh-data") is not None
        assert html_soup.find(id="system-status-text") is not None
        assert html_soup.find(id="last-updated-text") is not None
        assert html_soup.find(id="scan-countdown-widget") is not None
        assert html_soup.find(id="next-scan-slot") is not None
        assert html_soup.find(id="next-scan-timer") is not None

    def test_stock_lookup_elements(self, html_soup):
        # 1. Navbar Search Box
        assert html_soup.find(id="nav-stock-lookup-box") is not None
        assert html_soup.find(id="nav-stock-lookup-input") is not None
        assert html_soup.find(id="btn-nav-stock-lookup") is not None

        # 2. Main Ribbon Search Box
        assert html_soup.find(id="ticker-lookup-ribbon") is not None
        assert html_soup.find(id="main-stock-lookup-input") is not None
        assert html_soup.find(id="btn-main-stock-lookup") is not None
        assert html_soup.find(id="btn-clear-lookup-input") is not None
        assert html_soup.find(id="lookup-quick-chips") is not None

        # Quick chips must include core liquid symbols
        chips = [btn.get("data-sym") for btn in html_soup.select("#lookup-quick-chips .chip-sym-btn")]
        for core_sym in ["HPG", "FPT", "TCB", "MBB", "SSI", "VHM", "MSN"]:
            assert core_sym in chips, f"Core symbol {core_sym} missing from quick chips"

    def test_market_selector_and_ticker(self, html_soup):
        assert html_soup.find(id="btn-market-vn") is not None
        assert html_soup.find(id="btn-market-us") is not None
        assert html_soup.find(id="ai-scan-ticker") is not None
        assert html_soup.find(id="ticker-headline") is not None

    def test_six_navigation_tabs(self, html_soup):
        expected_tabs = [
            "tab-buy-signals",
            "tab-sell-signals",
            "tab-trades",
            "tab-performance",
            "tab-news-actions",
            "tab-evolution"
        ]
        for tab_id in expected_tabs:
            tab_btn = html_soup.find(attrs={"data-tab": tab_id})
            tab_pane = html_soup.find(id=tab_id)
            assert tab_btn is not None, f"Tab button for {tab_id} missing"
            assert tab_pane is not None, f"Tab pane for {tab_id} missing"

    def test_mobile_bottom_navigation(self, html_soup):
        mob_nav = html_soup.find(id="mobile-bottom-nav")
        assert mob_nav is not None
        mob_btns = [btn.get("data-tab") for btn in mob_nav.find_all("button")]
        assert "tab-buy-signals" in mob_btns
        assert "tab-sell-signals" in mob_btns
        assert "tab-trades" in mob_btns
        assert "tab-performance" in mob_btns
        assert "tab-news-actions" in mob_btns

    def test_modals_exist(self, html_soup):
        # Stock Diagnosis Modal
        diag_modal = html_soup.find(id="modal-stock-diagnosis")
        assert diag_modal is not None
        assert html_soup.find(id="btn-close-stock-diagnosis") is not None
        assert html_soup.find(id="btn-close-diag-footer") is not None
        assert html_soup.find(id="btn-diag-quick-trade") is not None
        assert html_soup.find(id="btn-diag-view-trades") is not None
        assert html_soup.find(id="stock-diagnosis-content") is not None

        # Quick Trade Modal
        trade_modal = html_soup.find(id="quick-trade-modal")
        assert trade_modal is not None
        assert html_soup.find(id="btn-close-quick-trade") is not None
        assert html_soup.find(id="btn-cancel-quick-trade") is not None
        assert html_soup.find(id="btn-confirm-quick-trade") is not None
        assert html_soup.find(id="modal-alloc-slider") is not None


# ==============================================================================
# TEST SUITE 2: DATA INTEGRITY & QUANT INVARIANTS
# ==============================================================================

class TestDataIntegrity:
    """Verifies JSON schema correctness, absence of virtual recommendations, and data consistency."""

    def test_all_json_files_parseable(self):
        json_files = glob.glob(os.path.join(DATA_DIR, "*.json"))
        assert len(json_files) >= 8, f"Expected at least 8 json data files, found {len(json_files)}"
        for fpath in json_files:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                assert data is not None, f"Empty JSON in {fpath}"

    def test_daily_summary_structure(self, daily_summary_vn):
        assert "vnindex" in daily_summary_vn
        assert "portfolio_summary" in daily_summary_vn
        assert "current_holdings" in daily_summary_vn
        assert "watchlist_items" in daily_summary_vn
        assert "news_radar" in daily_summary_vn
        assert "sell_signals" in daily_summary_vn
        assert "buy_signals" in daily_summary_vn

    def test_bear_regime_cash_defense_rule(self, daily_summary_vn):
        """CRITICAL INVARIANT: In Bear regime, buy_signals MUST be 0 (100% Cash Defense)."""
        regime = daily_summary_vn["vnindex"]["regime"]
        if regime == "BEAR":
            buy_signals = daily_summary_vn.get("buy_signals", [])
            assert len(buy_signals) == 0, (
                f"VIOLATION: Found {len(buy_signals)} buy signals during BEAR REGIME! "
                f"Cash defense rule demands 0 new buy signals."
            )

    def test_watchlist_completeness(self, daily_summary_vn):
        wl = daily_summary_vn["watchlist_items"]
        assert len(wl) == 15, f"Expected exactly 15 watchlist stocks, found {len(wl)}"
        for it in wl:
            assert "symbol" in it and len(it["symbol"]) >= 3
            assert "current_price" in it and it["current_price"] > 0
            assert "volume" in it and it["volume"] >= 0
            assert "rs_rating" in it and 0 <= it["rs_rating"] <= 100
            assert "rsi_14" in it and 0 <= it["rsi_14"] <= 100
            assert "ai_radar_action" in it and len(it["ai_radar_action"]) > 5
            assert "selection_reason" in it and len(it["selection_reason"]) > 10
            assert "quant_criteria" in it and len(it["quant_criteria"]) > 5

    def test_current_holdings_integrity(self, daily_summary_vn):
        holdings = daily_summary_vn["current_holdings"]
        assert len(holdings) == 14, f"Expected 14 active open holdings, found {len(holdings)}"
        summary_count = daily_summary_vn["portfolio_summary"]["total_positions"]
        assert summary_count == len(holdings), f"Mismatch: summary={summary_count} vs array={len(holdings)}"

        for h in holdings:
            assert "symbol" in h
            assert "advisor" in h
            assert "entry_price" in h and h["entry_price"] > 0
            assert "entry_date" in h
            assert "current_price" in h and h["current_price"] > 0
            assert "current_return_pct" in h
            assert "stop_loss" in h and h["stop_loss"] > 0
            assert "target_price" in h and h["target_price"] > 0

    def test_trades_history_data(self, trades_history):
        trades = trades_history.get("trades", [])
        assert len(trades) >= 2000, f"Expected >= 2000 historical trades, found {len(trades)}"
        for t in trades[:100]:  # Sample check first 100 trades
            assert "symbol" in t
            assert "advisor" in t
            assert "entry_date" in t
            assert "exit_date" in t
            assert "entry_price" in t and t["entry_price"] > 0
            assert "exit_price" in t and t["exit_price"] > 0
            assert "return_pct" in t
            assert "pnl_vnd" in t

    def test_live_phase_date_boundary(self, daily_summary_vn):
        """Deployment date MUST be 2026-01-01 as requested by user."""
        dep_date = daily_summary_vn["portfolio_summary"].get("deployment_date")
        assert dep_date == "2026-01-01", f"Expected deployment_date 2026-01-01, got {dep_date}"


# ==============================================================================
# TEST SUITE 3: CODE INTEGRITY & SYNTAX
# ==============================================================================

class TestCodeSyntaxAndStructure:

    def test_javascript_syntax_clean(self):
        import subprocess
        res = subprocess.run(["node", "-c", APP_JS], capture_output=True, text=True)
        assert res.returncode == 0, f"JavaScript syntax error in docs/app.js: {res.stderr}"

    def test_no_forbidden_virtual_recommendations_in_daily_update(self):
        fpath = os.path.join(ROOT_DIR, "scripts", "daily_update.py")
        with open(fpath, "r", encoding="utf-8") as f:
            code = f.read()
        assert 'market_regime != "BEAR"' in code or "market_regime == 'BEAR'" in code, "daily_update.py must explicitly check bear regime"
        assert "buy_signals = []" in code, "daily_update.py must enforce 0 buy signals in bear regime"


# ==============================================================================
# TEST SUITE 4: HOSE-OPTIMIZED QUANTITATIVE STRATEGY & RISK INVARIANTS
# ==============================================================================

class TestHoseQuantStrategy:
    """Verifies HOSE-tailored Dual MA 20/50, Pullback EMA15, Volume 1.5x, and 2.0x ATR risk rules."""

    def test_hose_indicator_feature_engineering(self):
        import pandas as pd
        import numpy as np
        from data.indicators import TechnicalFeatureEngineer

        n = 120
        dates = pd.date_range("2026-01-01", periods=n)
        # Construct an uptrending stock with pullback
        close = np.linspace(20.0, 35.0, n)
        high = close + 0.5
        low = close - 0.5
        df = pd.DataFrame({
            "time": dates,
            "open": close - 0.1,
            "high": high,
            "low": low,
            "close": close,
            "volume": np.full(n, 2000000)
        })

        feat_df = TechnicalFeatureEngineer.compute_features(df)
        required_cols = [
            "ema_12", "ema_15", "ema_20", "dist_ema15",
            "sma_20", "sma_50", "sma_20_slope_5",
            "hose_regime_uptrend", "candlestick_reversal",
            "hose_pullback_signal"
        ]
        for col in required_cols:
            assert col in feat_df.columns, f"HOSE indicator column '{col}' missing from feature stack"

        # Check uptrend condition logic on late rows
        tail = feat_df.tail(10)
        assert (tail["hose_regime_uptrend"] == 1).all(), "Late rows of strong linear uptrend must satisfy hose_regime_uptrend == 1"

    def test_hose_risk_parameters_and_sizing(self):
        from portfolio.risk_manager import RiskParameters, RiskManager

        params = RiskParameters(market="VN")
        # 1. Stop loss ATR multiplier between 1.8 and 2.2x ATR
        assert 1.8 <= params.stop_loss_atr_mult <= 2.2, f"Expected HOSE ATR stop 1.8-2.2x, got {params.stop_loss_atr_mult}"
        # 2. Trailing ATR multiplier 2.0x
        assert params.trailing_atr_mult == 2.0
        # 3. Position risk 0.5% - 0.8% NAV per trade
        assert 0.005 <= params.risk_per_trade_nav_pct <= 0.008
        # 4. Total portfolio open risk <= 4.5% - 5.0% NAV
        assert params.max_portfolio_risk_pct <= 0.050
        # 5. Time-stop sessions between 25 and 30
        assert 25 <= params.time_stop_sessions <= 30

        # Dynamic entry brackets test
        brackets = RiskManager.calculate_dynamic_entry_brackets(
            entry_price=30.0,
            atr_14=1.2,
            support_price=28.5,
            min_rr=2.85,
            atr_multiplier=2.0
        )
        assert brackets["entry_price"] == 30.0
        assert brackets["stop_loss"] < 30.0
        assert brackets["target_price"] > 30.0
        assert brackets["rr_ratio"] >= 2.85, f"R:R ratio must be >= 2.85, got {brackets['rr_ratio']}"


if __name__ == "__main__":
    pytest.main(["-v", __file__])

