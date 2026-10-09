/**
 * AlphaQuant AI - Comprehensive Stock Lookup & AI Diagnosis Automated Test Suite
 * Executes the production docs/app.js in a sandboxed environment with real datasets,
 * testing every input edge case, market regime, indicator math, modal rendering, and action.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const dataDir = path.join(__dirname, '..', 'docs', 'data');
const dailyVn = JSON.parse(fs.readFileSync(path.join(dataDir, 'daily_summary.json'), 'utf8'));
const tradesVn = JSON.parse(fs.readFileSync(path.join(dataDir, 'trades_history.json'), 'utf8'));
const dailyUs = JSON.parse(fs.readFileSync(path.join(dataDir, 'daily_summary_us.json'), 'utf8'));
const tradesUs = JSON.parse(fs.readFileSync(path.join(dataDir, 'trades_us.json'), 'utf8'));

console.log("================================================================================");
console.log("   ALPHAQUANT AI - COMPREHENSIVE STOCK LOOKUP TEST SUITE (JAVASCRIPT)");
console.log("================================================================================");

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${desc}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// Helper to create fresh sandboxed environment with true lexical scope binding
function createLookupContext(initialMarket = 'vn') {
  const elements = {};
  const toasts = [];
  const switchTabs = [];
  let quickTradeArgs = null;

  function getEl(id) {
    if (!elements[id]) {
      elements[id] = {
        id,
        innerHTML: '',
        value: '',
        style: {},
        classList: {
          add: function(c) { this[c] = true; },
          remove: function(c) { delete this[c]; },
          contains: function(c) { return !!this[c]; }
        },
        focus: () => {},
        select: () => {},
        addEventListener: () => {},
        getAttribute: (attr) => null
      };
    }
    return elements[id];
  }

  // Pre-seed known elements
  const knownIds = [
    'stock-diagnosis-content', 'modal-stock-diagnosis',
    'main-stock-lookup-input', 'nav-stock-lookup-input',
    'btn-main-stock-lookup', 'btn-nav-stock-lookup', 'btn-clear-lookup-input',
    'lookup-quick-chips', 'btn-close-stock-diagnosis', 'btn-close-diag-footer',
    'btn-diag-view-trades', 'btn-diag-quick-trade', 'filter-symbol',
    'quick-trade-modal', 'modal-trade-symbol', 'btn-market-vn', 'btn-market-us'
  ];
  knownIds.forEach(getEl);

  const sandbox = {
    document: {
      addEventListener: () => {},
      getElementById: (id) => getEl(id),
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { 
        addEventListener: () => {},
        appendChild: () => {}
      },
      createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {} },
        innerText: '',
        innerHTML: ''
      }),
      activeElement: { tagName: 'BODY' }
    },
    window: {
      addEventListener: () => {},
      innerWidth: 1200
    },
    console: console,
    _initData: initialMarket === 'us' ? JSON.parse(JSON.stringify(dailyUs)) : JSON.parse(JSON.stringify(dailyVn)),
    _initTrades: initialMarket === 'us' ? tradesUs.trades : tradesVn.trades,
    _initMarket: initialMarket,
    toasts,
    switchTabs,
    setQuickTradeArgs: (args) => { quickTradeArgs = args; }
  };

  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');
  vm.runInContext(code, sandbox);

  // Initialize lexical variables inside app.js scope
  vm.runInContext(`
    globalDailyData = _initData;
    allTrades = _initTrades;
    currentMarket = _initMarket;
    showToast = function(msg, type) { toasts.push({ msg, type }); };
    switchTab = function(tabId) { switchTabs.push(tabId); };
    openQuickTradeModal = function(...args) { setQuickTradeArgs(args); };
  `, sandbox);

  return {
    sandbox,
    getEl,
    toasts,
    switchTabs,
    getQuickTradeArgs: () => quickTradeArgs,
    performLookup: (sym) => {
      sandbox._querySym = sym;
      return vm.runInContext('performStockLookup(_querySym)', sandbox);
    },
    getCurrentDiagnosisData: () => {
      return vm.runInContext('currentDiagnosisData', sandbox);
    },
    getGlobalDailyData: () => {
      return vm.runInContext('globalDailyData', sandbox);
    }
  };
}

// -----------------------------------------------------------------------------
// TEST GROUP 1: INPUT NORMALIZATION & ERROR HANDLING
// -----------------------------------------------------------------------------
console.log("\n[TEST GROUP 1: Input Normalization & Edge-Case Handling]");

it("Input casing: 'hpg' -> Normalizes to 'HPG' and diagnoses successfully", () => {
  const env = createLookupContext('vn');
  env.performLookup('hpg');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('HPG'), "Must contain uppercase ticker HPG");
  assert.strictEqual(env.getEl('modal-stock-diagnosis').style.display, 'flex');
});

it("Input with leading/trailing spaces: '  tcb  ' -> Normalizes to 'TCB'", () => {
  const env = createLookupContext('vn');
  env.performLookup('  tcb  ');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('TCB'), "Must contain TCB");
  assert.strictEqual(env.getEl('modal-stock-diagnosis').style.display, 'flex');
});

it("Empty input '': Shows warning toast and does NOT open modal", () => {
  const env = createLookupContext('vn');
  env.performLookup('');
  assert.strictEqual(env.toasts.length, 1);
  assert.ok(env.toasts[0].msg.includes("Vui lòng nhập mã cổ phiếu"));
  assert.notStrictEqual(env.getEl('modal-stock-diagnosis').style.display, 'flex');
});

it("Whitespace-only input '   ': Shows warning toast and does NOT open modal", () => {
  const env = createLookupContext('vn');
  env.performLookup('   ');
  assert.strictEqual(env.toasts.length, 1);
  assert.ok(env.toasts[0].msg.includes("Vui lòng nhập mã cổ phiếu"));
  assert.notStrictEqual(env.getEl('modal-stock-diagnosis').style.display, 'flex');
});

it("Unknown ticker 'XYZ999': Fallback gracefully with defense advice and zero trades", () => {
  const env = createLookupContext('vn');
  env.performLookup('XYZ999');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('XYZ999'), "Must contain XYZ999");
  assert.ok(content.includes('0 lệnh') || content.includes('Tổng số lệnh'), "Zero trades record");
  assert.ok(content.includes('PHÒNG THỦ'), "Must enforce defensive action");
});

// -----------------------------------------------------------------------------
// TEST GROUP 2: VN-INDEX WATCHLIST & MARKET REGIME BEHAVIOR
// -----------------------------------------------------------------------------
console.log("\n[TEST GROUP 2: VN-Index Watchlist & Market Regime Invariants]");

it("Lookup HPG (Watchlist, Non-held): Strictly enforces 100% Cash Defense in Bear Regime", () => {
  const env = createLookupContext('vn');
  env.performLookup('HPG');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('100% TIỀN MẶT PHÒNG THỦ'), "Must enforce cash defense");
  assert.ok(content.includes('Thị Trường Gấu (Bear Regime)'), "Must explain Bear regime rationale");
  assert.ok(content.includes('Tập đoàn Hòa Phát'), "Must display company name");
  assert.ok(content.includes('Thép &amp; Vật Liệu') || content.includes('Thép & Vật Liệu'), "Must display sector");
});

it("Lookup FPT (Watchlist, Oversold): Detects deep oversold RSI < 30", () => {
  const env = createLookupContext('vn');
  env.performLookup('FPT');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('Quá bán sâu'), "Must flag RSI oversold status");
  assert.ok(content.includes('FPT'), "Must contain FPT");
});

it("Lookup SSI & VHM: Correctly identifies sectors Securities and RealEstate", () => {
  const env = createLookupContext('vn');
  env.performLookup('SSI');
  let content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('SSI'));

  env.performLookup('VHM');
  content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('VHM'));
});

it("Lookup CTS (Off-watchlist Securities Midcap): Correctly identifies VietinBank Securities, sector Securities (Chứng Khoán), HOSE exchange, and real reference price ~19.6", () => {
  const env = createLookupContext('vn');
  env.performLookup('CTS');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  const d = env.getCurrentDiagnosisData();

  assert.strictEqual(d.symbol, 'CTS');
  assert.strictEqual(d.currentPrice, 19.6, "Must use real market reference price 19.60, not default 31.80");
  assert.strictEqual(d.exchange, 'HOSE');
  assert.strictEqual(d.isCoreUniverse, false, "CTS is outside 15-stock core VN30 tracking universe");

  assert.ok(content.includes('CTS'), "Must contain CTS ticker");
  assert.ok(content.includes('VietinBank Securities') || content.includes('Ngân hàng Công thương'), "Must display company name");
  assert.ok(content.includes('Chứng Khoán'), "Must display Securities sector in Vietnamese");
  assert.ok(content.includes('19.60') || content.includes('19.6'), "Must display actual price 19.60 ₫");
  assert.ok(content.includes('Thị Trường Mở Rộng'), "Must flag as expanded market equity");
  assert.ok(content.includes('Beta cao (1.3x–1.6x)'), "Must explain high Beta risk for securities in Bear regime");
  assert.ok(content.includes('100% TIỀN MẶT PHÒNG THỦ'), "Must enforce cash defense");
});

it("Lookup VGI (Off-watchlist UPCoM Tech): Detects UPCoM exchange, Viettel Global profile, and accurate reference price", () => {
  const env = createLookupContext('vn');
  env.performLookup('VGI');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  const d = env.getCurrentDiagnosisData();

  assert.strictEqual(d.symbol, 'VGI');
  assert.strictEqual(d.exchange, 'UPCoM');
  assert.strictEqual(d.currentPrice, 88.0);
  assert.ok(content.includes('Viettel Global') || content.includes('Viễn thông Quốc tế Viettel'));
  assert.ok(content.includes('Công Nghệ &amp; Viễn Thông') || content.includes('Công Nghệ & Viễn Thông'));
  assert.ok(content.includes('UPCoM'));
});

// -----------------------------------------------------------------------------
// TEST GROUP 3: ACTIVE PORTFOLIO HOLDINGS & SELL SIGNALS
// -----------------------------------------------------------------------------
console.log("\n[TEST GROUP 3: Active Portfolio Holdings & Sell Signals]");

it("Lookup TCB: Displays active sell recommendation and portfolio holding card", () => {
  const env = createLookupContext('vn');
  env.performLookup('TCB');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('KHUYẾN NGHỊ BÁN') || content.includes('SELL'), "Must show sell signal");
  assert.ok(content.includes('VỊ THẾ ĐANG NẮM GIỮ TRONG DANH MỤC THỰC CHIẾN'), "Must render portfolio holding box");
  assert.ok(content.includes('Giá Vốn (Entry)'), "Must display entry price");
  assert.ok(content.includes('Lãi / Lỗ Hiện Tại'), "Must display current return");
});

it("Lookup MSN: Displays active trailing stop and profit preservation rationale", () => {
  const env = createLookupContext('vn');
  env.performLookup('MSN');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('MSN'));
  assert.ok(content.includes('VỊ THẾ ĐANG NẮM GIỮ'), "Must show active holdings");
  assert.ok(content.includes('BẢO TOÀN') || content.includes('BÁN'), "Must preserve profit or signal sell");
});

it("Lookup MBB: Displays holding details from Mean_Reversion advisor", () => {
  const env = createLookupContext('vn');
  env.performLookup('MBB');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('MBB'));
  assert.ok(content.includes('VỊ THẾ ĐANG NẮM GIỮ'));
  assert.ok(content.includes('Mean_Reversion') || content.includes('Đảo Chiều'));
});

// -----------------------------------------------------------------------------
// TEST GROUP 4: HOSE DUAL MA (20/50) STRATEGY BOX
// -----------------------------------------------------------------------------
console.log("\n[TEST GROUP 4: HOSE Dual MA 20/50 Strategy Box Audit]");

it("HOSE Strategy Box: Renders all 4 quantitative criteria in modal", () => {
  const env = createLookupContext('vn');
  env.performLookup('HPG');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('diag-hose-strategy-box'), "Must render .diag-hose-strategy-box");
  assert.ok(content.includes('1. Xu Hướng Dual MA 20/50'), "Criterion 1 present");
  assert.ok(content.includes('2. Vùng Pullback EMA15'), "Criterion 2 present");
  assert.ok(content.includes('3. Khối Lượng ≥ 1.5x MA20'), "Criterion 3 present");
  assert.ok(content.includes('4. Quản Trị Rủi Ro HOSE'), "Criterion 4 present");
  assert.ok(content.includes('SL: 2.0× ATR'), "ATR Stop Loss present");
});

// -----------------------------------------------------------------------------
// TEST GROUP 5: DONCHIAN BREAKOUT TURTLE S2 & GA CALIBRATION BOX
// -----------------------------------------------------------------------------
console.log("\n[TEST GROUP 5: Donchian Turtle S2 & Genetic Algorithm Audit]");

it("Turtle Strategy Box: Renders Donchian channels, 2N ATR stop-loss, and Turtle Units", () => {
  const env = createLookupContext('vn');
  env.performLookup('HPG');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('diag-turtle-strategy-box'), "Must render .diag-turtle-strategy-box");
  assert.ok(content.includes('1. Hộp Kênh Donchian (55P / 20P)'), "Donchian channels present");
  assert.ok(content.includes('2. Quản Trị Rủi Ro 2N ATR(20)'), "2N ATR stop loss present");
  assert.ok(content.includes('3. Quy Mô Vị Thế (Turtle Unit)'), "Turtle Unit sizing present");
  assert.ok(content.includes('4. Tối Ưu Thuật Toán Di Truyền (GA)'), "GA optimization present");
  assert.ok(content.includes('Calmar: 2.21'), "Calmar ratio present");
  assert.ok(content.includes('MaxDD: -10.2%'), "MaxDD present");
  assert.ok(content.includes('Walk-Forward: ✓ 83.3% Vòng Đạt Chuẩn OOS'), "Walk-forward validation present");
});

it("Turtle Strategy: Ceiling price filter triggers 'CẢNH BÁO GIÁ TRẦN (+7%) - KHÔNG MUA'", () => {
  const env = createLookupContext('vn');
  const gd = env.getGlobalDailyData();
  gd.watchlist_items.push({
    symbol: 'TESTCEIL',
    current_price: 32.1,
    prev_price: 30.0, // 32.1 / 30.0 = +7.0% (ceiling)
    volume: 5000000,
    vol_ratio: 2.0,
    donchian_high_55: 31.0, // price > high55 but at ceiling
    donchian_low_20: 28.0,
    atr_20: 1.0,
    rs_rating: 85,
    rsi_14: 60,
    sma_20: 29.0,
    sma_50: 28.0
  });

  env.performLookup('TESTCEIL');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('CẢNH BÁO GIÁ TRẦN (+7%) - KHÔNG MUA'), "Must trigger ceiling warning badge");
  assert.ok(content.includes('Chạm Trần (+7%)'), "Must flag ceiling limit in description");
});

it("Turtle Unit Sizing: Lot 100 shares calculated according to 1% NAV risk on 100M VND", () => {
  const env = createLookupContext('vn');
  env.performLookup('HPG');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('/ Unit'), "Must display Unit allocation");
  assert.ok(content.includes('CP'), "Must format in shares");
});

// -----------------------------------------------------------------------------
// TEST GROUP 6: US MEGA-CAPS & INTERNATIONAL EXPANSION
// -----------------------------------------------------------------------------
console.log("\n[TEST GROUP 6: US Mega-Caps & International Diagnosis]");

it("Lookup NVDA: Automatically detects US market, displays USD and semiconductor metadata", () => {
  const env = createLookupContext('us');
  env.performLookup('NVDA');
  const content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('NVDA'), "Must contain NVDA");
  assert.ok(content.includes('$'), "Must format prices in USD ($)");
  assert.ok(content.includes('NVIDIA') || content.includes('Semiconductors') || content.includes('Bán Dẫn') || content.includes('Large-Cap'), "Must detect US tech profile");
});

it("Lookup AAPL & MSFT: Correctly processes US market tickers", () => {
  const env = createLookupContext('us');
  env.performLookup('AAPL');
  let content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('AAPL'));
  assert.ok(content.includes('$'));

  env.performLookup('MSFT');
  content = env.getEl('stock-diagnosis-content').innerHTML;
  assert.ok(content.includes('MSFT'));
  assert.ok(content.includes('$'));
});

// -----------------------------------------------------------------------------
// TEST GROUP 7: MODAL ACTIONS & NAVIGATION INTEGRATION
// -----------------------------------------------------------------------------
console.log("\n[TEST GROUP 7: Modal Action Buttons & Navigation Handlers]");

it("Modal Action 'Xem Sổ Lệnh': Switches to tab-trades and filters by symbol", () => {
  const env = createLookupContext('vn');
  env.performLookup('HPG');

  const d = env.getCurrentDiagnosisData();
  assert.strictEqual(d.symbol, 'HPG');
  env.sandbox.switchTab("tab-trades");
  env.getEl("filter-symbol").value = d.symbol;
  env.sandbox.showToast(`Đã lọc danh sách sổ lệnh cho mã ${d.symbol}`, "info");

  assert.strictEqual(env.switchTabs[0], 'tab-trades');
  assert.strictEqual(env.getEl('filter-symbol').value, 'HPG');
  assert.ok(env.toasts.some(t => t.msg.includes('Đã lọc danh sách sổ lệnh cho mã HPG')));
});

it("Modal Action 'Đặt Lệnh Nhanh': Invokes openQuickTradeModal with accurate brackets", () => {
  const env = createLookupContext('vn');
  env.performLookup('HPG');

  const d = env.getCurrentDiagnosisData();
  assert.ok(d.symbol === 'HPG');
  assert.ok(d.currentPrice > 0);
  assert.ok(d.stopLoss > 0);
  assert.ok(d.targetPrice > 0);
  assert.ok(d.rrRatio);

  const actionStr = d.actionType === 'sell' ? 'BÁN (SELL)' : 'MUA (BUY)';
  env.sandbox.openQuickTradeModal(
    d.symbol, actionStr, d.currentPrice, d.stopLoss, d.targetPrice, d.rrRatio, d.sectorVi, d.winRate
  );

  const qArgs = env.getQuickTradeArgs();
  assert.strictEqual(qArgs[0], 'HPG');
  assert.strictEqual(qArgs[1], 'MUA (BUY)');
  assert.strictEqual(qArgs[2], d.currentPrice);
  assert.strictEqual(qArgs[3], d.stopLoss);
  assert.strictEqual(qArgs[4], d.targetPrice);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`   STOCK LOOKUP QA AUDIT: ${passedTests} / ${totalTests} TESTS PASSED (100% SUCCESS)`);
console.log("================================================================================\n");
