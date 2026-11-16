export function getWebAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>МойСклад • Терминал заказов</title>
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
      padding-top: calc(var(--safe-top) + 10px);
      padding-bottom: calc(var(--safe-bottom) + 85px);
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
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 12px;
    }

    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0 10px 0;
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
      font-size: 17px;
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

    /* SEARCH BAR */
    .search-box {
      position: relative;
      margin-bottom: 8px;
    }

    .search-input {
      width: 100%;
      height: 40px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0 36px 0 36px;
      color: var(--text);
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }

    .search-input:focus {
      border-color: var(--btn-bg);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
    }

    .search-icon {
      position: absolute;
      left: 11px;
      top: 11px;
      font-size: 15px;
      color: var(--hint);
    }

    .search-clear {
      position: absolute;
      right: 10px;
      top: 9px;
      background: none;
      border: none;
      color: var(--hint);
      font-size: 18px;
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
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .chips-bar {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none;
    }
    .chips-bar::-webkit-scrollbar { display: none; }

    .chip {
      white-space: nowrap;
      padding: 5px 11px;
      border-radius: 8px;
      background: var(--card-bg);
      color: var(--text);
      font-size: 12px;
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
      padding: 4px 0;
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
      width: 16px;
      height: 16px;
      accent-color: var(--btn-bg);
      cursor: pointer;
    }

    /* REGISTRY TABLE LIST (MOYSKLAD STYLE) */
    .registry-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 4px 8px 4px;
      font-size: 11px;
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
      border-radius: 10px;
      padding: 10px 12px;
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
      margin-bottom: 3px;
    }

    .brand-tag {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.25);
    }

    .pack-tag {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--hint);
    }

    .product-title {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.3;
      word-break: break-word;
    }

    .product-meta-line {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
      font-size: 12px;
    }

    .product-price {
      font-weight: 700;
      font-size: 14px;
      color: #fff;
    }

    .stock-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
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
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
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
      border-radius: 8px;
      overflow: hidden;
    }

    .btn-step {
      background: none;
      border: none;
      color: var(--text);
      width: 32px;
      height: 32px;
      font-size: 17px;
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
      min-width: 28px;
      text-align: center;
      font-size: 14px;
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
      border-radius: 14px;
      padding: 12px 18px;
      display: none;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.5), 0 8px 10px -6px rgba(37, 99, 235, 0.3);
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
      font-size: 12px;
      opacity: 0.9;
      font-weight: 500;
    }

    .cart-bar-total {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }

    .cart-bar-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.2);
      padding: 8px 14px;
      border-radius: 10px;
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
      border-radius: 20px 20px 0 0;
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
      padding: 16px 20px 12px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .sheet-title {
      font-size: 18px;
      font-weight: 700;
    }

    .sheet-close {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--hint);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      cursor: pointer;
    }

    .sheet-body {
      padding: 16px 20px;
      overflow-y: auto;
      flex: 1;
    }

    .sheet-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--hint);
      margin-bottom: 8px;
    }

    .sheet-items-table {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .sheet-item {
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .sheet-item:last-child { border-bottom: none; }

    .form-group {
      margin-bottom: 12px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 5px;
      color: var(--hint);
    }

    .form-input {
      width: 100%;
      height: 42px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0 14px;
      color: var(--text);
      font-size: 14px;
      outline: none;
    }
    .form-input:focus {
      border-color: var(--btn-bg);
    }

    .sheet-footer {
      padding: 14px 20px calc(var(--safe-bottom) + 14px) 20px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    .sheet-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .sheet-total-label {
      font-size: 14px;
      color: var(--hint);
    }

    .sheet-total-value {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
    }

    .btn-submit {
      width: 100%;
      height: 48px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.4);
    }

    .btn-submit:active {
      transform: scale(0.98);
    }

    /* EMPTY STATE & SPINNER */
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--hint);
    }
    .empty-icon {
      font-size: 36px;
      margin-bottom: 10px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin: 40px auto;
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

      <!-- SEARCH BOX -->
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" class="search-input" placeholder="Поиск по вкусу, бренду или фасовке..." autocomplete="off">
        <button id="searchClear" class="search-clear">✕</button>
      </div>

      <!-- 1. CATEGORIES BAR -->
      <div class="filter-group">
        <div class="chips-bar" id="categoriesBar"></div>
      </div>

      <!-- 2. BRANDS BAR -->
      <div class="filter-group">
        <div class="filter-label">
          <span>Бренд</span>
          <span id="activeBrandCount" style="color:var(--accent);"></span>
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
          <span>Только позиции в наличии</span>
        </label>
        <div id="filterSummaryLabel" style="font-size:11px;"></div>
      </div>
    </header>

    <!-- REGISTRY TABLE -->
    <div class="registry-header">
      <span>Номенклатура</span>
      <span>Склад / Заказ</span>
    </div>

    <div id="productsList" class="products-list">
      <div class="spinner"></div>
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

    let selectedCategory = 'all';
    let selectedBrand = 'all';
    let selectedPackaging = 'all';
    let inStockOnly = true;
    let searchQuery = '';

    // Cart: Map<productId, { product, qty }>
    const cart = new Map();

    async function loadCatalog() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        allProducts = data.products || [];
        allCategories = data.categories || [];
        allBrands = data.brands || [];
        allPackagings = data.packagings || [];

        document.getElementById('venueName').innerText = data.venue || 'LV Lounge';
        document.getElementById('posCountLabel').innerText = allProducts.length + ' позиций';

        renderCategories();
        renderBrands();
        renderPackagings();
        renderProducts();

        // Автозаполнение имени из Telegram
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

    // 1. RENDER CATEGORIES
    function renderCategories() {
      const bar = document.getElementById('categoriesBar');
      let html = '<div class="chip ' + (selectedCategory === 'all' ? 'active' : '') + '" data-val="all">Все категории</div>';

      // Выделяем верхнеуровневые разделы
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

    // 2. RENDER BRANDS
    function renderBrands() {
      const bar = document.getElementById('brandsBar');
      let html = '<div class="chip ' + (selectedBrand === 'all' ? 'active' : '') + '" data-val="all">Все бренды</div>';

      // Если бренды не были заполнены отдельно, собираем уникальные из товаров
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

    // 3. RENDER PACKAGINGS
    function renderPackagings() {
      const bar = document.getElementById('packagingsBar');
      let html = '<div class="chip ' + (selectedPackaging === 'all' ? 'active' : '') + '" data-val="all">Все фасовки</div>';

      const packSet = new Set(allPackagings);
      allProducts.forEach(p => {
        if (p.packaging && p.packaging.trim()) packSet.add(p.packaging.trim());
      });

      Array.from(packSet).sort().forEach(pack => {
        const active = selectedPackaging === pack ? 'active' : '';
        html += '<div class="chip ' + active + '" data-val="' + pack + '">' + pack + '</div>';
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
      const list = document.getElementById('productsList');
      const q = searchQuery.toLowerCase().trim();

      const filtered = allProducts.filter(p => {
        // Фильтр остатков
        if (inStockOnly && p.stock <= 0) return false;

        // Фильтр категорий
        if (selectedCategory !== 'all') {
          const matchCat = (p.category_id == selectedCategory) || (p.path && p.path.includes(selectedCategory));
          if (!matchCat) return false;
        }

        // Фильтр брендов
        if (selectedBrand !== 'all') {
          if (!p.brand || p.brand.toLowerCase() !== selectedBrand.toLowerCase()) return false;
        }

        // Фильтр фасовок
        if (selectedPackaging !== 'all') {
          if (!p.packaging || p.packaging.toLowerCase() !== selectedPackaging.toLowerCase()) return false;
        }

        // Поисковый запрос
        if (q) {
          const brandText = (p.brand || '').toLowerCase();
          const nameText = p.name.toLowerCase();
          const packText = (p.packaging || '').toLowerCase();
          const skuText = (p.sku || '').toLowerCase();
          const catText = (p.category_name || '').toLowerCase();

          const fullMatch = brandText.includes(q) || nameText.includes(q) || packText.includes(q) || skuText.includes(q) || catText.includes(q);
          if (!fullMatch) return false;
        }

        return true;
      });

      document.getElementById('filterSummaryLabel').innerText = 'Найдено: ' + filtered.length + ' поз.';

      if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div>Позиций с такими фильтрами не найдено</div></div>';
        return;
      }

      let html = '';
      filtered.forEach(p => {
        const inCart = cart.get(p.id);
        const qty = inCart ? inCart.qty : 0;
        const inStock = p.stock > 0;

        let stockClass = 'ok';
        let stockLabel = p.stock + ' шт.';
        if (!inStock) {
          stockClass = 'out';
          stockLabel = 'Нет на складе';
        } else if (p.stock <= 3) {
          stockClass = 'low';
          stockLabel = p.stock + ' шт. (мало)';
        }

        html += '<div class="product-row ' + (qty > 0 ? 'has-qty' : '') + '">';
        html += '  <div class="product-main">';
        html += '    <div class="product-header-line">';
        if (p.brand) {
          html += '      <span class="brand-tag">' + p.brand + '</span>';
        }
        if (p.packaging) {
          html += '      <span class="pack-tag">' + p.packaging + '</span>';
        }
        if (p.sku) {
          html += '      <span style="font-size:10px; color:var(--hint);">#' + p.sku + '</span>';
        }
        html += '    </div>';
        html += '    <div class="product-title">' + p.name + '</div>';
        html += '    <div class="product-meta-line">';
        html += '      <span class="product-price">' + p.price + ' ₽</span>';
        html += '      <span style="color:var(--border);">•</span>';
        html += '      <span class="stock-badge ' + stockClass + '">● ' + stockLabel + '</span>';
        html += '    </div>';
        html += '  </div>';

        html += '  <div class="product-action">';
        if (!inStock) {
          html += '<span style="font-size:11px; color:var(--hint);">Закончился</span>';
        } else if (qty === 0) {
          html += '<button class="btn-add" onclick="addToCart(' + p.id + ')">+ В заказ</button>';
        } else {
          html += '<div class="stepper">';
          html += '  <button class="btn-step" onclick="changeQty(' + p.id + ', -1)">−</button>';
          html += '  <span class="step-qty">' + qty + '</span>';
          html += '  <button class="btn-step" onclick="changeQty(' + p.id + ', 1)">+</button>';
          html += '</div>';
        }
        html += '  </div>';
        html += '</div>';
      });

      list.innerHTML = html;
    }

    // CART ACTIONS
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
        if (tg?.showAlert) tg.showAlert('Достигнут предел остатка на складе: ' + item.product.stock + ' шт.');
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
      if (uniqueCount > 0) {
        bar.style.display = 'flex';
        document.getElementById('cartCountLabel').innerText = uniqueCount + ' поз. (' + totalPieces + ' шт.)';
        document.getElementById('cartTotalLabel').innerText = totalSum + ' ₽';
      } else {
        bar.style.display = 'none';
      }
    }

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

    // MODAL SHEET
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
        html += '  <div style="flex:1; padding-right:10px;">';
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
        html += '    <div style="min-width:60px; text-align:right; font-weight:700;">' + subtotal + ' ₽</div>';
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

      const orderPayload = { name, phone, comment, items };

      // 1. Telegram WebApp sendData
      try {
        if (tg && tg.sendData) {
          haptic('success');
          tg.sendData(JSON.stringify(orderPayload));
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
          if (tg?.showAlert) {
            tg.showAlert('✅ Заявка #' + ans.orderId + ' на сумму ' + ans.total + ' ₽ принята на сборку!', () => tg.close());
          } else {
            alert('✅ Заявка оформлена!');
            window.location.reload();
          }
        } else {
          alert('Ошибка склада: ' + (ans.error || 'не удалось сохранить'));
        }
      } catch (err) {
        alert('Ошибка связи с сервером.');
      }
    });

    loadCatalog();
  </script>
</body>
</html>`;
}
