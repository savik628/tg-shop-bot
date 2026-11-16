export function getWebAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Каталог и Склад</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      --bg: var(--tg-theme-bg-color, #0f172a);
      --text: var(--tg-theme-text-color, #f8fafc);
      --hint: var(--tg-theme-hint-color, #94a3b8);
      --card-bg: var(--tg-theme-secondary-bg-color, #1e293b);
      --btn-bg: var(--tg-theme-button-color, #3b82f6);
      --btn-text: var(--tg-theme-button-text-color, #ffffff);
      --accent: #38bdf8;
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
      padding-top: calc(var(--safe-top) + 12px);
      padding-bottom: calc(var(--safe-bottom) + 90px);
      min-height: 100vh;
      overflow-x: hidden;
    }

    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 0 16px;
    }

    /* HEADER & SEARCH */
    .header {
      position: sticky;
      top: 0;
      z-index: 40;
      background: var(--bg);
      backdrop-filter: blur(12px);
      padding-bottom: 8px;
    }

    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .venue-title {
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .venue-badge {
      font-size: 11px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;
    }

    .search-box {
      position: relative;
      margin-bottom: 12px;
    }

    .search-input {
      width: 100%;
      height: 42px;
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 0 38px 0 38px;
      color: var(--text);
      font-size: 15px;
      outline: none;
      transition: all 0.2s;
    }

    .search-input:focus {
      border-color: var(--btn-bg);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 12px;
      font-size: 16px;
      color: var(--hint);
    }

    .search-clear {
      position: absolute;
      right: 12px;
      top: 10px;
      background: none;
      border: none;
      color: var(--hint);
      font-size: 18px;
      cursor: pointer;
      display: none;
    }

    /* CATEGORY CHIPS */
    .categories-bar {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none;
    }
    .categories-bar::-webkit-scrollbar { display: none; }

    .cat-chip {
      white-space: nowrap;
      padding: 7px 14px;
      border-radius: 20px;
      background: var(--card-bg);
      color: var(--text);
      font-size: 13px;
      font-weight: 500;
      border: 1px solid rgba(255, 255, 255, 0.05);
      cursor: pointer;
      transition: all 0.2s;
    }

    .cat-chip.active {
      background: var(--btn-bg);
      color: var(--btn-text);
      font-weight: 600;
      border-color: var(--btn-bg);
    }

    /* PRODUCTS LIST */
    .products-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 14px;
    }

    .product-card {
      background: var(--card-bg);
      border-radius: 14px;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: transform 0.1s;
    }

    .product-info {
      flex: 1;
      padding-right: 12px;
    }

    .product-name {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.3;
      margin-bottom: 4px;
    }

    .product-path {
      font-size: 12px;
      color: var(--hint);
      margin-bottom: 6px;
    }

    .product-price {
      font-size: 16px;
      font-weight: 700;
      color: var(--accent);
    }

    .product-stock {
      font-size: 11px;
      color: #10b981;
      margin-left: 6px;
      font-weight: 500;
    }
    .product-stock.out {
      color: #ef4444;
    }

    /* ACTIONS / COUNTERS */
    .product-action {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-add {
      background: var(--btn-bg);
      color: var(--btn-text);
      border: none;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn-add:active { opacity: 0.8; }

    .stepper {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 10px;
      padding: 4px 6px;
    }

    .btn-step {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: none;
      background: var(--btn-bg);
      color: var(--btn-text);
      font-size: 16px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .btn-step:active { opacity: 0.7; }

    .step-qty {
      font-size: 14px;
      font-weight: 700;
      min-width: 18px;
      text-align: center;
    }

    /* EMPTY STATE */
    .empty-state {
      text-align: center;
      padding: 40px 16px;
      color: var(--hint);
    }
    .empty-icon { font-size: 40px; margin-bottom: 10px; }

    /* FLOATING BOTTOM CART BAR */
    .cart-bar {
      position: fixed;
      bottom: calc(var(--safe-bottom) + 12px);
      left: 16px;
      right: 16px;
      max-width: 568px;
      margin: 0 auto;
      background: var(--btn-bg);
      color: var(--btn-text);
      border-radius: 14px;
      padding: 14px 20px;
      display: none;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
      z-index: 50;
      cursor: pointer;
      font-weight: 600;
      animation: slideUp 0.25s ease-out;
    }

    @keyframes slideUp {
      from { transform: translateY(100px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* CHECKOUT MODAL DIALOG */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: none;
      align-items: flex-end;
    }

    .modal-sheet {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background: var(--card-bg);
      border-radius: 20px 20px 0 0;
      padding: 20px 20px calc(var(--safe-bottom) + 24px) 20px;
      max-height: 85vh;
      overflow-y: auto;
      animation: sheetUp 0.25s ease-out;
    }

    @keyframes sheetUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .sheet-title {
      font-size: 18px;
      font-weight: 700;
    }

    .sheet-close {
      background: none;
      border: none;
      color: var(--hint);
      font-size: 20px;
      cursor: pointer;
    }

    .sheet-cart-items {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
      max-height: 200px;
      overflow-y: auto;
    }

    .sheet-item {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .form-group {
      margin-bottom: 12px;
    }

    .form-label {
      font-size: 12px;
      color: var(--hint);
      margin-bottom: 4px;
      display: block;
      font-weight: 500;
    }

    .form-input {
      width: 100%;
      height: 42px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 0 12px;
      color: var(--text);
      font-size: 14px;
      outline: none;
    }

    .btn-submit {
      width: 100%;
      height: 48px;
      background: var(--btn-bg);
      color: var(--btn-text);
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      margin-top: 14px;
      cursor: pointer;
    }
    .btn-submit:active { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="container">
    <!-- STICKY HEADER -->
    <div class="header">
      <div class="top-bar">
        <div class="venue-title">
          <span id="venueName">LV Lounge</span>
          <span class="venue-badge">Склад</span>
        </div>
        <div id="statsCount" style="font-size: 12px; color: var(--hint);">...</div>
      </div>

      <!-- SEARCH BAR -->
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" class="search-input" placeholder="Поиск вкуса, табака, чаши...">
        <button id="searchClear" class="search-clear">✕</button>
      </div>

      <!-- CATEGORIES TABS -->
      <div class="categories-bar" id="categoriesBar">
        <div class="cat-chip active" data-cat="all">Все товары</div>
      </div>
    </div>

    <!-- PRODUCTS LIST -->
    <div class="products-list" id="productsList">
      <div class="empty-state">
        <div class="empty-icon">⏳</div>
        <div>Загрузка каталога...</div>
      </div>
    </div>
  </div>

  <!-- FLOATING BOTTOM CART BAR -->
  <div class="cart-bar" id="cartBar">
    <div style="display:flex; align-items:center; gap:8px;">
      <span>🛒</span>
      <span id="cartCountLabel">0 шт.</span>
    </div>
    <div id="cartTotalLabel">0 ₽</div>
  </div>

  <!-- CHECKOUT MODAL DIALOG -->
  <div class="modal-backdrop" id="checkoutModal">
    <div class="modal-sheet">
      <div class="sheet-header">
        <div class="sheet-title">Оформление заявки</div>
        <button class="sheet-close" id="modalClose">✕</button>
      </div>

      <div class="sheet-cart-items" id="modalItems"></div>

      <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 16px; margin-bottom: 16px;">
        <span>ИТОГО:</span>
        <span id="modalTotal" style="color: var(--accent);">0 ₽</span>
      </div>

      <div class="form-group">
        <label class="form-label">Ваше имя / Заведение</label>
        <input type="text" id="orderName" class="form-input" placeholder="Например: Мята Lounge или Алексей">
      </div>

      <div class="form-group">
        <label class="form-label">Номер телефона для связи</label>
        <input type="tel" id="orderPhone" class="form-input" placeholder="+7 (999) 000-00-00">
      </div>

      <div class="form-group">
        <label class="form-label">Комментарий к заявке (необязательно)</label>
        <input type="text" id="orderComment" class="form-input" placeholder="Пожелания, время, доставка...">
      </div>

      <button class="btn-submit" id="btnSubmitOrder">Отправить заказ</button>
    </div>
  </div>

  <script>
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && tg.requestFullscreen) {
        tg.requestFullscreen();
      }
    }

    let allProducts = [];
    let allCategories = [];
    let selectedCategory = 'all';
    let searchQuery = '';
    const cart = new Map(); // productId -> { product, qty }

    function haptic() {
      try { tg?.HapticFeedback?.impactOccurred('light'); } catch(e) {}
    }

    async function loadCatalog() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        allProducts = data.products || [];
        allCategories = data.categories || [];
        document.getElementById('venueName').innerText = data.venue || 'LV Lounge';
        document.getElementById('statsCount').innerText = allProducts.length + ' позиций';

        renderCategories();
        renderProducts();

        // Автозаполнение имени из Telegram
        const user = tg?.initDataUnsafe?.user;
        if (user) {
          const nameField = document.getElementById('orderName');
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          if (fullName && !nameField.value) nameField.value = fullName;
        }
      } catch (err) {
        document.getElementById('productsList').innerHTML = '<div class="empty-state">❌ Ошибка загрузки каталога</div>';
      }
    }

    function renderCategories() {
      const bar = document.getElementById('categoriesBar');
      let html = '<div class="cat-chip ' + (selectedCategory === 'all' ? 'active' : '') + '" data-cat="all">Все товары</div>';
      
      allCategories.forEach(c => {
        const active = selectedCategory == c.id ? 'active' : '';
        html += '<div class="cat-chip ' + active + '" data-cat="' + c.id + '">' + c.name + '</div>';
      });

      bar.innerHTML = html;
      bar.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          haptic();
          selectedCategory = chip.getAttribute('data-cat');
          bar.querySelectorAll('.cat-chip').forEach(ch => ch.classList.remove('active'));
          chip.classList.add('active');
          renderProducts();
        });
      });
    }

    function renderProducts() {
      const list = document.getElementById('productsList');
      const filtered = allProducts.filter(p => {
        const matchCat = (selectedCategory === 'all') || (p.category_id == selectedCategory) || (p.path && p.path.includes(selectedCategory));
        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.category_name && p.category_name.toLowerCase().includes(q));
        return matchCat && matchSearch;
      });

      if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div>По вашему запросу ничего не найдено</div></div>';
        return;
      }

      let html = '';
      filtered.forEach(p => {
        const inCart = cart.get(p.id);
        const qty = inCart ? inCart.qty : 0;
        const inStock = p.stock > 0;

        html += '<div class="product-card">';
        html += '  <div class="product-info">';
        html += '    <div class="product-name">' + p.name + '</div>';
        html += '    <div class="product-path">' + (p.category_name || '') + '</div>';
        html += '    <div class="product-price">' + p.price + ' ₽';
        html += inStock 
          ? ' <span class="product-stock">' + p.stock + ' шт.</span>'
          : ' <span class="product-stock out">Нет в наличии</span>';
        html += '    </div>';
        html += '  </div>';

        html += '  <div class="product-action">';
        if (!inStock) {
          html += '<span style="font-size:12px; color:var(--hint);">Закончился</span>';
        } else if (qty === 0) {
          html += '<button class="btn-add" onclick="addToCart(' + p.id + ')">+ Добавить</button>';
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

    window.addToCart = function(id) {
      haptic();
      const p = allProducts.find(x => x.id === id);
      if (!p) return;
      cart.set(id, { product: p, qty: 1 });
      updateCartBar();
      renderProducts();
    };

    window.changeQty = function(id, delta) {
      haptic();
      const item = cart.get(id);
      if (!item) return;
      item.qty += delta;
      if (item.qty <= 0) {
        cart.delete(id);
      } else if (item.qty > item.product.stock) {
        item.qty = item.product.stock;
        if (tg?.showAlert) tg.showAlert('Достигнут максимальный остаток на складе (' + item.product.stock + ' шт.)');
      }
      updateCartBar();
      renderProducts();
    };

    function updateCartBar() {
      let count = 0;
      let total = 0;
      cart.forEach(v => {
        count += v.qty;
        total += v.qty * v.product.price;
      });

      const bar = document.getElementById('cartBar');
      if (count > 0) {
        bar.style.display = 'flex';
        document.getElementById('cartCountLabel').innerText = count + ' шт. в заказе';
        document.getElementById('cartTotalLabel').innerText = total + ' ₽ ➔';
      } else {
        bar.style.display = 'none';
      }
    }

    // SEARCH LISTENER
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

    // CART MODAL
    document.getElementById('cartBar').addEventListener('click', () => {
      haptic();
      openCheckoutModal();
    });
    document.getElementById('modalClose').addEventListener('click', () => {
      document.getElementById('checkoutModal').style.display = 'none';
    });

    function openCheckoutModal() {
      const itemsContainer = document.getElementById('modalItems');
      let html = '';
      let total = 0;

      cart.forEach(v => {
        const subtotal = v.qty * v.product.price;
        total += subtotal;
        html += '<div class="sheet-item">';
        html += '  <div><b>' + v.product.name + '</b><div style="font-size:12px; color:var(--hint);">' + v.qty + ' шт. × ' + v.product.price + ' ₽</div></div>';
        html += '  <div style="font-weight:600;">' + subtotal + ' ₽</div>';
        html += '</div>';
      });

      itemsContainer.innerHTML = html;
      document.getElementById('modalTotal').innerText = total + ' ₽';
      document.getElementById('checkoutModal').style.display = 'flex';
    }

    // SUBMIT ORDER
    document.getElementById('btnSubmitOrder').addEventListener('click', async () => {
      haptic();
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

      // 1. Попытка отправки через нативный WebApp sendData
      try {
        if (tg && tg.sendData) {
          tg.sendData(JSON.stringify(orderPayload));
          return;
        }
      } catch (err) {}

      // 2. Fallback через HTTP API
      try {
        const res = await fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });
        const ans = await res.json();
        if (ans.success) {
          if (tg?.showAlert) {
            tg.showAlert('✅ Заявка #' + ans.orderId + ' успешно отправлена!', () => tg.close());
          } else {
            alert('✅ Заявка оформлена!');
            window.location.reload();
          }
        } else {
          alert('Ошибка: ' + (ans.error || 'не удалось сохранить'));
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
