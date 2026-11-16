export function getWebAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>МойСклад • Диалоговый терминал</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      --bg: var(--tg-theme-bg-color, #0f172a);
      --text: var(--tg-theme-text-color, #f8fafc);
      --hint: var(--tg-theme-hint-color, #94a3b8);
      --card-bg: var(--tg-theme-secondary-bg-color, #1e293b);
      --border: rgba(255, 255, 255, 0.08);
      --btn-bg: var(--tg-theme-button-color, #2563eb);
      --btn-text: var(--tg-theme-button-text-color, #ffffff);
      --accent: #38bdf8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --safe-top: var(--tg-content-safe-area-inset-top, 0px);
      --safe-bottom: var(--tg-content-safe-area-inset-bottom, 0px);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      padding-top: calc(var(--safe-top) + 8px);
      padding-bottom: calc(var(--safe-bottom) + 80px);
      min-height: 100vh;
      overflow-x: hidden;
    }

    .container {
      max-width: 680px;
      margin: 0 auto;
      padding: 0 14px;
    }

    /* HEADER */
    .header {
      position: sticky;
      top: 0;
      z-index: 40;
      background: var(--bg);
      backdrop-filter: blur(12px);
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 10px;
    }

    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0 8px 0;
    }

    .venue-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .venue-logo-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      color: #fff;
      font-weight: 700;
    }

    .venue-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .venue-subtitle {
      font-size: 11px;
      color: var(--hint);
      font-weight: 500;
    }

    .stats-badge {
      font-size: 12px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--accent);
      padding: 4px 10px;
      border-radius: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    /* NAVIGATION TABS */
    .nav-tabs {
      display: flex;
      gap: 5px;
      background: var(--card-bg);
      padding: 3px;
      border-radius: 10px;
      border: 1px solid var(--border);
      margin-bottom: 6px;
    }

    .nav-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 7px 4px;
      border-radius: 7px;
      border: none;
      background: transparent;
      color: var(--hint);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }

    .nav-tab.active {
      background: var(--btn-bg);
      color: var(--btn-text);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }

    .tab-badge {
      background: var(--danger);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 8px;
      line-height: 12px;
    }

    /* SEARCH BAR */
    .search-box {
      position: relative;
      margin-bottom: 8px;
    }

    .search-input {
      width: 100%;
      height: 38px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 0 34px 0 34px;
      color: var(--text);
      font-size: 13px;
      outline: none;
      transition: all 0.2s;
    }

    .search-input:focus {
      border-color: var(--btn-bg);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 10px;
      font-size: 14px;
      color: var(--hint);
    }

    .search-clear {
      position: absolute;
      right: 9px;
      top: 8px;
      background: none;
      border: none;
      color: var(--hint);
      font-size: 17px;
      cursor: pointer;
      display: none;
      width: 22px;
      height: 22px;
      line-height: 20px;
      text-align: center;
      border-radius: 50%;
    }

    /* FILTERS SECTION */
    .filter-group {
      margin-bottom: 6px;
    }

    .filter-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--hint);
      margin-bottom: 3px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .chips-bar {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 3px;
      scrollbar-width: none;
    }
    .chips-bar::-webkit-scrollbar { display: none; }

    .chip {
      white-space: nowrap;
      padding: 4px 10px;
      border-radius: 7px;
      background: var(--card-bg);
      color: var(--text);
      font-size: 11px;
      font-weight: 500;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.15s;
    }

    .chip.active {
      background: var(--btn-bg);
      color: var(--btn-text);
      font-weight: 600;
      border-color: var(--btn-bg);
    }

    .stock-toggle-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 12px;
      color: var(--hint);
    }

    .stock-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
    }

    .stock-checkbox {
      width: 15px;
      height: 15px;
      accent-color: var(--btn-bg);
      cursor: pointer;
    }

    /* REGISTRY TABLE LIST (MOYSKLAD STYLE) */
    .registry-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 4px 6px 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--hint);
      border-bottom: 1px solid var(--border);
      margin-bottom: 6px;
    }

    .products-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .product-row {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 9px 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: transform 0.1s, border-color 0.15s;
    }

    .product-row.has-qty {
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(30, 41, 59, 0.95);
    }

    .product-main {
      flex: 1;
      min-width: 0;
    }

    .product-header-line {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 2px;
    }

    .brand-tag {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.25);
    }

    .pack-tag {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--hint);
    }

    .product-title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
      word-break: break-word;
    }

    .product-meta-line {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 3px;
      font-size: 12px;
    }

    .product-price {
      font-weight: 700;
      font-size: 13px;
      color: #fff;
    }

    .stock-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      font-weight: 500;
    }

    .stock-badge.ok { color: var(--success); }
    .stock-badge.low { color: var(--warning); }
    .stock-badge.out { color: var(--danger); }

    /* STEPPERS & ACTIONS */
    .product-action {
      flex-shrink: 0;
    }

    .btn-add {
      background: var(--btn-bg);
      color: var(--btn-text);
      border: none;
      padding: 7px 12px;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .btn-add:active {
      transform: scale(0.96);
    }

    .stepper {
      display: flex;
      align-items: center;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 7px;
      overflow: hidden;
    }

    .btn-step {
      background: none;
      border: none;
      color: var(--text);
      width: 30px;
      height: 30px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }

    .btn-step:active {
      background: rgba(255, 255, 255, 0.1);
    }

    .step-qty {
      min-width: 26px;
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
    }

    /* FLOATING BOTTOM CART BAR */
    .cart-bar {
      position: fixed;
      bottom: calc(var(--safe-bottom) + 12px);
      left: 14px;
      right: 14px;
      max-width: 652px;
      margin: 0 auto;
      background: linear-gradient(135deg, #1d4ed8, #2563eb);
      color: #fff;
      border-radius: 13px;
      padding: 11px 16px;
      display: none;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.5);
      cursor: pointer;
      z-index: 50;
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .cart-bar-left {
      display: flex;
      flex-direction: column;
    }

    .cart-bar-count {
      font-size: 11px;
      opacity: 0.9;
      font-weight: 500;
    }

    .cart-bar-total {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }

    .cart-bar-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 13px;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.2);
      padding: 7px 13px;
      border-radius: 9px;
    }

    /* CHECKOUT MODAL (SHEET) */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: none;
      align-items: flex-end;
      justify-content: center;
    }

    .modal-sheet {
      background: var(--bg);
      border-top: 1px solid var(--border);
      border-radius: 18px 18px 0 0;
      width: 100%;
      max-width: 680px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      animation: sheetUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes sheetUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .sheet-header {
      padding: 14px 18px 10px 18px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .sheet-title {
      font-size: 16px;
      font-weight: 700;
    }

    .sheet-close {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--hint);
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      cursor: pointer;
    }

    .sheet-body {
      padding: 14px 18px;
      overflow-y: auto;
      flex: 1;
    }

    .sheet-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--hint);
      margin-bottom: 7px;
    }

    .sheet-items-table {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 9px;
      margin-bottom: 14px;
      overflow: hidden;
    }

    .sheet-item {
      padding: 9px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .sheet-item:last-child { border-bottom: none; }

    .form-group {
      margin-bottom: 10px;
    }

    .form-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--hint);
    }

    .form-input {
      width: 100%;
      height: 40px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 0 12px;
      color: var(--text);
      font-size: 13px;
      outline: none;
    }
    .form-input:focus {
      border-color: var(--btn-bg);
    }

    .sheet-footer {
      padding: 12px 18px calc(var(--safe-bottom) + 14px) 18px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    .sheet-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .sheet-total-label {
      font-size: 13px;
      color: var(--hint);
    }

    .sheet-total-value {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
    }

    .btn-submit {
      width: 100%;
      height: 46px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      border: none;
      border-radius: 11px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.4);
    }

    .btn-submit:active {
      transform: scale(0.98);
    }

    /* ORDERS VIEW & ADMIN CARDS */
    .orders-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .order-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 11px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .order-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .order-id {
      font-size: 14px;
      font-weight: 700;
    }

    .order-date {
      font-size: 11px;
      color: var(--hint);
      margin-left: 6px;
    }

    .status-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .status-new { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .status-in_progress { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .status-completed { background: rgba(56, 189, 248, 0.15); color: var(--accent); }
    .status-cancelled { background: rgba(148, 163, 184, 0.15); color: var(--hint); }

    .order-items-box {
      font-size: 12px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 7px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .order-item-line {
      display: flex;
      justify-content: space-between;
      color: var(--text);
    }

    .order-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 4px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }

    .order-total-sum {
      font-size: 15px;
      font-weight: 800;
      color: #fff;
    }

    .admin-actions-row {
      display: flex;
      gap: 5px;
      margin-top: 6px;
      flex-wrap: wrap;
    }

    .btn-status {
      flex: 1;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
    }
    .btn-status:active { transform: scale(0.96); }

    /* VENUE & ADMIN TILES */
    .stat-tiles {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .stat-tile {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      text-align: center;
    }

    .stat-val {
      font-size: 16px;
      font-weight: 800;
      color: var(--accent);
    }

    .stat-lbl {
      font-size: 10px;
      color: var(--hint);
      margin-top: 2px;
    }

    .action-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 11px;
      padding: 14px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .btn-primary {
      background: var(--btn-bg);
      color: var(--btn-text);
      border: none;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    /* EMPTY STATE & SPINNER */
    .empty-state {
      text-align: center;
      padding: 35px 20px;
      color: var(--hint);
    }
    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .spinner {
      width: 22px;
      height: 22px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin: 30px auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- HEADER -->
    <header class="header">
      <div class="top-bar">
        <div class="venue-brand">
          <div class="venue-logo-icon">📦</div>
          <div>
            <div class="venue-title" id="venueName">LV Lounge</div>
            <div class="venue-subtitle">Терминал склада (МойСклад)</div>
          </div>
        </div>
        <div class="stats-badge" id="statsCount">
          <span>●</span> <span id="posCountLabel">Загрузка...</span>
        </div>
      </div>

      <!-- 4 NAVIGATION TABS -->
      <nav class="nav-tabs">
        <button class="nav-tab active" data-tab="catalog" onclick="switchTab('catalog')">
          <span>📦 Склад</span>
        </button>
        <button class="nav-tab" data-tab="orders" onclick="switchTab('orders')">
          <span>📋 Заказы</span>
          <span class="tab-badge" id="ordersTabBadge" style="display:none;">0</span>
        </button>
        <button class="nav-tab" data-tab="venue" onclick="switchTab('venue')">
          <span>🏢 О складе</span>
        </button>
        <button class="nav-tab" data-tab="admin" id="adminTabBtn" style="display:none;" onclick="switchTab('admin')">
          <span>⚙️ Управление</span>
        </button>
      </nav>
    </header>

    <!-- VIEW 1: CATALOG (СКЛАД) -->
    <div id="viewCatalog">
      <!-- SEARCH -->
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" class="search-input" placeholder="Поиск: вкус, бренд, фасовка, артикул...">
        <button id="searchClear" class="search-clear">✕</button>
      </div>

      <!-- 1. CATEGORIES BAR -->
      <div class="filter-group">
        <div class="filter-label">
          <span>Категории</span>
        </div>
        <div class="chips-bar" id="categoriesBar"></div>
      </div>

      <!-- 2. BRAND BAR -->
      <div class="filter-group">
        <div class="filter-label">
          <span>Бренд</span>
        </div>
        <div class="chips-bar" id="brandsBar"></div>
      </div>

      <!-- 3. PACKAGING BAR & TOGGLE -->
      <div class="filter-group">
        <div class="filter-label">
          <span>Фасовка / Вес</span>
        </div>
        <div class="chips-bar" id="packagingsBar"></div>
      </div>

      <div class="stock-toggle-bar">
        <label class="stock-toggle">
          <input type="checkbox" id="inStockOnlyCheckbox" class="stock-checkbox" checked>
          <span>Только в наличии</span>
        </label>
        <div id="filterSummaryLabel" style="font-size:11px;"></div>
      </div>

      <!-- REGISTRY TABLE -->
      <div class="registry-header">
        <span>Номенклатура</span>
        <span>Склад / Заказ</span>
      </div>

      <div id="productsList" class="products-list">
        <div class="spinner"></div>
      </div>
    </div>

    <!-- VIEW 2: ORDERS (МОИ ЗАКАЗЫ) -->
    <div id="viewOrders" style="display:none;">
      <div class="sheet-section-title" style="margin-top:6px;">Мои накладные и заявки</div>
      <div id="ordersList" class="orders-container">
        <div class="spinner"></div>
      </div>
    </div>

    <!-- VIEW 3: VENUE & CONTACTS (О СКЛАДЕ) -->
    <div id="viewVenue" style="display:none;">
      <div class="action-card" style="margin-top:6px;">
        <div style="font-size:16px; font-weight:700;" id="venueInfoTitle">🏢 LV OPT • Оптовый склад</div>
        <div style="font-size:13px; color:var(--hint); line-height:1.4;" id="venueInfoDesc">
          Оптово-розничный терминал поставок табака, угля и аксессуаров. Прямые поставки от производителей.
        </div>
        <div style="margin-top:6px; font-size:12px; display:flex; flex-direction:column; gap:6px;">
          <div>📍 <b>Адрес отгрузки:</b> Основной склад заведения</div>
          <div>🕒 <b>Время сборки заказов:</b> Ежедневно с 12:00 до 02:00</div>
          <div>📞 <b>Контакты склада:</b> <span id="venueContactsText">Уточняйте у менеджера</span></div>
        </div>
      </div>
    </div>

    <!-- VIEW 4: ADMIN DASHBOARD (УПРАВЛЕНИЕ ДЛЯ ВЛАДЕЛЬЦА) -->
    <div id="viewAdmin" style="display:none;">
      <div class="stat-tiles" style="margin-top:6px;">
        <div class="stat-tile">
          <div class="stat-val" id="adminTotalProd">0</div>
          <div class="stat-lbl">Товаров</div>
        </div>
        <div class="stat-tile">
          <div class="stat-val" id="adminTotalOrders">0</div>
          <div class="stat-lbl">Заявок</div>
        </div>
        <div class="stat-tile">
          <div class="stat-val" id="adminTotalSales">0 ₽</div>
          <div class="stat-lbl">Выручка</div>
        </div>
      </div>

      <!-- 1-CLICK GOOGLE SHEETS SYNC -->
      <div class="action-card">
        <div style="font-size:14px; font-weight:700;">📊 Google Таблица Склада</div>
        <div style="font-size:11px; color:var(--hint);" id="sheetsSyncStatus">
          Синхронизация обновляет все категории, бренды, фасовки, цены и остатки.
        </div>
        <button id="btnAdminSync" class="btn-primary" onclick="triggerAdminSync()">
          <span>🔄</span> <span>Синхронизировать сейчас</span>
        </button>
      </div>

      <div class="sheet-section-title">Все заявки склада (Управление статусами)</div>
      <div id="adminOrdersList" class="orders-container">
        <div class="spinner"></div>
      </div>
    </div>
  </div>

  <!-- FLOATING CART BAR -->
  <div id="cartBar" class="cart-bar">
    <div class="cart-bar-left">
      <span class="cart-bar-count" id="cartCountLabel">0 поз.</span>
      <span class="cart-bar-total" id="cartTotalLabel">0 ₽</span>
    </div>
    <div class="cart-bar-btn">
      <span>Накладная</span>
      <span>➔</span>
    </div>
  </div>

  <!-- CHECKOUT MODAL SHEET -->
  <div id="checkoutModal" class="modal-overlay">
    <div class="modal-sheet">
      <div class="sheet-header">
        <div class="sheet-title">📋 Накладная заявки</div>
        <button id="modalClose" class="sheet-close">✕</button>
      </div>

      <div class="sheet-body">
        <div class="sheet-section-title">Состав заказа</div>
        <div id="modalItems" class="sheet-items-table"></div>

        <div class="sheet-section-title">Данные получателя</div>
        <div class="form-group">
          <label class="form-label">Заведение / Имя клиента *</label>
          <input type="text" id="orderName" class="form-input" placeholder="Например: Hookah Place / Иван" required>
        </div>
        <div class="form-group">
          <label class="form-label">Контактный телефон *</label>
          <input type="tel" id="orderPhone" class="form-input" placeholder="+7 (999) 000-00-00" required>
        </div>
        <div class="form-group">
          <label class="form-label">Комментарий к сборке (опционально)</label>
          <input type="text" id="orderComment" class="form-input" placeholder="Время отгрузки, пожелания по замене">
        </div>
      </div>

      <div class="sheet-footer">
        <div class="sheet-total-row">
          <span class="sheet-total-label">Сумма к оплате:</span>
          <span class="sheet-total-value" id="modalTotal">0 ₽</span>
        </div>
        <button id="btnSubmitOrder" class="btn-submit">
          <span>⚡️</span>
          <span>Отправить заказ на сборку</span>
        </button>
      </div>
    </div>
  </div>

  <script>
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try { tg.enableClosingConfirmation(); } catch (e) {}
    }

    function haptic(type = 'light') {
      try {
        if (tg?.HapticFeedback) {
          if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
          else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
          else tg.HapticFeedback.impactOccurred('light');
        }
      } catch (e) {}
    }

    // STATE
    let allProducts = [];
    let allCategories = [];
    let allBrands = [];
    let allPackagings = [];

    let currentTab = 'catalog';
    let selectedCategory = 'all';
    let selectedBrand = 'all';
    let selectedPackaging = 'all';
    let inStockOnly = true;
    let searchQuery = '';

    let isUserAdmin = false;
    let currentUserId = tg?.initDataUnsafe?.user?.id || Number(localStorage.getItem('lv_user_id') || Date.now());
    localStorage.setItem('lv_user_id', currentUserId);

    // Cart: Map<productId, { product, qty }>
    const cart = new Map();

    // TAB SWITCHER
    window.switchTab = function(tabId) {
      haptic('light');
      currentTab = tabId;
      document.querySelectorAll('.nav-tab').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
      });
      document.getElementById('viewCatalog').style.display = tabId === 'catalog' ? 'block' : 'none';
      document.getElementById('viewOrders').style.display = tabId === 'orders' ? 'block' : 'none';
      document.getElementById('viewVenue').style.display = tabId === 'venue' ? 'block' : 'none';
      document.getElementById('viewAdmin').style.display = tabId === 'admin' ? 'block' : 'none';

      updateCartBar();

      if (tabId === 'orders') loadOrders();
      if (tabId === 'admin') loadAdminDashboard();
    };

    // 1. LOAD INITIAL DATA
    async function initTerminal() {
      await loadInfo();
      await loadCatalog();
    }

    async function loadInfo() {
      try {
        const res = await fetch('/api/info?userId=' + currentUserId);
        const data = await res.json();
        if (data.success) {
          isUserAdmin = data.isAdmin;
          if (isUserAdmin) {
            document.getElementById('adminTabBtn').style.display = 'flex';
          }
          if (data.venue) {
            document.getElementById('venueName').innerText = data.venue;
            document.getElementById('venueInfoTitle').innerText = '🏢 ' + data.venue + ' • Оптовый склад';
          }
          if (data.contacts) {
            document.getElementById('venueContactsText').innerText = data.contacts;
          }
          if (data.sheetsLastSync) {
            document.getElementById('sheetsSyncStatus').innerText = 'Последняя синхронизация: ' + data.sheetsLastSync;
          }
        }
      } catch (e) {}
    }

    async function loadCatalog() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        allProducts = data.products || [];
        allCategories = data.categories || [];
        allBrands = data.brands || [];
        allPackagings = data.packagings || [];

        document.getElementById('posCountLabel').innerText = allProducts.length + ' поз.';

        renderCategories();
        renderBrands();
        renderPackagings();
        renderProducts();

        const user = tg?.initDataUnsafe?.user;
        if (user) {
          const nameField = document.getElementById('orderName');
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          if (fullName && !nameField.value) nameField.value = fullName;
        }
      } catch (err) {
        document.getElementById('productsList').innerHTML = '<div class="empty-state">❌ Ошибка связи со складом</div>';
      }
    }

    // RENDER CATEGORIES
    function renderCategories() {
      const bar = document.getElementById('categoriesBar');
      let html = '<div class="chip ' + (selectedCategory === 'all' ? 'active' : '') + '" data-val="all">Все категории</div>';
      const topCategories = allCategories.filter(c => !c.parent_id);
      topCategories.forEach(c => {
        const active = selectedCategory == c.id ? 'active' : '';
        html += '<div class="chip ' + active + '" data-val="' + c.id + '">' + c.name + '</div>';
      });

      bar.innerHTML = html;
      bar.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
          haptic();
          selectedCategory = chip.getAttribute('data-val');
          bar.querySelectorAll('.chip').forEach(ch => ch.classList.remove('active'));
          chip.classList.add('active');
          renderProducts();
        });
      });
    }

    // RENDER BRANDS
    function renderBrands() {
      const bar = document.getElementById('brandsBar');
      let html = '<div class="chip ' + (selectedBrand === 'all' ? 'active' : '') + '" data-val="all">Все бренды</div>';
      const brandSet = new Set(allBrands);
      allProducts.forEach(p => {
        if (p.brand && p.brand.trim()) brandSet.add(p.brand.trim());
      });

      Array.from(brandSet).sort().forEach(b => {
        const active = selectedBrand === b ? 'active' : '';
        html += '<div class="chip ' + active + '" data-val="' + b + '">' + b + '</div>';
      });

      bar.innerHTML = html;
      bar.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
          haptic();
          selectedBrand = chip.getAttribute('data-val');
          bar.querySelectorAll('.chip').forEach(ch => ch.classList.remove('active'));
          chip.classList.add('active');
          renderProducts();
        });
      });
    }

    // RENDER PACKAGINGS
    function renderPackagings() {
      const bar = document.getElementById('packagingsBar');
      let html = '<div class="chip ' + (selectedPackaging === 'all' ? 'active' : '') + '" data-val="all">Все</div>';
      const packSet = new Set(allPackagings);
      allProducts.forEach(p => {
        if (p.packaging && p.packaging.trim()) packSet.add(p.packaging.trim());
      });

      Array.from(packSet).sort().forEach(pk => {
        const active = selectedPackaging === pk ? 'active' : '';
        html += '<div class="chip ' + active + '" data-val="' + pk + '">' + pk + '</div>';
      });

      bar.innerHTML = html;
      bar.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
          haptic();
          selectedPackaging = chip.getAttribute('data-val');
          bar.querySelectorAll('.chip').forEach(ch => ch.classList.remove('active'));
          chip.classList.add('active');
          renderProducts();
        });
      });
    }

    // RENDER PRODUCTS
    function renderProducts() {
      const container = document.getElementById('productsList');
      const q = searchQuery.toLowerCase().trim();

      const filtered = allProducts.filter(p => {
        if (inStockOnly && p.stock <= 0) return false;

        if (selectedCategory !== 'all') {
          const catId = Number(selectedCategory);
          const childIds = allCategories.filter(c => c.parent_id === catId).map(c => c.id);
          childIds.push(catId);
          if (!childIds.includes(p.category_id)) return false;
        }

        if (selectedBrand !== 'all') {
          if (!p.brand || p.brand.toLowerCase() !== selectedBrand.toLowerCase()) return false;
        }

        if (selectedPackaging !== 'all') {
          if (!p.packaging || p.packaging.toLowerCase() !== selectedPackaging.toLowerCase()) return false;
        }

        if (q) {
          const matchName = (p.name || '').toLowerCase().includes(q);
          const matchBrand = (p.brand || '').toLowerCase().includes(q);
          const matchPack = (p.packaging || '').toLowerCase().includes(q);
          const matchSku = (p.sku || '').toLowerCase().includes(q);
          const matchCat = (p.category_name || '').toLowerCase().includes(q);
          if (!matchName && !matchBrand && !matchPack && !matchSku && !matchCat) return false;
        }

        return true;
      });

      document.getElementById('filterSummaryLabel').innerText = filtered.length + ' из ' + allProducts.length;

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>По запросу ничего не найдено</div>';
        return;
      }

      let html = '';
      filtered.forEach(p => {
        const inCart = cart.get(p.id);
        const qty = inCart ? inCart.qty : 0;
        const rowClass = qty > 0 ? 'product-row has-qty' : 'product-row';

        let stockBadge = '<span class="stock-badge ok">● ' + p.stock + ' шт.</span>';
        if (p.stock <= 0) stockBadge = '<span class="stock-badge out">○ Нет на складе</span>';
        else if (p.stock <= 3) stockBadge = '<span class="stock-badge low">● ' + p.stock + ' шт. (мало)</span>';

        html += '<div class="' + rowClass + '">';
        html += '  <div class="product-main">';
        html += '    <div class="product-header-line">';
        if (p.brand) html += '      <span class="brand-tag">' + p.brand + '</span>';
        if (p.packaging) html += '      <span class="pack-tag">' + p.packaging + '</span>';
        html += '    </div>';
        html += '    <div class="product-title">' + p.name + '</div>';
        html += '    <div class="product-meta-line">';
        html += '      <span class="product-price">' + p.price + ' ₽</span>';
        html += '      ' + stockBadge;
        html += '    </div>';
        html += '  </div>';

        html += '  <div class="product-action">';
        if (p.stock <= 0) {
          html += '    <button class="btn-add" style="opacity:0.4; cursor:not-allowed;" disabled>Нет</button>';
        } else if (qty === 0) {
          html += '    <button class="btn-add" onclick="addToCart(' + p.id + ')">+ В заказ</button>';
        } else {
          html += '    <div class="stepper">';
          html += '      <button class="btn-step" onclick="changeQty(' + p.id + ', -1)">−</button>';
          html += '      <span class="step-qty">' + qty + '</span>';
          html += '      <button class="btn-step" onclick="changeQty(' + p.id + ', 1)">+</button>';
          html += '    </div>';
        }
        html += '  </div>';
        html += '</div>';
      });

      container.innerHTML = html;
    }

    // CART LOGIC
    window.addToCart = function(id) {
      haptic('medium');
      const p = allProducts.find(x => x.id === id);
      if (!p) return;
      cart.set(id, { product: p, qty: 1 });
      updateCartBar();
      renderProducts();
    };

    window.changeQty = function(id, delta) {
      haptic('light');
      const item = cart.get(id);
      if (!item) return;
      item.qty += delta;
      if (item.qty <= 0) {
        cart.delete(id);
      } else if (item.qty > item.product.stock) {
        item.qty = item.product.stock;
        if (tg?.showAlert) tg.showAlert('Достигнут предел остатка: ' + item.product.stock + ' шт.');
      }
      updateCartBar();
      renderProducts();
    };

    function updateCartBar() {
      let uniqueCount = cart.size;
      let totalPieces = 0;
      let totalSum = 0;

      cart.forEach(v => {
        totalPieces += v.qty;
        totalSum += v.qty * v.product.price;
      });

      const bar = document.getElementById('cartBar');
      if (uniqueCount > 0 && currentTab === 'catalog') {
        bar.style.display = 'flex';
        document.getElementById('cartCountLabel').innerText = uniqueCount + ' поз. (' + totalPieces + ' шт.)';
        document.getElementById('cartTotalLabel').innerText = totalSum + ' ₽';
      } else {
        bar.style.display = 'none';
      }
    }

    // 2. ORDERS VIEW (ИСТОРИЯ ЗАКАЗОВ)
    async function loadOrders() {
      const container = document.getElementById('ordersList');
      container.innerHTML = '<div class="spinner"></div>';

      try {
        const res = await fetch('/api/orders?userId=' + currentUserId);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const orders = data.orders || [];
        const activeCount = orders.filter(o => o.status === 'new' || o.status === 'in_progress').length;
        const badge = document.getElementById('ordersTabBadge');
        if (activeCount > 0) {
          badge.innerText = activeCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }

        if (orders.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>У вас пока нет оформленных заявок.<br><button class="btn-primary" style="margin:12px auto; display:inline-flex;" onclick="switchTab(\\'catalog\\')">📦 Перейти на склад</button></div>';
          return;
        }

        let html = '';
        orders.forEach(o => {
          let statusText = '🟢 Принят';
          let statusClass = 'status-new';
          if (o.status === 'in_progress') { statusText = '⏳ На сборке'; statusClass = 'status-in_progress'; }
          else if (o.status === 'completed') { statusText = '🔵 Готов к выдаче'; statusClass = 'status-completed'; }
          else if (o.status === 'cancelled') { statusText = '⚪️ Отменён'; statusClass = 'status-cancelled'; }

          html += '<div class="order-card">';
          html += '  <div class="order-card-header">';
          html += '    <div><span class="order-id">Накладная #' + o.id + '</span><span class="order-date">' + (o.createdAt || '') + '</span></div>';
          html += '    <span class="status-pill ' + statusClass + '">' + statusText + '</span>';
          html += '  </div>';

          html += '  <div class="order-items-box">';
          if (Array.isArray(o.items)) {
            o.items.forEach(it => {
              html += '    <div class="order-item-line"><span>' + it.name + ' × ' + it.quantity + ' шт.</span><span>' + (it.subtotal || (it.price * it.quantity)) + ' ₽</span></div>';
            });
          }
          if (o.comment && o.comment !== 'Без комментария') {
            html += '    <div style="font-size:11px; color:var(--hint); margin-top:3px;">💬 ' + o.comment + '</div>';
          }
          html += '  </div>';

          html += '  <div class="order-card-footer">';
          html += '    <span style="color:var(--hint);">Сумма накладной:</span>';
          html += '    <span class="order-total-sum">' + o.totalPrice + ' ₽</span>';
          html += '  </div>';
          html += '</div>';
        });

        container.innerHTML = html;
      } catch (err) {
        container.innerHTML = '<div class="empty-state">❌ Ошибка загрузки заявок</div>';
      }
    }

    // 3. ADMIN DASHBOARD
    async function loadAdminDashboard() {
      const container = document.getElementById('adminOrdersList');
      container.innerHTML = '<div class="spinner"></div>';

      try {
        const infoRes = await fetch('/api/info?userId=' + currentUserId);
        const info = await infoRes.json();
        if (info.stats) {
          document.getElementById('adminTotalProd').innerText = info.stats.productsCount;
          document.getElementById('adminTotalOrders').innerText = info.stats.ordersCount;
          document.getElementById('adminTotalSales').innerText = info.stats.totalSales + ' ₽';
        }
        if (info.sheetsLastSync) {
          document.getElementById('sheetsSyncStatus').innerText = 'Последняя синхронизация: ' + info.sheetsLastSync;
        }

        const ordersRes = await fetch('/api/orders?userId=' + currentUserId);
        const ordersData = await ordersRes.json();
        const orders = ordersData.orders || [];

        if (orders.length === 0) {
          container.innerHTML = '<div class="empty-state">Заявок пока нет</div>';
          return;
        }

        let html = '';
        orders.forEach(o => {
          let statusText = '🟢 Принят';
          let statusClass = 'status-new';
          if (o.status === 'in_progress') { statusText = '⏳ В работе'; statusClass = 'status-in_progress'; }
          else if (o.status === 'completed') { statusText = '✅ Выполнен'; statusClass = 'status-completed'; }
          else if (o.status === 'cancelled') { statusText = '⚪️ Отменён'; statusClass = 'status-cancelled'; }

          html += '<div class="order-card">';
          html += '  <div class="order-card-header">';
          html += '    <div><span class="order-id">#' + o.id + ' • ' + (o.userName || 'Клиент') + '</span><span class="order-date">' + (o.phone || '') + '</span></div>';
          html += '    <span class="status-pill ' + statusClass + '">' + statusText + '</span>';
          html += '  </div>';

          html += '  <div class="order-items-box">';
          if (Array.isArray(o.items)) {
            o.items.forEach(it => {
              html += '    <div class="order-item-line"><span>' + it.name + ' × ' + it.quantity + ' шт.</span><span>' + (it.subtotal || (it.price * it.quantity)) + ' ₽</span></div>';
            });
          }
          if (o.comment && o.comment !== 'Без комментария') {
            html += '    <div style="font-size:11px; color:var(--hint); margin-top:3px;">💬 ' + o.comment + '</div>';
          }
          html += '  </div>';

          html += '  <div class="order-card-footer">';
          html += '    <span style="color:var(--hint);">Сумма:</span>';
          html += '    <span class="order-total-sum">' + o.totalPrice + ' ₽</span>';
          html += '  </div>';

          // Action buttons for admin
          html += '  <div class="admin-actions-row">';
          html += '    <button class="btn-status" onclick="setOrderStatus(' + o.id + ', \\'in_progress\\')">⏳ В работу</button>';
          html += '    <button class="btn-status" onclick="setOrderStatus(' + o.id + ', \\'completed\\')">✅ Готов</button>';
          html += '    <button class="btn-status" onclick="setOrderStatus(' + o.id + ', \\'cancelled\\')">❌ Отмена</button>';
          html += '  </div>';
          html += '</div>';
        });

        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="empty-state">Ошибка загрузки панели</div>';
      }
    }

    window.setOrderStatus = async function(orderId, status) {
      haptic('medium');
      try {
        const res = await fetch('/api/orders/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, status, userId: currentUserId })
        });
        const ans = await res.json();
        if (ans.success) {
          haptic('success');
          loadAdminDashboard();
        } else {
          alert('Ошибка: ' + (ans.error || 'не удалось обновить'));
        }
      } catch (e) {
        alert('Ошибка связи');
      }
    };

    window.triggerAdminSync = async function() {
      haptic('medium');
      const btn = document.getElementById('btnAdminSync');
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> <span>Синхронизация Google Таблицы...</span>';

      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId })
        });
        const ans = await res.json();
        if (ans.success) {
          haptic('success');
          if (tg?.showAlert) tg.showAlert('✅ Склад успешно синхронизирован! Товаров: ' + (ans.count || allProducts.length));
          else alert('✅ Синхронизировано товаров: ' + (ans.count || allProducts.length));
          await loadCatalog();
          await loadAdminDashboard();
        } else {
          alert('Ошибка синхронизации: ' + (ans.error || 'сбой'));
        }
      } catch (e) {
        alert('Ошибка соединения с сервером');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔄</span> <span>Синхронизировать сейчас</span>';
      }
    };

    // SEARCH LISTENERS
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      searchClear.style.display = searchQuery ? 'block' : 'none';
      renderProducts();
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.style.display = 'none';
      renderProducts();
    });

    // STOCK TOGGLE
    document.getElementById('inStockOnlyCheckbox').addEventListener('change', (e) => {
      haptic();
      inStockOnly = e.target.checked;
      renderProducts();
    });

    // CHECKOUT MODAL
    document.getElementById('cartBar').addEventListener('click', () => {
      haptic('medium');
      openCheckoutModal();
    });
    document.getElementById('modalClose').addEventListener('click', () => {
      document.getElementById('checkoutModal').style.display = 'none';
    });

    function openCheckoutModal() {
      const itemsContainer = document.getElementById('modalItems');
      let html = '';
      let totalSum = 0;

      cart.forEach(v => {
        const subtotal = v.qty * v.product.price;
        totalSum += subtotal;
        html += '<div class="sheet-item">';
        html += '  <div style="flex:1; padding-right:8px;">';
        if (v.product.brand) {
          html += '    <span style="font-size:10px; color:var(--accent); font-weight:700;">' + v.product.brand + ' </span>';
        }
        html += '    <b>' + v.product.name + '</b>';
        html += '    <div style="font-size:11px; color:var(--hint);">' + (v.product.packaging || '') + ' • ' + v.product.price + ' ₽/шт</div>';
        html += '  </div>';
        html += '  <div style="display:flex; align-items:center; gap:8px;">';
        html += '    <div class="stepper">';
        html += '      <button class="btn-step" onclick="changeQty(' + v.product.id + ', -1); openCheckoutModal();">−</button>';
        html += '      <span class="step-qty">' + v.qty + '</span>';
        html += '      <button class="btn-step" onclick="changeQty(' + v.product.id + ', 1); openCheckoutModal();">+</button>';
        html += '    </div>';
        html += '    <div style="min-width:55px; text-align:right; font-weight:700;">' + subtotal + ' ₽</div>';
        html += '  </div>';
        html += '</div>';
      });

      itemsContainer.innerHTML = html;
      document.getElementById('modalTotal').innerText = totalSum + ' ₽';
      document.getElementById('checkoutModal').style.display = 'flex';
    }

    // SUBMIT ORDER
    document.getElementById('btnSubmitOrder').addEventListener('click', async () => {
      haptic('medium');
      const name = document.getElementById('orderName').value.trim();
      const phone = document.getElementById('orderPhone').value.trim();
      const comment = document.getElementById('orderComment').value.trim();

      if (!phone) {
        if (tg?.showAlert) tg.showAlert('Пожалуйста, укажите контактный номер телефона.');
        else alert('Пожалуйста, укажите номер телефона.');
        return;
      }

      const items = [];
      cart.forEach((v, id) => {
        items.push({ id, name: v.product.name, price: v.product.price, quantity: v.qty });
      });

      const orderPayload = { name, phone, comment, items, userId: currentUserId };

      // 1. Telegram WebApp sendData
      try {
        if (tg && tg.sendData) {
          haptic('success');
          tg.sendData(JSON.stringify(orderPayload));
          cart.clear();
          updateCartBar();
          document.getElementById('checkoutModal').style.display = 'none';
          return;
        }
      } catch (err) {}

      // 2. REST API Fallback
      try {
        const res = await fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });
        const ans = await res.json();
        if (ans.success) {
          haptic('success');
          cart.clear();
          updateCartBar();
          document.getElementById('checkoutModal').style.display = 'none';
          if (tg?.showAlert) {
            tg.showAlert('✅ Заявка #' + ans.orderId + ' на сумму ' + ans.total + ' ₽ принята на сборку!', () => {
              switchTab('orders');
            });
          } else {
            alert('✅ Заявка #' + ans.orderId + ' оформлена!');
            switchTab('orders');
          }
        } else {
          alert('Ошибка склада: ' + (ans.error || 'не удалось сохранить'));
        }
      } catch (err) {
        alert('Ошибка связи с сервером.');
      }
    });

    initTerminal();
  </script>
</body>
</html>`;
}
