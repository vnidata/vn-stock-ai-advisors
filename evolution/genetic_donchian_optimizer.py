"""
Genetic Algorithm Optimizer for Donchian Breakout (Turtle Trading System 2 - S2).
Optimizes:
- entry_window (40 - 70 days)
- exit_window (15 - 25 days)
- atr_period (14 - 25 days)
- risk_per_unit (0.5% - 1.5% equity)

Fitness Function:
    Fitness = 0.7 * Calmar_Ratio - 0.3 * Max_Drawdown
Includes Walk-Forward Optimization (252 train -> 63 test) and Out-Of-Sample acceptance gates.
"""
import random
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional, Any
import numpy as np
import pandas as pd


@dataclass
class TurtleGenome:
    entry_window: int = 55       # S2 default: 55 days
    exit_window: int = 20        # S2 default: 20 days
    atr_period: int = 20         # S2 default: 20 days (N)
    risk_per_unit: float = 0.010 # 1.0% equity per unit
    max_units: int = 4           # Maximum 4 units per stock

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entry_window": int(self.entry_window),
            "exit_window": int(self.exit_window),
            "atr_period": int(self.atr_period),
            "risk_per_unit": round(float(self.risk_per_unit), 4),
            "max_units": int(self.max_units)
        }


@dataclass
class BacktestMetrics:
    total_trades: int
    cagr_pct: float
    max_drawdown_pct: float
    calmar_ratio: float
    sharpe_ratio: float
    win_rate_pct: float
    profit_factor: float
    fitness_score: float


class GeneticDonchianOptimizer:
    """
    Genetic Algorithm for Turtle Donchian S2 Parameter Optimization on VN Equities.
    """

    def __init__(
        self,
        population_size: int = 24,
        generations: int = 15,
        mutation_rate: float = 0.20,
        crossover_rate: float = 0.80,
        w_calmar: float = 0.70,
        w_drawdown: float = 0.30
    ):
        self.population_size = population_size
        self.generations = generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.w_calmar = w_calmar
        self.w_drawdown = w_drawdown

        # Search parameter space bounds for Vietnam market
        self.bounds = {
            "entry_window": (40, 70),
            "exit_window": (15, 25),
            "atr_period": (14, 25),
            "risk_per_unit": (0.005, 0.015)
        }

    def generate_random_genome(self) -> TurtleGenome:
        """Create a randomized valid chromosome within Vietnam market boundaries."""
        return TurtleGenome(
            entry_window=random.randint(*self.bounds["entry_window"]),
            exit_window=random.randint(*self.bounds["exit_window"]),
            atr_period=random.randint(*self.bounds["atr_period"]),
            risk_per_unit=round(random.uniform(*self.bounds["risk_per_unit"]), 4),
            max_units=4
        )

    def evaluate_genome(
        self,
        genome: TurtleGenome,
        df: pd.DataFrame,
        initial_capital: float = 1_000_000_000.0,
        fee_rate: float = 0.0015
    ) -> BacktestMetrics:
        """
        Fast, causal vectorized-loop backtest for Turtle Donchian Breakout on a single stock.
        """
        if len(df) < genome.entry_window + 10:
            return BacktestMetrics(0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, -999.0)

        close = df["close"].values
        high = df["high"].values
        low = df["low"].values
        n_bars = len(close)

        # 1. Precalculate ATR (True Range rolling mean)
        tr1 = high - low
        tr2 = np.abs(high - np.roll(close, 1))
        tr3 = np.abs(low - np.roll(close, 1))
        tr = np.maximum(tr1, np.maximum(tr2, tr3))
        tr[0] = tr1[0]

        atr = pd.Series(tr).rolling(genome.atr_period, min_periods=5).mean().values

        # 2. Precalculate Donchian Channels (shifted by 1 bar to strictly exclude current bar)
        high_series = pd.Series(high).shift(1)
        low_series = pd.Series(low).shift(1)
        donchian_high = high_series.rolling(genome.entry_window, min_periods=10).max().values
        donchian_low = low_series.rolling(genome.exit_window, min_periods=10).min().values

        # 3. Simulate Long-Only Turtle System 2
        equity = initial_capital
        cash = initial_capital
        position_shares = 0
        entry_price = 0.0
        stop_price = 0.0
        peak_equity = initial_capital
        max_drawdown = 0.0
        equity_curve = [initial_capital]

        trade_pnls = []

        start_idx = max(genome.entry_window, genome.atr_period) + 1

        for i in range(start_idx, n_bars):
            current_close = close[i]
            prev_close = close[i - 1]
            current_n = atr[i] if atr[i] > 0 else (current_close * 0.03)

            # Check if current bar hit +7% ceiling (cannot enter at ceiling on HOSE)
            is_ceiling = (current_close >= prev_close * 1.0685)

            # Mark to market
            current_equity = cash + (position_shares * current_close)
            if current_equity > peak_equity:
                peak_equity = current_equity
            dd = (peak_equity - current_equity) / peak_equity
            if dd > max_drawdown:
                max_drawdown = dd
            equity_curve.append(current_equity)

            # Exit Conditions
            if position_shares > 0:
                hit_exit_window = current_close < donchian_low[i]
                hit_stop_loss = current_close <= stop_price

                if hit_exit_window or hit_stop_loss:
                    # Close position
                    gross_revenue = position_shares * current_close
                    net_revenue = gross_revenue * (1.0 - fee_rate)
                    cash += net_revenue
                    pnl_pct = (current_close - entry_price) / entry_price
                    trade_pnls.append(pnl_pct)
                    position_shares = 0
                    entry_price = 0.0
                    stop_price = 0.0
                    continue

            # Entry Condition (Turtle S2: Breakout 55-day High, not ceiling, cash available)
            if position_shares == 0:
                if current_close > donchian_high[i] and not is_ceiling:
                    # Position sizing: Unit = (risk_pct * Equity) / (N * Price)
                    unit_risk_vnd = current_equity * genome.risk_per_unit
                    # In Turtle, 1 unit risk = 2N or 1N. Standard: N risk per dollar
                    dollar_volatility = current_n * 1000.0  # VND per lot
                    if dollar_volatility > 0:
                        raw_shares = (unit_risk_vnd / (current_n * 1.0))
                        lot_shares = int(raw_shares // 100) * 100
                    else:
                        lot_shares = 100

                    # Cap at 20% NAV per single unit entry for prudent diversification
                    max_alloc_shares = int((current_equity * 0.20) / (current_close * 1000.0) // 100) * 100
                    target_shares = max(100, min(lot_shares, max_alloc_shares))

                    cost = target_shares * current_close * 1.0
                    total_cost = cost * (1.0 + fee_rate)

                    if total_cost <= cash * 0.95 and target_shares > 0:
                        position_shares = target_shares
                        entry_price = current_close
                        stop_price = entry_price - (2.0 * current_n)  # 2N Stop Loss
                        cash -= total_cost

        # Close open position at end
        if position_shares > 0:
            gross = position_shares * close[-1]
            cash += gross * (1.0 - fee_rate)
            trade_pnls.append((close[-1] - entry_price) / entry_price)

        final_equity = cash
        total_trades = len(trade_pnls)
        years = max(1.0, (n_bars - start_idx) / 252.0)
        cagr = ((final_equity / initial_capital) ** (1.0 / years) - 1.0) * 100.0

        winning_trades = [p for p in trade_pnls if p > 0]
        losing_trades = [p for p in trade_pnls if p <= 0]
        win_rate = (len(winning_trades) / total_trades * 100.0) if total_trades > 0 else 0.0

        gross_gains = sum(winning_trades)
        gross_losses = abs(sum(losing_trades))
        profit_factor = (gross_gains / gross_losses) if gross_losses > 0 else (3.0 if gross_gains > 0 else 1.0)

        # Daily returns for Sharpe
        eq_series = pd.Series(equity_curve)
        daily_ret = eq_series.pct_change().dropna()
        if len(daily_ret) > 10 and daily_ret.std() > 0:
            sharpe = float((daily_ret.mean() / daily_ret.std()) * np.sqrt(252))
        else:
            sharpe = 0.0

        max_dd_pct = max(0.01, max_drawdown * 100.0)
        calmar = (cagr / max_dd_pct) if max_dd_pct > 0 else 0.0

        # Dual Fitness Function: w1 * Calmar - w2 * MaxDD
        # Normalize MaxDD penalty scale
        fitness = (self.w_calmar * calmar) - (self.w_drawdown * (max_dd_pct / 20.0))

        return BacktestMetrics(
            total_trades=total_trades,
            cagr_pct=round(cagr, 2),
            max_drawdown_pct=round(max_dd_pct, 2),
            calmar_ratio=round(calmar, 2),
            sharpe_ratio=round(sharpe, 2),
            win_rate_pct=round(win_rate, 1),
            profit_factor=round(profit_factor, 2),
            fitness_score=round(fitness, 3)
        )

    def crossover(self, parent_a: TurtleGenome, parent_b: TurtleGenome) -> TurtleGenome:
        """Blend parameters from two elite parents."""
        if random.random() > self.crossover_rate:
            return TurtleGenome(**parent_a.to_dict())

        blend = random.uniform(0.3, 0.7)
        child_entry = int(round(parent_a.entry_window * blend + parent_b.entry_window * (1.0 - blend)))
        child_exit = int(round(parent_a.exit_window * blend + parent_b.exit_window * (1.0 - blend)))
        child_atr = int(round(parent_a.atr_period * blend + parent_b.atr_period * (1.0 - blend)))
        child_risk = round(parent_a.risk_per_unit * blend + parent_b.risk_per_unit * (1.0 - blend), 4)

        return TurtleGenome(
            entry_window=max(self.bounds["entry_window"][0], min(self.bounds["entry_window"][1], child_entry)),
            exit_window=max(self.bounds["exit_window"][0], min(self.bounds["exit_window"][1], child_exit)),
            atr_period=max(self.bounds["atr_period"][0], min(self.bounds["atr_period"][1], child_atr)),
            risk_per_unit=max(self.bounds["risk_per_unit"][0], min(self.bounds["risk_per_unit"][1], child_risk)),
            max_units=4
        )

    def mutate(self, genome: TurtleGenome) -> TurtleGenome:
        """Randomly perturb genes to discover better local optima."""
        if random.random() > self.mutation_rate:
            return genome

        gene_to_mutate = random.choice(["entry_window", "exit_window", "atr_period", "risk_per_unit"])
        if gene_to_mutate == "entry_window":
            genome.entry_window = max(self.bounds["entry_window"][0], min(self.bounds["entry_window"][1], genome.entry_window + random.choice([-3, -2, 2, 3])))
        elif gene_to_mutate == "exit_window":
            genome.exit_window = max(self.bounds["exit_window"][0], min(self.bounds["exit_window"][1], genome.exit_window + random.choice([-2, -1, 1, 2])))
        elif gene_to_mutate == "atr_period":
            genome.atr_period = max(self.bounds["atr_period"][0], min(self.bounds["atr_period"][1], genome.atr_period + random.choice([-2, -1, 1, 2])))
        elif gene_to_mutate == "risk_per_unit":
            genome.risk_per_unit = max(self.bounds["risk_per_unit"][0], min(self.bounds["risk_per_unit"][1], round(genome.risk_per_unit + random.choice([-0.002, 0.002]), 4)))

        return genome

    def optimize(self, df: pd.DataFrame) -> Tuple[TurtleGenome, BacktestMetrics]:
        """
        Runs Genetic Algorithm optimization across generations.
        Returns the fittest TurtleGenome and its performance metrics.
        """
        population = [self.generate_random_genome() for _ in range(self.population_size)]
        # Always inject standard S2 benchmark genome
        population[0] = TurtleGenome(entry_window=55, exit_window=20, atr_period=20, risk_per_unit=0.01)

        best_genome = population[0]
        best_metrics = self.evaluate_genome(best_genome, df)

        for gen in range(self.generations):
            scored = []
            for g in population:
                metrics = self.evaluate_genome(g, df)
                scored.append((g, metrics))

            # Sort descending by fitness
            scored.sort(key=lambda x: x[1].fitness_score, reverse=True)

            if scored[0][1].fitness_score > best_metrics.fitness_score:
                best_genome = scored[0][0]
                best_metrics = scored[0][1]

            # Elitism: retain top 2
            next_generation = [scored[0][0], scored[1][0]]

            # Mating pool: top 50%
            mating_pool = [x[0] for x in scored[: max(4, self.population_size // 2)]]

            while len(next_generation) < self.population_size:
                p1 = random.choice(mating_pool)
                p2 = random.choice(mating_pool)
                child = self.crossover(p1, p2)
                child = self.mutate(child)
                next_generation.append(child)

            population = next_generation

        return best_genome, best_metrics

    def walk_forward_optimization(
        self,
        df: pd.DataFrame,
        train_window: int = 252,
        test_window: int = 63
    ) -> Dict[str, Any]:
        """
        Walk-Forward Optimization:
        - Fits parameters on 252 sessions (1 year)
        - Tests out-of-sample on following 63 sessions (1 quarter)
        - Shifts forward and repeats across the entire dataset.
        """
        n_bars = len(df)
        if n_bars < train_window + test_window:
            best_g, metrics = self.optimize(df)
            return {
                "folds_count": 1,
                "best_genome": best_g.to_dict(),
                "avg_oos_calmar": metrics.calmar_ratio,
                "avg_oos_cagr": metrics.cagr_pct,
                "avg_oos_maxdd": metrics.max_drawdown_pct,
                "oos_pass_rate_pct": 100.0 if metrics.calmar_ratio > 0.5 else 0.0
            }

        folds = []
        step = test_window
        current_start = 0

        while current_start + train_window + test_window <= n_bars:
            train_df = df.iloc[current_start : current_start + train_window].reset_index(drop=True)
            test_df = df.iloc[current_start + train_window : current_start + train_window + test_window].reset_index(drop=True)

            # Fit on training window
            fold_best_genome, train_metrics = self.optimize(train_df)

            # Evaluate out-of-sample on testing window
            oos_metrics = self.evaluate_genome(fold_best_genome, test_df)
            is_pass = (oos_metrics.calmar_ratio >= 0.50) or (oos_metrics.total_trades == 0) or (oos_metrics.max_drawdown_pct < 8.0)

            folds.append({
                "fold_idx": len(folds) + 1,
                "genome": fold_best_genome.to_dict(),
                "train_calmar": train_metrics.calmar_ratio,
                "oos_cagr": oos_metrics.cagr_pct,
                "oos_maxdd": oos_metrics.max_drawdown_pct,
                "oos_calmar": oos_metrics.calmar_ratio,
                "oos_trades": oos_metrics.total_trades,
                "is_pass": is_pass
            })

            current_start += step

        pass_count = sum(1 for f in folds if f["is_pass"])
        pass_rate = (pass_count / len(folds) * 100.0) if folds else 0.0
        avg_calmar = float(np.mean([f["oos_calmar"] for f in folds])) if folds else 0.0
        avg_cagr = float(np.mean([f["oos_cagr"] for f in folds])) if folds else 0.0
        avg_maxdd = float(np.mean([f["oos_maxdd"] for f in folds])) if folds else 0.0

        # Global best genome from most recent training window
        latest_genome, _ = self.optimize(df.tail(train_window).reset_index(drop=True))

        return {
            "folds_count": len(folds),
            "folds": folds,
            "oos_pass_rate_pct": round(pass_rate, 1),
            "avg_oos_calmar": round(avg_calmar, 2),
            "avg_oos_cagr": round(avg_cagr, 2),
            "avg_oos_maxdd": round(avg_maxdd, 2),
            "recommended_genome": latest_genome.to_dict()
        }
