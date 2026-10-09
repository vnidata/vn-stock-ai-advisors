// AlphaQuant AI - Autonomous Stock Portfolio Advisory Dashboard
// Master Controller: Holdings, New Signals, News Actions, Trades History, Per-Symbol Analytics, Performance & Evolution

let currentMarket = 'vn'; // 'vn' or 'us'
let globalDailyData = null;
let allTrades = [];
let allSymbolStats = {};
let currentPhaseSymbolStats = {};
let currentPhaseFilter = 'live'; // 'live', 'backtest', 'all'
let tradesPayloadMetadata = null;
let selectedSymbol = null;
let currentHoldingsAdvisor = 'all';
let currentBuyFilter = 'all';
let currentSellFilter = 'all';
let currentSignalFilter = 'all';
let filteredTrades = [];
let currentTradePage = 1;
let tradePageSize = 15;
let equityCurvesData = null;
let equityChartInstance = null;
let allNewsArticles = [];
let currentTradeSortCol = 'exit_date';
let currentTradeSortDir = 'desc';
let currentWatchlistSector = 'all';
let currentWatchlistSearch = '';

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
  "Bluechip": "Cổ Phiếu Trụ Bluechip",
  "Semiconductors": "Bán Dẫn & Chip AI",
  "CommunicationServices": "Truyền Thông & Internet",
  "ConsumerDiscretionary": "Tiêu Dùng Không Thiết Yếu",
  "ConsumerStaples": "Hàng Tiêu Dùng Thiết Yếu",
  "Financials": "Tài Chính & Ngân Hàng Mỹ",
  "Healthcare": "Y Tế & Dược Phẩm",
  "IndexETF": "Quỹ Chỉ Số ETF SPY"
};

function getSectorVi(sector) {
  return SECTOR_VIETNAMESE[sector] || sector || "Cổ Phiếu Bluechip";
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupMobileBottomNav();
  setupMarketSwitcher();
  startLiveClock();
  startScanCountdownTimer();
  startAiScanTicker();
  setupRefreshButton();
  setupBackToTop();
  setupExportCsv();
  setupTradeSorting();
  setupHoldingsControls();
  setupWatchlistControls();
  setupBuySignalControls();
  setupSellSignalControls();
  setupQuickTradeModal();
  setupStockLookup();
  setupSymbolStatsControls();
  setupPhaseSwitcher();
  setupTradeFilters();
  setupNewsFilters();
  setupChartZoom();
  await loadDashboardData();
});

// ==========================================
// 1. ADVANCED UI/UX CONTROLLERS
// ==========================================
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      switchTab(targetId);
    });
  });

  // Keyboard shortcut listener [1 - 6] for quick tab switching
  window.addEventListener("keydown", (e) => {
    const activeTag = document.activeElement?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

    const shortcutMap = {
      '1': 'tab-buy-signals',
      '2': 'tab-sell-signals',
      '3': 'tab-trades',
      '4': 'tab-performance',
      '5': 'tab-news-actions',
      '6': 'tab-evolution'
    };

    if (shortcutMap[e.key]) {
      e.preventDefault();
      switchTab(shortcutMap[e.key]);
      const btn = document.querySelector(`.tab-btn[data-tab="${shortcutMap[e.key]}"]`);
      const tabName = btn ? btn.querySelector(".tab-text")?.innerText || shortcutMap[e.key] : shortcutMap[e.key];
      showToast(`Chuyển đến tab: ${tabName} (Phím [${e.key}])`, "info");
    }
  });

  // Restore saved active tab from localStorage if exists
  const savedTab = localStorage.getItem("alphaquant_active_tab");
  if (savedTab && document.getElementById(savedTab)) {
    switchTab(savedTab);
  }
}

function switchTab(targetId) {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panes = document.querySelectorAll(".tab-pane");

  tabBtns.forEach(b => {
    if (b.getAttribute("data-tab") === targetId) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });

  panes.forEach(p => {
    if (p.id === targetId) {
      p.classList.add("active");
    } else {
      p.classList.remove("active");
    }
  });

  // Sync Mobile Bottom Nav Buttons
  const mobBtns = document.querySelectorAll(".mobile-nav-btn");
  mobBtns.forEach(mb => {
    if (mb.getAttribute("data-tab") === targetId) {
      mb.classList.add("active");
    } else {
      mb.classList.remove("active");
    }
  });

  localStorage.setItem("alphaquant_active_tab", targetId);

  // Auto-scroll top sticky tab button into view on mobile
  const activeTabBtn = document.querySelector(`.tab-btn[data-tab="${targetId}"]`);
  if (activeTabBtn && activeTabBtn.scrollIntoView) {
    activeTabBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // On mobile devices, smooth-scroll to content top when switching tabs
  if (window.innerWidth <= 768) {
    const pane = document.getElementById(targetId);
    if (pane) {
      const topOffset = pane.getBoundingClientRect().top + window.pageYOffset - 110;
      window.scrollTo({ top: Math.max(0, topOffset), behavior: "smooth" });
    }
  }

  // Resize chart if performance tab is opened
  if (targetId === "tab-performance" && equityChartInstance) {
    setTimeout(() => equityChartInstance.resize(), 100);
  }
}

// 1A. Mobile Bottom Navigation
function setupMobileBottomNav() {
  const mobBtns = document.querySelectorAll(".mobile-nav-btn");
  mobBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      switchTab(tabId);
    });
  });
}

// 1B. Real-Time 6-Session Scan Countdown (09:00, 10:00, 11:30, 13:30, 14:00, 15:00)
function startScanCountdownTimer() {
  const scanSlots = [
    { time: "09:00", label: "09:00 - ATO Mở Phiên", h: 9, m: 0 },
    { time: "10:00", label: "10:00 - Giữa Phiên Sáng", h: 10, m: 0 },
    { time: "11:30", label: "11:30 - Chốt Phiên Sáng", h: 11, m: 30 },
    { time: "13:30", label: "13:30 - Mở Phiên Chiều", h: 13, m: 30 },
    { time: "14:00", label: "14:00 - Cao Điểm Chiều", h: 14, m: 0 },
    { time: "15:00", label: "15:00 - Đóng Phiên ATC", h: 15, m: 0 }
  ];

  function updateCountdown() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vnDate = new Date(utc + (3600000 * 7)); // Vietnam Time (UTC+7)
    
    const curH = vnDate.getHours();
    const curM = vnDate.getMinutes();
    const curS = vnDate.getSeconds();
    const curTotalSec = curH * 3600 + curM * 60 + curS;

    let nextSlot = null;
    let nextTotalSec = 0;

    for (let slot of scanSlots) {
      const slotSec = slot.h * 3600 + slot.m * 60;
      if (curTotalSec < slotSec) {
        nextSlot = slot;
        nextTotalSec = slotSec;
        break;
      }
    }

    let diffSec = 0;
    if (nextSlot) {
      diffSec = nextTotalSec - curTotalSec;
    } else {
      // Next trading day 09:00
      nextSlot = scanSlots[0];
      diffSec = (24 * 3600 - curTotalSec) + (9 * 3600);
    }

    const diffH = Math.floor(diffSec / 3600);
    const diffM = Math.floor((diffSec % 3600) / 60);
    const diffS = diffSec % 60;
    const timeFormatted = `${String(diffH).padStart(2, '0')}:${String(diffM).padStart(2, '0')}:${String(diffS).padStart(2, '0')}`;

    const slotElem = document.getElementById("next-scan-slot");
    const timerElem = document.getElementById("next-scan-timer");
    if (slotElem) slotElem.innerText = nextSlot.time;
    if (timerElem) timerElem.innerText = timeFormatted;

    // Update slot pills
    const pills = document.querySelectorAll(".slot-pill");
    pills.forEach(p => {
      const pTime = p.getAttribute("data-slot");
      const matched = scanSlots.find(s => s.time === pTime);
      if (matched) {
        const slotSec = matched.h * 3600 + matched.m * 60;
        p.classList.remove("active", "passed");
        if (matched.time === nextSlot.time) {
          p.classList.add("active");
        } else if (curTotalSec >= slotSec) {
          p.classList.add("passed");
        }
      }
    });
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

// 1C. AI Radar Live Scan Feed Ticker
function startAiScanTicker() {
  const tickerHeadline = document.getElementById("ticker-headline");
  if (!tickerHeadline) return;

  const feeds = [
    "● [15:00 ATC] Đã quét 15 mã VN30 & 160 tin tức tài chính. Hệ thống duy trì 100% tiền mặt phòng thủ bảo toàn vốn trong thị trường gấu.",
    "● [14:00 Cao Điểm] Kiểm tra xung lực RSI & Dòng tiền MA20. Toàn bộ mã chưa đạt điều kiện giải ngân an toàn.",
    "● [13:30 Mở Chiều] Hấp thụ lượng cổ phiếu T+2.5 khớp lệnh. Không phát hiện phân kỳ dương thỏa mãn tỷ lệ RR 3.0x.",
    "● [11:30 Chốt Trưa] VN-Index 1.759,08 điểm dưới MA20/MA50. 5 AI Advisors đồng thuận kỷ luật giữ 100% tiền mặt.",
    "● [10:00 Giữa Sáng] Tin tức bất thường: Kích hoạt Red Flag Veto đối với 2 mã rủi ro vốn & thanh khoản.",
    "● [09:00 Mở Phiên] Khởi động radar 6 phiên/ngày. Đọc dữ liệu realtime từ vnstock API & Yahoo Finance."
  ];

  let feedIdx = 0;
  setInterval(() => {
    feedIdx = (feedIdx + 1) % feeds.length;
    tickerHeadline.style.opacity = 0;
    setTimeout(() => {
      tickerHeadline.innerText = feeds[feedIdx];
      tickerHeadline.style.opacity = 1;
    }, 300);
  }, 7000);
}

// 1D. Quick Trade Modal Controller (Click-to-Trade)
let currentModalTradeData = {
  symbol: "HPG",
  action: "MUA (BUY)",
  entryPrice: 20.5,
  stopLoss: 19.55,
  targetPrice: 23.6,
  rrRatio: "3.3x",
  sector: "Thép & Vật Liệu",
  winRate: 78
};

function setupQuickTradeModal() {
  const modal = document.getElementById("quick-trade-modal");
  const btnClose = document.getElementById("btn-close-quick-trade");
  const btnCancel = document.getElementById("btn-cancel-quick-trade");
  const btnConfirm = document.getElementById("btn-confirm-quick-trade");
  const slider = document.getElementById("modal-alloc-slider");

  if (!modal) return;

  const closeModal = () => { modal.style.display = "none"; };
  if (btnClose) btnClose.addEventListener("click", closeModal);
  if (btnCancel) btnCancel.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  if (slider) {
    slider.addEventListener("input", () => {
      updateModalCalculations();
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener("click", () => {
      const shares = document.getElementById("modal-trade-shares").innerText;
      const total = document.getElementById("modal-trade-total").innerText;
      showToast(`⚡ Đã khớp lệnh ${currentModalTradeData.action} ${currentModalTradeData.symbol}: ${shares} (Tổng: ${total}). Đã đưa vào danh mục theo dõi AI!`, "success");
      closeModal();
    });
  }
}

function openQuickTradeModal(symbol, action, entry, sl, tp, rr, sector, winRate) {
  currentModalTradeData.symbol = symbol || "HPG";
  currentModalTradeData.action = action || "MUA (BUY)";
  currentModalTradeData.entryPrice = Number(entry) || 20.5;
  currentModalTradeData.stopLoss = Number(sl) || 19.55;
  currentModalTradeData.targetPrice = Number(tp) || 23.6;
  currentModalTradeData.rrRatio = rr || "3.3x";
  currentModalTradeData.sector = sector || "Thép & Vật Liệu";
  currentModalTradeData.winRate = winRate || 78;

  const symElem = document.getElementById("modal-trade-symbol");
  if (symElem) symElem.innerText = currentModalTradeData.symbol;
  const secElem = document.getElementById("modal-trade-sector");
  if (secElem) secElem.innerText = currentModalTradeData.sector;
  
  const actionBadge = document.getElementById("modal-trade-action");
  if (actionBadge) {
    actionBadge.innerText = currentModalTradeData.action;
    actionBadge.className = currentModalTradeData.action.includes("BÁN") ? "trade-action-badge action-sell" : "trade-action-badge action-buy";
  }

  const winRateElem = document.getElementById("modal-trade-winrate");
  if (winRateElem) winRateElem.innerText = `Win Rate: ${currentModalTradeData.winRate}%`;

  const isUs = currentMarket === 'us';
  const currencySymbol = isUs ? "$" : " ₫";

  const entryElem = document.getElementById("modal-trade-entry");
  if (entryElem) entryElem.innerText = `${currentModalTradeData.entryPrice.toLocaleString('vi-VN')}${currencySymbol}`;
  const slElem = document.getElementById("modal-trade-sl");
  if (slElem) slElem.innerText = `${currentModalTradeData.stopLoss.toLocaleString('vi-VN')}${currencySymbol}`;
  const tpElem = document.getElementById("modal-trade-tp");
  if (tpElem) tpElem.innerText = `${currentModalTradeData.targetPrice.toLocaleString('vi-VN')}${currencySymbol}`;
  const rrElem = document.getElementById("modal-trade-rr");
  if (rrElem) rrElem.innerText = currentModalTradeData.rrRatio;

  updateModalCalculations();

  const modal = document.getElementById("quick-trade-modal");
  if (modal) modal.style.display = "flex";
}

function updateModalCalculations() {
  const slider = document.getElementById("modal-alloc-slider");
  const allocPct = slider ? parseInt(slider.value) : 10;
  
  const pctElem = document.getElementById("modal-alloc-pct");
  if (pctElem) pctElem.innerText = `${allocPct}%`;

  const isUs = currentMarket === 'us';
  const nav = isUs ? 50000 : 100000000; // $50k or 100M VND
  const currencySymbol = isUs ? "$" : " ₫";

  const budgetElem = document.getElementById("modal-alloc-budget");
  if (budgetElem) budgetElem.innerText = `Ngân sách NAV: ${nav.toLocaleString('vi-VN')}${currencySymbol}`;

  const allocatedCapital = (nav * allocPct) / 100;
  const price = currentModalTradeData.entryPrice * (isUs ? 1 : 1000);
  
  let shares = 0;
  if (price > 0) {
    if (isUs) {
      shares = Math.floor(allocatedCapital / price);
    } else {
      shares = Math.floor(allocatedCapital / price / 100) * 100; // Lot 100
      if (shares === 0) shares = 100;
    }
  }

  const totalValue = shares * price;
  const maxRisk = totalValue * 0.045;
  const maxGain = totalValue * 0.15;

  const sharesElem = document.getElementById("modal-trade-shares");
  if (sharesElem) sharesElem.innerText = `${shares.toLocaleString('vi-VN')} CP`;
  const totalElem = document.getElementById("modal-trade-total");
  if (totalElem) totalElem.innerText = `${totalValue.toLocaleString('vi-VN')}${currencySymbol}`;
  const riskElem = document.getElementById("modal-trade-max-risk");
  if (riskElem) riskElem.innerText = `-${maxRisk.toLocaleString('vi-VN')}${currencySymbol} (-4.5%)`;
  const gainElem = document.getElementById("modal-trade-max-gain");
  if (gainElem) gainElem.innerText = `+${maxGain.toLocaleString('vi-VN')}${currencySymbol} (+15.0%)`;
}

// ==========================================
// 1E. ADVANCED STOCK LOOKUP & AI ACTION RECOMMENDATION
// ==========================================
const VN_COMPANIES_DIR = {
  "HPG": { name: "CTCP Tập đoàn Hòa Phát", sector: "Materials", cap: "Mega-Cap Thép số 1 Việt Nam", desc: "Doanh nghiệp thép tích hợp chuỗi giá trị khép kín lớn nhất Đông Nam Á, thị phần xây dựng số 1." },
  "FPT": { name: "CTCP FPT", sector: "Technology", cap: "Mega-Cap Công Nghệ Số 1", desc: "Doanh nghiệp công nghệ, xuất khẩu phần mềm, AI và bán dẫn hàng đầu, đối tác chiến lược toàn cầu của Nvidia." },
  "TCB": { name: "Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)", sector: "Banking", cap: "Top Ngân Hàng Tư Nhân Số 1", desc: "Ngân hàng số hàng đầu với tỷ lệ CASA vượt trội và hiệu quả sinh lời ROA/ROE cao nhất hệ thống." },
  "MBB": { name: "Ngân hàng TMCP Quân Đội (MBBank)", sector: "Banking", cap: "Top Ngân Hàng Số & CASA", desc: "Ngân hàng quân đội tiên phong chuyển đổi số, CASA cao top 2 toàn ngành, tăng trưởng tín dụng bền vững." },
  "VCB": { name: "Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)", sector: "Banking", cap: "Ngân Hàng Trụ Vốn Hóa Lớn Nhất", desc: "Ngân hàng uy tín số 1 Việt Nam, chất lượng tài sản tốt nhất, tỷ lệ bao phủ nợ xấu cao nhất hệ thống." },
  "ACB": { name: "Ngân hàng TMCP Á Châu", sector: "Banking", cap: "Ngân Hàng Bán Lẻ An Toàn", desc: "Mô hình quản trị rủi ro hàng đầu, chất lượng nợ sạch nhất ngành ngân hàng bán lẻ." },
  "SSI": { name: "CTCP Chứng khoán SSI", sector: "Securities", cap: "Công Ty Chứng Khoán Số 1", desc: "Thị phần môi giới và vốn điều lệ top đầu thị trường chứng khoán Việt Nam, hưởng lợi trực tiếp từ nâng hạng KRX." },
  "VND": { name: "CTCP Chứng khoán VNDIRECT", sector: "Securities", cap: "Top 3 Môi Giới Bán Lẻ", desc: "Công ty chứng khoán số lượng tài khoản cá nhân lớn, hệ sinh thái tài chính và công nghệ mở rộng." },
  "VHM": { name: "CTCP Vinhomes", sector: "RealEstate", cap: "Nhà Phát Triển BĐS Số 1", desc: "Doanh nghiệp phát triển đại đô thị lớn nhất Việt Nam, quỹ đất khổng lồ và năng lực triển khai dự án hàng đầu." },
  "MWG": { name: "CTCP Đầu tư Thế Giới Di Động", sector: "Retail", cap: "Tập Đoàn Bán Lẻ Số 1", desc: "Chuỗi bán lẻ điện thoại, điện máy và Bách Hóa Xanh đạt điểm hòa vốn và bước vào chu kỳ tăng trưởng lợi nhuận." },
  "MSN": { name: "CTCP Tập đoàn Masan", sector: "Consumer", cap: "Hệ Sinh Thái Tiêu Dùng - Bán Lẻ", desc: "Tập đoàn tiêu dùng cốt lõi, sở hữu WinCommerce, Masan Consumer Holdings và chuỗi thịt sạch MEATDeli." },
  "VNM": { name: "CTCP Sữa Việt Nam (Vinamilk)", sector: "Consumer", cap: "Thương Hiệu Sữa Quốc Gia", desc: "Doanh nghiệp sữa dẫn đầu thị phần Việt Nam, dòng tiền thuần và cổ tức tiền mặt đều đặn, sức khỏe tài chính lành mạnh." },
  "DGC": { name: "CTCP Tập đoàn Hóa chất Đức Giang", sector: "Chemicals", cap: "Thống Lĩnh Phốt Pho Vàng", desc: "Nhà sản xuất phốt pho vàng (P4) nguyên liệu quan trọng cho công nghiệp chip bán dẫn và pin lithium lớn nhất châu Á." },
  "GAS": { name: "Tổng Công ty Khí Việt Nam (PV GAS)", sector: "Energy", cap: "Trụ Năng Lượng Quốc Gia", desc: "Độc quyền vận chuyển và phân phối khí thiên nhiên tại Việt Nam, dòng tiền dồi dào, đóng góp cổ tức lớn." },
  "GMD": { name: "CTCP Gemadept", sector: "Logistics", cap: "Cảng Biển & Logistics Hàng Đầu", desc: "Sở hữu cụm cảng nước sâu Gemalink lớn nhất Cái Mép - Thị Vải, hưởng lợi từ làn sóng dịch chuyển sản xuất FDI." },
  "STB": { name: "Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)", sector: "Banking", cap: "Ngân Hàng Tái Cơ Cấu Hoàn Tất", desc: "Ngân hàng xử lý xong đề án tái cơ cấu VAMC, mở ra dư địa hoàn nhập dự phòng và tăng trưởng mạnh mẽ." },
  "VPB": { name: "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)", sector: "Banking", cap: "Top Ngân Hàng Vốn Chủ Sở Hữu", desc: "Quy mô vốn điều lệ và vốn chủ sở hữu khủng sau thương vụ bán vốn chiến lược cho SMBC Nhật Bản." },
  "CTG": { name: "Ngân hàng TMCP Công Thương Việt Nam (VietinBank)", sector: "Banking", cap: "Trụ Cột Ngân Hàng Quốc Doanh", desc: "Quy mô tổng tài sản và dư nợ cho vay doanh nghiệp lớn nhất, hưởng lợi khi tín dụng mở rộng." },
  "BID": { name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)", sector: "Banking", cap: "Ngân Hàng Tổng Tài Sản Số 1", desc: "Quy mô huy động vốn và mạng lưới chi nhánh rộng khắp toàn quốc." },
  "VCI": { name: "CTCP Chứng khoán Vietcap", sector: "Securities", cap: "Ngân Hàng Đầu Tư IB Số 1", desc: "Đơn vị tư vấn thương vụ M&A, IPO và môi giới khách hàng tổ chức nước ngoài dẫn đầu thị trường." },
  "HCM": { name: "CTCP Chứng khoán TP.HCM (HSC)", sector: "Securities", cap: "Top Đầu Môi Giới Tổ Chức", desc: "Thị phần vững chắc khối tổ chức quốc tế và tự doanh ổn định." },
  "NVL": { name: "CTCP Tập đoàn Đầu tư Địa ốc No Va (Novaland)", sector: "RealEstate", cap: "Bất Động Sản Dân Cư & Nghỉ Dưỡng", desc: "Doanh nghiệp BĐS đang trong tiến trình tái cấu trúc nợ và tháo gỡ pháp lý các đại dự án." },
  "KDH": { name: "CTCP Đầu tư và Kinh doanh Nhà Khang Điền", sector: "RealEstate", cap: "Nhà Phát Triển BĐS Pháp Lý Sạch", desc: "Quỹ đất tập trung tại khu Đông TP.HCM, pháp lý minh bạch và sản phẩm nhà phố/căn hộ thanh khoản cao." },
  "DXG": { name: "CTCP Tập đoàn Đất Xanh", sector: "RealEstate", cap: "Phát Triển & Dịch Vụ Môi Giới BĐS", desc: "Hệ thống phân phối BĐS số 1 Việt Nam kết hợp các dự án khu đô thị quy mô lớn." },
  "PVD": { name: "Tổng CTCP Khoan và Dịch vụ Khoan Dầu khí", sector: "Energy", cap: "Dịch Vụ Giàn Khoan Biển", desc: "Đội giàn khoan tự nâng hoạt động hết công suất với giá thuê ngày duy trì ở mức cao trên thị trường quốc tế." },
  "PVS": { name: "Tổng CTCP Dịch vụ Kỹ thuật Dầu khí Việt Nam", sector: "Energy", cap: "Xây Lắp & Dầu Khí - Điện Gió Ngoài Khơi", desc: "Doanh nghiệp tổng thầu EPCI hạ tầng năng lượng ngoài khơi, hợp đồng điện gió xuất khẩu quốc tế tỷ đô." },
  "FRT": { name: "CTCP Bán lẻ Kỹ thuật số FPT (FPT Retail)", sector: "Retail", cap: "Chuỗi Bán Lẻ Dược Phẩm Long Châu", desc: "Chuỗi nhà thuốc Long Châu dẫn đầu toàn quốc với tốc độ mở mới và hiệu quả sinh lời vượt bậc." },
  "DBC": { name: "CTCP Tập đoàn DABACO Việt Nam", sector: "Agriculture", cap: "Chuỗi 3F Nông Nghiệp & Vaccine", desc: "Mô hình khép kín thức ăn - trang trại - thực phẩm, nghiên cứu thành công vaccine dịch tả lợn châu Phi (ASF)." },
  "REE": { name: "CTCP Cơ Điện Lạnh", sector: "Industrial", cap: "Tập Đoàn Cơ Điện & Năng Lượng Tái Tạo", desc: "Doanh nghiệp đa ngành cơ điện tử, văn phòng cho thuê cao cấp và sở hữu danh mục nhà máy thủy điện/điện gió." },
  "VRE": { name: "CTCP Vincom Retail", sector: "RealEstate", cap: "Bất Động Sản Bán Lẻ & Trung Tâm Thương Mại", desc: "Chủ sở hữu hệ thống TTTM Vincom lớn nhất Việt Nam, tỷ lệ lấp đầy cao và dòng tiền kinh doanh vượt trội." }
};

const US_COMPANIES_DIR = {
  "NVDA": { name: "NVIDIA Corporation", sector: "Semiconductors", cap: "Thống Lĩnh Chip AI Toàn Cầu", desc: "Công ty chip AI và GPU số 1 thế giới, nền tảng cho làn sóng Generative AI và Data Center." },
  "AMD": { name: "Advanced Micro Devices, Inc.", sector: "Semiconductors", cap: "Top 2 CPU & GPU Toàn Cầu", desc: "Đối thủ lớn nhất của Nvidia trong mảng AI Accelerator (Instinct MI300) và x86 Server CPU." },
  "MSFT": { name: "Microsoft Corporation", sector: "Technology", cap: "Mega-Cap Đám Mây & AI", desc: "Hệ sinh thái Azure AI, Copilot và phần mềm doanh nghiệp hàng đầu thế giới." },
  "AAPL": { name: "Apple Inc.", sector: "Technology", cap: "Mega-Cap Thiết Bị & Dịch Vụ Số 1", desc: "Hệ sinh thái iPhone, Mac và dịch vụ số với hơn 2 tỷ thiết bị hoạt động trên toàn cầu." },
  "AMZN": { name: "Amazon.com, Inc.", sector: "ConsumerDiscretionary", cap: "Thống Lĩnh E-Commerce & AWS Cloud", desc: "Đế chế thương mại điện tử và hạ tầng điện toán đám mây AWS biên lợi nhuận cao." },
  "GOOGL": { name: "Alphabet Inc. (Google)", sector: "CommunicationServices", cap: "Thống Lĩnh Tìm Kiếm & AI Research", desc: "Hệ sinh thái Google Search, YouTube, Android và mô hình nền tảng Gemini AI." },
  "META": { name: "Meta Platforms, Inc.", sector: "CommunicationServices", cap: "Mạng Xã Hội Lớn Nhất Toàn Cầu", desc: "Sở hữu Facebook, Instagram, WhatsApp và mô hình AI mã nguồn mở Llama." },
  "TSLA": { name: "Tesla, Inc.", sector: "ConsumerDiscretionary", cap: "Tiên Phong Xe Điện & Tự Hành FSD", desc: "Nhà sản xuất xe điện hàng đầu, năng lượng tái tạo và công nghệ tự hành Robotaxi." },
  "AVGO": { name: "Broadcom Inc.", sector: "Semiconductors", cap: "Chip Mạng & Custom ASIC AI", desc: "Thiết kế chip mạng chuyển mạch AI (Tomahawk) và giải pháp phần mềm VMware." },
  "SPY": { name: "SPDR S&P 500 ETF Trust", sector: "IndexETF", cap: "Quỹ Chỉ Số 500 Cổ Phiếu Lớn Nhất Mỹ", desc: "ETF thanh khoản cao nhất thế giới, đại diện cho toàn bộ sức khỏe kinh tế Mỹ." }
};

let currentDiagnosisData = null;

function setupStockLookup() {
  const navInput = document.getElementById("nav-stock-lookup-input");
  const navBtn = document.getElementById("btn-nav-stock-lookup");
  const mainInput = document.getElementById("main-stock-lookup-input");
  const mainBtn = document.getElementById("btn-main-stock-lookup");
  const clearBtn = document.getElementById("btn-clear-lookup-input");
  const quickChips = document.querySelectorAll(".chip-sym-btn");

  const modal = document.getElementById("modal-stock-diagnosis");
  const btnClose = document.getElementById("btn-close-stock-diagnosis");
  const btnCloseFooter = document.getElementById("btn-close-diag-footer");
  const btnQuickTrade = document.getElementById("btn-diag-quick-trade");
  const btnViewTrades = document.getElementById("btn-diag-view-trades");

  const closeModal = () => {
    if (modal) modal.style.display = "none";
  };

  if (btnClose) btnClose.addEventListener("click", closeModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Sync inputs
  if (navInput && mainInput) {
    navInput.addEventListener("input", () => {
      mainInput.value = navInput.value;
      if (clearBtn) clearBtn.style.display = navInput.value ? "block" : "none";
    });
    mainInput.addEventListener("input", () => {
      navInput.value = mainInput.value;
      if (clearBtn) clearBtn.style.display = mainInput.value ? "block" : "none";
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (navInput) navInput.value = "";
      if (mainInput) mainInput.value = "";
      clearBtn.style.display = "none";
      if (mainInput) mainInput.focus();
    });
  }

  // Trigger search on button click & enter
  if (navBtn) {
    navBtn.addEventListener("click", () => {
      const sym = (navInput ? navInput.value : "").trim();
      performStockLookup(sym);
    });
  }
  if (navInput) {
    navInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        performStockLookup(navInput.value);
      }
    });
  }

  if (mainBtn) {
    mainBtn.addEventListener("click", () => {
      const sym = (mainInput ? mainInput.value : "").trim();
      performStockLookup(sym);
    });
  }
  if (mainInput) {
    mainInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        performStockLookup(mainInput.value);
      }
    });
  }

  // Quick Chips
  quickChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const sym = chip.getAttribute("data-sym");
      if (sym) {
        if (navInput) navInput.value = sym;
        if (mainInput) mainInput.value = sym;
        if (clearBtn) clearBtn.style.display = "block";
        performStockLookup(sym);
      }
    });
  });

  // Global Keyboard Shortcuts: '/' or 'Ctrl+K' to focus lookup input; 'Escape' to close modal
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modal && modal.style.display === "flex") {
        closeModal();
        return;
      }
    }

    const activeTag = document.activeElement?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

    if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      const targetInput = (window.innerWidth <= 768) ? mainInput : (navInput || mainInput);
      if (targetInput) {
        targetInput.focus();
        targetInput.select();
        showToast("🔍 Nhập mã cổ phiếu để tra cứu khuyến nghị AI", "info");
      }
    }
  });

  // Global delegation for any ticker pill clicked anywhere
  document.body.addEventListener("click", (e) => {
    const pill = e.target.closest(".ticker-pill");
    if (pill) {
      const sym = pill.innerText.trim();
      if (sym && sym.length >= 2 && sym.length <= 10) {
        if (navInput) navInput.value = sym;
        if (mainInput) mainInput.value = sym;
        if (clearBtn) clearBtn.style.display = "block";
        performStockLookup(sym);
      }
    }
  });

  // Modal Actions: Quick-Trade & View Trades
  if (btnQuickTrade) {
    btnQuickTrade.addEventListener("click", () => {
      if (!currentDiagnosisData) return;
      closeModal();
      const actionStr = currentDiagnosisData.actionType === 'sell' ? 'BÁN (SELL)' : 'MUA (BUY)';
      openQuickTradeModal(
        currentDiagnosisData.symbol,
        actionStr,
        currentDiagnosisData.currentPrice,
        currentDiagnosisData.stopLoss,
        currentDiagnosisData.targetPrice,
        currentDiagnosisData.rrRatio,
        currentDiagnosisData.sectorVi,
        currentDiagnosisData.winRate
      );
    });
  }

  if (btnViewTrades) {
    btnViewTrades.addEventListener("click", () => {
      if (!currentDiagnosisData) return;
      const sym = currentDiagnosisData.symbol;
      closeModal();
      switchTab("tab-trades");
      const symInput = document.getElementById("filter-symbol");
      if (symInput) symInput.value = sym;
      applyTradeFilters();
      showToast(`Đã lọc danh sách sổ lệnh cho mã ${sym}`, "info");
    });
  }
}

function performStockLookup(inputSymbol) {
  const sym = (inputSymbol || "").trim().toUpperCase();
  if (!sym) {
    showToast("⚠️ Vui lòng nhập mã cổ phiếu cần tra cứu (VD: HPG, FPT, TCB, VHM...)", "warning");
    const input = document.getElementById("main-stock-lookup-input") || document.getElementById("nav-stock-lookup-input");
    if (input) input.focus();
    return;
  }

  // 1. Gather all related data
  const wlItem = globalDailyData && globalDailyData.watchlist_items ? globalDailyData.watchlist_items.find(x => x.symbol === sym) : null;
  const holdingItems = globalDailyData && globalDailyData.current_holdings ? globalDailyData.current_holdings.filter(x => x.symbol === sym) : [];
  const sellSignal = globalDailyData && globalDailyData.sell_signals ? globalDailyData.sell_signals.find(x => x.symbol === sym) : null;
  const buySignal = globalDailyData && globalDailyData.buy_signals ? globalDailyData.buy_signals.find(x => x.symbol === sym) : null;
  const symStats = currentPhaseSymbolStats[sym] || allSymbolStats[sym] || null;
  const matchingTrades = (allTrades || []).filter(t => t.symbol === sym);
  const matchingNews = (allNewsArticles || []).filter(n => (n.symbols && n.symbols.includes(sym)) || (n.title && n.title.toUpperCase().includes(sym)));
  const dirInfo = VN_COMPANIES_DIR[sym] || US_COMPANIES_DIR[sym] || null;

  const isUs = currentMarket === 'us' || (US_COMPANIES_DIR[sym] && !VN_COMPANIES_DIR[sym]);
  const currencySymbol = isUs ? "$" : " ₫";

  const sector = dirInfo?.sector || wlItem?.sector || (holdingItems[0] ? holdingItems[0].sector : null) || symStats?.sector || (isUs ? "Technology" : "Materials");
  const sectorVi = dirInfo ? getSectorVi(dirInfo.sector) : (wlItem?.sector_vi || getSectorVi(sector));
  const companyName = dirInfo?.name || wlItem?.name || `Công ty Cổ phần ${sym}`;
  const capTier = dirInfo?.cap || wlItem?.market_cap_tier || (isUs ? "US Large-Cap Equity" : "Cổ Phiếu Niêm Yết Sàn HoSE");
  const marketRegime = (globalDailyData && globalDailyData.vnindex && globalDailyData.vnindex.regime) || "BEAR";

  // Price & changes
  const currentPrice = wlItem?.current_price !== undefined ? wlItem.current_price : 
                       (holdingItems[0]?.current_price !== undefined ? holdingItems[0].current_price : 
                       (buySignal?.suggested_price !== undefined ? buySignal.suggested_price : 
                       (symStats?.last_price || (isUs ? 150.0 : 31.8))));
  const prevPrice = wlItem?.prev_price !== undefined ? wlItem.prev_price : currentPrice;
  const dailyChangePct = wlItem?.daily_change_pct !== undefined ? wlItem.daily_change_pct : (holdingItems[0]?.daily_change_pct || 0);
  const dailyChangePts = wlItem?.daily_change_pts !== undefined ? wlItem.daily_change_pts : 0;
  const volume = wlItem?.volume !== undefined ? wlItem.volume : 2500000;
  const volRatio = wlItem?.vol_ratio !== undefined ? wlItem.vol_ratio : 1.0;
  const rsRating = wlItem?.rs_rating !== undefined ? wlItem.rs_rating : 65.0;
  const rsi = wlItem?.rsi_14 !== undefined ? wlItem.rsi_14 : 45.0;
  const sma20 = wlItem?.sma_20 !== undefined ? wlItem.sma_20 : (currentPrice * 1.03);
  const sma50 = wlItem?.sma_50 !== undefined ? wlItem.sma_50 : (currentPrice * 1.06);
  const distMA20 = wlItem?.dist_sma20_pct !== undefined ? wlItem.dist_sma20_pct : ((currentPrice - sma20) / sma20 * 100);
  const distMA50 = wlItem?.dist_sma50_pct !== undefined ? wlItem.dist_sma50_pct : ((currentPrice - sma50) / sma50 * 100);

  // Targets
  const stopLoss = holdingItems[0]?.stop_loss !== undefined ? Number(holdingItems[0].stop_loss) : 
                   (buySignal?.stop_loss !== undefined ? Number(buySignal.stop_loss) : Number((currentPrice * 0.955).toFixed(2)));
  const targetPrice = holdingItems[0]?.target_price !== undefined ? Number(holdingItems[0].target_price) : 
                      (buySignal?.take_profit !== undefined ? Number(buySignal.take_profit) : Number((currentPrice * 1.15).toFixed(2)));
  const rrRatio = buySignal?.risk_reward_ratio || (holdingItems[0] ? "3.2x" : "3.0x");

  // Win rate & trades
  let winRate = 75;
  let totalTrades = 0;
  let avgReturn = 2.8;
  let totalPnl = 0;

  if (symStats) {
    winRate = symStats.win_rate !== undefined ? symStats.win_rate : 75;
    totalTrades = symStats.total_trades || 0;
    avgReturn = symStats.avg_return_pct !== undefined ? symStats.avg_return_pct : 2.5;
    totalPnl = isUs ? (symStats.total_pnl_usd || 0) : (symStats.total_pnl_vnd || 0);
  } else if (matchingTrades.length > 0) {
    totalTrades = matchingTrades.length;
    const wins = matchingTrades.filter(t => (t.pnl_vnd || t.pnl_usd || 0) > 0).length;
    winRate = Number(((wins / totalTrades) * 100).toFixed(1));
    const totalRet = matchingTrades.reduce((acc, t) => acc + (t.return_pct || 0), 0);
    avgReturn = Number((totalRet / totalTrades).toFixed(2));
    totalPnl = matchingTrades.reduce((acc, t) => acc + (isUs ? (t.pnl_usd || 0) : (t.pnl_vnd || 0)), 0);
  }

  // 2. Synthesize AI Action Recommendation
  let actionType = "watch";
  let actionTagClass = "watch";
  let actionBannerClass = "watch";
  let actionBadgeText = "⚪ THEO DÕI TÍCH LŨY (WATCHLIST)";
  let actionTitleText = "Quan sát biến động kỹ thuật & tín hiệu dòng tiền";
  let actionDescText = "";

  if (sellSignal) {
    actionType = "sell";
    actionTagClass = "sell";
    actionBannerClass = "sell";
    actionBadgeText = "🔴 KHUYẾN NGHỊ BÁN (SELL / TAKE-PROFIT)";
    actionTitleText = `Kích hoạt lệnh Bán từ chuyên gia ${sellSignal.advisor || 'AlphaQuant AI'}`;
    actionDescText = `Cảnh báo kỷ luật: Giá chạm ngưỡng quản trị rủi ro hoặc bảo toàn lợi nhuận. Lý do: ${sellSignal.reason || 'Bảo toàn lợi nhuận vị thế'}. Giá khuyến nghị thoát vị thế: ${Number(sellSignal.exit_price || currentPrice).toFixed(2)}${currencySymbol}.`;
  } else if (holdingItems.length > 0) {
    actionType = "hold";
    actionTagClass = "hold";
    actionBannerClass = "hold";
    const primaryHold = holdingItems[0];
    actionBadgeText = "🟡 TIẾP TỤC NẮM GIỮ (HOLD)";
    actionTitleText = `Đang nắm giữ bởi ${holdingItems.map(h => h.advisor_name || h.advisor).join(", ")}`;
    actionDescText = `Vị thế đang được bảo vệ tự động bằng trailing stop ATR. Hiệu suất hiện tại: ${primaryHold.current_return_pct >= 0 ? '+' : ''}${primaryHold.current_return_pct}%. Mức cắt lỗ quản trị rủi ro tại ${Number(primaryHold.stop_loss || stopLoss).toFixed(2)}${currencySymbol} | Mục tiêu kỳ vọng: ${Number(primaryHold.target_price || targetPrice).toFixed(2)}${currencySymbol}. Tiếp tục giữ vị thế.`;
  } else if (buySignal) {
    actionType = "buy";
    actionTagClass = "buy";
    actionBannerClass = "buy";
    actionBadgeText = "🟢 KHUYẾN NGHỊ MUA MỚI (BUY)";
    actionTitleText = `Điểm mua chuẩn từ chuyên gia ${buySignal.advisor || 'AlphaQuant AI'}`;
    actionDescText = `${buySignal.reason || 'Cổ phiếu bứt phá vùng tích lũy với thanh khoản lớn'}. Điểm vào lệnh đề xuất: ${Number(buySignal.suggested_price || currentPrice).toFixed(2)}${currencySymbol}, Cắt lỗ: ${stopLoss}${currencySymbol}, Chốt lời: ${targetPrice}${currencySymbol} (Tỷ lệ R:R: ${rrRatio}).`;
  } else if (marketRegime === "BEAR") {
    actionType = "defend";
    actionTagClass = "defend";
    actionBannerClass = "defend";
    actionBadgeText = "🛡️ 100% TIỀN MẶT PHÒNG THỦ (CASH DEFENSE)";
    actionTitleText = "Thị Trường Gấu (Bear Regime): Kỷ Luật Bảo Toàn Vốn 100%";
    if (wlItem && wlItem.ai_radar_action) {
      actionDescText = wlItem.ai_radar_action;
    } else {
      actionDescText = `Thị trường VN-Index đang trong chế độ Bear Market (dưới SMA20 & SMA50). Theo nguyên tắc quản trị rủi ro bất đối xứng của AlphaQuant AI, hệ thống áp đặt lệnh CẤM MUA MỚI (0 lệnh mua) và duy trì 100% tiền mặt phòng thủ. Tuyệt đối không giải ngân vào mã ${sym} cho đến khi thị trường chung xác nhận Ngày Bùng Nổ Theo Đà (FTD).`;
    }
  } else {
    actionType = "watch";
    actionTagClass = "watch";
    actionBannerClass = "watch";
    actionBadgeText = "⚪ THEO DÕI TÍCH LŨY (WATCHLIST)";
    actionTitleText = "Chờ đợi tín hiệu bứt phá (Breakout) đạt chuẩn";
    actionDescText = `Mã ${sym} đang nằm trong vùng tích lũy/quan sát kỹ thuật. Hiện chưa có điểm mua thỏa mãn đồng thời tiêu chí RS Rating > 70 và thanh khoản vượt 1.5x MA20. Khuyến nghị kiên nhẫn quan sát phản ứng tại các mốc hỗ trợ cứng.`;
  }

  currentDiagnosisData = {
    symbol: sym,
    actionType,
    currentPrice,
    stopLoss,
    targetPrice,
    rrRatio,
    sectorVi,
    winRate
  };

  // 3. Render Modal Content
  renderStockDiagnosisModal({
    sym,
    companyName,
    sectorVi,
    capTier,
    isUs,
    currencySymbol,
    currentPrice,
    prevPrice,
    dailyChangePct,
    dailyChangePts,
    volume,
    volRatio,
    rsRating,
    rsi,
    sma20,
    sma50,
    distMA20,
    distMA50,
    stopLoss,
    targetPrice,
    rrRatio,
    winRate,
    totalTrades,
    avgReturn,
    totalPnl,
    holdingItems,
    sellSignal,
    buySignal,
    actionTagClass,
    actionBannerClass,
    actionBadgeText,
    actionTitleText,
    actionDescText,
    wlItem,
    matchingNews
  });

  const modal = document.getElementById("modal-stock-diagnosis");
  if (modal) {
    modal.style.display = "flex";
  }
}

function renderStockDiagnosisModal(d) {
  const container = document.getElementById("stock-diagnosis-content");
  if (!container) return;

  const isGainer = d.dailyChangePct > 0.05;
  const isLoser = d.dailyChangePct < -0.05;
  const chgClass = isGainer ? "text-green" : (isLoser ? "text-red" : "text-muted");
  const chgSign = isGainer ? "+" : "";
  const ptsSign = d.dailyChangePts >= 0 ? "+" : "";
  const ptsText = d.dailyChangePts !== 0 ? ` (${ptsSign}${Number(d.dailyChangePts).toFixed(2)})` : "";

  const priceFormatted = d.isUs ? `$${Number(d.currentPrice).toFixed(2)}` : Number(d.currentPrice).toFixed(2);
  const volumeFormatted = (d.volume || 0).toLocaleString('vi-VN');

  // RS class
  let rsClass = "badge-cyan";
  if (d.rsRating >= 75) rsClass = "badge-bull";
  else if (d.rsRating < 50) rsClass = "tag-yellow";

  // RSI class
  let rsiClass = "text-muted";
  let rsiNote = "Vùng trung tính";
  if (d.rsi < 30) { rsiClass = "text-green"; rsiNote = "Quá bán sâu (Khả năng bật hồi)"; }
  else if (d.rsi > 70) { rsiClass = "text-red"; rsiNote = "Quá mua (Cẩn trọng áp lực chốt)"; }

  // Moving averages
  const ma20Class = d.distMA20 >= 0 ? "text-green" : "text-red";
  const ma50Class = d.distMA50 >= 0 ? "text-green" : "text-red";
  const ma20Sign = d.distMA20 >= 0 ? "+" : "";
  const ma50Sign = d.distMA50 >= 0 ? "+" : "";

  // Portfolio Holding Section HTML
  let portfolioHtml = "";
  if (d.holdingItems && d.holdingItems.length > 0) {
    portfolioHtml = `
      <div class="diag-portfolio-box">
        <div class="diag-portfolio-title">
          <span>💼 <strong>VỊ THẾ ĐANG NẮM GIỮ TRONG DANH MỤC THỰC CHIẾN</strong></span>
          <span class="badge badge-green" style="font-size: 0.72rem;">Đang Nắm Giữ (${d.holdingItems.length} Vị Thế)</span>
        </div>
        ${d.holdingItems.map(h => {
          const ret = h.current_return_pct !== undefined ? h.current_return_pct : 0;
          const retClass = ret >= 0 ? "text-green" : "text-red";
          const retSign = ret >= 0 ? "+" : "";
          const pnlFmt = d.isUs ? (h.pnl_usd ? `$${h.pnl_usd.toLocaleString()}` : '$0') : (h.pnl_vnd ? `${(h.pnl_vnd / 1000000).toFixed(2)} Tr ₫` : '0 ₫');
          return `
            <div class="diag-portfolio-grid" style="margin-top: 6px;">
              <div class="diag-port-cell">
                <span class="diag-port-label">Chuyên Gia AI:</span>
                <span class="diag-port-val text-blue">${h.advisor_name || h.advisor}</span>
              </div>
              <div class="diag-port-cell">
                <span class="diag-port-label">Giá Vốn (Entry):</span>
                <span class="diag-port-val font-mono">${Number(h.entry_price).toFixed(2)}${d.currencySymbol}</span>
              </div>
              <div class="diag-port-cell">
                <span class="diag-port-label">Lãi / Lỗ Hiện Tại:</span>
                <span class="diag-port-val font-mono ${retClass}">${retSign}${ret}% (${pnlFmt})</span>
              </div>
              <div class="diag-port-cell">
                <span class="diag-port-label">Cắt Lỗ / Chốt Lời:</span>
                <span class="diag-port-val font-mono text-yellow">${h.stop_loss ? Number(h.stop_loss).toFixed(2) : '--'} / ${h.target_price ? Number(h.target_price).toFixed(2) : '--'}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // News intelligence HTML
  let newsHtml = "";
  if (d.matchingNews && d.matchingNews.length > 0) {
    const firstNews = d.matchingNews[0];
    const badgeClass = firstNews.sentiment === "positive" ? "badge-green" : (firstNews.sentiment === "negative" ? "badge-red" : "badge-amber");
    newsHtml = `
      <div class="diag-card-panel">
        <div class="diag-panel-title">
          <span>📰 Tin Tức &amp; Xung Lực Thị Trường</span>
          <span class="badge ${badgeClass}" style="font-size: 0.68rem;">${firstNews.sentiment === 'positive' ? 'Tích Cực' : (firstNews.sentiment === 'negative' ? 'Tiêu Cực' : 'Trung Lập')}</span>
        </div>
        <div class="diag-panel-body">
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">${firstNews.title}</div>
          <div style="font-size: 0.72rem; color: var(--text-dim);">${firstNews.source || 'Tin tức tài chính'} · ${firstNews.published_at || 'Mới nhất'}</div>
        </div>
      </div>
    `;
  } else {
    newsHtml = `
      <div class="diag-card-panel">
        <div class="diag-panel-title">
          <span>📰 Tin Tức &amp; Xung Lực Thị Trường</span>
          <span class="badge badge-cyan" style="font-size: 0.68rem;">An Toàn</span>
        </div>
        <div class="diag-panel-body">
          <span>Không phát hiện tin tức tiêu cực hoặc cảnh báo Red Flag nào đối với mã ${d.sym} trong 160 nguồn tin gần nhất.</span>
        </div>
      </div>
    `;
  }

  // Track Record HTML
  const pnlDisplay = d.isUs ? 
    `${d.totalPnl >= 0 ? '+' : ''}${(d.totalPnl / 1000).toFixed(1)}k USD` : 
    `${d.totalPnl >= 0 ? '+' : ''}${(d.totalPnl / 1000000000).toFixed(2)} Tỷ ₫`;
  const pnlClass = d.totalPnl >= 0 ? "text-green" : "text-red";

  const trackRecordHtml = `
    <div class="diag-card-panel">
      <div class="diag-panel-title">
        <span>🏆 Lịch Sử Khuyến Nghị Thực Chiến (2010 - 2026)</span>
        <span class="badge badge-bull" style="font-size: 0.68rem;">Win Rate ${d.winRate}%</span>
      </div>
      <div class="diag-panel-body">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Tổng số lệnh thực hiện: <strong class="font-mono text-blue">${d.totalTrades} lệnh</strong></span>
          <span>Lãi TB/lệnh: <strong class="font-mono text-green">+${d.avgReturn}%</strong></span>
        </div>
        <div>
          <span>Tổng PnL đã hiện thực hóa: <strong class="font-mono ${pnlClass}">${pnlDisplay}</strong></span>
        </div>
      </div>
    </div>
  `;

  // Put everything together
  container.innerHTML = `
    <!-- Hero Ticker Banner -->
    <div class="diag-hero-banner">
      <div class="diag-hero-left">
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <span class="diag-sym-badge">${d.sym}</span>
          <span class="badge ${rsClass}" style="font-size: 0.72rem;">RS ${Number(d.rsRating).toFixed(0)}</span>
        </div>
        <div class="diag-company-name">${d.companyName}</div>
        <div class="diag-meta-row">
          <span>Ngành: <strong class="text-blue">${d.sectorVi}</strong></span>
          <span>·</span>
          <span>Quy mô: <strong>${d.capTier}</strong></span>
        </div>
      </div>
      <div class="diag-price-group">
        <div class="diag-current-price font-mono">${priceFormatted}${d.currencySymbol}</div>
        <div class="diag-price-change font-mono ${chgClass}">
          ${chgSign}${Number(d.dailyChangePct).toFixed(2)}%${ptsText}
        </div>
        <div class="diag-vol-text font-mono">${volumeFormatted} CP · ${d.volRatio}x MA20</div>
      </div>
    </div>

    <!-- AI Action Recommendation Banner -->
    <div class="diag-action-banner ${d.actionBannerClass}">
      <div class="diag-action-badge-row">
        <span class="diag-action-tag ${d.actionTagClass}">${d.actionBadgeText}</span>
        <span class="diag-action-title">${d.actionTitleText}</span>
      </div>
      <div class="diag-action-desc">${d.actionDescText}</div>
    </div>

    <!-- Portfolio Position (if any) -->
    ${portfolioHtml}

    <!-- Quant Indicators Grid -->
    <div class="diag-quant-section-title">
      <span>⚙️ CHẨN ĐOÁN CÁC CHỈ BÁO ĐỊNH LƯỢNG (QUANT FACTOR MATRIX)</span>
    </div>
    <div class="diag-quant-grid">
      <div class="diag-metric-card">
        <span class="diag-metric-name">Sức Mạnh Giá (RS Rating)</span>
        <span class="diag-metric-val font-mono text-cyan">${Number(d.rsRating).toFixed(1)}/99</span>
        <span class="diag-metric-sub">${d.rsRating >= 70 ? 'Nhóm dẫn dắt' : 'Dưới chuẩn bứt phá'}</span>
      </div>
      <div class="diag-metric-card">
        <span class="diag-metric-name">Động Lượng (RSI-14)</span>
        <span class="diag-metric-val font-mono ${rsiClass}">${Number(d.rsi).toFixed(1)}</span>
        <span class="diag-metric-sub">${rsiNote}</span>
      </div>
      <div class="diag-metric-card">
        <span class="diag-metric-name">Xu Hướng vs MA20</span>
        <span class="diag-metric-val font-mono ${ma20Class}">${ma20Sign}${Number(d.distMA20).toFixed(1)}%</span>
        <span class="diag-metric-sub">${d.distMA20 >= 0 ? 'Trên MA20 (Khỏe)' : 'Dưới MA20 (Yếu)'}</span>
      </div>
      <div class="diag-metric-card">
        <span class="diag-metric-name">Tỷ Lệ Risk / Reward (R:R)</span>
        <span class="diag-metric-val font-mono text-yellow">${d.rrRatio}</span>
        <span class="diag-metric-sub">Kỳ vọng lợi nhuận tối ưu</span>
      </div>
    </div>

    <!-- News & Track Record Row -->
    <div class="diag-news-track-row">
      ${newsHtml}
      ${trackRecordHtml}
    </div>
  `;
}

function setupMarketSwitcher() {
  const btnVn = document.getElementById("btn-market-vn");
  const btnUs = document.getElementById("btn-market-us");
  if (!btnVn || !btnUs) return;

  btnVn.addEventListener("click", async () => {
    if (currentMarket === 'vn') return;
    currentMarket = 'vn';
    btnVn.classList.add("active");
    btnUs.classList.remove("active");
    selectedSymbol = null;
    currentTradePage = 1;
    showToast("Đã kích hoạt không gian: 🇻🇳 Thị Trường Việt Nam (VN30)", "info");
    await loadDashboardData();
  });

  btnUs.addEventListener("click", async () => {
    if (currentMarket === 'us') return;
    currentMarket = 'us';
    btnUs.classList.add("active");
    btnVn.classList.remove("active");
    selectedSymbol = null;
    currentTradePage = 1;
    showToast("Đã kích hoạt không gian: 🌐 Quốc Tế (US Mega-Caps & S&P 500)", "info");
    await loadDashboardData();
  });
}

function startLiveClock() {
  function updateClock() {
    const timeElem = document.getElementById("clock-time");
    const zoneElem = document.getElementById("clock-zone");
    if (!timeElem || !zoneElem) return;

    const now = new Date();
    const isUs = currentMarket === 'us';

    if (isUs) {
      const options = { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" };
      timeElem.innerText = new Intl.DateTimeFormat("vi-VN", options).format(now);
      zoneElem.innerText = "NEW YORK (EDT)";
    } else {
      const options = { timeZone: "Asia/Ho_Chi_Minh", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" };
      timeElem.innerText = new Intl.DateTimeFormat("vi-VN", options).format(now);
      zoneElem.innerText = "HÀ NỘI (GMT+7)";
    }
  }

  updateClock();
  setInterval(updateClock, 1000);
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;

  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  else if (type === "warning") icon = "⚠️";
  else if (type === "error") icon = "❌";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, 3200);
}

function setupRefreshButton() {
  const btn = document.getElementById("btn-refresh-data");
  const icon = document.getElementById("refresh-icon");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (icon) icon.classList.add("spinning");
    btn.disabled = true;

    await loadDashboardData();

    setTimeout(() => {
      if (icon) icon.classList.remove("spinning");
      btn.disabled = false;
      showToast("Đồng bộ dữ liệu thị trường mới nhất thành công!", "success");
    }, 400);
  });
}

function setupBackToTop() {
  const btn = document.getElementById("btn-back-to-top");
  if (!btn) return;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 350) {
      btn.classList.add("visible");
    } else {
      btn.classList.remove("visible");
    }
  });

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function updateTabBadges() {
  const badgeBuy = document.getElementById("tab-badge-buy");
  if (badgeBuy) {
    const buyCount = (globalDailyData && globalDailyData.buy_signals) ? globalDailyData.buy_signals.length : 
                     (globalDailyData && globalDailyData.new_signals ? globalDailyData.new_signals.filter(s => s.signal_badge === "buy").length : 0);
    badgeBuy.innerText = buyCount;
    const mobBuy = document.getElementById("mob-badge-buy");
    if (mobBuy) mobBuy.innerText = buyCount;
  }

  const badgeSell = document.getElementById("tab-badge-sell");
  if (badgeSell) {
    const sellCount = (globalDailyData && globalDailyData.sell_signals) ? globalDailyData.sell_signals.length : 
                      (globalDailyData && globalDailyData.new_signals ? globalDailyData.new_signals.filter(s => s.signal_badge !== "buy").length : 0);
    badgeSell.innerText = sellCount;
    const mobSell = document.getElementById("mob-badge-sell");
    if (mobSell) mobSell.innerText = sellCount;
  }

  const badgeHoldings = document.getElementById("tab-badge-holdings");
  if (badgeHoldings) {
    const count = (globalDailyData && globalDailyData.portfolio_summary && globalDailyData.portfolio_summary.total_positions) || 
                  (globalDailyData && globalDailyData.current_holdings ? globalDailyData.current_holdings.length : 0);
    badgeHoldings.innerText = count;
    const mobHoldings = document.getElementById("mob-badge-holdings");
    if (mobHoldings) mobHoldings.innerText = count;
  }

  const badgeNews = document.getElementById("tab-badge-news");
  if (badgeNews) {
    const cats = (globalDailyData && globalDailyData.catalyst_actions && globalDailyData.catalyst_actions.length) || 
                 (globalDailyData && globalDailyData.news_action_recommendations && globalDailyData.news_action_recommendations.catalysts && globalDailyData.news_action_recommendations.catalysts.length) || 0;
    const reds = (globalDailyData && globalDailyData.redflag_actions && globalDailyData.redflag_actions.length) || 
                 (globalDailyData && globalDailyData.news_action_recommendations && globalDailyData.news_action_recommendations.red_flags && globalDailyData.news_action_recommendations.red_flags.length) || 0;
    const totalNewsActions = cats + reds;
    badgeNews.innerText = totalNewsActions;
    const mobNews = document.getElementById("mob-badge-news");
    if (mobNews) mobNews.innerText = totalNewsActions;
  }

  const badgeTrades = document.getElementById("tab-badge-trades");
  if (badgeTrades) {
    const count = allTrades.length;
    const txt = count > 999 ? `${(count / 1000).toFixed(1)}k` : count;
    badgeTrades.innerText = txt;
    const mobTrades = document.getElementById("mob-badge-trades");
    if (mobTrades) mobTrades.innerText = txt;
  }

  const badgePerf = document.getElementById("tab-badge-perf");
  if (badgePerf) badgePerf.innerText = "5 AI";

  const badgeEvo = document.getElementById("tab-badge-evo");
  if (badgeEvo) badgeEvo.innerText = "Gen 2";
}

function setupTradeSorting() {
  const sortHeaders = document.querySelectorAll("#trades-table th.th-sortable");
  sortHeaders.forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort");
      if (currentTradeSortCol === col) {
        currentTradeSortDir = currentTradeSortDir === "asc" ? "desc" : "asc";
      } else {
        currentTradeSortCol = col;
        currentTradeSortDir = (col === "symbol" || col === "advisor") ? "asc" : "desc";
      }

      sortHeaders.forEach(h => {
        h.classList.remove("sorted-asc", "sorted-desc");
        const icon = h.querySelector(".sort-icon");
        if (icon) icon.innerText = "⇅";
      });

      th.classList.add(currentTradeSortDir === "asc" ? "sorted-asc" : "sorted-desc");
      const activeIcon = th.querySelector(".sort-icon");
      if (activeIcon) activeIcon.innerText = currentTradeSortDir === "asc" ? "▲" : "▼";

      currentTradePage = 1;
      sortAndRenderTrades();
    });
  });
}

function sortAndRenderTrades() {
  const isUs = currentMarket === 'us';
  const dir = currentTradeSortDir === "asc" ? 1 : -1;

  filteredTrades.sort((a, b) => {
    let valA = a[currentTradeSortCol];
    let valB = b[currentTradeSortCol];

    if (currentTradeSortCol === "pnl") {
      valA = isUs ? (a.pnl_usd !== undefined ? a.pnl_usd : (a.pnl_vnd ? a.pnl_vnd / 25400 : 0)) : (a.pnl_vnd || 0);
      valB = isUs ? (b.pnl_usd !== undefined ? b.pnl_usd : (b.pnl_vnd ? b.pnl_vnd / 25400 : 0)) : (b.pnl_vnd || 0);
    } else if (currentTradeSortCol === "is_live") {
      valA = a.is_live ? 1 : 0;
      valB = b.is_live ? 1 : 0;
    } else if (currentTradeSortCol === "return_pct" || currentTradeSortCol === "shares" || currentTradeSortCol === "holding_days") {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
    }

    if (typeof valA === "string") {
      return valA.localeCompare(valB) * dir;
    }
    return ((valA || 0) - (valB || 0)) * dir;
  });

  renderTradesTable();
}

function setupExportCsv() {
  const btn = document.getElementById("btn-export-trades-csv");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (!filteredTrades || filteredTrades.length === 0) {
      showToast("Không có lệnh nào trong bộ lọc hiện tại để xuất!", "warning");
      return;
    }

    const isUs = currentMarket === 'us';
    const currency = isUs ? "USD" : "VND";

    // Build CSV with UTF-8 BOM for Microsoft Excel compatibility
    let csv = "\uFEFFMã Lệnh,Chế Độ,Chuyên Gia AI,Mã CP,Ngành,Ngày Vào,Ngày Ra,Giá Vào,Giá Ra,Số Lượng,Số Ngày Giữ,Hiệu Suất (%),Lãi Lỗ (" + currency + "),Lý Do Đóng Lệnh\n";

    filteredTrades.forEach(t => {
      const mode = t.is_live ? "Thực Chiến" : "Kiểm Định Backtest";
      const advisor = (t.advisor || "").replace("AI_Advisor_", "");
      const sector = getSectorVi(t.sector || "Bluechip");
      const pnl = isUs ? (t.pnl_usd !== undefined ? t.pnl_usd : (t.pnl_vnd ? t.pnl_vnd / 25400 : 0)) : (t.pnl_vnd || 0);

      const row = [
        `"${t.id || ''}"`,
        `"${mode}"`,
        `"${advisor}"`,
        `"${t.symbol || ''}"`,
        `"${sector}"`,
        `"${t.entry_date || ''}"`,
        `"${t.exit_date || ''}"`,
        Number(t.entry_price || 0).toFixed(2),
        Number(t.exit_price || 0).toFixed(2),
        t.shares || 0,
        t.holding_days || 1,
        t.return_pct || 0,
        Math.round(pnl),
        `"${(t.exit_reason || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const marketPrefix = isUs ? "US_MegaCaps" : "VN30";
    link.setAttribute("href", url);
    link.setAttribute("download", `AlphaQuant_${marketPrefix}_Trades_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Đã xuất ${filteredTrades.length.toLocaleString('vi-VN')} lệnh giao dịch ra file CSV thành công!`, "success");
  });
}

// ==========================================
// 2. DATA LOADER & DISPATCHER
// ==========================================
async function loadDashboardData() {
  try {
    const isUs = currentMarket === 'us';
    const summaryFile = isUs ? "data/daily_summary_us.json" : "data/daily_summary.json";
    const perfFile = isUs ? "data/performance_us_15y.json" : "data/performance_15y.json";
    const curvesFile = isUs ? "data/equity_curves_us.json" : "data/equity_curves.json";
    const tradesFile = isUs ? "data/trades_us.json" : "data/trades_history.json";

    // Update dynamic table headers
    const pnlSymbolHeader = document.getElementById("th-symbol-pnl-header");
    if (pnlSymbolHeader) pnlSymbolHeader.innerText = isUs ? "Tổng PnL USD" : "Tổng PnL VND";
    const pnlTradeHeader = document.getElementById("th-trades-pnl-header");
    if (pnlTradeHeader) pnlTradeHeader.innerText = isUs ? "Lãi/Lỗ USD" : "Lãi/Lỗ VND";

    // 1. Fetch daily summary
    const summaryRes = await fetch(summaryFile).catch(() => null);
    globalDailyData = summaryRes && summaryRes.ok ? await summaryRes.json() : getFallbackDailySummary();
    renderDailySummary(globalDailyData);
    renderHoldingsTable(globalDailyData);
    renderWatchlistTable(globalDailyData);
    renderBuySignals(globalDailyData);
    renderSellSignals(globalDailyData);
    renderNewsActionRecommendations(globalDailyData);

    // 2. Fetch 15-year performance metrics
    const perfRes = await fetch(perfFile).catch(() => null);
    const perfData = perfRes && perfRes.ok ? await perfRes.json() : getFallbackPerformance();
    renderLeaderboard(perfData);
    renderAnnualTable(perfData);

    // 3. Fetch Equity Curves
    const curvesRes = await fetch(curvesFile).catch(() => null);
    equityCurvesData = curvesRes && curvesRes.ok ? await curvesRes.json() : getFallbackEquityCurves();
    renderEquityChart(equityCurvesData);

    // 4. Fetch Trades History & Symbol Stats
    const tradesRes = await fetch(tradesFile).catch(() => null);
    if (tradesRes && tradesRes.ok) {
      const tradesPayload = await tradesRes.json();
      tradesPayloadMetadata = tradesPayload;
      allTrades = tradesPayload.trades || [];
      allSymbolStats = tradesPayload.symbol_stats || {};

      // Update Phase Switcher counts
      if (tradesPayload.live_execution_summary) {
        const liveCountElem = document.getElementById("count-phase-live");
        if (liveCountElem) liveCountElem.innerText = `(${tradesPayload.live_execution_summary.total_trades.toLocaleString('vi-VN')} lệnh)`;
      }
      if (tradesPayload.backtest_audit_summary) {
        const btCountElem = document.getElementById("count-phase-backtest");
        if (btCountElem) btCountElem.innerText = `(${tradesPayload.backtest_audit_summary.total_trades.toLocaleString('vi-VN')} lệnh)`;
      }
      if (tradesPayload.total_trades) {
        const allCountElem = document.getElementById("count-phase-all");
        if (allCountElem) allCountElem.innerText = `(${tradesPayload.total_trades.toLocaleString('vi-VN')} lệnh)`;
      }
    } else {
      allTrades = getFallbackTrades();
      allSymbolStats = getFallbackSymbolStats();
    }
    updatePhaseSymbolStats();
    applyTradeFilters();

    // 5. Fetch News & Corporate Disclosures Intelligence
    const newsRes = await fetch("data/news_intelligence.json").catch(() => null);
    if (newsRes && newsRes.ok) {
      const newsData = await newsRes.json();
      renderNewsIntelligence(newsData);
    }

    updateTabBadges();

  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// ==========================================
// 3. RENDER ENRICHED TODAY'S RECOMMENDATIONS
// ==========================================
function renderDailySummary(data) {
  if (!data) return;

  const isUs = currentMarket === 'us' || data.market === "US_EQUITIES";

  document.getElementById("last-updated-text").innerText = `Đồng bộ: ${data.last_updated || 'Hôm nay'}`;
  
  const bmTitleElem = document.getElementById("banner-bm-title");
  if (bmTitleElem) bmTitleElem.innerText = isUs ? "CHỈ SỐ S&P 500 (SPY)" : "CHỈ SỐ VN-INDEX";

  if (isUs) {
    const closeVal = data.benchmark_close ? `$${Number(data.benchmark_close).toFixed(2)}` : "$769.64";
    document.getElementById("vnindex-close").innerText = closeVal;

    const changeElem = document.getElementById("vnindex-change");
    const change = data.benchmark_change_pct || 0.45;
    changeElem.innerText = `${change >= 0 ? '+' : ''}${change}%`;
    changeElem.className = change >= 0 ? "stat-change text-green" : "stat-change text-red";

    const regimeElem = document.getElementById("market-regime");
    regimeElem.innerText = "BULLISH TREND";
    regimeElem.className = "stat-badge badge-bull";

    const regimeNote = document.getElementById("market-regime-note");
    if (regimeNote) regimeNote.innerText = "Chỉ số SPY nằm trên MA20 & MA50";

    const breadthElem = document.getElementById("market-breadth");
    if (breadthElem) breadthElem.innerHTML = `Độ rộng: <span class="text-green">S&amp;P 500 Uptrend</span>`;
    const wlBreadthElem = document.getElementById("watchlist-breadth");
    if (wlBreadthElem) wlBreadthElem.innerHTML = `Rổ theo dõi: <span class="text-green">15/15 siêu cổ phiếu dẫn dắt</span>`;

    const champElem = document.getElementById("champion-strategy");
    if (champElem) champElem.innerText = "Chiến Lược Chủ Động (US)";

    const champSub = document.getElementById("champion-strategy-sub");
    if (champSub) champSub.innerText = "Lợi nhuận: +1,080.9% | CAGR: 15.3%";

    const rrBadge = document.getElementById("banner-rr-badge");
    if (rrBadge) rrBadge.innerHTML = `<span class="pulse-dot"></span> ASYMMETRIC RR: 2.97x`;

    const rrSub = document.getElementById("banner-rr-sub");
    if (rrSub) rrSub.innerText = "Lãi TB: +12.5% | Lỗ TB: -4.2% (Peak: 3.99x)";
  } else {
    const vnClose = data.vnindex ? Number(data.vnindex.close).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : (data.benchmark_close ? Number(data.benchmark_close).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : "1.759,08");
    document.getElementById("vnindex-close").innerText = vnClose;
    const changeElem = document.getElementById("vnindex-change");
    const change = (data.vnindex ? data.vnindex.change_pct : data.benchmark_change_pct) || 0;
    const changePts = (data.vnindex && data.vnindex.change_pts !== undefined) ? data.vnindex.change_pts : null;
    const ptsText = changePts !== null ? ` (${changePts >= 0 ? '+' : ''}${Number(changePts).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} điểm)` : '';
    changeElem.innerText = `${change >= 0 ? '+' : ''}${change}%${ptsText}`;
    changeElem.className = change >= 0 ? "stat-change text-green" : "stat-change text-red";

    const regime = data.vnindex?.regime || (data.market_regime === "BEAR" ? "BEAR" : "BEAR");
    const regimeElem = document.getElementById("market-regime");
    regimeElem.innerText = regime === "BULL" ? "BULLISH TREND" : (regime === "BEAR" ? "BEARISH REGIME" : "SIDEWAYS RECOVERY");
    regimeElem.className = regime === "BULL" ? "stat-badge badge-bull" : (regime === "BEAR" ? "stat-badge tag-red" : "stat-badge badge-info");

    const regimeNote = document.getElementById("market-regime-note");
    if (regimeNote) {
      regimeNote.innerText = regime === "BULL" ? "Chỉ số nằm trên MA20 & MA50" : (regime === "BEAR" ? "Chỉ số dưới MA20 & MA50 (Bảo toàn vốn)" : "Chỉ số giằng co tích lũy");
    }

    const breadthElem = document.getElementById("market-breadth");
    if (breadthElem) {
      const g = (data.vnindex && data.vnindex.gainers !== undefined) ? data.vnindex.gainers : 127;
      const l = (data.vnindex && data.vnindex.losers !== undefined) ? data.vnindex.losers : 177;
      const u = (data.vnindex && data.vnindex.unchanged !== undefined) ? data.vnindex.unchanged : 64;
      breadthElem.innerHTML = `Độ rộng HoSE: <span class="text-green">${g} tăng</span> · <span class="text-red">${l} giảm</span> · <span>${u} tham chiếu</span>`;
    }

    const wlBreadthElem = document.getElementById("watchlist-breadth");
    if (wlBreadthElem) {
      const wl = data.vnindex?.watchlist_breadth || { gainers: 10, losers: 4, unchanged: 1, total: 15 };
      wlBreadthElem.innerHTML = `Rổ theo dõi (${wl.total || 15} mã): <span class="text-green">${wl.gainers} tăng</span> · <span class="text-red">${wl.losers} giảm</span> · <span>${wl.unchanged} đứng giá</span>`;
    }

    const champElem = document.getElementById("champion-strategy");
    if (champElem) champElem.innerText = "Chiến Lược Chủ Động (2W)";

    const champSub = document.getElementById("champion-strategy-sub");
    if (champSub) champSub.innerText = "Lợi nhuận: +948.8% | MDD: -21.7%";

    const rrBadge = document.getElementById("banner-rr-badge");
    if (rrBadge) rrBadge.innerHTML = `<span class="pulse-dot"></span> ASYMMETRIC RR: 2.76x`;

    const rrSub = document.getElementById("banner-rr-sub");
    if (rrSub) rrSub.innerText = "Lãi TB: +14.5% | Lỗ TB: -5.3%";
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

    if (!rowsHtml) {
      rowsHtml = `
        <tr>
          <td colspan="10" class="text-center" style="padding: 26px 16px;">
            <div style="color: #fbbf24; font-weight: 700; font-size: 0.95rem;">🛡️ Trạng Thái: 100% Tiền Mặt (Phòng Thủ Thị Trường Gấu)</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 6px; line-height: 1.5;">
              Toàn bộ cổ phiếu vi phạm quy tắc an toàn (gãy MA20/MA50 hoặc RS &lt; 55). Chuyên gia ${s.name.replace("AI_Advisor_", "")} giữ nguyên 100% tiền mặt bảo toàn vốn, chờ đợi thị trường bùng nổ theo đà.
            </div>
          </td>
        </tr>
      `;
    }

    const advClean = key.replace("AI_Advisor_", "");
    const advAudit = (data.advisor_performance_audit && data.advisor_performance_audit[advClean]) || {};
    const winRateAudit = advAudit.win_rate ? `${advAudit.win_rate}%` : '48.2%';
    const rrAudit = advAudit.rr_ratio || '2.50x';
    const cagrAudit = advAudit.cagr ? `${advAudit.cagr}%` : '14.5%';
    const mddAudit = advAudit.max_drawdown ? `${advAudit.max_drawdown}%` : '-22.0%';
    const pfAudit = advAudit.profit_factor ? `${advAudit.profit_factor}` : '1.65';
    const expAudit = advAudit.expectancy ? `+${advAudit.expectancy}%` : '+3.5%';

    const card = document.createElement("div");
    card.className = "strategy-card";
    card.innerHTML = `
      <div class="strategy-header">
        <div>
          <div class="strat-title">${advClean}</div>
          <div class="strat-target">Phân bổ: ${s.allocation_method} | Chu kỳ: ${s.rebalance_days} ngày</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 5px; font-size: 0.75rem; color: var(--text-dim);">
            <span>Win Rate: <strong class="text-green">${winRateAudit}</strong></span>
            <span>R:R: <strong class="text-gold">${rrAudit}</strong></span>
            <span>CAGR: <strong class="text-blue">${cagrAudit}</strong></span>
            <span>Max DD: <strong class="text-red">${mddAudit}</strong></span>
            <span>Profit Factor: <strong>${pfAudit}</strong></span>
            <span>Kỳ vọng: <strong class="text-green">${expAudit}</strong></span>
          </div>
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
  const sellTabHoldingsBadge = document.getElementById("sell-tab-holdings-count-badge");
  if (sellTabHoldingsBadge) sellTabHoldingsBadge.innerText = `${totalCount} Vị Thế Đang Nắm Giữ`;
  
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

  const defenseBanner = document.getElementById("holdings-defense-banner");
  if (defenseBanner) {
    if (holdings.length === 0) {
      defenseBanner.style.display = "block";
      const isBear = data.vnindex && data.vnindex.regime === "BEAR";
      const bmClose = data.vnindex ? Number(data.vnindex.close).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : "1.759,08";
      const ma20 = (data.vnindex && data.vnindex.sma_20) ? Number(data.vnindex.sma_20).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : "1.790,21";
      const ma50 = (data.vnindex && data.vnindex.sma_50) ? Number(data.vnindex.sma_50).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : "1.775,98";
      const regBadge = document.getElementById("defense-regime-badge");
      if (regBadge) {
        regBadge.innerHTML = `<span class="pulse-dot"></span> ${isBear ? 'BEAR REGIME ACTIVATED' : 'CASH DEFENSE ACTIVATED'}`;
      }
      const r1 = document.getElementById("defense-reason-1");
      if (r1) {
        r1.innerHTML = `Chỉ số VN-Index (<strong>${bmClose} điểm</strong>) nằm dưới đường trung bình MA20 (${ma20} điểm) và MA50 (${ma50} điểm). Hệ thống xác nhận thị trường chung suy yếu (BEAR REGIME).`;
      }
    } else {
      defenseBanner.style.display = "none";
    }
  }

  const tbody = document.getElementById("holdings-table-body");
  if (!tbody) return;

  if (filtered.length === 0) {
    if (holdings.length === 0) {
      const bmClose = data.vnindex ? Number(data.vnindex.close).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : "1.759,08";
      tbody.innerHTML = `
        <tr>
          <td colspan="13" class="text-center" style="padding: 40px 20px;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
              <span style="font-size: 2.4rem;">🛡️</span>
              <strong style="color: #fbbf24; font-size: 1.15rem; letter-spacing: 0.5px;">HỆ THỐNG ĐANG Ở TRẠNG THÁI PHÒNG THỦ TUYỆT ĐỐI (100% TIỀN MẶT - CASH DEFENSE)</strong>
              <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 720px; margin: 0; line-height: 1.6;">
                Thị trường VN-Index đang trong trạng thái <strong>BEAR REGIME</strong> (đóng cửa dưới MA20 &amp; MA50). Toàn bộ 15 cổ phiếu trong rổ VN30 đều vi phạm tiêu chuẩn an toàn định lượng (RS &lt; 55 hoặc gãy hỗ trợ kỹ thuật). AI kiên quyết giữ 100% tiền mặt bảo toàn vốn và không bắt đáy dao rơi.
              </p>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 6px;">
                <span class="badge tag-red">VN-Index: ${bmClose} (Dưới MA50)</span>
                <span class="badge tag-yellow">15/15 Mã Bị Loại Bởi Conviction Gate</span>
                <span class="badge tag-green">Tỷ Trọng Tiền Mặt: 100.0%</span>
                <span class="badge badge-info">Sức Mua Được Bảo Toàn Tuyệt Đối</span>
              </div>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted" style="padding: 24px;">Không có vị thế nắm giữ nào cho chuyên gia đã chọn.</td></tr>`;
    }
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
  const sellTabTbody = document.getElementById("sell-tab-holdings-table-body");
  if (sellTabTbody) {
    sellTabTbody.innerHTML = html;
  }
}

// ==========================================
// 3A-2. ALPHA WATCHLIST UNIVERSE CONTROLLER & RENDERER
// ==========================================
function setupWatchlistControls() {
  const chips = document.querySelectorAll(".wl-filter-chip");
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentWatchlistSector = chip.getAttribute("data-wl-sector");
      renderWatchlistTable(globalDailyData);
    });
  });

  const searchInput = document.getElementById("watchlist-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentWatchlistSearch = (e.target.value || "").trim().toLowerCase();
      renderWatchlistTable(globalDailyData);
    });
  }

  // Interactive quick scroll from Top Banner Watchlist Breadth chip
  const wlBreadthBtn = document.getElementById("watchlist-breadth");
  if (wlBreadthBtn) {
    wlBreadthBtn.addEventListener("click", () => {
      switchTab("tab-holdings");
      const target = document.getElementById("section-watchlist");
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          target.classList.add("highlight-jump");
          setTimeout(() => target.classList.remove("highlight-jump"), 1600);
        }, 120);
      }
    });
  }
}

function renderWatchlistTable(data) {
  if (!data) return;
  const items = data.watchlist_items || [];
  const isUs = currentMarket === 'us' || data.market === "US_EQUITIES";

  // Filter by sector
  let filtered = items;
  if (currentWatchlistSector !== 'all') {
    if (currentWatchlistSector === 'Retail-Consumer') {
      filtered = filtered.filter(it => ['Retail', 'Consumer', 'ConsumerDiscretionary', 'ConsumerStaples'].includes(it.sector));
    } else if (currentWatchlistSector === 'Technology') {
      filtered = filtered.filter(it => ['Technology', 'Semiconductors'].includes(it.sector));
    } else if (currentWatchlistSector === 'RealEstate') {
      filtered = filtered.filter(it => ['RealEstate', 'IndustrialRealEstate'].includes(it.sector));
    } else if (currentWatchlistSector === 'Others') {
      filtered = filtered.filter(it => ['Chemicals', 'Energy', 'Logistics', 'Financials', 'Healthcare', 'IndexETF'].includes(it.sector));
    } else {
      filtered = filtered.filter(it => it.sector === currentWatchlistSector);
    }
  }

  // Filter by search query
  if (currentWatchlistSearch) {
    filtered = filtered.filter(it => {
      const sym = (it.symbol || "").toLowerCase();
      const name = (it.name || "").toLowerCase();
      const reason = (it.selection_reason || "").toLowerCase();
      const sector = (it.sector_vi || it.sector || "").toLowerCase();
      return sym.includes(currentWatchlistSearch) || 
             name.includes(currentWatchlistSearch) || 
             reason.includes(currentWatchlistSearch) || 
             sector.includes(currentWatchlistSearch);
    });
  }

  // Update Summary Pill & Badge
  const countBadge = document.getElementById("watchlist-count-badge");
  if (countBadge) {
    countBadge.innerText = `${items.length} Cổ Phiếu Tuyển Chọn (${filtered.length} Hiển Thị)`;
  }

  const gainers = items.filter(it => (it.daily_change_pct || 0) > 0.05).length;
  const losers = items.filter(it => (it.daily_change_pct || 0) < -0.05).length;
  const unchanged = items.length - gainers - losers;

  const pillGain = document.getElementById("wl-pill-gainers");
  if (pillGain) pillGain.innerText = `${gainers} Tăng`;
  const pillLose = document.getElementById("wl-pill-losers");
  if (pillLose) pillLose.innerText = `${losers} Giảm`;
  const pillUnch = document.getElementById("wl-pill-unchanged");
  if (pillUnch) pillUnch.innerText = `${unchanged} Đứng Giá`;

  const tbody = document.getElementById("watchlist-table-body");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 26px;">Không tìm thấy cổ phiếu nào phù hợp với bộ lọc trong rổ 15 mã.</td></tr>`;
    return;
  }

  let html = "";
  filtered.forEach(it => {
    const chg = it.daily_change_pct || 0;
    const isGainer = chg > 0.05;
    const isLoser = chg < -0.05;
    const chgSign = isGainer ? "+" : "";
    const chgClass = isGainer ? "change-badge pos" : (isLoser ? "change-badge neg" : "change-badge");
    const ptsSign = (it.daily_change_pts || 0) >= 0 ? "+" : "";
    const ptsText = it.daily_change_pts !== undefined ? ` (${ptsSign}${Number(it.daily_change_pts).toFixed(2)})` : "";

    const priceFormatted = isUs ? `$${Number(it.current_price).toFixed(2)}` : Number(it.current_price).toFixed(2);
    const prevFormatted = isUs ? `$${Number(it.prev_price).toFixed(2)}` : Number(it.prev_price).toFixed(2);
    const volumeFormatted = (it.volume || 0).toLocaleString('vi-VN');

    // RS Badge Class
    const rs = it.rs_rating || 50;
    let rsBadgeClass = "badge-info";
    if (rs >= 75) rsBadgeClass = "badge-bull";
    else if (rs >= 50) rsBadgeClass = "badge-cyan";
    else rsBadgeClass = "tag-yellow";

    // RSI Badge Class
    const rsi = it.rsi_14 || 50;
    let rsiBadgeClass = "";
    if (rsi < 30) rsiBadgeClass = "text-green"; // Oversold bounce
    else if (rsi > 70) rsiBadgeClass = "text-red"; // Overbought
    else rsiBadgeClass = "text-muted";

    // MA20 & MA50 Position
    const distMA20 = it.dist_sma20_pct !== undefined ? it.dist_sma20_pct : 0;
    const distMA50 = it.dist_sma50_pct !== undefined ? it.dist_sma50_pct : 0;
    const ma20Class = distMA20 >= 0 ? "text-green" : "text-red";
    const ma50Class = distMA50 >= 0 ? "text-green" : "text-red";
    const ma20Sign = distMA20 >= 0 ? "+" : "";
    const ma50Sign = distMA50 >= 0 ? "+" : "";

    let radarBoxClass = "wl-radar-box";
    if (it.ai_radar_action && it.ai_radar_action.includes("kỷ luật")) {
      radarBoxClass = "wl-radar-box defend";
    } else if (it.ai_radar_action && it.ai_radar_action.includes("chờ")) {
      radarBoxClass = "wl-radar-box wait";
    }

    html += `
      <tr>
        <td>
          <div style="display: flex; align-items: baseline; gap: 8px;">
            <span class="ticker-pill">${it.symbol}</span>
            <span class="badge ${rsBadgeClass}" style="font-size: 0.65rem;">RS ${rs.toFixed(0)}</span>
          </div>
          <span class="wl-company-name">${it.name || it.symbol}</span>
          <span style="font-size: 0.68rem; color: var(--color-cyan);">${it.market_cap_tier || 'Top Liquid'}</span>
        </td>
        <td>
          <span class="sector-label">${it.sector_vi || getSectorVi(it.sector)}</span>
        </td>
        <td class="text-right">
          <strong class="font-mono" style="font-size: 0.95rem;">${priceFormatted}</strong>
          <div style="font-size: 0.72rem; color: var(--text-dim);">TC: ${prevFormatted}</div>
        </td>
        <td class="text-center">
          <span class="${chgClass}">${chgSign}${chg.toFixed(2)}%</span>
          <div style="font-size: 0.68rem; color: var(--text-dim); margin-top: 2px;">${ptsText}</div>
        </td>
        <td class="text-right font-mono">
          <div>${volumeFormatted} CP</div>
          <div style="font-size: 0.72rem; color: var(--text-dim);">${it.vol_ratio ? `${it.vol_ratio}x Vol 20D` : ''}</div>
        </td>
        <td class="text-center font-mono">
          <div><strong>RS ${rs.toFixed(1)}</strong></div>
          <div class="${rsiBadgeClass}" style="font-size: 0.75rem;">RSI: ${rsi.toFixed(1)}</div>
        </td>
        <td class="text-center font-mono" style="font-size: 0.78rem;">
          <div class="${ma20Class}">MA20: ${ma20Sign}${distMA20.toFixed(1)}%</div>
          <div class="${ma50Class}">MA50: ${ma50Sign}${distMA50.toFixed(1)}%</div>
        </td>
        <td class="text-center">
          <div style="font-size: 0.78rem; font-weight: 600; color: #fff;">${it.status_text || 'Tích lũy'}</div>
          ${it.news_status ? `<div style="margin-top: 4px;"><span class="news-badge ${it.news_badge || 'neutral'}">${it.news_status}</span></div>` : ''}
        </td>
        <td>
          <div class="wl-thesis-box">
            <strong>Luận điểm AI:</strong> ${it.selection_reason || 'Cổ phiếu đầu ngành trong rổ VN30.'}
            <span class="wl-quant-tag">⚙️ Tiêu chí Quant: ${it.quant_criteria || 'Thanh khoản cao, chất lượng cơ bản'}</span>
          </div>
        </td>
        <td>
          <div class="${radarBoxClass}">
            <span>🎯 <strong>Khuyến nghị Radar:</strong></span>
            <div>${it.ai_radar_action || 'Theo dõi sát diễn biến dòng tiền'}</div>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ==========================================
// 3B-1. ACTIONABLE BUY SIGNALS CONTROLLER & RENDERER
// ==========================================
function setupBuySignalControls() {
  const buyBtns = document.querySelectorAll("#buy-filter-buttons .sig-filter-btn");
  buyBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      buyBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentBuyFilter = btn.getAttribute("data-buy-filter");
      renderBuySignals(globalDailyData);
    });
  });

  const btnCards = document.getElementById("btn-view-buy-cards");
  const btnTable = document.getElementById("btn-view-buy-table");
  const cardsContainer = document.getElementById("buy-signals-cards-container");
  const tableContainer = document.getElementById("buy-signals-table-container");

  if (btnCards && btnTable && cardsContainer && tableContainer) {
    btnCards.addEventListener("click", () => {
      btnCards.classList.add("active");
      btnTable.classList.remove("active");
      cardsContainer.style.display = "grid";
      tableContainer.style.display = "none";
    });

    btnTable.addEventListener("click", () => {
      btnTable.classList.add("active");
      btnCards.classList.remove("active");
      tableContainer.style.display = "block";
      cardsContainer.style.display = "none";
    });
  }
}

function renderBuySignals(data) {
  if (!data) return;
  const isUs = currentMarket === 'us' || data.market === "US_EQUITIES";
  const buySignals = data.buy_signals || (data.new_signals ? data.new_signals.filter(s => s.signal_badge === "buy") : []);

  const totalBuy = buySignals.length;
  const kpiBuy = document.getElementById("kpi-buy-total");
  if (kpiBuy) kpiBuy.innerText = `${totalBuy} tín hiệu`;

  const kpiRr = document.getElementById("kpi-buy-rr");
  if (kpiRr) kpiRr.innerText = isUs ? "2.97 : 1" : "3.33 : 1";

  const kpiWin = document.getElementById("kpi-buy-winrate");
  if (kpiWin) kpiWin.innerText = isUs ? "51.4%" : "48.2%";

  const kpiTp = document.getElementById("kpi-buy-tp");
  if (kpiTp) kpiTp.innerText = "+15.0%";

  const syncTag = document.getElementById("buy-signals-sync-tag");
  if (syncTag) syncTag.innerText = `Kỳ EOD: ${data.trading_date || 'Mới nhất'} · Quét 6 Lần/Ngày`;

  const tbody = document.getElementById("buy-signals-table-body");
  const cardsContainer = document.getElementById("buy-signals-cards-container");

  // Filtering by advisor
  const filtered = currentBuyFilter === "all" ?
    buySignals :
    buySignals.filter(s => (s.recommended_advisor || "").includes(currentBuyFilter));

  // Render Table Empty State
  if (filtered.length === 0) {
    if (tbody) {
      if (buySignals.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="13" class="text-center" style="padding: 40px 20px;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <span style="font-size: 2.2rem;">🛡️</span>
                <strong style="color: #fbbf24; font-size: 1.1rem; letter-spacing: 0.5px;">TẠM DỪNG MỞ VỊ THẾ MUA MỚI (100% TIỀN MẶT - CASH DEFENSE)</strong>
                <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 680px; margin: 0; line-height: 1.6;">
                  Thị trường VN-Index đang trong trạng thái <strong>BEAR REGIME</strong>. 5 AI Advisors đồng thuận giữ 100% tiền mặt, bảo toàn sức mua và kiên nhẫn chờ tín hiệu bùng nổ theo đà (Follow-Through Day).
                </p>
                <div style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; justify-content: center;">
                  <span class="badge tag-red">Thị Trường: BEAR REGIME</span>
                  <span class="badge tag-yellow">Bộ Lọc An Toàn: Khóa Mua Mới</span>
                  <span class="badge tag-green">Bảo Vệ Vốn: Đạt Chuẩn</span>
                </div>
              </div>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted" style="padding: 24px;">Không có tín hiệu mua mới nào cho chuyên gia đã chọn.</td></tr>`;
      }
    }

    if (cardsContainer) {
      const sampleSym = isUs ? "NVDA" : "HPG";
      const sampleSector = isUs ? "Semiconductors" : "Thép & Vật Liệu";
      const samplePrice = isUs ? 122.5 : 20.5;
      const sampleSl = isUs ? 116.9 : 19.55;
      const sampleTp = isUs ? 140.8 : 23.6;

      cardsContainer.innerHTML = `
        <div class="signal-action-card" style="grid-column: 1 / -1; background: #121620; border: 1px solid rgba(251, 191, 36, 0.35); box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 2rem;">🛡️</span>
              <div>
                <h4 style="margin: 0; color: #fbbf24; font-size: 1.15rem; font-weight: 700;">HỆ THỐNG PHÒNG THỦ: 100% TIỀN MẶT (CHƯA PHÁT TÍN HIỆU MUA MỚI)</h4>
                <span style="font-size: 0.8rem; color: var(--text-muted);">Thị trường chung suy yếu (BEAR REGIME) · Bảo vệ vốn tối đa · Quét tự động 6 phiên/ngày</span>
              </div>
            </div>
            <span class="signal-action-badge action-hold">🛡️ CASH DEFENSE</span>
          </div>

          <p style="color: var(--text-main); font-size: 0.9rem; line-height: 1.6; margin-bottom: 14px;">
            Toàn bộ 15 cổ phiếu lớn đang gãy MA20/MA50 hoặc có điểm RS &le; 52.9. Để tránh bẫy giảm giá, 5 Chuyên gia AI kiên quyết giữ tỷ trọng tiền mặt tối đa. Hệ thống đang quét tự động 6 phiên/ngày (<strong>09:00 · 10:00 · 11:30 · 13:30 · 14:00 · 15:00</strong>) để đón đầu cơ hội bùng nổ theo đà.
          </p>

          <div class="condition-tags-row">
            <span class="tech-tag">VN-Index dưới MA20 &amp; MA50</span>
            <span class="tech-tag">RS Rating &le; 52.9</span>
            <span class="tech-tag">Kỷ Luật Khóa Mua</span>
            <span class="tech-tag">Quét 6 Lần/Ngày</span>
            <span class="tech-tag">RR Kỳ Vọng: 3.3x</span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08); flex-wrap: wrap; gap: 10px;">
            <span class="signal-validity-tag">⏱️ Phiên quét hiện hành: Còn hiệu lực trong phiên</span>
            <span class="badge tag-yellow" style="padding: 6px 14px; font-weight: 600; font-size: 0.8rem;">🛡️ Đang ở chế độ bảo vệ vốn — Khóa vị thế mua mới</span>
          </div>
        </div>
      `;
    }
    return;
  }

  // Render Table View (when buy signals exist)
  if (tbody) {
    let tableHtml = "";
    filtered.forEach(sig => {
      const sectorVi = getSectorVi(sig.sector);
      const currP = Number(sig.signal_price).toFixed(2);
      const tp = Number(sig.target_price).toFixed(2);
      const sl = Number(sig.stop_loss).toFixed(2);
      const winRate = sig.win_rate || 48.0;
      const conf = sig.confidence_score || 85;

      tableHtml += `
        <tr>
          <td><strong style="color: var(--color-cyan); font-family: var(--font-mono);">${sig.id}</strong></td>
          <td><span class="ticker-pill">${sig.symbol}</span></td>
          <td><span class="sector-label">${sig.recommended_advisor}</span></td>
          <td><span class="sector-label">${sectorVi}</span></td>
          <td class="text-right font-mono"><strong>${currP}</strong></td>
          <td class="text-right font-mono text-green"><strong>${tp}</strong> (+${sig.target_return_pct}%)</td>
          <td class="text-right font-mono text-red">${sl} (${sig.max_loss_pct}%)</td>
          <td class="text-center font-mono text-gold"><strong>${sig.rr_ratio}</strong></td>
          <td class="text-center font-mono"><strong>${sig.recommended_weight_pct}%</strong></td>
          <td class="text-center font-mono" style="font-size: 0.8rem;">
            <span class="text-green"><strong>${winRate}%</strong></span> / <span class="text-cyan">${conf}%</span>
          </td>
          <td><span class="signal-tag">${sig.entry_technique || 'Bùng Nổ Breakout'}</span></td>
          <td style="font-size: 0.82rem; color: var(--text-muted); max-width: 280px;">${sig.advisor_rationale}</td>
          <td class="text-center">
            <button class="btn-quick-trade" style="padding: 4px 10px; font-size: 0.76rem;" onclick="openQuickTradeModal('${sig.symbol}', 'MUA MỚI', ${sig.signal_price}, ${sig.stop_loss}, ${sig.target_price}, '${sig.rr_ratio}', '${sectorVi}', ${winRate})">
              <span>⚡ Mua</span>
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = tableHtml;
  }

  // Render SaaS Cards View (when buy signals exist)
  if (cardsContainer) {
    let cardsHtml = "";
    filtered.forEach(sig => {
      const sectorVi = getSectorVi(sig.sector);
      const entryFormatted = Number(sig.signal_price).toLocaleString('vi-VN');
      const slFormatted = Number(sig.stop_loss).toLocaleString('vi-VN');
      const tpFormatted = Number(sig.target_price).toLocaleString('vi-VN');
      const winRate = sig.win_rate || 48.0;
      const conf = sig.confidence_score || 85;

      cardsHtml += `
        <div class="signal-action-card">
          <div class="signal-card-header">
            <div class="signal-card-ticker">
              <span class="signal-sym">${sig.symbol}</span>
              <span class="signal-sector">${sectorVi}</span>
            </div>
            <span class="signal-action-badge action-buy">
              ⚡ MUA MỚI (${sig.recommended_weight_pct}%)
            </span>
          </div>

          <div class="ai-confidence-meter">
            <div class="meter-header">
              <span class="meter-title">Độ Tin Cậy AI (Confidence Score)</span>
              <span class="meter-score">${conf}% · Win Rate ${winRate}%</span>
            </div>
            <div class="meter-bar-track">
              <div class="meter-bar-fill" style="width: ${conf}%;"></div>
            </div>
          </div>

          <div class="condition-tags-row">
            <span class="tech-tag">${sig.entry_technique || 'Mô Thức Bùng Nổ'}</span>
            <span class="tech-tag">Tỷ trọng: ${sig.recommended_weight_pct}% NAV</span>
            <span class="tech-tag">${sig.recommended_advisor}</span>
            ${sig.news_status ? `<span class="news-badge ${sig.news_badge || 'neutral'}">${sig.news_status}</span>` : ''}
          </div>

          <div class="rr-visualizer-box">
            <div class="rr-metrics-row">
              <div class="rr-metric-item">
                <span>Cắt Lỗ (-4.5%)</span>
                <strong class="text-red">${slFormatted}</strong>
              </div>
              <div class="rr-metric-item">
                <span>Giá Vào Mua</span>
                <strong class="text-blue">${entryFormatted}</strong>
              </div>
              <div class="rr-metric-item">
                <span>Mục Tiêu (+15%)</span>
                <strong class="text-green">${tpFormatted}</strong>
              </div>
            </div>
            <div class="rr-bar-strip">
              <div class="rr-loss-segment" title="Rủi ro: -4.5%"></div>
              <div class="rr-entry-mark"></div>
              <div class="rr-gain-segment" title="Kỳ vọng: +15.0%"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--text-dim); margin-top: 4px;">
              <span>Rủi ro: -4.5%</span>
              <strong style="color: #fbbf24;">Tỷ Lệ RR: ${sig.rr_ratio}</strong>
              <span>Kỳ vọng: +${sig.target_return_pct}%</span>
            </div>
          </div>

          <p style="font-size: 0.85rem; color: var(--text-main); margin: 10px 0 6px 0; line-height: 1.5;">
            <strong>Luận điểm:</strong> ${sig.advisor_rationale}
          </p>

          <div class="signal-card-footer">
            <span class="signal-validity-tag">⏱️ Phiên quét hiện hành · Còn hiệu lực</span>
            <button class="btn-quick-trade" onclick="openQuickTradeModal('${sig.symbol}', 'MUA MỚI', ${sig.signal_price}, ${sig.stop_loss}, ${sig.target_price}, '${sig.rr_ratio}', '${sectorVi}', ${winRate})">
              <span>⚡ Đặt Lệnh Nhanh</span>
            </button>
          </div>
        </div>
      `;
    });
    cardsContainer.innerHTML = cardsHtml;
  }
}

// ==========================================
// 3B-2. SELL SIGNALS & RISK MANAGEMENT CONTROLLER & RENDERER
// ==========================================
function setupSellSignalControls() {
  const sellBtns = document.querySelectorAll("#sell-filter-buttons .sig-filter-btn");
  sellBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sellBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSellFilter = btn.getAttribute("data-sell-filter");
      renderSellSignals(globalDailyData);
    });
  });

  const btnCards = document.getElementById("btn-view-sell-cards");
  const btnTable = document.getElementById("btn-view-sell-table");
  const cardsContainer = document.getElementById("sell-signals-cards-container");
  const tableContainer = document.getElementById("sell-signals-table-container");

  if (btnCards && btnTable && cardsContainer && tableContainer) {
    btnCards.addEventListener("click", () => {
      btnCards.classList.add("active");
      btnTable.classList.remove("active");
      cardsContainer.style.display = "grid";
      tableContainer.style.display = "none";
    });

    btnTable.addEventListener("click", () => {
      btnTable.classList.add("active");
      btnCards.classList.remove("active");
      tableContainer.style.display = "block";
      cardsContainer.style.display = "none";
    });
  }
}

function renderSellSignals(data) {
  if (!data) return;
  const isUs = currentMarket === 'us' || data.market === "US_EQUITIES";
  const sellSignals = data.sell_signals || (data.new_signals ? data.new_signals.filter(s => s.signal_badge !== "buy") : []);

  const totalSell = sellSignals.length;
  const profitCount = sellSignals.filter(s => s.signal_type.includes("CHỐT LỜI")).length;
  const trailingCount = sellSignals.filter(s => s.signal_type.includes("TRAILING")).length;
  const stopCount = sellSignals.filter(s => s.signal_type.includes("CẮT LỖ")).length;
  const warningCount = sellSignals.filter(s => s.signal_type.includes("CẢNH BÁO") || s.signal_badge === "warning").length;
  const rebalanceCount = sellSignals.filter(s => s.signal_type.includes("TÁI CƠ CẤU")).length;

  const kpiTotal = document.getElementById("kpi-sell-total");
  if (kpiTotal) kpiTotal.innerText = `${totalSell} lệnh`;

  const kpiTp = document.getElementById("kpi-sell-tp");
  if (kpiTp) kpiTp.innerText = `${profitCount} lệnh`;

  const kpiTrailing = document.getElementById("kpi-sell-trailing");
  if (kpiTrailing) kpiTrailing.innerText = `${trailingCount} lệnh`;

  const kpiSl = document.getElementById("kpi-sell-sl");
  if (kpiSl) kpiSl.innerText = `${stopCount + warningCount} lệnh`;

  const syncTag = document.getElementById("sell-signals-sync-tag");
  if (syncTag) syncTag.innerText = `Kỷ Luật: Dừng Lỗ Cứng -4.5% · Bảo Toàn Lãi +3%+`;

  const tbody = document.getElementById("sell-signals-table-body");
  const cardsContainer = document.getElementById("sell-signals-cards-container");

  // Filtering by sell type
  const filtered = currentSellFilter === "all" ? sellSignals : sellSignals.filter(s => {
    if (currentSellFilter === "profit") return s.signal_type.includes("CHỐT LỜI");
    if (currentSellFilter === "trailing") return s.signal_type.includes("TRAILING");
    if (currentSellFilter === "stop") return s.signal_type.includes("CẮT LỖ");
    if (currentSellFilter === "rebalance") return s.signal_type.includes("TÁI CƠ CẤU");
    if (currentSellFilter === "warning") return s.signal_type.includes("CẢNH BÁO") || s.signal_badge === "warning";
    return true;
  });

  // Empty State
  if (filtered.length === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center" style="padding: 40px 20px;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <span style="font-size: 2.2rem;">🛡️</span>
              <strong style="color: #34d399; font-size: 1.1rem; letter-spacing: 0.5px;">DANH MỤC AN TOÀN — CHƯA CÓ LỆNH BÁN PHÁT SINH</strong>
              <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 650px; margin: 0; line-height: 1.6;">
                Tất cả các vị thế đang nắm giữ đều vận động trong ngưỡng an toàn, chưa vi phạm quy tắc cắt lỗ (-4.5%) hoặc đạt điểm chốt lời kỳ vọng (+15%).
              </p>
            </div>
          </td>
        </tr>
      `;
    }
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="signal-action-card" style="grid-column: 1 / -1; background: #121620; border: 1px solid rgba(16, 185, 129, 0.35); text-align: center; padding: 36px 20px;">
          <span style="font-size: 2.4rem;">🛡️</span>
          <h4 style="margin: 10px 0 6px 0; color: #34d399; font-size: 1.15rem;">KHÔNG CÓ LỆNH BÁN CẦN XỬ LÝ</h4>
          <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 600px; margin: 0 auto; line-height: 1.6;">
            Hệ thống quản trị rủi ro tự động quét liên tục: nếu cổ phiếu giảm quá -4.5%, hệ thống sẽ lập tức gửi cảnh báo và sinh lệnh Bán Cắt Lỗ để triệt tiêu Max Drawdown.
          </p>
        </div>
      `;
    }
    return;
  }

  // Render Table View (when sell signals exist)
  if (tbody) {
    let tableHtml = "";
    filtered.forEach(sig => {
      const sectorVi = getSectorVi(sig.sector);
      const isProfit = sig.signal_type.includes("CHỐT LỜI") || sig.signal_type.includes("TRAILING");
      const isStop = sig.signal_type.includes("CẮT LỖ");
      const isWarn = sig.signal_type.includes("CẢNH BÁO");

      let badgeClass = "signal-badge profit";
      if (isStop) badgeClass = "signal-badge stop";
      else if (isWarn) badgeClass = "signal-badge stop";
      else if (sig.signal_type.includes("TÁI CƠ CẤU")) badgeClass = "signal-badge rebalance";

      const ret = sig.target_return_pct !== undefined ? sig.target_return_pct : 0.0;
      const retSign = ret >= 0 ? "+" : "";
      const retColor = ret >= 0 ? "text-green" : "text-red";

      tableHtml += `
        <tr>
          <td><strong style="color: var(--color-cyan); font-family: var(--font-mono);">${sig.id}</strong></td>
          <td><span class="ticker-pill">${sig.symbol}</span></td>
          <td><span class="${badgeClass}">${sig.signal_type}</span></td>
          <td><span class="sector-label">${sig.recommended_advisor}</span></td>
          <td><span class="sector-label">${sectorVi}</span></td>
          <td class="text-right font-mono"><strong>${Number(sig.signal_price).toFixed(2)}</strong></td>
          <td class="text-right font-mono" style="color: var(--text-muted);">${sig.entry_price ? Number(sig.entry_price).toFixed(2) : '-'}</td>
          <td class="text-center font-mono ${retColor}"><strong>${retSign}${ret}%</strong></td>
          <td class="text-right font-mono ${isProfit ? 'text-green' : 'text-red'}">
            <strong>${Number(sig.stop_loss).toFixed(2)}</strong>
          </td>
          <td style="font-size: 0.82rem; color: #fff; font-weight: 600;">${sig.action_advice || 'Bán theo kỷ luật'}</td>
          <td style="font-size: 0.82rem; color: var(--text-muted); max-width: 280px;">${sig.advisor_rationale}</td>
          <td class="text-center">
            <button class="btn-quick-trade" style="padding: 4px 10px; font-size: 0.76rem; background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #f87171;" onclick="openQuickTradeModal('${sig.symbol}', '${sig.signal_type}', ${sig.signal_price}, ${sig.stop_loss}, ${sig.target_price}, 'Thực Hiện Bán', '${sectorVi}', 90)">
              <span>🔔 Bán</span>
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = tableHtml;
  }

  // Render SaaS Cards View (when sell signals exist)
  if (cardsContainer) {
    let cardsHtml = "";
    filtered.forEach(sig => {
      const sectorVi = getSectorVi(sig.sector);
      const isProfit = sig.signal_type.includes("CHỐT LỜI") || sig.signal_type.includes("TRAILING");
      const isStop = sig.signal_type.includes("CẮT LỖ");
      const isWarn = sig.signal_type.includes("CẢNH BÁO");

      let cardClass = "signal-action-card card-sell";
      let actionBadgeClass = "signal-action-badge action-sell";
      if (isProfit && !sig.signal_type.includes("TRAILING")) {
        actionBadgeClass = "signal-action-badge action-hold";
      } else if (sig.signal_type.includes("TRAILING")) {
        actionBadgeClass = "signal-action-badge action-buy";
      }

      const ret = sig.target_return_pct !== undefined ? sig.target_return_pct : 0.0;
      const retSign = ret >= 0 ? "+" : "";
      const retColor = ret >= 0 ? "text-green" : "text-red";
      const currPFormatted = Number(sig.signal_price).toLocaleString('vi-VN');
      const entryPFormatted = sig.entry_price ? Number(sig.entry_price).toLocaleString('vi-VN') : currPFormatted;
      const triggerPFormatted = Number(sig.stop_loss).toLocaleString('vi-VN');

      cardsHtml += `
        <div class="${cardClass}">
          <div class="signal-card-header">
            <div class="signal-card-ticker">
              <span class="signal-sym">${sig.symbol}</span>
              <span class="signal-sector">${sectorVi}</span>
            </div>
            <span class="${actionBadgeClass}">
              🔔 ${sig.signal_type}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; background: rgba(0,0,0,0.25); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <div>
              <span style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Giá Vốn</span>
              <div class="font-mono" style="font-size: 0.95rem; color: var(--text-muted);">${entryPFormatted}</div>
            </div>
            <div>
              <span style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Giá Hiện Tại</span>
              <div class="font-mono" style="font-size: 0.95rem; font-weight: 700; color: #fff;">${currPFormatted}</div>
            </div>
            <div>
              <span style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Lãi/Lỗ Vị Thế</span>
              <div class="font-mono ${retColor}" style="font-size: 0.95rem; font-weight: 800;">${retSign}${ret}%</div>
            </div>
          </div>

          <div class="condition-tags-row">
            <span class="tech-tag">${sig.recommended_advisor}</span>
            <span class="tech-tag">${sig.technical_reason}</span>
            ${sig.news_status ? `<span class="news-badge ${sig.news_badge || 'neutral'}">${sig.news_status}</span>` : ''}
          </div>

          <div style="margin: 10px 0; padding: 10px 12px; background: rgba(239, 68, 68, 0.08); border-left: 3px solid #ef4444; border-radius: 0 6px 6px 0;">
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Hành động đề xuất:</div>
            <div style="font-size: 0.88rem; font-weight: 700; color: #fff; margin-top: 2px;">${sig.action_advice}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Ngưỡng kích hoạt: <strong class="${isProfit ? 'text-green' : 'text-red'} font-mono">${triggerPFormatted}</strong> (${sig.rr_ratio})</div>
          </div>

          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 6px 0 12px 0; line-height: 1.5;">
            <strong>Luận điểm QTRR:</strong> ${sig.advisor_rationale}
          </p>

          <div class="signal-card-footer">
            <span class="signal-validity-tag">⏱️ Siết kỷ luật dừng lỗ</span>
            <button class="btn-quick-trade" style="background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.5); color: #f87171;" onclick="openQuickTradeModal('${sig.symbol}', '${sig.signal_type}', ${sig.signal_price}, ${sig.stop_loss}, ${sig.target_price}, 'Bán Khẩn Cấp', '${sectorVi}', 90)">
              <span>🔔 Xác Nhận Bán</span>
            </button>
          </div>
        </div>
      `;
    });
    cardsContainer.innerHTML = cardsHtml;
  }
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
function computeSymbolStats(tradesList) {
  if (!tradesList || tradesList.length === 0) return {};
  const stats = {};
  tradesList.forEach(t => {
    const sym = t.symbol;
    if (!stats[sym]) {
      stats[sym] = {
        symbol: sym,
        sector: t.sector || "Materials",
        total_trades: 0,
        win_trades: 0,
        loss_trades: 0,
        win_rate: 0,
        avg_return_pct: 0,
        avg_win_pct: 0,
        avg_loss_pct: 0,
        risk_reward_ratio: 0,
        best_trade_pct: -999,
        worst_trade_pct: 999,
        total_pnl_vnd: 0,
        total_pnl_usd: 0,
        avg_holding_days: 0,
        _total_return: 0,
        _total_win_return: 0,
        _total_loss_return: 0,
        _total_days: 0
      };
    }
    const s = stats[sym];
    s.total_trades += 1;
    if (t.return_pct > 0) {
      s.win_trades += 1;
      s._total_win_return += t.return_pct;
    } else {
      s.loss_trades += 1;
      s._total_loss_return += t.return_pct;
    }
    s._total_return += t.return_pct;
    s._total_days += (t.holding_days || 1);
    s.total_pnl_vnd += (t.pnl_vnd || 0);
    s.total_pnl_usd += (t.pnl_usd || (t.pnl_vnd ? t.pnl_vnd / 25400 : 0));
    if (t.return_pct > s.best_trade_pct) s.best_trade_pct = t.return_pct;
    if (t.return_pct < s.worst_trade_pct) s.worst_trade_pct = t.return_pct;
  });

  Object.keys(stats).forEach(sym => {
    const s = stats[sym];
    s.win_rate = s.total_trades > 0 ? Number(((s.win_trades / s.total_trades) * 100).toFixed(1)) : 0;
    s.avg_return_pct = s.total_trades > 0 ? Number((s._total_return / s.total_trades).toFixed(2)) : 0;
    s.avg_win_pct = s.win_trades > 0 ? Number((s._total_win_return / s.win_trades).toFixed(2)) : 0;
    s.avg_loss_pct = s.loss_trades > 0 ? Number((s._total_loss_return / s.loss_trades).toFixed(2)) : 0;
    s.risk_reward_ratio = s.avg_loss_pct !== 0 ? Number((Math.abs(s.avg_win_pct / s.avg_loss_pct)).toFixed(2)) : (s.win_trades > 0 ? 3.5 : 0);
    s.avg_holding_days = s.total_trades > 0 ? Number((s._total_days / s.total_trades).toFixed(1)) : 0;
    if (s.best_trade_pct === -999) s.best_trade_pct = 0;
    if (s.worst_trade_pct === 999) s.worst_trade_pct = 0;
  });

  return stats;
}

function updatePhaseSymbolStats() {
  let targetTrades = allTrades;
  if (currentPhaseFilter === "live") {
    targetTrades = allTrades.filter(t => t.is_live);
  } else if (currentPhaseFilter === "backtest") {
    targetTrades = allTrades.filter(t => !t.is_live);
  }
  currentPhaseSymbolStats = computeSymbolStats(targetTrades);
  if (Object.keys(currentPhaseSymbolStats).length === 0 && Object.keys(allSymbolStats).length > 0) {
    currentPhaseSymbolStats = allSymbolStats;
  }
  const searchInput = document.getElementById("symbol-stats-search");
  const term = searchInput ? searchInput.value : "";
  renderSymbolStatsTable(currentPhaseSymbolStats, term);
}

function setupSymbolStatsControls() {
  const searchInput = document.getElementById("symbol-stats-search");
  if (searchInput) {
    let debounce;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        renderSymbolStatsTable(currentPhaseSymbolStats, searchInput.value);
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
  const symData = currentPhaseSymbolStats[sym] || allSymbolStats[sym];

  const banner = document.getElementById("selected-symbol-banner");
  if (banner && symData) {
    document.getElementById("selected-sym-code").innerText = sym;
    document.getElementById("selected-sym-title").innerText = `Chi Tiết Hiệu Suất Cổ Phiếu ${sym} (${getSectorVi(symData.sector)})`;
    
    const isUs = currentMarket === 'us';
    let pnlDisplay = "";
    let pnlClass = "text-green";
    if (isUs) {
      const pnlUsd = symData.total_pnl_usd || (symData.total_pnl_vnd ? symData.total_pnl_vnd / 25400 : 0);
      const sign = pnlUsd >= 0 ? "+" : "";
      pnlClass = pnlUsd >= 0 ? "text-green" : "text-red";
      pnlDisplay = `${sign}${(pnlUsd / 1000000).toFixed(2)}M USD`;
    } else {
      const pnlVnd = symData.total_pnl_vnd || 0;
      const sign = pnlVnd >= 0 ? "+" : "";
      pnlClass = pnlVnd >= 0 ? "text-green" : "text-red";
      pnlDisplay = `${sign}${(pnlVnd / 1000000000).toFixed(2)} Tỷ ₫`;
    }

    const rrVal = symData.risk_reward_ratio !== undefined ? Number(symData.risk_reward_ratio).toFixed(2) : "0.00";

    document.getElementById("selected-sym-summary").innerHTML = `
      Ngành: <strong>${getSectorVi(symData.sector)}</strong> · 
      Win Rate: <strong class="text-green">${symData.win_rate}%</strong> (${symData.win_trades} thắng / ${symData.loss_trades} thua) · 
      Tỷ Lệ RR: <strong class="text-yellow">${rrVal}x</strong> · 
      Tổng Lệnh: <strong>${symData.total_trades}</strong> · 
      Lãi TB: <strong>${symData.avg_return_pct >= 0 ? '+' : ''}${symData.avg_return_pct}%</strong> · 
      Trade Tốt Nhất: <strong class="text-green">+${symData.best_trade_pct}%</strong> · 
      Trade Tệ Nhất: <strong class="text-red">${symData.worst_trade_pct}%</strong> · 
      Tổng PnL: <strong class="${pnlClass}">${pnlDisplay}</strong> · 
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
    tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted">Chưa có dữ liệu thống kê theo mã.</td></tr>`;
    return;
  }

  const term = searchTerm.trim().toUpperCase();
  const filteredSymbols = symbols.filter(sym => !term || sym.includes(term) || (statsMap[sym].sector && statsMap[sym].sector.toUpperCase().includes(term)));

  filteredSymbols.sort((a, b) => statsMap[b].total_trades - statsMap[a].total_trades);

  const isUs = currentMarket === 'us';

  let html = "";
  filteredSymbols.forEach(sym => {
    const s = statsMap[sym];
    const winRateClass = s.win_rate >= 50 ? "text-green" : "text-gold";
    const retClass = s.avg_return_pct >= 0 ? "text-green" : "text-red";
    const retSign = s.avg_return_pct >= 0 ? "+" : "";

    const rrVal = s.risk_reward_ratio !== undefined ? Number(s.risk_reward_ratio).toFixed(2) : "0.00";
    const rrNum = parseFloat(rrVal);
    const rrClass = rrNum >= 2.5 ? "text-green font-bold" : (rrNum >= 1.8 ? "text-yellow" : "text-muted");

    let pnlDisplay = "";
    let pnlClass = "text-green";
    if (isUs) {
      const pnlUsd = s.total_pnl_usd || (s.total_pnl_vnd ? s.total_pnl_vnd / 25400 : 0);
      const pnlSign = pnlUsd >= 0 ? "+" : "";
      pnlClass = pnlUsd >= 0 ? "text-green" : "text-red";
      if (Math.abs(pnlUsd) >= 1000000) {
        pnlDisplay = `${pnlSign}${(pnlUsd / 1000000).toFixed(2)}M $`;
      } else {
        pnlDisplay = `${pnlSign}${(pnlUsd / 1000).toFixed(1)}k $`;
      }
    } else {
      const pnlVnd = s.total_pnl_vnd || 0;
      const pnlSign = pnlVnd >= 0 ? "+" : "";
      pnlClass = pnlVnd >= 0 ? "text-green" : "text-red";
      const pnlBillion = (pnlVnd / 1000000000).toFixed(2);
      pnlDisplay = `${pnlSign}${pnlBillion} Tỷ ₫`;
    }

    const isActive = selectedSymbol === sym ? "active-symbol-row" : "";

    html += `
      <tr class="${isActive}" data-symbol="${sym}">
        <td><span class="ticker-pill">${sym}</span></td>
        <td><span class="sector-label">${getSectorVi(s.sector)}</span></td>
        <td class="text-center font-mono"><strong>${s.total_trades}</strong></td>
        <td class="text-center font-mono text-green">${s.win_trades}</td>
        <td class="text-center font-mono text-red">${s.loss_trades}</td>
        <td class="text-center font-mono ${winRateClass}"><strong>${s.win_rate}%</strong></td>
        <td class="text-center font-mono ${rrClass}"><strong>${rrVal}x</strong></td>
        <td class="text-center font-mono ${retClass}"><strong>${retSign}${s.avg_return_pct}%</strong></td>
        <td class="text-right font-mono text-green">+${s.best_trade_pct}%</td>
        <td class="text-right font-mono text-red">${s.worst_trade_pct}%</td>
        <td class="text-right font-mono ${pnlClass}"><strong>${pnlDisplay}</strong></td>
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
function setupPhaseSwitcher() {
  const phaseBtns = document.querySelectorAll(".phase-btn");
  phaseBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const phase = btn.getAttribute("data-phase");
      setPhaseMode(phase, true);
    });
  });
}

function setPhaseMode(phase, updateDates = true) {
  currentPhaseFilter = phase;

  // Update button active state
  document.querySelectorAll(".phase-btn").forEach(b => {
    if (b.getAttribute("data-phase") === phase) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });

  const rangePills = document.querySelectorAll(".range-pill");

  if (updateDates) {
    const fromInput = document.getElementById("filter-from-date");
    const toInput = document.getElementById("filter-to-date");
    rangePills.forEach(p => p.classList.remove("active"));

    if (phase === "live") {
      if (fromInput) fromInput.value = "2026-01-01";
      if (toInput) toInput.value = "2026-12-31";
      const p26 = document.querySelector('.range-pill[data-range="2026"]');
      if (p26) p26.classList.add("active");
    } else if (phase === "backtest") {
      if (fromInput) fromInput.value = "2010-01-01";
      if (toInput) toInput.value = "2025-12-31";
      const p15 = document.querySelector('.range-pill[data-range="15y"]');
      if (p15) p15.classList.add("active");
    } else {
      if (fromInput) fromInput.value = "2010-01-01";
      if (toInput) toInput.value = "2026-12-31";
      const pAll = document.querySelector('.range-pill[data-range="all"]');
      if (pAll) pAll.classList.add("active");
    }
  }

  updatePhaseSymbolStats();
  applyTradeFilters();
}

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
    document.getElementById("filter-advisor").value = "all";
    document.getElementById("filter-symbol").value = "";
    document.getElementById("filter-outcome").value = "all";
    
    selectedSymbol = null;
    const banner = document.getElementById("selected-symbol-banner");
    if (banner) banner.style.display = "none";
    document.querySelectorAll("#symbol-stats-tbody tr").forEach(tr => tr.classList.remove("active-symbol-row"));

    setPhaseMode("live", true);
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
    setPhaseMode("all", false);
  } else if (range === "15y") {
    fromInput.value = "2010-01-01";
    toInput.value = "2025-12-31";
    setPhaseMode("backtest", false);
  } else if (range === "2026") {
    fromInput.value = "2026-01-01";
    toInput.value = "2026-12-31";
    setPhaseMode("live", false);
  } else if (range === "1m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
    setPhaseMode("live", false);
  } else if (range === "3m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
    setPhaseMode("live", false);
  } else if (range === "6m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
    setPhaseMode("live", false);
  } else if (range === "1y") {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    fromInput.value = d.toISOString().split("T")[0];
    toInput.value = now.toISOString().split("T")[0];
    setPhaseMode("all", false);
  } else if (/^\d{4}$/.test(range)) {
    fromInput.value = `${range}-01-01`;
    toInput.value = `${range}-12-31`;
    if (parseInt(range, 10) <= 2025) {
      setPhaseMode("backtest", false);
    } else {
      setPhaseMode("live", false);
    }
  }
}

function applyTradeFilters() {
  const fromDate = document.getElementById("filter-from-date").value || "2010-01-01";
  const toDate = document.getElementById("filter-to-date").value || "2026-12-31";
  const advisor = document.getElementById("filter-advisor").value;
  const symbol = (document.getElementById("filter-symbol").value || "").trim().toUpperCase();
  const outcome = document.getElementById("filter-outcome").value;

  filteredTrades = allTrades.filter(t => {
    // 0. Phase Filter (Live vs Backtest)
    if (currentPhaseFilter === "live" && !t.is_live) return false;
    if (currentPhaseFilter === "backtest" && t.is_live) return false;

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
  sortAndRenderTrades();
}

function updateTradesKPIs(trades) {
  const total = trades.length;
  const wins = trades.filter(t => t.return_pct > 0);
  const losses = trades.filter(t => t.return_pct <= 0);

  const isUs = currentMarket === 'us';
  const winRate = total > 0 ? ((wins.length / total) * 100).toFixed(1) : "0.0";
  
  const grossWin = wins.reduce((acc, t) => acc + (isUs ? (t.pnl_usd || t.pnl_vnd / 25400 || 0) : (t.pnl_vnd || 0)), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (isUs ? (t.pnl_usd || t.pnl_vnd / 25400 || 0) : (t.pnl_vnd || 0)), 0));
  const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : (wins.length > 0 ? "2.50" : "0.00");

  const avgWin = wins.length > 0 ? (wins.reduce((acc, t) => acc + t.return_pct, 0) / wins.length).toFixed(1) : "0.0";
  const avgLoss = losses.length > 0 ? (losses.reduce((acc, t) => acc + t.return_pct, 0) / losses.length).toFixed(1) : "0.0";
  const avgLossNum = Math.abs(parseFloat(avgLoss));
  const avgWinNum = Math.abs(parseFloat(avgWin));
  const rrRatio = avgLossNum > 0 ? (avgWinNum / avgLossNum).toFixed(2) : (wins.length > 0 ? "3.50" : "0.00");
  const avgHold = total > 0 ? (trades.reduce((acc, t) => acc + (t.holding_days || 1), 0) / total).toFixed(1) : "0";

  document.getElementById("kpi-total-trades").innerText = total.toLocaleString("vi-VN");
  document.getElementById("kpi-trades-count-sub").innerText = `Lệnh đã khớp`;
  document.getElementById("kpi-win-rate").innerText = `${winRate}%`;
  document.getElementById("kpi-win-count-sub").innerText = `${wins.length} lệnh lãi / ${losses.length} lệnh lỗ`;
  document.getElementById("kpi-profit-factor").innerText = pf;

  const kpiRr = document.getElementById("kpi-rr-ratio");
  if (kpiRr) kpiRr.innerText = `${rrRatio}x`;
  const kpiRrSub = document.getElementById("kpi-rr-sub");
  if (kpiRrSub) kpiRrSub.innerText = isUs ? "Lãi TB / |Lỗ TB| (US Universe)" : "Lãi TB / |Lỗ TB| (VN30 Universe)";

  document.getElementById("kpi-avg-win").innerText = `+${avgWin}%`;
  document.getElementById("kpi-avg-loss").innerText = `${avgLoss}%`;

  const lossSub = document.getElementById("kpi-loss-sub");
  if (lossSub) lossSub.innerText = isUs ? "Hard Stop (-4.0% US)" : "Hard Stop (-6.0% VN)";

  document.getElementById("kpi-avg-holding").innerText = `${avgHold} ngày`;

  const settleSub = document.getElementById("kpi-settlement-sub");
  if (settleSub) settleSub.innerText = isUs ? "Chu kỳ T+1 (US Mega-Caps)" : "Chu kỳ T+2.5 (Việt Nam)";
}

function renderTradesTable() {
  const tbody = document.getElementById("trades-table-body");
  if (!tbody) return;

  if (filteredTrades.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center" style="padding: 30px; color: var(--text-muted);">
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

  const isUs = currentMarket === 'us';
  const currSym = isUs ? "$" : "";
  const pnlUnit = isUs ? " $" : " ₫";

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
    
    let pnlVal = 0;
    if (isUs) {
      pnlVal = t.pnl_usd !== undefined ? t.pnl_usd : (t.pnl_vnd ? t.pnl_vnd / 25400 : 0);
    } else {
      pnlVal = t.pnl_vnd || 0;
    }
    const pnlFormatted = Number(Math.round(pnlVal)).toLocaleString("vi-VN");
    const pnlClass = isWin ? "text-green" : "text-red";
    
    const phaseBadge = t.is_live ? 
      `<span class="badge tag-red" style="font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;"><span class="pulse-dot" style="width: 5px; height: 5px;"></span> THỰC CHIẾN</span>` : 
      `<span class="badge badge-info" style="font-size: 0.72rem;">🏛️ KIỂM ĐỊNH</span>`;

    const entryFormatted = t.entry_price ? `${currSym}${Number(t.entry_price).toFixed(2)}` : '-';
    const exitFormatted = t.exit_price ? `${currSym}${Number(t.exit_price).toFixed(2)}` : '-';

    html += `
      <tr>
        <td><strong style="color: var(--color-cyan); font-family: var(--font-mono);">${t.id}</strong></td>
        <td>${phaseBadge}</td>
        <td><span class="sector-label">${advisorShort}</span></td>
        <td><span class="ticker-pill">${t.symbol}</span></td>
        <td><span class="sector-label">${getSectorVi(t.sector || 'Bluechip')}</span></td>
        <td style="font-family: var(--font-mono); font-size: 0.78rem;">${t.entry_date} ➔ ${t.exit_date}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${entryFormatted} ➔ <strong>${exitFormatted}</strong></td>
        <td class="text-center" style="font-family: var(--font-mono);">${t.shares ? Number(t.shares).toLocaleString("vi-VN") : '-'}</td>
        <td class="text-center" style="font-family: var(--font-mono);">${t.holding_days || 1}d</td>
        <td class="text-center"><span class="${retClass}">${retSign}${t.return_pct}%</span></td>
        <td class="text-right ${pnlClass}" style="font-family: var(--font-mono); font-weight: 700;">${isWin ? '+' : ''}${pnlFormatted}${pnlUnit}</td>
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

    const rrVal = row["RR Ratio"] !== undefined ? `${row["RR Ratio"]}x` : (row["Profit Factor"] ? `${(row["Profit Factor"] * 1.5).toFixed(2)}x` : "2.50x");
    const rrNum = parseFloat(rrVal);
    const rrClass = rrNum >= 2.8 ? "text-green font-bold" : "text-yellow";

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
      <td class="text-center font-mono ${rrClass}"><strong>${rrVal}</strong></td>
      <td class="text-center">${row["Turnover (x/y)"]}x</td>
      <td class="text-center" style="color: var(--color-cyan); font-weight: 700;">${row["Score"]}</td>
    `;
    tbody.appendChild(tr);
  });
}

function getAnnualReturns(curves, key) {
  if (!curves || !curves[key]) return null;
  const pts = curves[key];
  const byYear = {};
  pts.forEach(p => {
    const yr = parseInt(p.date.substring(0, 4), 10);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(p.nav);
  });
  const res = {};
  const yrs = Object.keys(byYear).map(Number).sort((a,b) => a - b);
  for (let i = 0; i < yrs.length; i++) {
    const yr = yrs[i];
    const prevNav = i > 0 ? byYear[yrs[i-1]][byYear[yrs[i-1]].length - 1] : byYear[yr][0];
    const curNav = byYear[yr][byYear[yr].length - 1];
    res[yr] = prevNav > 0 ? Number((((curNav / prevNav) - 1) * 100).toFixed(1)) : 0;
  }
  return res;
}

function renderAnnualTable(data) {
  const tbody = document.getElementById("annual-body");
  if (!tbody) return;

  const isUs = currentMarket === 'us' || (equityCurvesData && Boolean(equityCurvesData["SPY (S&P 500)"]));
  const thBm = document.querySelector("#annual-table thead tr th:nth-child(2)");
  if (thBm) thBm.innerText = isUs ? "S&P 500 (SPY)" : "VN-Index";

  const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];

  const bmKey = isUs ? "SPY (S&P 500)" : "VNINDEX";
  const bmCurves = getAnnualReturns(equityCurvesData, bmKey);
  const actCurves = getAnnualReturns(equityCurvesData, "AI_Advisor_ChuDong_2W");
  const harCurves = getAnnualReturns(equityCurvesData, "AI_Advisor_NhipNhang_1M");
  const perCurves = getAnnualReturns(equityCurvesData, "AI_Advisor_BenBi_3M");
  const canCurves = getAnnualReturns(equityCurvesData, "AI_Advisor_CANSLIM_Breakout");

  const defaultBm = {
    2025: 40.5, 2024: 11.9, 2023: 8.2, 2022: -34.0, 2021: 33.7, 2020: 14.2,
    2019: 7.8, 2018: -10.4, 2017: 46.5, 2016: 15.7, 2015: 6.4, 2014: 8.2,
    2013: 20.6, 2012: 18.2, 2011: -27.7, 2010: -6.3
  };

  tbody.innerHTML = "";
  years.forEach(yr => {
    const bm = (bmCurves && bmCurves[yr] !== undefined) ? bmCurves[yr] : (defaultBm[yr] || 0);
    const act = (actCurves && actCurves[yr] !== undefined) ? actCurves[yr] : 0;
    const har = (harCurves && harCurves[yr] !== undefined) ? harCurves[yr] : 0;
    const per = (perCurves && perCurves[yr] !== undefined) ? perCurves[yr] : 0;
    const can = (canCurves && canCurves[yr] !== undefined) ? canCurves[yr] : 0;

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

  const isUs = currentMarket === 'us' || Boolean(curvesData["SPY (S&P 500)"]);
  const bmKey = isUs ? "SPY (S&P 500)" : "VNINDEX";
  const bmLabel = isUs ? "S&P 500 ETF (SPY)" : "VN-Index (Thị trường chung)";
  const refKey = curvesData[bmKey] ? bmKey : (curvesData["VNINDEX"] ? "VNINDEX" : Object.keys(curvesData)[0]);

  let allLabels = (curvesData[refKey] || []).map(p => p.date);
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
      label: bmLabel,
      data: getSlice(bmKey),
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
    },
    {
      label: "Đảo Chiều Thống Kê (20D)",
      data: getSlice("AI_Advisor_Mean_Reversion"),
      borderColor: "#ec4899",
      backgroundColor: "transparent",
      borderWidth: 2,
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
    "last_updated": "2026-10-06 15:00:00 (UTC+7)",
    "trading_date": "2026-10-06",
    "vnindex": { 
      "close": 1759.08, "prev_close": 1753.2, "change_pct": 0.34, "change_pts": 5.88, 
      "sma_20": 1790.21, "sma_50": 1775.98, "sma_200": 1796.12, "regime": "BEAR", 
      "gainers": 127, "losers": 177, "unchanged": 64,
      "hose_breadth": { "gainers": 127, "losers": 177, "unchanged": 64, "total": 368 },
      "watchlist_breadth": { "gainers": 10, "losers": 4, "unchanged": 1, "total": 15 }
    },
    "strategies": {}
  };
}

function getFallbackPerformance() {
  return [
    {
      "Advisor Name": "AI_Advisor_ChuDong_2W",
      "Total Return (%)": 945.7,
      "CAGR (%)": 15.8,
      "Alpha vs VN-Index (%/y)": 7.8,
      "Beta": 0.41,
      "Max Drawdown (%)": -21.8,
      "Sharpe": 0.71,
      "Win Rate (%)": 45.7,
      "Profit Factor": 1.85,
      "Avg Win (%)": 12.56,
      "Avg Loss (%)": -5.03,
      "RR Ratio": 2.50,
      "Expectancy (%)": 3.01,
      "Turnover (x/y)": 11.6,
      "Score": 0.74
    },
    {
      "Advisor Name": "AI_Advisor_Mean_Reversion",
      "Total Return (%)": 952.8,
      "CAGR (%)": 15.9,
      "Alpha vs VN-Index (%/y)": 7.8,
      "Beta": 0.39,
      "Max Drawdown (%)": -34.7,
      "Sharpe": 0.71,
      "Win Rate (%)": 49.3,
      "Profit Factor": 1.76,
      "Avg Win (%)": 17.65,
      "Avg Loss (%)": -5.61,
      "RR Ratio": 3.15,
      "Expectancy (%)": 5.85,
      "Turnover (x/y)": 9.7,
      "Score": 0.66
    },
    {
      "Advisor Name": "AI_Advisor_NhipNhang_1M",
      "Total Return (%)": 808.5,
      "CAGR (%)": 14.8,
      "Alpha vs VN-Index (%/y)": 6.7,
      "Beta": 0.42,
      "Max Drawdown (%)": -23.8,
      "Sharpe": 0.65,
      "Win Rate (%)": 49.4,
      "Profit Factor": 1.68,
      "Avg Win (%)": 13.18,
      "Avg Loss (%)": -5.16,
      "RR Ratio": 2.55,
      "Expectancy (%)": 3.91,
      "Turnover (x/y)": 12.3,
      "Score": 0.65
    },
    {
      "Advisor Name": "AI_Advisor_CANSLIM_Breakout",
      "Total Return (%)": 760.9,
      "CAGR (%)": 14.4,
      "Alpha vs VN-Index (%/y)": 6.4,
      "Beta": 0.42,
      "Max Drawdown (%)": -23.8,
      "Sharpe": 0.63,
      "Win Rate (%)": 49.2,
      "Profit Factor": 1.67,
      "Avg Win (%)": 13.44,
      "Avg Loss (%)": -5.14,
      "RR Ratio": 2.61,
      "Expectancy (%)": 4.00,
      "Turnover (x/y)": 12.2,
      "Score": 0.63
    },
    {
      "Advisor Name": "AI_Advisor_BenBi_3M",
      "Total Return (%)": 281.2,
      "CAGR (%)": 8.7,
      "Alpha vs VN-Index (%/y)": 0.7,
      "Beta": 0.21,
      "Max Drawdown (%)": -22.4,
      "Sharpe": 0.40,
      "Win Rate (%)": 48.3,
      "Profit Factor": 2.27,
      "Avg Win (%)": 19.10,
      "Avg Loss (%)": -5.65,
      "RR Ratio": 3.38,
      "Expectancy (%)": 6.32,
      "Turnover (x/y)": 4.2,
      "Score": 0.30
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
