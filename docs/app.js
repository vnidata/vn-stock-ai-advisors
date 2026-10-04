// BSC Quant - AI Portfolio Advisor Web Dashboard
// Master Controller: Holdings, New Signals, News Actions, Trades History, Per-Symbol Analytics, Performance & Evolution

let globalDailyData = null;
let allTrades = [];
let allSymbolStats = {};
let selectedSymbol = null;
let currentHoldingsAdvisor = 'all';
let currentSignalFilter = 'all';
let filteredTrades = [];
let currentTradePage = 1;
let tradePageSize = 15;
let equityCurvesData = null;
let equityChartInstance = null;
let allNewsArticles = [];

const SECTOR_VIETNAMESE = {
  "Materials": "Thép & Vật Liệu",
  "Technology": "Công Nghệ & Viễn Thông",
  "Banking": "Ngân Hàng",
  "Securities": "Chứng Khoán",
  "Chemicals": "Hóa Chất & Phân Bón",
  "RealEstate": "Bất Động Sản Dân Cư",
  "IndustrialRealEstate": "BĐS Khu Công Nghiệp",
  "Retail": "Bán Lẻ & Chuỗi",
  "Consumer": "Tiêu Dùng & Thực Phẩm",
  "Energy": "Dầu Khí & Năng Lượng",
  "Logistics": "Cảng Biển & Logistics",
  "Agriculture": "Nông Nghiệp & Chăn Nuôi",
  "Industrial": "Công Nghiệp Cơ Điện",
  "Bluechip": "Cổ Phiếu Trụ Bluechip"
};

function getSectorVi(sector) {
  return SECTOR_VIETNAMESE[sector] || sector || "Cổ Phiếu Bluechip";
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupHoldingsControls();
  setupSignalControls();
  setupSymbolStatsControls();
  setupTradeFilters();
  setupNewsFilters();
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
    globalDailyData = summaryRes && summaryRes.ok ? await summaryRes.json() : getFallbackDailySummary();
    renderDailySummary(globalDailyData);
    renderHoldingsTable(globalDailyData);
    renderNewSignals(globalDailyData);
    renderNewsActionRecommendations(globalDailyData);

    // 2. Fetch 15-year performance metrics
    const perfRes = await fetch("data/performance_15y.json").catch(() => null);
    const perfData = perfRes && perfRes.ok ? await perfRes.json() : getFallbackPerformance();
    renderLeaderboard(perfData);
    renderAnnualTable(perfData);

    // 3. Fetch Equity Curves
    const curvesRes = await fetch("data/equity_curves.json").catch(() => null);
    equityCurvesData = curvesRes && curvesRes.ok ? await curvesRes.json() : getFallbackEquityCurves();
    renderEquityChart(equityCurvesData);

    // 4. Fetch Trades History & Symbol Stats
    const tradesRes = await fetch("data/trades_history.json").catch(() => null);
    if (tradesRes && tradesRes.ok) {
      const tradesPayload = await tradesRes.json();
      allTrades = tradesPayload.trades || [];
      allSymbolStats = tradesPayload.symbol_stats || {};
    } else {
      allTrades = getFallbackTrades();
      allSymbolStats = getFallbackSymbolStats();
    }
    renderSymbolStatsTable(allSymbolStats);
    applyTradeFilters();

    // 5. Fetch News & Corporate Disclosures Intelligence
    const newsRes = await fetch("data/news_intelligence.json").catch(() => null);
    if (newsRes && newsRes.ok) {
      const newsData = await newsRes.json();
      renderNewsIntelligence(newsData);
    }

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
          <td>
            <span class="signal-tag">${item.technical_signal || 'Theo dõi'}</span>
            ${item.news_status ? `<div style="margin-top: 4px;"><span class="news-badge ${item.news_badge || 'neutral'}">${item.news_status}</span></div>` : ''}
          </td>
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
// 3A. CURRENT HOLDINGS CONTROLLER & RENDERER
// ==========================================
function setupHoldingsControls() {
  const chips = document.querySelectorAll(".holdings-chip");
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentHoldingsAdvisor = chip.getAttribute("data-advisor");
      renderHoldingsTable(globalDailyData);
    });
  });

  const btnTable = document.getElementById("btn-view-table");
  const btnCards = document.getElementById("btn-view-cards");
  const tableContainer = document.getElementById("holdings-table-container");
  const cardsContainer = document.getElementById("strategy-cards-container");

  if (btnTable && btnCards && tableContainer && cardsContainer) {
    btnTable.addEventListener("click", () => {
      btnTable.classList.add("active");
      btnCards.classList.remove("active");
      tableContainer.style.display = "block";
      cardsContainer.style.display = "none";
    });

    btnCards.addEventListener("click", () => {
      btnCards.classList.add("active");
      btnTable.classList.remove("active");
      tableContainer.style.display = "none";
      cardsContainer.style.display = "grid";
    });
  }
}

function renderHoldingsTable(data) {
  if (!data) return;
  const holdings = data.current_holdings || [];

  const filtered = currentHoldingsAdvisor === 'all' ? 
    holdings : 
    holdings.filter(h => h.advisor === currentHoldingsAdvisor || h.advisor_name.includes(currentHoldingsAdvisor));

  const totalCount = holdings.length;
  const wins = holdings.filter(h => h.current_return_pct > 0).length;
  const losses = holdings.filter(h => h.current_return_pct <= 0).length;
  const avgRet = totalCount > 0 ? (holdings.reduce((acc, h) => acc + h.current_return_pct, 0) / totalCount).toFixed(2) : "0.0";
  const safeCount = holdings.filter(h => h.current_return_pct >= 0).length;
  const atRiskCount = holdings.filter(h => h.current_return_pct <= -3.0).length;

  const kpiCountElem = document.getElementById("kpi-holdings-count");
  if (kpiCountElem) kpiCountElem.innerText = `${totalCount} mã`;
  
  const kpiAvgRetElem = document.getElementById("kpi-holdings-avg-ret");
  if (kpiAvgRetElem) {
    kpiAvgRetElem.innerText = `${avgRet >= 0 ? '+' : ''}${avgRet}%`;
    kpiAvgRetElem.className = avgRet >= 0 ? "kpi-value text-green" : "kpi-value text-red";
  }

  const kpiWinRatioElem = document.getElementById("kpi-holdings-win-ratio");
  if (kpiWinRatioElem) kpiWinRatioElem.innerText = `${wins} vị thế lãi / ${losses} vị thế lỗ`;

  const kpiSafeElem = document.getElementById("kpi-holdings-safe");
  if (kpiSafeElem) kpiSafeElem.innerText = `${safeCount} mã`;

  const kpiRiskElem = document.getElementById("kpi-holdings-at-risk");
  if (kpiRiskElem) kpiRiskElem.innerText = `${atRiskCount} mã`;

  const tbody = document.getElementById("holdings-table-body");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted" style="padding: 24px;">Không có vị thế nắm giữ nào cho chuyên gia đã chọn.</td></tr>`;
    return;
  }

  let html = "";
  filtered.forEach(h => {
    const isWin = h.current_return_pct >= 0;
    const retSign = isWin ? "+" : "";
    const retClass = isWin ? "text-green" : "text-red";
    const dailyChgSign = h.daily_change_pct >= 0 ? "+" : "";
    const dailyChgClass = h.daily_change_pct >= 0 ? "change-badge pos" : "change-badge neg";

    let statusPillClass = "status-pill neutral";
    if (h.status_badge === "pos-bold") statusPillClass = "status-pill pos-bold";
    else if (h.status_badge === "pos") statusPillClass = "status-pill pos";
    else if (h.status_badge === "neg") statusPillClass = "status-pill neg";

    html += `
      <tr>
        <td><span class="ticker-pill">${h.symbol}</span></td>
        <td><span class="sector-label">${h.advisor_name}</span></td>
        <td><span class="sector-label">${getSectorVi(h.sector)}</span></td>
        <td class="text-center font-mono"><strong>${h.weight_pct}%</strong></td>
        <td class="text-right font-mono">${Number(h.entry_price).toFixed(2)}</td>
        <td class="text-right font-mono"><strong>${Number(h.current_price).toFixed(2)}</strong></td>
        <td class="text-center"><span class="${dailyChgClass}">${dailyChgSign}${h.daily_change_pct}%</span></td>
        <td class="text-center font-mono ${retClass}"><strong>${retSign}${h.current_return_pct}%</strong></td>
        <td class="text-center font-mono">${h.holding_days}d</td>
        <td class="text-right font-mono text-red">${Number(h.stop_loss).toFixed(2)}</td>
        <td class="text-right font-mono text-green">${Number(h.target_price).toFixed(2)}</td>
        <td class="text-center"><span class="${statusPillClass}">${h.status_text || 'ĐANG NẮM GIỮ'}</span></td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${h.action_advice || 'Duy trì vị thế'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ==========================================
// 3B. NEW BUY/SELL SIGNALS CONTROLLER & RENDERER
// ==========================================
function setupSignalControls() {
  const sigBtns = document.querySelectorAll(".sig-filter-btn");
  sigBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sigBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSignalFilter = btn.getAttribute("data-sig-filter");
      renderNewSignals(globalDailyData);
    });
  });
}

function renderNewSignals(data) {
  if (!data) return;
  const signals = data.new_signals || [];

  const buyCount = signals.filter(s => s.signal_badge === "buy").length;
  const tpCount = signals.filter(s => s.signal_badge === "profit").length;
  const slCount = signals.filter(s => s.signal_badge === "stop").length;

  const kpiBuy = document.getElementById("kpi-sig-buy");
  if (kpiBuy) kpiBuy.innerText = `${buyCount} tín hiệu`;

  const kpiTp = document.getElementById("kpi-sig-tp");
  if (kpiTp) kpiTp.innerText = `${tpCount} tín hiệu`;

  const kpiSl = document.getElementById("kpi-sig-sl");
  if (kpiSl) kpiSl.innerText = `${slCount} tín hiệu`;

  const tbody = document.getElementById("signals-table-body");
  if (!tbody) return;

  const filtered = currentSignalFilter === "all" ? 
    signals : 
    signals.filter(s => s.signal_badge === currentSignalFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 24px;">Không có tín hiệu nào cho bộ lọc đã chọn.</td></tr>`;
    return;
  }

  let html = "";
  filtered.forEach(sig => {
    let badgeClass = "signal-badge buy";
    if (sig.signal_badge === "profit") badgeClass = "signal-badge profit";
    else if (sig.signal_badge === "stop") badgeClass = "signal-badge stop";
    else if (sig.signal_badge === "rebalance") badgeClass = "signal-badge rebalance";

    html += `
      <tr>
        <td><strong style="color: var(--color-cyan); font-family: var(--font-mono);">${sig.id}</strong></td>
        <td><span class="ticker-pill">${sig.symbol}</span></td>
        <td><span class="${badgeClass}">${sig.signal_type}</span></td>
        <td><span class="sector-label">${sig.recommended_advisor}</span></td>
        <td><span class="sector-label">${getSectorVi(sig.sector)}</span></td>
        <td class="text-right font-mono"><strong>${Number(sig.signal_price).toFixed(2)}</strong></td>
        <td class="text-right font-mono text-green">${Number(sig.target_price).toFixed(2)} (+${sig.target_return_pct}%)</td>
        <td class="text-right font-mono text-red">${Number(sig.stop_loss).toFixed(2)} (${sig.max_loss_pct}%)</td>
        <td class="text-center font-mono text-gold"><strong>${sig.rr_ratio}</strong></td>
        <td class="text-center font-mono">${sig.recommended_weight_pct}%</td>
        <td style="font-size: 0.82rem; color: var(--text-main); font-weight: 500;">${sig.technical_reason}</td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${sig.advisor_rationale}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ==========================================
// 3C. NEWS ACTION RECOMMENDATIONS RENDERER
// ==========================================
function renderNewsActionRecommendations(data) {
  if (!data) return;
  const newsActions = data.news_action_recommendations || {};
  const catalysts = newsActions.catalysts || [];
  const redFlags = newsActions.red_flags || [];

  // 1. Catalyst Box
  const catContainer = document.getElementById("catalyst-actions-list");
  if (catContainer) {
    if (catalysts.length === 0) {
      catContainer.innerHTML = `<div class="text-center text-muted" style="padding: 16px;">Chưa phát hiện mã cổ phiếu có catalyst vượt ngưỡng đột phá.</div>`;
    } else {
      let catHtml = "";
      catalysts.forEach(item => {
        catHtml += `
          <div class="action-stock-card">
            <div class="action-stock-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="ticker-pill">${item.symbol}</span>
                <span class="sector-label">${getSectorVi(item.sector)}</span>
                <span class="news-badge pos">+${item.net_sentiment.toFixed(2)}</span>
              </div>
              <span class="badge tag-green">${item.sentiment_multiplier.toFixed(2)}x [THƯỞNG ĐIỂM]</span>
            </div>
            <div class="action-stock-headline">${item.latest_headline}</div>
            <div>
              <span class="action-stock-advice advice-boost">🎯 Khuyến nghị: ${item.action_desc}</span>
            </div>
          </div>
        `;
      });
      catContainer.innerHTML = catHtml;
    }
  }

  // 2. Red Flag Box
  const redContainer = document.getElementById("redflag-actions-list");
  if (redContainer) {
    if (redFlags.length === 0) {
      redContainer.innerHTML = `
        <div class="action-stock-card" style="border-color: rgba(16, 185, 129, 0.3);">
          <div style="display: flex; align-items: center; gap: 10px; color: var(--color-green);">
            <span style="font-size: 1.2rem;">✅</span>
            <strong>HỆ THỐNG AN TOÀN TUYỆT ĐỐI:</strong>
          </div>
          <p style="font-size: 0.84rem; color: var(--text-muted); margin-top: 4px;">
            Không phát hiện mã nào trong vũ trụ đầu tư dính sai phạm, thanh tra khởi tố hay kiểm toán từ chối trong 24h qua.
          </p>
        </div>
      `;
    } else {
      let redHtml = "";
      redFlags.forEach(item => {
        redHtml += `
          <div class="action-stock-card">
            <div class="action-stock-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="ticker-pill">${item.symbol}</span>
                <span class="sector-label">${getSectorVi(item.sector)}</span>
                <span class="news-badge neg-danger">${item.net_sentiment.toFixed(2)}</span>
              </div>
              <span class="badge tag-red">0.00x [VETO PHỦ QUYẾT]</span>
            </div>
            <div class="action-stock-headline text-red">${item.latest_headline}</div>
            <div>
              <span class="action-stock-advice advice-veto">🛑 Phủ Quyết: ${item.action_desc}</span>
            </div>
          </div>
        `;
      });
      redContainer.innerHTML = redHtml;
    }
  }
}

// ==========================================
// 3D. PER-SYMBOL PERFORMANCE ANALYTICS & DRILL-DOWN
// ==========================================
function setupSymbolStatsControls() {
  const searchInput = document.getElementById("symbol-stats-search");
  if (searchInput) {
    let debounce;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        renderSymbolStatsTable(allSymbolStats, searchInput.value);
      }, 200);
    });
  }

  const btnClear = document.getElementById("btn-clear-symbol-filter");
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      clearSymbolSelection();
    });
  }
}

function selectSymbol(sym) {
  selectedSymbol = sym;
  const symData = allSymbolStats[sym];

  const banner = document.getElementById("selected-symbol-banner");
  if (banner && symData) {
    document.getElementById("selected-sym-code").innerText = sym;
    document.getElementById("selected-sym-title").innerText = `Chi Tiết Hiệu Suất Cổ Phiếu ${sym} (${getSectorVi(symData.sector)})`;
    const pnlSign = symData.total_pnl_vnd >= 0 ? "+" : "";
    const pnlBillion = (symData.total_pnl_vnd / 1000000000).toFixed(2);
    document.getElementById("selected-sym-summary").innerHTML = `
      Ngành: <strong>${getSectorVi(symData.sector)}</strong> · 
      Win Rate: <strong class="text-green">${symData.win_rate}%</strong> (${symData.win_trades} thắng / ${symData.loss_trades} thua) · 
      Tổng Lệnh: <strong>${symData.total_trades}</strong> · 
      Lãi TB: <strong>${symData.avg_return_pct >= 0 ? '+' : ''}${symData.avg_return_pct}%</strong> · 
      Trade Tốt Nhất: <strong class="text-green">+${symData.best_trade_pct}%</strong> · 
      Trade Tệ Nhất: <strong class="text-red">${symData.worst_trade_pct}%</strong> · 
      Tổng PnL: <strong class="${symData.total_pnl_vnd >= 0 ? 'text-green' : 'text-red'}">${pnlSign}${pnlBillion} Tỷ ₫</strong> · 
      Giữ TB: <strong>${symData.avg_holding_days} ngày</strong>
    `;
    banner.style.display = "flex";
  }

  const symInput = document.getElementById("filter-symbol");
  if (symInput) symInput.value = sym;

  document.querySelectorAll("#symbol-stats-tbody tr").forEach(tr => {
    if (tr.getAttribute("data-symbol") === sym) {
      tr.classList.add("active-symbol-row");
    } else {
      tr.classList.remove("active-symbol-row");
    }
  });

  applyTradeFilters();

  if (banner) {
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearSymbolSelection() {
  selectedSymbol = null;
  const banner = document.getElementById("selected-symbol-banner");
  if (banner) banner.style.display = "none";

  const symInput = document.getElementById("filter-symbol");
  if (symInput) symInput.value = "";

  document.querySelectorAll("#symbol-stats-tbody tr").forEach(tr => {
    tr.classList.remove("active-symbol-row");
  });

  applyTradeFilters();
}

function renderSymbolStatsTable(statsMap, searchTerm = "") {
  const tbody = document.getElementById("symbol-stats-tbody");
  if (!tbody || !statsMap) return;

  const symbols = Object.keys(statsMap);
  if (symbols.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted">Chưa có dữ liệu thống kê theo mã.</td></tr>`;
    return;
  }

  const term = searchTerm.trim().toUpperCase();
  const filteredSymbols = symbols.filter(sym => !term || sym.includes(term) || (statsMap[sym].sector && statsMap[sym].sector.toUpperCase().includes(term)));

  filteredSymbols.sort((a, b) => statsMap[b].total_trades - statsMap[a].total_trades);

  let html = "";
  filteredSymbols.forEach(sym => {
    const s = statsMap[sym];
    const winRateClass = s.win_rate >= 50 ? "text-green" : "text-gold";
    const retClass = s.avg_return_pct >= 0 ? "text-green" : "text-red";
    const retSign = s.avg_return_pct >= 0 ? "+" : "";
    const pnlSign = s.total_pnl_vnd >= 0 ? "+" : "";
    const pnlClass = s.total_pnl_vnd >= 0 ? "text-green" : "text-red";
    const pnlBillion = (s.total_pnl_vnd / 1000000000).toFixed(2);
    const isActive = selectedSymbol === sym ? "active-symbol-row" : "";

    html += `
      <tr class="${isActive}" data-symbol="${sym}">
        <td><span class="ticker-pill">${sym}</span></td>
        <td><span class="sector-label">${getSectorVi(s.sector)}</span></td>
        <td class="text-center font-mono"><strong>${s.total_trades}</strong></td>
        <td class="text-center font-mono text-green">${s.win_trades}</td>
        <td class="text-center font-mono text-red">${s.loss_trades}</td>
        <td class="text-center font-mono ${winRateClass}"><strong>${s.win_rate}%</strong></td>
        <td class="text-center font-mono ${retClass}"><strong>${retSign}${s.avg_return_pct}%</strong></td>
        <td class="text-right font-mono text-green">+${s.best_trade_pct}%</td>
        <td class="text-right font-mono text-red">${s.worst_trade_pct}%</td>
        <td class="text-right font-mono ${pnlClass}"><strong>${pnlSign}${pnlBillion} Tỷ ₫</strong></td>
        <td class="text-center font-mono">${s.avg_holding_days}d</td>
        <td class="text-center">
          <button class="btn-symbol-inspect" data-sym="${sym}">Xem Lệnh ➔</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", () => {
      const sym = tr.getAttribute("data-symbol");
      if (sym) selectSymbol(sym);
    });
  });

  tbody.querySelectorAll(".btn-symbol-inspect").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sym = btn.getAttribute("data-sym");
      if (sym) selectSymbol(sym);
    });
  });
}

function getFallbackSymbolStats() {
  return {
    "HPG": { "symbol": "HPG", "sector": "Materials", "total_trades": 163, "win_trades": 94, "loss_trades": 69, "win_rate": 57.7, "avg_return_pct": 2.99, "best_trade_pct": 39.76, "worst_trade_pct": -9.32, "total_pnl_vnd": 1581168756046, "avg_holding_days": 18.7 },
    "FPT": { "symbol": "FPT", "sector": "Technology", "total_trades": 182, "win_trades": 112, "loss_trades": 70, "win_rate": 61.5, "avg_return_pct": 3.45, "best_trade_pct": 42.15, "worst_trade_pct": -8.54, "total_pnl_vnd": 1892450000000, "avg_holding_days": 21.2 },
    "VCB": { "symbol": "VCB", "sector": "Banking", "total_trades": 145, "win_trades": 85, "loss_trades": 60, "win_rate": 58.6, "avg_return_pct": 2.75, "best_trade_pct": 28.40, "worst_trade_pct": -6.20, "total_pnl_vnd": 1120300000000, "avg_holding_days": 19.5 },
    "MBB": { "symbol": "MBB", "sector": "Banking", "total_trades": 158, "win_trades": 90, "loss_trades": 68, "win_rate": 57.0, "avg_return_pct": 2.65, "best_trade_pct": 33.10, "worst_trade_pct": -7.10, "total_pnl_vnd": 1240000000000, "avg_holding_days": 17.8 },
    "TCB": { "symbol": "TCB", "sector": "Banking", "total_trades": 138, "win_trades": 78, "loss_trades": 60, "win_rate": 56.5, "avg_return_pct": 2.50, "best_trade_pct": 31.50, "worst_trade_pct": -7.50, "total_pnl_vnd": 980000000000, "avg_holding_days": 18.0 }
  };
}

// ==========================================
// 3.5. NEWS INTELLIGENCE & RE-EVALUATION RADAR
// ==========================================
function setupNewsFilters() {
  const filterBtns = document.querySelectorAll(".news-filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.getAttribute("data-filter");
      filterNewsArticles(filter);
    });
  });
}

function filterNewsArticles(filter) {
  const container = document.getElementById("news-articles-container");
  if (!container) return;

  let filtered = allNewsArticles;
  if (filter === "catalyst") {
    filtered = allNewsArticles.filter(a => a.is_catalyst || a.sentiment_score >= 0.5);
  } else if (filter === "redflag") {
    filtered = allNewsArticles.filter(a => a.is_red_flag || a.sentiment_score <= -0.5);
  } else if (filter === "cbtt") {
    filtered = allNewsArticles.filter(a => (a.category && a.category.includes("DOANH NGHIỆP")) || (a.source && a.source.includes("CBTT")));
  }

  renderArticlesList(filtered);
}

function renderNewsIntelligence(newsData) {
  if (!newsData) return;

  // 1. KPI Cards
  const totalElem = document.getElementById("kpi-news-total");
  if (totalElem) totalElem.innerText = `${newsData.total_news_scanned || 0} tin`;

  const catElem = document.getElementById("kpi-news-catalysts");
  if (catElem) catElem.innerText = `${newsData.catalysts_detected || 0} mã`;

  const redElem = document.getElementById("kpi-news-redflags");
  if (redElem) redElem.innerText = `${newsData.red_flags_detected || 0} mã`;

  const verdElem = document.getElementById("kpi-news-verdict");
  if (verdElem) {
    verdElem.innerText = newsData.system_verdict || "AN TOÀN";
    verdElem.className = (newsData.red_flags_detected > 0) ? "kpi-value text-red" : "kpi-value text-gold";
  }

  const syncElem = document.getElementById("news-sync-time");
  if (syncElem && newsData.last_updated) {
    syncElem.innerText = `Rà soát: ${newsData.last_updated}`;
  }

  // 2. Symbol Re-evaluation Matrix Table
  const matrixTbody = document.getElementById("news-matrix-tbody");
  if (matrixTbody && newsData.symbols_sentiment) {
    matrixTbody.innerHTML = "";
    const symbols = Object.keys(newsData.symbols_sentiment);
    
    // Sort symbols: Red flags first, then catalysts, then highest news count
    symbols.sort((a, b) => {
      const sa = newsData.symbols_sentiment[a];
      const sb = newsData.symbols_sentiment[b];
      if (sa.has_red_flag && !sb.has_red_flag) return -1;
      if (!sa.has_red_flag && sb.has_red_flag) return 1;
      if (sa.has_catalyst && !sb.has_catalyst) return -1;
      if (!sa.has_catalyst && sb.has_catalyst) return 1;
      return sb.news_count - sa.news_count;
    });

    symbols.forEach(sym => {
      const item = newsData.symbols_sentiment[sym];
      const tr = document.createElement("tr");

      const scoreSign = item.net_sentiment > 0 ? "+" : "";
      const scoreColor = item.net_sentiment > 0 ? "text-green" : (item.net_sentiment < 0 ? "text-red" : "text-muted");
      const multiplierText = item.sentiment_multiplier === 0.0 ? 
        `<span class="badge tag-red">0.0x [VETO PHỦ QUYẾT]</span>` : 
        (item.sentiment_multiplier > 1.0 ? `<span class="badge tag-green">${item.sentiment_multiplier.toFixed(2)}x [THƯỞNG]</span>` : `<span class="badge badge-info">1.00x [CHUẨN]</span>`);

      tr.innerHTML = `
        <td><span class="ticker-pill">${item.symbol}</span></td>
        <td class="text-center"><strong>${item.news_count}</strong></td>
        <td class="text-center font-mono ${scoreColor}"><strong>${scoreSign}${item.net_sentiment.toFixed(2)}</strong></td>
        <td class="text-center"><span class="news-badge ${item.status_badge || 'neutral'}">${item.status}</span></td>
        <td style="max-width: 360px; font-size: 0.85rem;">
          <div style="font-weight: 600; color: var(--text-main); line-height: 1.3;">${item.latest_headline}</div>
        </td>
        <td><span style="font-size: 0.82rem; color: var(--text-muted);">${item.action_desc}</span></td>
        <td class="text-right">${multiplierText}</td>
      `;
      matrixTbody.appendChild(tr);
    });
  }

  // 3. Articles Feed
  allNewsArticles = newsData.recent_articles || [];
  renderArticlesList(allNewsArticles);
}

function renderArticlesList(articles) {
  const container = document.getElementById("news-articles-container");
  if (!container) return;
  container.innerHTML = "";

  if (!articles || articles.length === 0) {
    container.innerHTML = `<div class="text-center text-muted" style="padding: 30px;">Không tìm thấy bài viết phù hợp với bộ lọc.</div>`;
    return;
  }

  articles.slice(0, 30).forEach(art => {
    const item = document.createElement("div");
    item.className = "news-article-item";

    const symbolsHtml = (art.symbols || []).map(s => `<span class="news-symbol-tag">${s}</span>`).join(" ");
    const triggersHtml = (art.triggers_found || []).map(t => `<span class="news-trigger-tag">${t}</span>`).join(" ");

    item.innerHTML = `
      <div class="news-article-header">
        <a href="${art.link || '#'}" target="_blank" rel="noopener noreferrer" class="news-article-title">
          ${art.title}
        </a>
        <span class="news-badge ${art.sentiment_badge || 'neutral'}">${art.sentiment_label || 'TRUNG TÍNH'}</span>
      </div>
      ${art.description ? `<p class="news-article-desc">${art.description}</p>` : ''}
      <div class="news-article-meta">
        <span><strong>Nguồn:</strong> ${art.source || 'Tin tức'}</span>
        <span><strong>Thời gian:</strong> ${art.published_date || ''}</span>
        <span><strong>Chuyên mục:</strong> ${art.category || 'Tài chính'}</span>
        ${symbolsHtml ? `<span><strong>Mã liên quan:</strong> ${symbolsHtml}</span>` : ''}
        ${triggersHtml ? `<span><strong>Từ khóa:</strong> ${triggersHtml}</span>` : ''}
      </div>
    `;
    container.appendChild(item);
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
    
    selectedSymbol = null;
    const banner = document.getElementById("selected-symbol-banner");
    if (banner) banner.style.display = "none";
    document.querySelectorAll("#symbol-stats-tbody tr").forEach(tr => tr.classList.remove("active-symbol-row"));

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
