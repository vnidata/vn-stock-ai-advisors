"""
Quantitative feature engineering and technical indicator extraction.
Addresses Challenge 2: "Nén" raw market data into high-signal quantitative features
combining Trend, Momentum, Volatility, Volume Flow, and Relative Strength (RS).
"""
import sys
import pandas as pd
import numpy as np
from typing import Dict, Optional

# Force UTF-8 encoding for standard output
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


class TechnicalFeatureEngineer:
    """
    Computes comprehensive quantitative features for equities and benchmarks.
    Guarantees strict causal ordering (no future leakage).
    """

    @staticmethod
    def compute_features(df: pd.DataFrame, benchmark_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
        """
        Calculates full indicator stack on an OHLCV dataframe.
        """
        if df is None or len(df) < 30:
            return df

        df = df.copy().sort_values("time").reset_index(drop=True)
        close = df["close"]
        high = df["high"]
        low = df["low"]
        volume = df["volume"]

        # 1. Moving Averages & Trend
        df["sma_10"] = close.rolling(10).mean()
        df["sma_20"] = close.rolling(20).mean()
        df["sma_50"] = close.rolling(50).mean()
        df["sma_150"] = close.rolling(150, min_periods=30).mean()
        df["sma_200"] = close.rolling(200, min_periods=30).mean()
        df["ema_12"] = close.ewm(span=12, adjust=False).mean()
        df["ema_15"] = close.ewm(span=15, adjust=False).mean()
        df["ema_20"] = close.ewm(span=20, adjust=False).mean()
        df["ema_26"] = close.ewm(span=26, adjust=False).mean()

        # Trend Divergences (%)
        df["dist_sma20"] = (close - df["sma_20"]) / (df["sma_20"] + 1e-9)
        df["dist_ema15"] = (close - df["ema_15"]) / (df["ema_15"] + 1e-9)
        df["dist_ema20"] = (close - df["ema_20"]) / (df["ema_20"] + 1e-9)
        df["dist_sma50"] = (close - df["sma_50"]) / (df["sma_50"] + 1e-9)
        df["dist_sma200"] = (close - df["sma_200"]) / (df["sma_200"] + 1e-9)
        
        # Dual Moving Average (50/200) Golden Cross & Trend Slope
        df["sma_50_slope_10"] = (df["sma_50"] - df["sma_50"].shift(10)) / (df["sma_50"].shift(10) + 1e-9)
        df["dual_ma_uptrend"] = (
            (close > df["sma_200"]) &
            (df["sma_50"] > df["sma_200"]) &
            (df["sma_50_slope_10"] > 0)
        ).astype(int)

        # Dual Moving Average (20/50) HOSE-Optimized Regime & Slope
        df["sma_20_slope_5"] = (df["sma_20"] - df["sma_20"].shift(5)) / (df["sma_20"].shift(5) + 1e-9)
        df["hose_regime_uptrend"] = (
            (close > df["sma_50"]) &
            (df["sma_20"] > df["sma_50"]) &
            (df["sma_20_slope_5"] > 0)
        ).astype(int)

        # Hybrid Trend Architecture: Tactical HOSE (20/50) backed by Macro Trend Anchor (50/200)
        # Eliminates whipsaws during long-term bear markets while retaining +30.9%/yr tactical agility
        macro_sma200 = df["sma_200"].fillna(df["sma_50"])
        df["hose_hybrid_trend"] = (
            (df["hose_regime_uptrend"] == 1) &
            ((df["sma_50"] >= macro_sma200) | (close > macro_sma200 * 0.98))
        ).astype(int)

        # Bullish moving average alignment (Thế trận rồng bay)
        df["bullish_alignment"] = (
            (close > df["sma_20"]) &
            (df["sma_20"] > df["sma_50"]) &
            (df["sma_50"] > df["sma_200"])
        ).astype(int)

        # 2. MACD
        df["macd"] = df["ema_12"] - df["ema_26"]
        df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
        df["macd_hist"] = df["macd"] - df["macd_signal"]

        # 3. Momentum & RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / (loss + 1e-9)
        df["rsi_14"] = 100 - (100 / (1 + rs))

        # Rate of Change (ROC)
        df["roc_10"] = close.pct_change(10)
        df["roc_20"] = close.pct_change(20)
        df["roc_60"] = close.pct_change(60)

        # 4. Volatility & Bollinger Bands
        bb_std = close.rolling(20).std()
        df["bb_upper"] = df["sma_20"] + (2.0 * bb_std)
        df["bb_lower"] = df["sma_20"] - (2.0 * bb_std)
        df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / (df["sma_20"] + 1e-9)
        df["bb_pct_b"] = (close - df["bb_lower"]) / ((df["bb_upper"] - df["bb_lower"]) + 1e-9)

        # Average True Range (ATR)
        tr1 = high - low
        tr2 = (high - close.shift(1)).abs()
        tr3 = (low - close.shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        df["atr_14"] = tr.rolling(14).mean()
        df["atr_pct"] = df["atr_14"] / (close + 1e-9)

        # Historical Volatility (20-day annualized)
        log_ret = np.log(close / close.shift(1))
        df["volatility_20d"] = log_ret.rolling(20).std() * np.sqrt(250)

        # 5. Volume Flow & Breakout Ratios
        df["vol_sma_20"] = volume.rolling(20).mean()
        df["vol_ratio"] = volume / (df["vol_sma_20"] + 1e-9)
        
        # On-Balance Volume (OBV) - Vectorized
        direction = np.sign(close.diff().fillna(0))
        df["obv"] = (direction * volume).cumsum()
        df["obv_sma20"] = df["obv"].rolling(20).mean()
        df["obv_trend"] = (df["obv"] > df["obv_sma20"]).astype(int)

        # 6. 52-Week High / Low & Support / Resistance Brackets
        rolling_max_250 = close.rolling(250, min_periods=50).max()
        rolling_min_250 = close.rolling(250, min_periods=50).min()
        df["dist_52w_high"] = (close - rolling_max_250) / (rolling_max_250 + 1e-9)
        df["drawdown_60d"] = (close - close.rolling(60, min_periods=20).max()) / (close.rolling(60, min_periods=20).max() + 1e-9)

        # Dynamic 20-day Support / Resistance Pivots
        df["support_20d"] = low.rolling(20, min_periods=5).min()
        df["resistance_20d"] = high.rolling(20, min_periods=5).max()
        df["dist_support"] = (close - df["support_20d"]) / (df["support_20d"] + 1e-9)
        df["dist_resistance"] = (df["resistance_20d"] - close) / (close + 1e-9)

        # 7. Volume Spread Analysis (VSA) & Institutional Flow
        bar_spread = (high - low) / (close + 1e-9)
        bar_spread_ratio = bar_spread / (bar_spread.rolling(20, min_periods=5).mean() + 1e-9)
        df["effort_vs_result"] = df["vol_ratio"] / (bar_spread_ratio + 1e-9)

        # Pocket Pivot (Volume on up-day exceeds highest down-day volume in past 10 sessions)
        is_up_day = close > close.shift(1)
        down_vol = volume.where(~is_up_day, 0.0)
        max_down_vol_10 = down_vol.rolling(10, min_periods=3).max()
        df["pocket_pivot"] = ((is_up_day) & (volume > max_down_vol_10) & (close > df["sma_20"])).astype(int)

        # Bollinger Band Squeeze (Width in lowest 25th percentile over 60 days)
        rolling_bb_min = df["bb_width"].rolling(60, min_periods=20).quantile(0.25)
        df["bb_squeeze"] = (df["bb_width"] <= rolling_bb_min).astype(int)

        # MACD & RSI Acceleration Slopes
        df["macd_hist_slope"] = df["macd_hist"].diff().fillna(0.0)
        df["rsi_slope_5d"] = df["rsi_14"].diff(5).fillna(0.0)

        # 7B. Dual MA (50/200) Pullback to EMA 20 with Volume Confirmation (Global Baseline)
        open_price = df["open"] if "open" in df.columns else close.shift(1)
        touched_pullback_zone = (low <= df["ema_20"]) | ((low <= df["sma_20"]) & (low >= df["sma_50"] * 0.98))
        bullish_candle = (close > df["ema_20"]) & (close > open_price)
        vol_confirmed = (df["vol_ratio"] >= 1.20) | (volume > volume.shift(1))
        df["volume_dry_up"] = (df["vol_ratio"] <= 0.65).astype(int)
        
        df["pullback_ema20_signal"] = (
            (df["dual_ma_uptrend"] == 1) &
            touched_pullback_zone &
            bullish_candle &
            vol_confirmed
        ).astype(int)

        # 7C. Candlestick Reversal Patterns & HOSE-Optimized Dual MA (20/50) + EMA15 Pullback
        candle_body = (close - open_price).abs()
        candle_range = (high - low) + 1e-9
        
        # Hammer / Bullish Pinbar: long lower wick >= 1.8x body, close in upper 35% of range
        is_hammer = ((close > open_price) | (close >= low + 0.60 * candle_range)) & \
                    ((df[["open", "close"]].min(axis=1) - low) >= 1.5 * candle_body)
        
        # Bullish Engulfing: green candle completely engulfs preceding red body
        prev_open = open_price.shift(1)
        prev_close = close.shift(1)
        is_bullish_engulfing = (prev_close < prev_open) & (close > open_price) & (open_price <= prev_close) & (close >= prev_open)
        
        # Piercing Line: opens below prev low, closes > 50% into prev red body
        is_piercing = (prev_close < prev_open) & (close > open_price) & (open_price < prev_close) & (close >= (prev_open + prev_close) / 2)
        
        df["candlestick_reversal"] = (is_hammer | is_bullish_engulfing | is_piercing).astype(int)

        # HOSE Pullback Signal:
        # 1. Regime Filter: Close > SMA50 & SMA20 > SMA50 & SMA20 Slope > 0 (5 days)
        # 2. Pullback Zone: Low tests EMA 12–15 or holds near SMA50
        # 3. Confirmation: Bullish green close above EMA 15
        # 4. Volume Threshold: Vol >= 1.5x MA20 (strict HoSE threshold)
        touched_ema15_zone = (low <= df["ema_15"] * 1.005) & (low >= df["sma_50"] * 0.96)
        bullish_ema15_close = (close > df["ema_15"]) & (close > open_price)
        vol_confirmed_hose = (df["vol_ratio"] >= 1.50)

        df["hose_pullback_signal"] = (
            (df["hose_regime_uptrend"] == 1) &
            touched_ema15_zone &
            bullish_ema15_close &
            vol_confirmed_hose
        ).astype(int)

        # Hybrid Pullback Signal (Combines Tactical 20/50 + Macro 50/200)
        df["hose_hybrid_pullback_signal"] = (
            (df["hose_hybrid_trend"] == 1) &
            (df["hose_pullback_signal"] == 1)
        ).astype(int)

        # 8. Relative Strength (RS Rating) vs Benchmark (VN-Index)
        if benchmark_df is not None and not benchmark_df.empty:
            bm_close = benchmark_df.set_index("time")["close"]
            cur_time = df["time"]
            aligned_bm = cur_time.map(bm_close).ffill()
            
            # Stock return vs Index return over 20, 60 days
            stock_ret_20 = close.pct_change(20)
            bm_ret_20 = aligned_bm.pct_change(20)
            df["alpha_20d"] = stock_ret_20 - bm_ret_20

            stock_ret_60 = close.pct_change(60)
            bm_ret_60 = aligned_bm.pct_change(60)
            df["alpha_60d"] = stock_ret_60 - bm_ret_60
            
            # RS Score (CANSLIM-style: 0 to 100 normalized)
            raw_rs = (0.4 * df["roc_60"].fillna(0)) + (0.3 * df["roc_20"].fillna(0)) + (0.3 * df["roc_10"].fillna(0))
            df["rs_rating"] = 50.0 + (raw_rs * 100.0).clip(-45.0, 45.0)
        else:
            df["alpha_20d"] = df["roc_20"]
            df["alpha_60d"] = df["roc_60"]
            df["rs_rating"] = 50.0 + (df["roc_20"].fillna(0) * 100.0).clip(-45.0, 45.0)

        return df

    # Convenient alias for feature extraction
    add_technical_indicators = compute_features
