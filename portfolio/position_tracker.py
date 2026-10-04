"""
Position tracking, NAV calculation, and trade execution logger.
Faithfully enforces T+2 settlement lockup, board lot 100 shares, and fee tracking.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional
import pandas as pd
from config.trading_rules import VietnamTradingRules


@dataclass
class Position:
    symbol: str
    shares: int
    entry_price: float
    entry_date: pd.Timestamp
    days_held: int = 0
    current_price: float = 0.0

    @property
    def market_value(self) -> float:
        return self.shares * self.current_price

    @property
    def cost_basis(self) -> float:
        return self.shares * self.entry_price

    @property
    def unrealized_pnl(self) -> float:
        return self.market_value - self.cost_basis

    @property
    def unrealized_pnl_pct(self) -> float:
        if self.cost_basis <= 0:
            return 0.0
        return self.unrealized_pnl / self.cost_basis


@dataclass
class TradeRecord:
    date: pd.Timestamp
    symbol: str
    action: str  # "BUY" or "SELL"
    shares: int
    price: float
    gross_value: float
    fees: float
    tax: float
    net_cash_flow: float
    realized_pnl: float = 0.0
    reason: str = "REBALANCE"


class PositionTracker:
    """
    Maintains the live state of a portfolio during simulated or live trading.
    """

    def __init__(self, initial_capital: float = 1_000_000_000.0, rules: Optional[VietnamTradingRules] = None):
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.rules = rules or VietnamTradingRules()
        self.positions: Dict[str, Position] = {}
        self.trade_history: List[TradeRecord] = []
        self.daily_snapshots: List[Dict] = []
        self.cumulative_turnover_value: float = 0.0

    def update_day(self, current_date: pd.Timestamp, prices_dict: Dict[str, float]):
        """
        End-of-day update: increments holding days and marks positions to market.
        Records a daily snapshot for performance analysis.
        """
        total_market_value = 0.0
        for sym, pos in list(self.positions.items()):
            pos.days_held += 1
            if sym in prices_dict:
                pos.current_price = prices_dict[sym]
            total_market_value += pos.market_value

        nav = self.cash + total_market_value
        prev_nav = self.daily_snapshots[-1]["nav"] if self.daily_snapshots else self.initial_capital
        daily_ret = (nav - prev_nav) / prev_nav if prev_nav > 0 else 0.0

        self.daily_snapshots.append({
            "time": current_date,
            "nav": nav,
            "cash": self.cash,
            "market_value": total_market_value,
            "daily_return": daily_ret,
            "num_positions": len(self.positions)
        })

    def execute_buy(
        self,
        date: pd.Timestamp,
        symbol: str,
        target_amount: float,
        current_price: float,
        reason: str = "REBALANCE"
    ) -> bool:
        """
        Execute BUY order respecting cash balance, 100-share lot size, fee, and slippage.
        """
        if target_amount <= 0 or current_price <= 0:
            return False

        # Available cash minus safety buffer
        spendable_cash = min(self.cash, target_amount)
        if spendable_cash < current_price * 100:
            return False

        # Raw estimate of shares
        raw_shares = spendable_cash / (current_price * (1.0 + self.rules.slippage_rate + self.rules.brokerage_fee_rate))
        shares_to_buy = self.rules.round_to_lot(raw_shares)
        if shares_to_buy <= 0:
            return False

        total_cash_needed = self.rules.calculate_buy_cost(shares_to_buy, current_price)
        while total_cash_needed > self.cash and shares_to_buy >= self.rules.lot_size:
            shares_to_buy -= self.rules.lot_size
            total_cash_needed = self.rules.calculate_buy_cost(shares_to_buy, current_price)

        if shares_to_buy <= 0 or total_cash_needed > self.cash:
            return False

        exec_price = current_price * (1.0 + self.rules.slippage_rate)
        gross_value = shares_to_buy * exec_price
        fee = gross_value * self.rules.brokerage_fee_rate

        self.cash -= total_cash_needed
        self.cumulative_turnover_value += gross_value

        if symbol in self.positions:
            # Average down/up
            existing = self.positions[symbol]
            new_total_shares = existing.shares + shares_to_buy
            new_cost_basis = existing.cost_basis + gross_value
            existing.entry_price = new_cost_basis / new_total_shares
            existing.shares = new_total_shares
            existing.current_price = current_price
        else:
            self.positions[symbol] = Position(
                symbol=symbol,
                shares=shares_to_buy,
                entry_price=exec_price,
                entry_date=date,
                days_held=0,
                current_price=current_price
            )

        self.trade_history.append(TradeRecord(
            date=date,
            symbol=symbol,
            action="BUY",
            shares=shares_to_buy,
            price=current_price,
            gross_value=gross_value,
            fees=fee,
            tax=0.0,
            net_cash_flow=-total_cash_needed,
            reason=reason
        ))
        return True

    def execute_sell(
        self,
        date: pd.Timestamp,
        symbol: str,
        shares_to_sell: Optional[int] = None,
        current_price: float = 0.0,
        reason: str = "REBALANCE",
        force_settlement_override: bool = False
    ) -> bool:
        """
        Execute SELL order respecting T+2 settlement rule, tax, fee, and slippage.
        """
        if symbol not in self.positions or current_price <= 0:
            return False

        pos = self.positions[symbol]
        # Check T+2 settlement
        if not force_settlement_override and pos.days_held < self.rules.settlement_days:
            # Stock is still locked in T+2 settlement
            return False

        if shares_to_sell is None or shares_to_sell >= pos.shares:
            sell_qty = pos.shares
        else:
            sell_qty = self.rules.round_to_lot(shares_to_sell)

        if sell_qty <= 0:
            return False

        exec_price = current_price * (1.0 - self.rules.slippage_rate)
        gross_value = sell_qty * exec_price
        fee = gross_value * self.rules.brokerage_fee_rate
        tax = gross_value * self.rules.personal_income_tax_rate
        net_proceeds = gross_value - fee - tax

        # Realized PnL calculation
        cost_of_sold = sell_qty * pos.entry_price
        realized_pnl = net_proceeds - cost_of_sold

        self.cash += net_proceeds
        self.cumulative_turnover_value += gross_value

        if sell_qty >= pos.shares:
            del self.positions[symbol]
        else:
            pos.shares -= sell_qty

        self.trade_history.append(TradeRecord(
            date=date,
            symbol=symbol,
            action="SELL",
            shares=sell_qty,
            price=current_price,
            gross_value=gross_value,
            fees=fee,
            tax=tax,
            net_cash_flow=net_proceeds,
            realized_pnl=realized_pnl,
            reason=reason
        ))
        return True

    def get_nav(self, prices_dict: Optional[Dict[str, float]] = None) -> float:
        """Calculate real-time NAV."""
        if prices_dict is None:
            stock_val = sum(p.market_value for p in self.positions.values())
        else:
            stock_val = sum(p.shares * prices_dict.get(p.symbol, p.current_price) for p in self.positions.values())
        return self.cash + stock_val

    def get_nav_series(self) -> pd.DataFrame:
        """Return history of daily NAV as a DataFrame."""
        if not self.daily_snapshots:
            return pd.DataFrame()
        df = pd.DataFrame(self.daily_snapshots)
        df["time"] = pd.to_datetime(df["time"])
        return df.sort_values("time").reset_index(drop=True)
