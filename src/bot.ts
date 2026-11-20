import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import http from "node:http";
import { MyContext } from "./types.js";
import { dbService, OrderItem } from "./database.js";
import { html, md } from "./format.js";
import { parseCsvBuffer, importProductsToDb } from "./excel.js";
import { fetchGoogleSheetsBuffer } from "./googleSheets.js";
import { getWidgetHtml } from "./widget_template.js";

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("ОШИБКА: BOT_TOKEN не указан!");
  process.exit(1);
}

export const bot = new Bot<MyContext>(token);
export const WEBAPP_URL = process.env.APP_URL || "https://tg-shop-bot-obnn.onrender.com";

// 1. Полная очистка публичных команд бота
bot.api.deleteMyCommands().catch(() => {});

// 2. Нативная кнопка меню диалога для мгновенного вызова виджета
bot.api.setChatMenuButton({
  menu_button: {
    type: "web_app",
    text: "🛍 Виджет Магазина",
    web_app: { url: `${WEBAPP_URL}/widget` }
  }
}).catch(() => {});

// Синхронизация с Google Таблицей
export async function syncGoogleSheetsDirect(): Promise<{
  success: boolean;
  error?: string;
  count?: number;
  categoriesCreated?: number;
  productsCreated?: number;
  productsUpdated?: number;
  timestamp?: string;
}> {
  const url = dbService.getGoogleSheetsUrl();
  if (!url) return { success: false, error: "Google Таблица не привязана" };

  const fetchRes = await fetchGoogleSheetsBuffer(url);
  if (!fetchRes.success || !fetchRes.buffer) {
    return { success: false, error: fetchRes.error || "Сбой загрузки таблицы" };
  }

  const parseRes = parseCsvBuffer(fetchRes.buffer);
  if (parseRes.items.length === 0) {
    return { success: false, error: "В Google Таблице не найдены строки с товарами" };
  }

  const importRes = importProductsToDb(parseRes.items, "replace_stock");
  const nowStr = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  dbService.setGoogleSheetsLastSync(nowStr);

  return {
    success: true,
    count: parseRes.items.length,
    categoriesCreated: importRes.categoriesCreated,
    productsCreated: importRes.productsCreated,
    productsUpdated: importRes.productsUpdated,
    timestamp: nowStr
  };
}

// Отправка интерактивного виджета магазина (Bot API 10.4 sendWidget)
async function sendStoreWidget(ctx: MyContext) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const venue = dbService.getVenueName();
  const categories = dbService.getAllCategoriesList();
  const products = dbService.getAllProductsWithCategory();

  const chatData = JSON.stringify({
    venue,
    categories: categories.map(c => ({ id: c.id, name: c.name })),
    products: products.map(p => ({
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      brand: p.brand || "",
      packaging: p.packaging || "",
      price: p.price,
      stock: p.stock
    }))
  });

  // 1. Попытка нативной отправки HTML-виджета в сообщение (Bot API 10.4)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendWidget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        html: getWidgetHtml(),
        chat_data: chatData,
        allow_queries: true
      })
    });
    const ans: any = await res.json();
    if (ans.ok) return;
  } catch (e) {}

  // 2. Резервный компактный запуск виджета
  const text = `<b>🏪 ${html(venue)} • Виджет Магазина</b>\n\n` +
    `<blockquote expandable>\n` +
    `📦 <b>В наличии: ${products.length} товаров</b>\n` +
    `Магазин переведён в интерактивный виджет. Все старые кнопки и меню удалены.\n\n` +
    `• Каталог и быстрый поиск по брендам и вкусам\n` +
    `• Добавление в корзину в 1 клик\n` +
    `• Моментальная отправка накладной на сборку\n` +
    `</blockquote>\n\n` +
    `👇 Нажмите для открытия виджета магазина:`;

  const kb = new InlineKeyboard().webApp("🛍 Открыть Виджет", `${WEBAPP_URL}/widget`);

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: kb
  }).catch(() => {});
}

// Обработка заказов и уведомлений
async function handleOrderPlacement(orderData: {
  userId: number;
  userName: string;
  phone: string;
  comment?: string;
  items: Array<{ id: number; name: string; price: number; quantity: number }>;
  chatId?: number;
}): Promise<{ success: boolean; orderId?: number; total?: number; error?: string }> {
  const { userId, userName, phone, comment, items, chatId } = orderData;
  const orderRes = dbService.checkoutOrderDirect(
    userId,
    userName || "Покупатель",
    phone || "Не указан",
    comment || "Без комментария",
    items || []
  );

  if (!orderRes.success || !orderRes.orderId || !orderRes.items) {
    return { success: false, error: orderRes.error || "Ошибка оформления заявки" };
  }

  // Уведомление в чат склада / админу
  const adminId = dbService.getAdminId();
  const ordersChat = dbService.getOrdersChatId();
  const targetChat = ordersChat || adminId;

  if (targetChat) {
    let orderMsg = `🔔 <b>Новая заявка #${orderRes.orderId} из виджета!</b>\n\n`;
    orderMsg += `👤 Клиент: <b>${html(userName)}</b>\n`;
    orderMsg += `📞 Телефон: <b>${html(phone)}</b>\n`;
    if (comment && comment !== "Без комментария") {
      orderMsg += `💬 Комментарий: <i>${html(comment)}</i>\n`;
    }
    orderMsg += `\n📦 <b>Состав накладной:</b>\n<blockquote expandable>\n`;
    for (const it of orderRes.items) {
      orderMsg += `• ${html(it.name)} — ${it.quantity} шт. × ${it.price} ₽ = ${it.subtotal} ₽\n`;
    }
    orderMsg += `</blockquote>\n`;
    orderMsg += `💰 <b>ИТОГО: ${orderRes.total} ₽</b>`;

    const manageKb = new InlineKeyboard()
      .text("⏳ В работу", `order_status_${orderRes.orderId}_in_progress`)
      .text("✅ Выполнен", `order_status_${orderRes.orderId}_completed`).row()
      .text("❌ Отменить", `order_cancel_${orderRes.orderId}`);

    await bot.api.sendMessage(targetChat, orderMsg, {
      parse_mode: "HTML",
      reply_markup: manageKb
    }).catch(() => {});
  }

  // Подтверждение покупателю
  if (chatId) {
    let userMsg = `✅ <b>Заявка #${orderRes.orderId} принята на сборку!</b>\n\n`;
    userMsg += `💰 Сумма: <b>${orderRes.total} ₽</b>\n`;
    userMsg += `📦 Состав:\n<blockquote expandable>\n`;
    for (const it of orderRes.items) {
      userMsg += `• ${html(it.name)} — ${it.quantity} шт. = ${it.subtotal} ₽\n`;
    }
    userMsg += `</blockquote>\nМенеджер склада уже собирает заказ!`;

    await bot.api.sendMessage(chatId, userMsg, { parse_mode: "HTML" }).catch(() => {});
  }

  return { success: true, orderId: orderRes.orderId, total: orderRes.total };
}

// 3. Поддержка запросов виджета (Bot API 10.4 widget_query)
bot.use(async (ctx, next) => {
  const update = ctx.update as any;
  if (update?.widget_query) {
    const q = update.widget_query;
    try {
      const payload = JSON.parse(q.data || "{}");
      if (payload.action === "order") {
        const userId = q.from?.id || 0;
        const res = await handleOrderPlacement({
          userId,
          userName: payload.name || q.from?.first_name || "Клиент",
          phone: payload.phone,
          comment: payload.comment,
          items: payload.items || [],
          chatId: userId > 0 ? userId : undefined
        });

        await fetch(`https://api.telegram.org/bot${token}/answerWidgetQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            widget_query_id: q.id,
            text: res.success ? `✅ Заявка #${res.orderId} принята!` : "Ошибка создания"
          })
        }).catch(() => {});
      }
    } catch (e) {}
    return;
  }
  return next();
});

// Команда /start запускает виджет
bot.command("start", async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  await sendStoreWidget(ctx);
});

// Служебные команды владельца
bot.command("sync", async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  const res = await syncGoogleSheetsDirect();
  if (res.success) {
    await ctx.reply(`✅ Склад синхронизирован! Товаров: ${res.count} шт.`);
  } else {
    await ctx.reply(`❌ Ошибка синхронизации: ${res.error}`);
  }
});

// Очистка сообщений в приватном чате
bot.on(["message:text", "message:sticker", "message:photo"], async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.deleteMessage().catch(() => {});
  await sendStoreWidget(ctx);
});

// Смена статусов заказов менеджером
bot.callbackQuery(/^order_status_(\d+)_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const orderId = parseInt(ctx.match[1], 10);
  const status = ctx.match[2] as "in_progress" | "completed";
  dbService.updateOrderStatus(orderId, status);

  const order = dbService.getOrderById(orderId);
  if (order && order.user_id) {
    const txt = status === "in_progress" ? "⏳ Заявка на сборке" : "✅ Заявка готова к выдаче!";
    await bot.api.sendMessage(order.user_id, `<b>Заявка #${orderId}</b>\n${txt}`, { parse_mode: "HTML" }).catch(() => {});
  }
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
});

bot.callbackQuery(/^order_cancel_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Заявка отменена" });
  const orderId = parseInt(ctx.match[1], 10);
  dbService.cancelOrderWithStockRefund(orderId);
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
});

// ======================== HTTP СЕРВЕР ДЛЯ ВИДЖЕТА ========================
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // Healthcheck для Render и UptimeRobot
  if (pathname === "/health" || pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok", products: dbService.getStats().productsCount }));
    return;
  }

  // HTML виджета
  if (pathname === "/widget" || pathname === "/app" || pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(getWidgetHtml());
    return;
  }

  // API товаров
  if (pathname === "/api/products" && req.method === "GET") {
    const venue = dbService.getVenueName();
    const categories = dbService.getAllCategoriesList();
    const products = dbService.getAllProductsWithCategory();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ success: true, venue, categories, products }));
    return;
  }

  // API заказа из виджета
  if (pathname === "/api/order" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const orderRes = await handleOrderPlacement({
          userId: Number(payload.userId) || 0,
          userName: payload.name || "Клиент (Виджет)",
          phone: payload.phone,
          comment: payload.comment,
          items: payload.items || [],
          chatId: payload.userId > 0 ? Number(payload.userId) : undefined
        });

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(orderRes));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`Сервер виджета запущен на порту ${PORT}`);
});

// Автовосстановление из Google Таблицы при пустой БД
async function autoRestoreFromGoogleSheetsIfEmpty() {
  try {
    const stats = dbService.getStats();
    if (stats.productsCount === 0) {
      console.log("🔄 База пуста. Восстанавливаю каталог из Google Таблицы...");
      await syncGoogleSheetsDirect();
    }
  } catch (err: any) {
    console.error("Ошибка автовосстановления:", err?.message);
  }
}

// Anti-Sleep пингер
function startKeepAliveEngine() {
  const pingUrl = process.env.APP_URL || "https://tg-shop-bot-obnn.onrender.com";
  const target = pingUrl.endsWith("/") ? `${pingUrl}health` : `${pingUrl}/health`;
  setInterval(async () => {
    try {
      await fetch(target, { signal: AbortSignal.timeout(10000) });
    } catch {}
  }, 10 * 60 * 1000);
}

console.log("Запуск бота виджета...");
bot.start({
  onStart: async (info) => {
    console.log(`Бот-виджет @${info.username} запущен!`);
    startKeepAliveEngine();
    await autoRestoreFromGoogleSheetsIfEmpty();
  }
});
