export function getWidgetHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
:root{--bg:#111827;--card:#1f2937;--text:#f9fafb;--hint:#9ca3af;--accent:#38bdf8;--btn:#2563eb;--green:#10b981;--border:rgba(255,255,255,0.08)}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
body{background:var(--bg);color:var(--text);padding:10px;font-size:13px;user-select:none;overflow-x:hidden}
.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.logo{font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px}
.badge{font-size:10px;background:var(--card);padding:2px 8px;border-radius:10px;color:var(--accent);border:1px solid var(--border)}
.srch{width:100%;height:32px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:0 10px;color:var(--text);font-size:12px;outline:none;margin-bottom:8px}
.srch:focus{border-color:var(--accent)}
.cats{display:flex;gap:5px;overflow-x:auto;padding-bottom:4px;margin-bottom:8px;scrollbar-width:none}
.cats::-webkit-scrollbar{display:none}
.cat{white-space:nowrap;padding:4px 9px;border-radius:6px;background:var(--card);font-size:11px;border:1px solid var(--border);cursor:pointer}
.cat.act{background:var(--btn);color:#fff;border-color:var(--btn);font-weight:600}
.list{display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;padding-right:2px}
.row{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.row.act{border-color:rgba(56,189,248,0.4);background:rgba(31,41,55,0.9)}
.info{flex:1;min-width:0}
.ttl{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{font-size:11px;color:var(--hint);margin-top:2px;display:flex;gap:6px}
.prc{color:var(--accent);font-weight:700}
.stk{color:var(--green)}
.btn-add{background:var(--btn);color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer}
.stp{display:flex;align-items:center;background:rgba(0,0,0,0.3);border-radius:6px;border:1px solid var(--border);overflow:hidden}
.stp-b{background:none;border:none;color:#fff;width:26px;height:26px;font-size:15px;font-weight:700;cursor:pointer}
.stp-q{min-width:20px;text-align:center;font-size:12px;font-weight:700;color:var(--accent)}
.cbar{margin-top:8px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border-radius:8px;padding:8px 12px;display:none;justify-content:space-between;align-items:center;cursor:pointer;font-weight:700}
.modal{position:fixed;inset:0;background:rgba(0,0,0,0.75);display:none;align-items:flex-end;justify-content:center;z-index:90}
.sheet{background:var(--bg);width:100%;border-top:1px solid var(--border);border-radius:14px 14px 0 0;padding:12px;display:flex;flex-direction:column;gap:8px;max-height:90vh}
.inp{width:100%;height:36px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:0 10px;color:var(--text);font-size:13px;outline:none}
.btn-sub{width:100%;height:40px;background:var(--green);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
.btn-close{background:none;border:none;color:var(--hint);font-size:16px;cursor:pointer;float:right}
</style>
</head>
<body>
<div class="hdr">
  <div class="logo">📦 <span id="vTitle">LV OPT</span></div>
  <div class="badge" id="vCount">0 поз.</div>
</div>
<input type="text" id="srch" class="srch" placeholder="Поиск товара или вкуса...">
<div class="cats" id="cats"></div>
<div class="list" id="list">Загрузка склада...</div>
<div class="cbar" id="cbar" onclick="openOrderModal()">
  <span id="cbarTxt">0 поз.</span>
  <span id="cbarTot">0 ₽ ➔ Заказать</span>
</div>

<div class="modal" id="modal">
  <div class="sheet">
    <div>
      <b style="font-size:14px;">Оформление накладной</b>
      <button class="btn-close" onclick="closeOrderModal()">✕</button>
    </div>
    <div id="mItems" style="max-height:120px;overflow-y:auto;font-size:11px;color:var(--hint);border-bottom:1px solid var(--border);padding-bottom:6px;"></div>
    <input type="text" id="cName" class="inp" placeholder="Имя / Название заведения">
    <input type="tel" id="cPhone" class="inp" placeholder="Номер телефона *">
    <input type="text" id="cComm" class="inp" placeholder="Комментарий к сборке">
    <button class="btn-sub" onclick="submitOrder()">⚡️ Отправить заказ</button>
  </div>
</div>

<script>
var state = { venue: "LV OPT", categories: [], products: [] };
var cart = {};
var selCat = "all";
var q = "";

function applyData(raw) {
  if (!raw) return;
  try {
    var d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (d.venue) { state.venue = d.venue; document.getElementById("vTitle").innerText = d.venue; }
    if (d.categories) state.categories = d.categories;
    if (d.products) state.products = d.products;
    document.getElementById("vCount").innerText = state.products.length + " поз.";
    renderCats();
    renderList();
  } catch(e){}
}

if (window.TelegramWidget && window.TelegramWidget.onEvent) {
  window.TelegramWidget.onEvent("chatDataChanged", function(data) { applyData(data); });
}

function renderCats() {
  var el = document.getElementById("cats");
  var h = '<div class="cat ' + (selCat === "all" ? "act" : "") + '" onclick="setCat(\\'all\\')">Все</div>';
  state.categories.forEach(function(c) {
    h += '<div class="cat ' + (selCat == c.id ? "act" : "") + '" onclick="setCat(' + c.id + ')">' + c.name + '</div>';
  });
  el.innerHTML = h;
}

function setCat(id) { selCat = id; renderCats(); renderList(); }

function renderList() {
  var el = document.getElementById("list");
  var needle = q.toLowerCase().trim();
  var filtered = state.products.filter(function(p) {
    if (selCat !== "all" && p.category_id != selCat) return false;
    if (needle && (p.name || "").toLowerCase().indexOf(needle) === -1 && (p.brand || "").toLowerCase().indexOf(needle) === -1) return false;
    return true;
  });

  if (filtered.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--hint);">Ничего не найдено</div>';
    return;
  }

  var h = "";
  filtered.forEach(function(p) {
    var qty = cart[p.id] || 0;
    h += '<div class="row ' + (qty > 0 ? "act" : "") + '">';
    h += '  <div class="info">';
    h += '    <div class="ttl">' + (p.brand ? '<span style="color:var(--accent);font-size:10px;">' + p.brand + ' </span>' : '') + p.name + '</div>';
    h += '    <div class="meta"><span class="prc">' + p.price + ' ₽</span> <span class="stk">● ' + p.stock + ' шт.</span>' + (p.packaging ? ' • ' + p.packaging : '') + '</div>';
    h += '  </div>';
    h += '  <div>';
    if (qty === 0) {
      h += '    <button class="btn-add" onclick="add(' + p.id + ')">+ Заказ</button>';
    } else {
      h += '    <div class="stp">';
      h += '      <button class="stp-b" onclick="step(' + p.id + ',-1)">−</button>';
      h += '      <span class="stp-q">' + qty + '</span>';
      h += '      <button class="stp-b" onclick="step(' + p.id + ',1)">+</button>';
      h += '    </div>';
    }
    h += '  </div>';
    h += '</div>';
  });
  el.innerHTML = h;
}

function add(id) { cart[id] = 1; updateCart(); renderList(); }
function step(id, d) {
  cart[id] = (cart[id] || 0) + d;
  if (cart[id] <= 0) delete cart[id];
  updateCart();
  renderList();
}

function updateCart() {
  var count = 0, total = 0;
  for (var id in cart) {
    var p = state.products.find(function(x) { return x.id == id; });
    if (p) { count += cart[id]; total += cart[id] * p.price; }
  }
  var bar = document.getElementById("cbar");
  if (count > 0) {
    bar.style.display = "flex";
    document.getElementById("cbarTxt").innerText = count + " шт.";
    document.getElementById("cbarTot").innerText = total + " ₽ ➔ Заказать";
  } else {
    bar.style.display = "none";
  }
}

document.getElementById("srch").addEventListener("input", function(e) { q = e.target.value; renderList(); });

function openOrderModal() {
  var mi = document.getElementById("mItems");
  var h = "";
  for (var id in cart) {
    var p = state.products.find(function(x) { return x.id == id; });
    if (p) h += '<div>' + p.name + ' × ' + cart[id] + ' шт. = ' + (cart[id] * p.price) + ' ₽</div>';
  }
  mi.innerHTML = h;
  document.getElementById("modal").style.display = "flex";
}
function closeOrderModal() { document.getElementById("modal").style.display = "none"; }

function submitOrder() {
  var name = document.getElementById("cName").value.trim();
  var phone = document.getElementById("cPhone").value.trim();
  var comm = document.getElementById("cComm").value.trim();
  if (!phone) { alert("Укажите телефон для связи"); return; }

  var items = [];
  for (var id in cart) {
    var p = state.products.find(function(x) { return x.id == id; });
    if (p) items.push({ id: p.id, name: p.name, price: p.price, quantity: cart[id] });
  }

  var payload = { action: "order", name: name || "Клиент", phone: phone, comment: comm, items: items };

  if (window.TelegramWidget && window.TelegramWidget.request) {
    window.TelegramWidget.request(JSON.stringify(payload));
    cart = {};
    updateCart();
    closeOrderModal();
    return;
  }

  // Fallback REST
  fetch("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function(r){ return r.json(); }).then(function(res){
    if (res.success) {
      alert("✅ Заявка #" + res.orderId + " отправлена на сборку!");
      cart = {}; updateCart(); closeOrderModal(); renderList();
    } else { alert("Ошибка: " + (res.error || "сбой")); }
  }).catch(function(){ alert("Ошибка соединения"); });
}

// Первичная инициализация (для WebApp или автономного просмотра)
fetch("/api/products").then(function(r){ return r.json(); }).then(function(d){ if (d.success) applyData(d); });
</script>
</body>
</html>`;
}
