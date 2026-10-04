"""
Stock Universe definition and Point-in-Time Liquidity Filter.
Solves Challenge 1: Liquidity barriers and dynamic universe selection (Top 20-50).
Prevents survivorship bias and eliminates illiquid slippage risks.
"""
from typing import List, Dict, Optional
import pandas as pd
import numpy as np

# Curated investable stock pool in Vietnam market (VN30 + Top liquid leading mid-caps)
CORE_VN_UNIVERSE = [
    # Technology & Telecommunications
    "FPT", "CMG", "ELC",
    # Banking (Trụ cột thị trường)
    "VCB", "MBB", "TCB", "ACB", "CTG", "BID", "STB", "VPB", "HDB", "TPB", "MSB", "SHB",
    # Securities & Brokerage (Nhạy sóng thanh khoản)
    "SSI", "VND", "VCI", "HCM", "MBS", "FTS", "BSI",
    # Steel & Materials (Nguyên vật liệu)
    "HPG", "HSG", "NKG", "DGC",
    # Real Estate & Industrial Parks (Bất động sản dân cư & KCN)
    "VHM", "VIC", "VRE", "KDH", "NLG", "PDR", "DIG", "KBC", "IDC", "SZC",
    # Retail & Consumer Goods (Bán lẻ & Tiêu dùng)
    "MWG", "PNJ", "MSN", "VNM", "SAB", "DGW", "FRT",
    # Oil, Gas & Energy (Năng lượng)
    "GAS", "PLX", "PVD", "PVS", "POW", "PC1", "REE",
    # Transportation & Ports (Logistics & Cảng biển)
    "GMD", "VSC", "HAH",
    # Agriculture & Food
    "DBC", "BAF"
]

SECTOR_MAP: Dict[str, str] = {
    "FPT": "Technology", "CMG": "Technology", "ELC": "Technology",
    "VCB": "Banking", "MBB": "Banking", "TCB": "Banking", "ACB": "Banking",
    "CTG": "Banking", "BID": "Banking", "STB": "Banking", "VPB": "Banking",
    "HDB": "Banking", "TPB": "Banking", "MSB": "Banking", "SHB": "Banking",
    "SSI": "Securities", "VND": "Securities", "VCI": "Securities",
    "HCM": "Securities", "MBS": "Securities", "FTS": "Securities", "BSI": "Securities",
    "HPG": "Materials", "HSG": "Materials", "NKG": "Materials", "DGC": "Chemicals",
    "VHM": "RealEstate", "VIC": "RealEstate", "VRE": "RealEstate",
    "KDH": "RealEstate", "NLG": "RealEstate", "PDR": "RealEstate",
    "DIG": "RealEstate", "KBC": "IndustrialRealEstate", "IDC": "IndustrialRealEstate",
    "SZC": "IndustrialRealEstate",
    "MWG": "Retail", "PNJ": "Retail", "MSN": "Consumer", "VNM": "Consumer",
    "SAB": "Consumer", "DGW": "Retail", "FRT": "Retail",
    "GAS": "Energy", "PLX": "Energy", "PVD": "Energy", "PVS": "Energy",
    "POW": "Energy", "PC1": "Energy", "REE": "Industrial",
    "GMD": "Logistics", "VSC": "Logistics", "HAH": "Logistics",
    "DBC": "Agriculture", "BAF": "Agriculture"
}


class StockUniverse:
    """
    Manages investable equity universe for AI Advisors.
    Applies Point-in-Time (PIT) liquidity filtering based strictly on trailing information
    to guarantee no lookahead bias.
    """
    def __init__(self, symbols: Optional[List[str]] = None):
        self.symbols = symbols if symbols is not None else CORE_VN_UNIVERSE

    def get_base_universe(self) -> List[str]:
        """Return the complete base symbol universe."""
        return list(self.symbols)

    def get_sector(self, symbol: str) -> str:
        """Return ICB/Sector for a given stock symbol."""
        return SECTOR_MAP.get(symbol.upper(), "Diversified")

    def filter_liquid_universe(
        self,
        market_data_dict: Dict[str, pd.DataFrame],
        as_of_date: pd.Timestamp,
        top_n: int = 30,
        lookback_days: int = 20
    ) -> List[str]:
        """
        Point-in-Time (PIT) Liquidity Screener:
        At date T, compute the 20-day trailing median turnover = Volume * Close.
        Rank and select top N symbols with highest liquidity.
        Strictly strictly uses data prior to as_of_date (T-1).
        """
        turnover_records = []
        
        for symbol, df in market_data_dict.items():
            if symbol == "VNINDEX":
                continue
            
            # Point-in-time slice: only past data before current rebalance date
            past_df = df[df["time"] < as_of_date]
            if len(past_df) < lookback_days:
                continue
            
            tail = past_df.tail(lookback_days)
            daily_turnover = tail["close"] * tail["volume"]
            median_turnover = daily_turnover.median()
            avg_volume = tail["volume"].mean()
            
            turnover_records.append({
                "symbol": symbol,
                "median_turnover": median_turnover,
                "avg_volume": avg_volume
            })
            
        if not turnover_records:
            return self.symbols[:top_n]
            
        turnover_df = pd.DataFrame(turnover_records)
        turnover_df = turnover_df.sort_values(by="median_turnover", ascending=False)
        return turnover_df["symbol"].head(top_n).tolist()
