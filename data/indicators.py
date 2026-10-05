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
        df["sma_150"] = close.rolling(150).mean()
        df["sma_200"] = close.rolling(200).mean()
        df["ema_12"] = close.ewm(span=12, adjust=False).mean()
        df["ema_26"] = close.ewm(span=26, adjust=False).mean()

        # Trend Divergences (%)
        df["dist_sma20"] = (close - df["sma_20"]) / (df["sma_20"] + 1e-9)
        df["dist_sma50"] = (close - df["sma_50"]) / (df["sma_50"] + 1e-9)
        df["dist_sma200"] = (close - df["sma_200"]) / (df["sma_200"] + 1e-9)
        
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

        # 6. 52-Week High / Low & Drawdown
        rolling_max_250 = close.rolling(250, min_periods=50).max()
        rolling_min_250 = close.rolling(250, min_periods=50).min()
        df["dist_52w_high"] = (close - rolling_max_250) / (rolling_max_250 + 1e-9)
        df["drawdown_60d"] = (close - close.rolling(60, min_periods=20).max()) / (close.rolling(60, min_periods=20).max() + 1e-9)

        # 7. Relative Strength (RS Rating) vs Benchmark (VN-Index)
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
