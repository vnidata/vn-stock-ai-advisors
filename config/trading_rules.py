"""
Vietnam Stock Market specific trading rules, settlement constraints, and friction costs.
Accurately models T+2 settlement, lot size (100 shares), price limits, commissions, and taxes.
"""
from dataclasses import dataclass
import math

@dataclass
class VietnamTradingRules:
    """Trading mechanics and market microstructure constraints in Vietnam."""
    # Settlement rules
    settlement_days: int = 2          # T+2 trading settlement in Vietnam
    lot_size: int = 100               # Standard board lot size (100 shares)
    
    # Daily price fluctuation limits
    hose_price_limit: float = 0.07    # +/- 7% on HOSE
    hnx_price_limit: float = 0.10     # +/- 10% on HNX
    upcom_price_limit: float = 0.15   # +/- 15% on UPCOM
    
    # Transaction costs & frictions
    brokerage_fee_rate: float = 0.0015     # 0.15% brokerage fee per trade
    personal_income_tax_rate: float = 0.001 # 0.10% PIT on gross sale proceeds
    slippage_rate: float = 0.0010          # 0.10% estimated market impact / slippage
    
    # Portfolio constraints
    min_cash_reserve_ratio: float = 0.02   # Keep 2% cash buffer for fees and dividend tracking
    max_single_stock_weight: float = 0.30  # Max 30% NAV in any single stock to ensure diversification
    
    def round_to_lot(self, shares: float) -> int:
        """Round down share quantity to standard 100-share lot size."""
        if shares <= 0:
            return 0
        return int(math.floor(shares / self.lot_size) * self.lot_size)
    
    def calculate_buy_cost(self, shares: int, price: float) -> float:
        """
        Calculate total cash required to buy shares including fee and slippage.
        Executed price = price * (1 + slippage)
        Fee = executed_value * brokerage_fee_rate
        """
        if shares <= 0:
            return 0.0
        exec_price = price * (1.0 + self.slippage_rate)
        exec_value = shares * exec_price
        total_fee = exec_value * self.brokerage_fee_rate
        return exec_value + total_fee
    
    def calculate_sell_proceeds(self, shares: int, price: float) -> float:
        """
        Calculate net cash received from selling shares after fee, tax, and slippage.
        Executed price = price * (1 - slippage)
        Fee = executed_value * brokerage_fee_rate
        Tax = executed_value * personal_income_tax_rate
        Net cash = executed_value - Fee - Tax
        """
        if shares <= 0:
            return 0.0
        exec_price = price * (1.0 - self.slippage_rate)
        exec_value = shares * exec_price
        total_fee = exec_value * self.brokerage_fee_rate
        tax = exec_value * self.personal_income_tax_rate
        return exec_value - total_fee - tax
    
    def round_price(self, price: float) -> float:
        """
        Round price to valid tick size on HOSE:
        < 10,000 VND: tick 10 VND
        10,000 - 49,950 VND: tick 50 VND
        >= 50,000 VND: tick 100 VND
        (Prices in vnstock are usually in thousands VND: e.g. 25.5 = 25,500 VND)
        """
        return round(price, 2)


@dataclass
class InternationalTradingRules(VietnamTradingRules):
    """Trading mechanics and microstructure constraints for International Equities (US Markets)."""
    settlement_days: int = 1               # T+1 trading settlement (US standard since May 2024)
    lot_size: int = 1                      # 1-share board lot / fractional shares allowed
    hose_price_limit: float = 1.0          # No daily price ceiling/floor in US equities
    hnx_price_limit: float = 1.0
    upcom_price_limit: float = 1.0
    brokerage_fee_rate: float = 0.0005     # 0.05% institutional / low-cost brokerage
    personal_income_tax_rate: float = 0.0  # Gross sale does not withhold PIT at broker level
    slippage_rate: float = 0.0005          # 0.05% tight bid-ask spread for US Mega-Caps
    min_cash_reserve_ratio: float = 0.01   # Keep 1% cash buffer
    max_single_stock_weight: float = 0.30  # Max 30% NAV in any single stock

