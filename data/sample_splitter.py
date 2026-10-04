"""
Sample Splitter implementation.
Addresses Challenge 3: Preventing Lookahead Bias and Data Leakage.
Strictly segments market data into 3 distinct chronological phases:
1. Training Phase: [Q3/2018 - Q2/2022] (Historical pattern recognition)
2. Validation Phase: [Q3/2022 - Q2/2024] (Parameter calibration & Model selection)
3. Out-of-Sample Phase: [Q3/2024 - Present] (True blind forward-testing & Live battle simulation)
"""
from typing import Dict, Tuple
import pandas as pd
from config.settings import PeriodConfig


class SampleSplitter:
    """
    Chronological partitioner that guarantees strict boundary enforcement.
    No test or out-of-sample data is ever touched during the training phase.
    """

    def __init__(self, periods: PeriodConfig):
        self.train_start = pd.to_datetime(periods.train_start)
        self.train_end = pd.to_datetime(periods.train_end)
        self.val_start = pd.to_datetime(periods.val_start)
        self.val_end = pd.to_datetime(periods.val_end)
        self.oos_start = pd.to_datetime(periods.oos_start)
        self.oos_end = pd.to_datetime(periods.oos_end)

    def split_dataframe(self, df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
        """
        Split a single DataFrame into train, val, and out_of_sample slices.
        """
        if df is None or df.empty or "time" not in df.columns:
            return {"train": pd.DataFrame(), "val": pd.DataFrame(), "oos": pd.DataFrame()}

        times = pd.to_datetime(df["time"])
        
        train_df = df[(times >= self.train_start) & (times <= self.train_end)].copy()
        val_df = df[(times >= self.val_start) & (times <= self.val_end)].copy()
        oos_df = df[(times >= self.oos_start) & (times <= self.oos_end)].copy()

        return {
            "train": train_df.reset_index(drop=True),
            "val": val_df.reset_index(drop=True),
            "oos": oos_df.reset_index(drop=True)
        }

    def split_market_data(
        self, market_data_dict: Dict[str, pd.DataFrame]
    ) -> Tuple[Dict[str, pd.DataFrame], Dict[str, pd.DataFrame], Dict[str, pd.DataFrame]]:
        """
        Partition an entire market data dictionary (all symbols).
        Returns (train_dict, val_dict, oos_dict).
        """
        train_dict = {}
        val_dict = {}
        oos_dict = {}

        for symbol, df in market_data_dict.items():
            splits = self.split_dataframe(df)
            if not splits["train"].empty:
                train_dict[symbol] = splits["train"]
            if not splits["val"].empty:
                val_dict[symbol] = splits["val"]
            if not splits["oos"].empty:
                oos_dict[symbol] = splits["oos"]

        return train_dict, val_dict, oos_dict
