// BSC Quant - AI Portfolio Advisor Web Dashboard
// Master Controller: Live Recommendations, Trades History, Time Filters, Performance & Evolution

let allTrades = [];
let filteredTrades = [];
let currentTradePage = 1;
let tradePageSize = 15;
let equityCurvesData = null;
let equityChartInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupTradeFilters();
  setupChartZoom();
  await loadDashboardData();
});

// ==========================================
// 1. TAB NAVIGATION CONTROLLER
// ==========================================
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      
      // Update buttons
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Update panes
      const panes = document.querySelectorAll(".tab-pane");
      panes.forEach(p => p.classList.remove("active"));
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add("active");
      }

      // Resize chart if performance tab is opened
      if (targetId === "tab-performance" && equityChartInstance) {
        setTimeout(() => equityChartInstance.resize(), 100);
      }
    });
  });
}

// ==========================================
// 2. DATA LOADER & DISPATCHER
// ==========================================
async function loadDashboardData() {
  try {
    // 1. Fetch daily summary
    const summaryRes = await fetch("data/daily_summary.json").catch(() => null);
    const summaryData = summaryRes && summaryRes.ok ? await summaryRes.json() : getFallbackDailySummary();
    renderDailySummary(summaryData);

    // 2. Fetch 15-year performance metrics
    const perfRes = await fetch("data/performance_15y.json").catch(() => null);
    const perfData = perfRes && perfRes.ok ? await perfRes.json() : getFallbackPerformance();
    renderLeaderboard(perfData);
    renderAnnualTable(perfData);

    // 3. Fetch Equity Curves
    const curvesRes = await fetch("data/equity_curves.json").catch(() => null);
    equityCurvesData = curvesRes && curvesRes.ok ? await curvesRes.json() : getFallbackEquityCurves();
    renderEquityChart(equityCurvesData);

    // 4. Fetch Trades History (New Feature)
    const tradesRes = await fetch("data/trades_history.json").catch(() => null);
    if (tradesRes && tradesRes.ok) {
      const tradesPayload = await tradesRes.json();
      allTrades = tradesPayload.trades || [];
    } else {
      allTrades = getFallbackTrades();
    }
    applyTradeFilters();

  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// ==========================================
// 3. RENDER ENRICHED TODAY'S RECOMMENDATIONS
// ==========================================
function renderDailySummary(data) {
  if (!data) return;

  document.getElementById("last-updated-text").innerText = `Đồng bộ: ${data.last_updated || 'Hôm nay'}`;
  
  if (data.vnindex) {
    document.getElementById("vnindex-close").innerText = Number(data.vnindex.close).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
    const changeElem = document.getElementById("vnindex-change");
    const change = data.vnindex.change_pct || 0;
    changeElem.innerText = `${change >= 0 ? '+' : ''}${change}%`;
    changeElem.className = change >= 0 ? "stat-change text-green" : "stat-change text-red";

    const regimeElem = document.getElementById("market-regime");
    regimeElem.innerText = data.vnindex.regime === "BULL" ? "BULLISH TREND" : (data.vnindex.regime === "BEAR" ? "BEARISH REGIME" : "SIDEWAYS RECOVERY");
    regimeElem.className = data.vnindex.regime === "BULL" ? "stat-badge badge-bull" : (data.vnindex.regime === "BEAR" ? "stat-badge tag-red" : "stat-badge badge-info");

    const breadthElem = document.getElementById("market-breadth");
    if (breadthElem && data.vnindex.gainers !== undefined) {
      breadthElem.innerHTML = `Độ rộng: <span class="text-green">${data.vnindex.gainers} tăng</span> · <span class="text-red">${data.vnindex.losers} giảm</span> · <span>${data.vnindex.unchanged} không đổi</span>`;
    }
  }

  // Render Top 5 strategy cards
  const container = document.getElementById("strategy-cards-container");
  container.innerHTML = "";

  const stratKeys = Object.keys(data.strategies || {});
  stratKeys.forEach(key => {
    const s = data.strategies[key];
    const isBold = key.includes("ChuDong") || key.includes("Active");
    const isHarmony = key.includes("NhipNhang") || key.includes("Harmony");
    const isCanslim = key.includes("CANSLIM");
    
    let pillClass = "strat-pill pill-persistent";
    let pillLabel = "THẬN TRỌNG (3M)";
    if (isBold) {
      pillClass = "strat-pill pill-active";
      pillLabel = "TÁO BẠO (2W)";
    } else if (isHarmony) {
      pillClass = "strat-pill pill-harmony";
      pillLabel = "CÂN BẰNG (1M)";
    } else if (isCanslim) {
      pillClass = "strat-pill pill-active";
      pillLabel = "CANSLIM BREAKOUT";
    }

    const cycleRet = s.current_cycle_return_pct !== undefined ? s.current_cycle_return_pct : 0.0;
    const cycleRetClass = cycleRet >= 0 ? "text-green" : "text-red";
    const winPicks = s.winning_picks !== undefined ? s.winning_picks : '-';
    const totalPicks = s.total_picks !== undefined ? s.total_picks : 5;
    const cashRatio = s.cash_ratio_pct !== undefined ? s.cash_ratio_pct : 0.0;

    let rowsHtml = "";
    (s.top5 || []).forEach(item => {
      const dailyChg = item.daily_change_pct !== undefined ? item.daily_change_pct : 0.0;
      const chgClass = dailyChg >= 0 ? "change-badge pos" : "change-badge neg";
      const chgSign = dailyChg >= 0 ? "+" : "";

      const currRet = item.current_return_pct !== undefined ? item.current_return_pct : 0.0;
      const retClass = currRet >= 0 ? "ret-pill pos" : "ret-pill neg";
      const retSign = currRet >= 0 ? "+" : "";

      rowsHtml += `
        <tr>
          <td><span class="ticker-pill">${item.symbol}</span></td>
          <td><span class="sector-label">${item.sector || 'Bluechip'}</span></td>
          <td class="text-center"><span class="weight-badge">${item.weight_pct}%</span></td>
          <td class="text-right" style="color: var(--text-muted);">${item.entry_price ? Number(item.entry_price).toFixed(2) : '-'}</td>
          <td class="text-right"><strong>${item.current_price ? Number(item.current_price).toFixed(2) : '-'}</strong></td>
          <td class="text-center"><span class="${chgClass}">${chgSign}${dailyChg}%</span></td>
          <td class="text-center"><span class="${retClass}">${retSign}${currRet}%</span></td>
          <td class="text-right text-red">${item.stop_loss ? Number(item.stop_loss).toFixed(2) : '-'}</td>
          <td class="text-right text-green">${item.target_price ? Number(item.target_price).toFixed(2) : '-'}</td>
          <td><span class="signal-tag">${item.technical_signal || 'Theo dõi'}</span></td>
        </tr>
      `;
    });

    const card = document.createElement("div");
    card.className = "strategy-card";
    card.innerHTML = `
      <div class="strategy-header">
        <div>
          <div class="strat-title">${s.name.replace("AI_Advisor_", "")}</div>
          <div class="strat-target">Phân bổ: ${s.allocation_method} | Chu kỳ: ${s.rebalance_days} ngày</div>
        </div>
        <span class="${pillClass}">${pillLabel}</span>
      </div>

      <div class="strategy-meta-bar">
        <div class="meta-item">
          <span>Hiệu suất chu kỳ:</span>
          <strong class="${cycleRetClass}">${cycleRet >= 0 ? '+' : ''}${cycleRet}%</strong>
        </div>
        <div class="meta-item">
          <span>Mã sinh lời:</span>
          <strong>${winPicks}/${totalPicks} mã</strong>
        </div>
        <div class="meta-item">
          <span>Tiền mặt:</span>
          <strong>${cashRatio}%</strong>
        </div>
      </div>

      <div class="table-responsive">
        <table class="portfolio-table">
          <thead>
            <tr>
              <th>Mã CP</th>
              <th>Ngành</th>
              <th class="text-center">Tỷ Trọng</th>
              <th class="text-right">Giá Vào</th>
              <th class="text-right">Giá Đóng Cửa</th>
              <th class="text-center">Phiên Nay</th>
              <th class="text-center">Hiệu Suất</th>
              <th class="text-right">Cắt Lỗ (-4.5%)</th>
              <th class="text-right">Mục Tiêu (+15%)</th>
              <th>Tín Hiệu Kỹ Thuật</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(card);
  });
}

// ==========================================
// 4. TRADES HISTORY & TIME RANGE SEARCH
// ==========================================
function setupTradeFilters() {
  // Quick range pills
  const rangePills = document.querySelectorAll(".range-pill");
  rangePills.forEach(pill => {
    pill.addEventListener("click", () => {
      rangePills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");

      const range = pill.getAttribute("data-range");
      setDatesByRange(range);
      applyTradeFilters();
    });
  });

  // Date inputs
  document.getElementById("filter-from-date").addEventListener("change", applyTradeFilters);
  document.getElementById("filter-to-date").addEventListener("change", applyTradeFilters);

  // Select dropdowns
  document.getElementById("filter-advisor").addEventListener("change", applyTradeFilters);
  document.getElementById("filter-outcome").addEventListener("change", applyTradeFilters);

  // Symbol input with debounce
  let debounceTimer;
  document.getElementById("filter-symbol").addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyTradeFilters, 250);
  });

  // Reset button
  document.getElementById("btn-reset-filters").addEventListener("click", () => {
    document.getElementById("filter-from-date").value = "2010-01-01";
    document.getElementById("filter-to-date").value = "2026-12-31";
    document.getElementById("filter-advisor").value = "all";
    document.getElementById("filter-symbol").value = "";
    document.getElementById("filter-outcome").value = "all";
    
    rangePills.forEach(p => p.classList.remove("active"));
    document.querySelector('.range-pill[data-range="all"]').classList.add("active");

    applyTradeFilters();
  });

  // Page size select
  document.getElementById("page-size-select").addEventListener("change", (e) => {
    tradePageSize = parseInt(e.target.value, 10);
    currentTradePage = 1;
    renderTradesTable();
  });
}

function setDatesByRange(range) {
  const fromInput = document.getElementById("filter-from-date");
  const toInput = document.getElementById("filter-to-date");
  const now = new Date("2026-10-04");

  if (range === "all") {
    fromInput.value = "2010-01-01";
    toInput.value = "2026-12-31";
  } else if (range === "1m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
  } else if (range === "3m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
  } else if (range === "6m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
  } else if (range === "1y") {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
  } else if (/^\d{4}$/.test(range)) {
    fromInput.value = `${range}-01-01`;
    toInput.value = `${range}-12-31`;
  }
}

function applyTradeFilters() {
  const fromDate = document.getElementById("filter-from-date").value || "2010-01-01";
  const toDate = document.getElementById("filter-to-date").value || "2026-12-31";
  const advisor = document.getElementById("filter-advisor").value;
  const symbol = (document.getElementById("filter-symbol").value || "").trim().toUpperCase();
  const outcome = document.getElementById("filter-outcome").value;

  filteredTrades = allTrades.filter(t => {
    // 1. Date Range Filter
    const exitDate = t.exit_date;
    if (exitDate < fromDate || exitDate > toDate) return false;

    // 2. Advisor Filter
    if (advisor !== "all" && t.advisor !== advisor) return false;

    // 3. Symbol Search
    if (symbol && !t.symbol.toUpperCase().includes(symbol)) return false;

    // 4. Outcome Filter
    if (outcome === "win" && t.return_pct <= 0) return false;
    if (outcome === "loss" && t.return_pct > 0) return false;

    return true;
  });

  currentTradePage = 1;
  updateTradesKPIs(filteredTrades);
  renderTradesTable();
}

function updateTradesKPIs(trades) {
  const total = trades.length;
  const wins = trades.filter(t => t.return_pct > 0);
  const losses = trades.filter(t => t.return_pct <= 0);

  const winRate = total > 0 ? ((wins.length / total) * 100).toFixed(1) : "0.0";
  const grossWinVnd = wins.reduce((acc, t) => acc + (t.pnl_vnd || 0), 0);
  const grossLossVnd = Math.abs(losses.reduce((acc, t) => acc + (t.pnl_vnd || 0), 0));
  const pf = grossLossVnd > 0 ? (grossWinVnd / grossLossVnd).toFixed(2) : (wins.length > 0 ? "2.5" : "0.0");

  const avgWin = wins.length > 0 ? (wins.reduce((acc, t) => acc + t.return_pct, 0) / wins.length).toFixed(1) : "0.0";
  const avgLoss = losses.length > 0 ? (losses.reduce((acc, t) => acc + t.return_pct, 0) / losses.length).toFixed(1) : "0.0";
  const avgHold = total > 0 ? (trades.reduce((acc, t) => acc + (t.holding_days || 1), 0) / total).toFixed(1) : "0";

  document.getElementById("kpi-total-trades").innerText = total.toLocaleString("vi-VN");
  document.getElementById("kpi-trades-count-sub").innerText = `Lệnh đã khớp`;
  document.getElementById("kpi-win-rate").innerText = `${winRate}%`;
  document.getElementById("kpi-win-count-sub").innerText = `${wins.length} lệnh lãi / ${losses.length} lệnh lỗ`;
  document.getElementById("kpi-profit-factor").innerText = pf;
  document.getElementById("kpi-avg-win").innerText = `+${avgWin}%`;
  document.getElementById("kpi-avg-loss").innerText = `${avgLoss}%`;
  document.getElementById("kpi-avg-holding").innerText = `${avgHold} ngày`;
}

function renderTradesTable() {
  const tbody = document.getElementById("trades-table-body");
  if (!tbody) return;

  if (filteredTrades.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center" style="padding: 30px; color: var(--text-muted);">
          Không tìm thấy lệnh giao dịch nào phù hợp với bộ lọc đã chọn.
        </td>
      </tr>
    `;
    renderPagination(0);
    return;
  }

  const startIdx = (currentTradePage - 1) * tradePageSize;
  const endIdx = Math.min(startIdx + tradePageSize, filteredTrades.length);
  const pageItems = filteredTrades.slice(startIdx, endIdx);

  let html = "";
  pageItems.forEach(t => {
    const isWin = t.return_pct > 0;
    const retClass = isWin ? "ret-pill pos" : "ret-pill neg";
    const retSign = isWin ? "+" : "";

    let reasonClass = "reason-badge reason-rebalance";
    const rLower = (t.exit_reason || "").toLowerCase();
    if (rLower.includes("cắt lỗ") || rLower.includes("stop")) {
      reasonClass = "reason-badge reason-loss";
    } else if (rLower.includes("trailing")) {
      reasonClass = "reason-badge reason-trailing";
    } else if (rLower.includes("chốt lời")) {
      reasonClass = "reason-badge reason-profit";
    }

    const advisorShort = t.advisor ? t.advisor.replace("AI_Advisor_", "") : "Advisor";
    const pnlFormatted = t.pnl_vnd ? Number(t.pnl_vnd).toLocaleString("vi-VN") : "0";
    const pnlClass = isWin ? "text-green" : "text-red";

    html += `
      <tr>
        <td><strong style="color: var(--color-cyan); font-family: var(--font-mono);">${t.id}</strong></td>
        <td><span class="sector-label">${advisorShort}</span></td>
        <td><span class="ticker-pill">${t.symbol}</span></td>
        <td><span class="sector-label">${t.sector || 'Bluechip'}</span></td>
        <td style="font-family: var(--font-mono); font-size: 0.78rem;">${t.entry_date} ➔ ${t.exit_date}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${t.entry_price ? Number(t.entry_price).toFixed(2) : '-'} ➔ <strong>${t.exit_price ? Number(t.exit_price).toFixed(2) : '-'}</strong></td>
        <td class="text-center" style="font-family: var(--font-mono);">${t.shares ? Number(t.shares).toLocaleString("vi-VN") : '-'}</td>
        <td class="text-center" style="font-family: var(--font-mono);">${t.holding_days || 1}d</td>
        <td class="text-center"><span class="${retClass}">${retSign}${t.return_pct}%</span></td>
        <td class="text-right ${pnlClass}" style="font-family: var(--font-mono); font-weight: 700;">${isWin ? '+' : ''}${pnlFormatted} ₫</td>
        <td><span class="${reasonClass}">${t.exit_reason || 'Tái Cơ Cấu Định Kỳ'}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  renderPagination(filteredTrades.length);
}

function renderPagination(totalCount) {
  const info = document.getElementById("pagination-info");
  const controls = document.getElementById("pagination-controls");
  if (!info || !controls) return;

  if (totalCount === 0) {
    info.innerText = "Hiển thị 0 - 0 trên tổng 0 lệnh";
    controls.innerHTML = "";
    return;
  }

  const start = (currentTradePage - 1) * tradePageSize + 1;
  const end = Math.min(currentTradePage * tradePageSize, totalCount);
  info.innerText = `Hiển thị ${start} - ${end} trên tổng ${totalCount.toLocaleString('vi-VN')} lệnh`;

  const totalPages = Math.ceil(totalCount / tradePageSize);
  let btnHtml = "";

  // Prev button
  btnHtml += `<button class="page-btn" id="btn-page-prev" ${currentTradePage === 1 ? 'disabled' : ''}>❮ Trước</button>`;

  // Page numbers logic (max 5 page buttons)
  let startP = Math.max(1, currentTradePage - 2);
  let endP = Math.min(totalPages, startP + 4);
  if (endP - startP < 4) {
    startP = Math.max(1, endP - 4);
  }

  for (let p = startP; p <= endP; p++) {
    btnHtml += `<button class="page-btn ${p === currentTradePage ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }

  // Next button
  btnHtml += `<button class="page-btn" id="btn-page-next" ${currentTradePage === totalPages ? 'disabled' : ''}>Sau ❯</button>`;

  controls.innerHTML = btnHtml;

  // Bind pagination events
  const prevBtn = document.getElementById("btn-page-prev");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentTradePage > 1) {
        currentTradePage--;
        renderTradesTable();
      }
    });
  }

  const nextBtn = document.getElementById("btn-page-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentTradePage < totalPages) {
        currentTradePage++;
        renderTradesTable();
      }
    });
  }

  controls.querySelectorAll("button[data-page]").forEach(b => {
    b.addEventListener("click", () => {
      currentTradePage = parseInt(b.getAttribute("data-page"), 10);
      renderTradesTable();
    });
  });
}

// ==========================================
// 5. 15-YEAR LEADERBOARD & ANNUAL TABLE
// ==========================================
function renderLeaderboard(data) {
  if (!data || !Array.isArray(data)) return;
  const tbody = document.getElementById("leaderboard-body");
  tbody.innerHTML = "";

  data.forEach((row, idx) => {
    let rankBadge = `#${idx + 1}`;
    if (idx === 0) rankBadge = "🥇 #1";
    else if (idx === 1) rankBadge = "🥈 #2";
    else if (idx === 2) rankBadge = "🥉 #3";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-center"><strong>${rankBadge}</strong></td>
      <td><strong>${row["Advisor Name"]}</strong></td>
      <td class="${row["Total Return (%)"] >= 0 ? 'text-green' : 'text-red'}">${row["Total Return (%)"] >= 0 ? '+' : ''}${row["Total Return (%)"]}%</td>
      <td>${row["CAGR (%)"]}%</td>
      <td class="${row["Alpha vs VN-Index (%/y)"] >= 0 ? 'text-green' : 'text-red'}">${row["Alpha vs VN-Index (%/y)"] >= 0 ? '+' : ''}${row["Alpha vs VN-Index (%/y)"]}%</td>
      <td class="text-center">${row["Beta"]}</td>
      <td class="text-red">${row["Max Drawdown (%)"]}%</td>
      <td class="text-center">${row["Sharpe"]}</td>
      <td class="text-center">${row["Win Rate (%)"]}%</td>
      <td class="text-center">${row["Turnover (x/y)"]}x</td>
      <td class="text-center" style="color: var(--color-cyan); font-weight: 700;">${row["Score"]}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAnnualTable(data) {
  const tbody = document.getElementById("annual-body");
  if (!tbody) return;

  const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];
  
  const bmReturns = {
    2025: 40.5, 2024: 11.9, 2023: 8.2, 2022: -34.0, 2021: 33.7, 2020: 14.2,
    2019: 7.8, 2018: -10.4, 2017: 46.5, 2016: 15.7, 2015: 6.4, 2014: 8.2,
    2013: 20.6, 2012: 18.2, 2011: -27.7, 2010: -6.3
  };

  const activeReturns = {
    2025: -8.3, 2024: -13.4, 2023: -10.6, 2022: -29.1, 2021: 46.3, 2020: 9.3,
    2019: -1.7, 2018: -17.4, 2017: 30.2, 2016: 6.5, 2015: 19.3, 2014: 83.7,
    2013: 9.1, 2012: 10.6, 2011: -0.9, 2010: -11.0
  };

  const harmonyReturns = {
    2025: -10.5, 2024: -8.7, 2023: 7.9, 2022: -35.8, 2021: 33.8, 2020: 0.2,
    2019: 9.0, 2018: 8.4, 2017: 26.4, 2016: -3.2, 2015: 36.5, 2014: 0.5,
    2013: 4.9, 2012: 14.2, 2011: 5.8, 2010: -8.6
  };

  const persistentReturns = {
    2025: -8.3, 2024: 7.3, 2023: -0.3, 2022: -17.7, 2021: 13.5, 2020: -0.8,
    2019: 10.6, 2018: -11.3, 2017: 24.3, 2016: 5.5, 2015: 30.5, 2014: 11.0,
    2013: 7.3, 2012: -4.1, 2011: 9.6, 2010: -9.0
  };

  const canslimReturns = {
    2025: -10.9, 2024: -13.3, 2023: -16.0, 2022: -21.4, 2021: 56.8, 2020: 9.5,
    2019: -1.6, 2018: -15.8, 2017: 34.1, 2016: 3.4, 2015: 16.3, 2014: 66.3,
    2013: 8.4, 2012: 11.1, 2011: 1.3, 2010: -10.5
  };

  tbody.innerHTML = "";
  years.forEach(yr => {
    const bm = bmReturns[yr] || 0;
    const act = activeReturns[yr] || 0;
    const har = harmonyReturns[yr] || 0;
    const per = persistentReturns[yr] || 0;
    const can = canslimReturns[yr] || 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${yr}</strong></td>
      <td class="${bm >= 0 ? 'text-green' : 'text-red'}">${bm >= 0 ? '+' : ''}${bm}%</td>
      <td class="${act >= 0 ? 'text-green' : 'text-red'}">${act >= 0 ? '+' : ''}${act}%</td>
      <td class="${har >= 0 ? 'text-green' : 'text-red'}">${har >= 0 ? '+' : ''}${har}%</td>
      <td class="${per >= 0 ? 'text-green' : 'text-red'}"><strong>${per >= 0 ? '+' : ''}${per}%</strong></td>
      <td class="${can >= 0 ? 'text-green' : 'text-red'}">${can >= 0 ? '+' : ''}${can}%</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 6. INTERACTIVE EQUITY CHART & ZOOM
// ==========================================
function setupChartZoom() {
  const zoomBtns = document.querySelectorAll(".zoom-btn");
  zoomBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      zoomBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const zoom = btn.getAttribute("data-zoom");
      renderEquityChart(equityCurvesData, zoom);
    });
  });
}

function renderEquityChart(curvesData, zoom = "all") {
  const ctx = document.getElementById("equityChart");
  if (!ctx || !curvesData) return;

  let allLabels = (curvesData["VNINDEX"] || []).map(p => p.date);
  let cutoffIdx = 0;

  if (zoom === "1y") {
    cutoffIdx = Math.max(0, allLabels.length - 12);
  } else if (zoom === "3y") {
    cutoffIdx = Math.max(0, allLabels.length - 36);
  } else if (zoom === "5y") {
    cutoffIdx = Math.max(0, allLabels.length - 60);
  }

  const labels = allLabels.slice(cutoffIdx);

  const getSlice = (key) => {
    const raw = (curvesData[key] || []).slice(cutoffIdx);
    if (raw.length === 0) return [];
    const base = raw[0].nav;
    return raw.map(p => Number((p.nav / base * 100.0).toFixed(1)));
  };

  const datasets = [
    {
      label: "VN-Index (Thị trường chung)",
      data: getSlice("VNINDEX"),
      borderColor: "#94a3b8",
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderDash: [5, 5],
      pointRadius: 0
    },
    {
      label: "Chiến Lược Bền Bỉ (3M)",
      data: getSlice("AI_Advisor_BenBi_3M"),
      borderColor: "#10b981",
      backgroundColor: "rgba(16, 185, 129, 0.05)",
      borderWidth: 2.5,
      pointRadius: 0,
      fill: true
    },
    {
      label: "Chiến Lược Nhịp Nhàng (1M)",
      data: getSlice("AI_Advisor_NhipNhang_1M"),
      borderColor: "#06b6d4",
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 0
    },
    {
      label: "Chiến Lược Chủ Động (2W)",
      data: getSlice("AI_Advisor_ChuDong_2W"),
      borderColor: "#f59e0b",
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 0
    },
    {
      label: "CANSLIM Breakout",
      data: getSlice("AI_Advisor_CANSLIM_Breakout"),
      borderColor: "#a855f7",
      backgroundColor: "transparent",
      borderWidth: 1.8,
      pointRadius: 0
    }
  ];

  if (equityChartInstance) {
    equityChartInstance.destroy();
  }

  equityChartInstance = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", font: { family: "'Plus Jakarta Sans', sans-serif" } }
        },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} (NAV Chuẩn)`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#64748b", maxTicksLimit: 12 },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        },
        y: {
          ticks: { color: "#64748b" },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        }
      }
    }
  });
}

// Fallback generators
function getFallbackDailySummary() {
  return {
    "last_updated": "2026-10-04 17:00:00 (UTC+7)",
    "vnindex": { "close": 1280.5, "change_pct": 0.85, "regime": "BULL", "gainers": 8, "losers": 5, "unchanged": 2 },
    "strategies": {}
  };
}

function getFallbackPerformance() {
  return [
    {
      "Advisor Name": "AI_Advisor_CANSLIM_Breakout",
      "Total Return (%)": 119.3,
      "CAGR (%)": 5.0,
      "Alpha vs VN-Index (%/y)": -3.0,
      "Beta": 0.51,
      "Max Drawdown (%)": -54.0,
      "Sharpe": 0.08,
      "Win Rate (%)": 45.4,
      "Turnover (x/y)": 32.3,
      "Score": -0.03
    },
    {
      "Advisor Name": "AI_Advisor_ChuDong_2W",
      "Total Return (%)": 116.4,
      "CAGR (%)": 4.9,
      "Alpha vs VN-Index (%/y)": -3.1,
      "Beta": 0.51,
      "Max Drawdown (%)": -54.1,
      "Sharpe": 0.08,
      "Win Rate (%)": 48.1,
      "Turnover (x/y)": 32.1,
      "Score": -0.03
    },
    {
      "Advisor Name": "AI_Advisor_NhipNhang_1M",
      "Total Return (%)": 78.6,
      "CAGR (%)": 3.7,
      "Alpha vs VN-Index (%/y)": -4.4,
      "Beta": 0.43,
      "Max Drawdown (%)": -47.9,
      "Sharpe": -0.02,
      "Win Rate (%)": 45.1,
      "Turnover (x/y)": 17.2,
      "Score": -0.12
    },
    {
      "Advisor Name": "AI_Advisor_BenBi_3M",
      "Total Return (%)": 75.2,
      "CAGR (%)": 3.6,
      "Alpha vs VN-Index (%/y)": -4.5,
      "Beta": 0.29,
      "Max Drawdown (%)": -30.3,
      "Sharpe": -0.08,
      "Win Rate (%)": 44.8,
      "Turnover (x/y)": 6.8,
      "Score": -0.13
    }
  ];
}

function getFallbackEquityCurves() {
  const dates = [];
  for (let yr = 2010; yr <= 2025; yr++) {
    for (let m = 1; m <= 12; m++) {
      dates.push(`${yr}-${String(m).padStart(2, '0')}-01`);
    }
  }
  return {
    "VNINDEX": dates.map(d => ({ date: d, nav: 100 })),
    "AI_Advisor_BenBi_3M": dates.map(d => ({ date: d, nav: 100 }))
  };
}

function getFallbackTrades() {
  return [
    {
      id: "TRD-0001",
      advisor: "AI_Advisor_ChuDong_2W",
      symbol: "FPT",
      sector: "Công nghệ",
      entry_date: "2024-03-15",
      exit_date: "2024-04-10",
      entry_price: 98.5,
      exit_price: 114.2,
      shares: 3000,
      return_pct: 15.6,
      pnl_vnd: 46500000,
      holding_days: 26,
      exit_reason: "Chốt Lời Mục Tiêu (+15%)"
    }
  ];
}
