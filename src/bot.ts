import { Bot, InlineKeyboard, Keyboard, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import dotenv from "dotenv";
import http from "node:http";
import { MyContext, SessionData } from "./types.js";
import { dbService, OrderRecord, OrderItem } from "./database.js";
import { activeCategoryMap } from "./state.js";
import {
  checkoutConversation,
  addCategoryConversation,
  addSingleProductConversation,
  updateStockConversation,
  transferOwnerConversation
} from "./conversations.js";

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("ОШИБКА: BOT_TOKEN не указан!");
  process.exit(1);
}

export const bot = new Bot<MyContext>(token);

bot.use(session({ initial: (): SessionData => ({ targetCategoryId: null }) }));
bot.use(conversations());

bot.use(createConversation(checkoutConversation));
bot.use(createConversation(addCategoryConversation));
bot.use(createConversation(addSingleProductConversation));
bot.use(createConversation(updateStockConversation));
bot.use(createConversation(transferOwnerConversation));

// Официальное меню Telegram
bot.api.setMyCommands([
  { command: "start", description: "📁 Каталог и Склад" },
  { command: "cart", description: "🛒 Корзина заказа" },
  { command: "orders", description: "📋 Мои заказы / Заявки" },
  { command: "info", description: "🏢 О заведении и контакты" },
  { command: "admin", description: "⚙️ Управление складом" }
]).catch(() => {});

function isAdmin(ctx: MyContext): boolean {
  const currentAdmin = dbService.getAdminId();
  return Boolean(currentAdmin && ctx.from?.id === currentAdmin);
}

// Умная нижняя клавиатура с динамическими бейджами
function getBottomKeyboard(ctx: MyContext): Keyboard {
  const uid = ctx.from?.id;
  const isAdm = isAdmin(ctx);

  const cartCount = uid ? dbService.getCartTotalCount(uid) : 0;
  const cartLabel = cartCount > 0 ? `🛒 Корзина (${cartCount})` : "🛒 Корзина";

  const kb = new Keyboard()
    .text("📁 Склад")
    .text(cartLabel)
    .row();

  if (isAdm) {
    const newOrders = dbService.getNewOrdersCount();
    const ordersLabel = newOrders > 0 ? `📋 Заявки (${newOrders} 🆕)` : "📋 Заявки";
    kb.text(ordersLabel).text("⚙️ Управление");
  } else {
    const venue = dbService.getVenueName();
    kb.text("📋 Мои заказы").text(`🏢 ${venue}`);
  }

  return kb.resized();
}

async function deleteUserMessage(ctx: MyContext) {
  try {
    await ctx.deleteMessage();
  } catch {}
}

function getMainMenu(ctx: MyContext): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("📁 Открыть Склад", "cat_nav_root")
    .row()
    .text("🛒 Корзина заказов", "menu_cart")
    .row()
    .text("📋 Заявки", "view_orders_all")
    .row();

  if (isAdmin(ctx)) {
    kb.text("⚙️ Панель управления", "admin_main").row();
  }

  return kb;
}

// ======================== ПАНЕЛЬ УПРАВЛЕНИЯ ========================

async function showAdminPanel(ctx: MyContext) {
  const stats = dbService.getStats();
  const venue = dbService.getVenueName();
  const ordersChat = dbService.getOrdersChatId();

  let text = `⚙️ **Управление складом и заказами**\n\n`;
  text += `🏢 Заведение: **${venue}**\n`;
  text += `📢 Чат заказов: **${ordersChat ? `Подключен (${ordersChat})` : "В личку админу"}**\n\n`;
  text += `📊 **Сводка:**\n`;
  text += `• Всего товаров: **${stats.productsCount} шт.**\n`;
  text += `• Заказов: **${stats.ordersCount}**\n`;
  text += `• Выручка: **${stats.totalSales} ₽**\n\n`;
  text += `_Для отправки заявок в группу введите /set_orders_chat в группе._`;

  const kb = new InlineKeyboard()
    .text("📁 Открыть Склад", "cat_nav_root").row()
    .text("📋 Все заявки склада", "view_orders_all").row()
    .text("📁 + Создать корневые папки", "admin_create_root_cat").row()
    .text("👑 Сменить владельца", "admin_transfer_owner").row()
    .text("🔄 Обновить", "admin_refresh").row()
    .text("◀️ В меню", "menu_main");

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

// Карточка заведения
async function showVenueInfo(ctx: MyContext) {
  const venue = dbService.getVenueName();
  const uid = ctx.from?.id;
  const isAdm = dbService.getAdminId() === uid;

  let text = `🏢 **${venue}**\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💨 Премиальный кальянный парк, чаши и табаки.\n`;
  text += `🕒 Время работы: **Ежедневно с 12:00 до 02:00**\n`;
  text += `📍 Самовывоз / Доставка\n\n`;
  if (isAdm) {
    text += `💡 _Сменить название: /set_venue Новое Название_\n`;
  }

  const kb = new InlineKeyboard()
    .text("📁 Перейти к товарам", "cat_nav_root").row()
    .text("🛒 Открыть корзину", "menu_cart");

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

// ======================== КОМАНДЫ ========================

bot.command("start", async (ctx) => {
  await deleteUserMessage(ctx);
  const name = ctx.from?.first_name || "друг";
  const venue = dbService.getVenueName();
  const text = `👋 Здравствуйте, ${name}!\n\nДобро пожаловать в **${venue}**.\nВыберите товары на складе ниже:`;
  await ctx.reply(text, { reply_markup: getBottomKeyboard(ctx) });
  await renderWarehouseView(ctx, null);
});

bot.command("cart", async (ctx) => {
  await deleteUserMessage(ctx);
  await renderCartView(ctx);
});

bot.command("orders", async (ctx) => {
  await deleteUserMessage(ctx);
  await renderOrdersList(ctx);
});

bot.command("info", async (ctx) => {
  await deleteUserMessage(ctx);
  await showVenueInfo(ctx);
});

bot.command("admin", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  if (!uid) return;

  const currentAdmin = dbService.getAdminId();
  if (!currentAdmin) {
    const kb = new InlineKeyboard().text("👑 Назначить меня владельцем бота", "claim_admin_click");
    await ctx.reply(`⚙️ **Доступ к панели управления**\n\nВладелец ещё не назначен.\nВаш ID: \`${uid}\`\n\nНажмите кнопку ниже, чтобы стать владельцем:`, {
      parse_mode: "Markdown",
      reply_markup: kb
    });
    return;
  }

  if (currentAdmin !== uid) {
    await ctx.reply(`❌ **Доступ ограничен**\n\nПанель управления доступна только владельцу бота.\nВаш ID: \`${uid}\``, {
      parse_mode: "Markdown"
    });
    return;
  }

  await showAdminPanel(ctx);
});

bot.callbackQuery("admin_transfer_owner", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) {
    return ctx.reply("❌ Доступно только владельцу.");
  }
  await ctx.conversation.enter("transferOwnerConversation");
});

bot.command("transfer_owner", async (ctx) => {
  await deleteUserMessage(ctx);
  if (!isAdmin(ctx)) {
    await ctx.reply("❌ Команда доступна только текущему владельцу.");
    return;
  }
  const arg = ctx.message?.text?.split(" ")[1]?.trim();
  if (arg) {
    const targetId = parseInt(arg, 10);
    if (!isNaN(targetId) && targetId > 0) {
      if (targetId === ctx.from?.id) {
        await ctx.reply("⚠️ Вы уже являетесь владельцем.");
        return;
      }
      dbService.setAdminId(targetId);
      await ctx.reply(`🎉 **Права владельца переданы пользователю ID:** \`${targetId}\``, {
        parse_mode: "Markdown",
        reply_markup: getBottomKeyboard(ctx)
      });
      try {
        await ctx.api.sendMessage(targetId, "👑 Вам переданы права владельца склада! Для входа в панель введите /admin.");
      } catch {}
      return;
    }
  }
  await ctx.conversation.enter("transferOwnerConversation");
});

bot.callbackQuery("claim_admin_click", async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) return;

  const currentAdmin = dbService.getAdminId();
  if (currentAdmin && currentAdmin !== uid) {
    await ctx.answerCallbackQuery({ text: "Владелец уже назначен!" });
    await ctx.reply("❌ Владелец уже назначен. Сменить владельца может только действующий администратор.");
    return;
  }

  dbService.setAdminId(uid);
  await ctx.answerCallbackQuery({ text: "Вы назначены владельцем!" });
  await ctx.reply(
    `🎉 **Владелец бота успешно обновлен!**\n\n🆔 Ваш Telegram ID: \`${uid}\`\nВам доступен полный контроль над складом и заказами.\n\n💡 _Чтобы права не сбрасывались при перезапуске Render, добавьте в Render (Environment):_\n\`ADMIN_ID=${uid}\``,
    {
      parse_mode: "Markdown",
      reply_markup: getBottomKeyboard(ctx)
    }
  );
  await showAdminPanel(ctx);
});

bot.command("claim_admin", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  if (!uid) return;

  const currentAdmin = dbService.getAdminId();
  if (currentAdmin && currentAdmin !== uid) {
    await ctx.reply("❌ Владелец уже назначен. Передать права можно только через панель владельца или команду /transfer_owner.");
    return;
  }

  dbService.setAdminId(uid);
  await ctx.reply(
    `🎉 **Владелец бота успешно обновлен!**\n\n🆔 Ваш ID: \`${uid}\`\n💡 _Для сохранения на Render добавьте:_ \`ADMIN_ID=${uid}\``,
    {
      parse_mode: "Markdown",
      reply_markup: getBottomKeyboard(ctx)
    }
  );
  await showAdminPanel(ctx);
});

bot.command("reset_admin", async (ctx) => {
  await deleteUserMessage(ctx);
  dbService.clearAdminId();
  await ctx.reply("🔄 Владелец сброшен! Теперь можно назначить владельца заново командой /claim_admin.");
});

bot.command("set_orders_chat", async (ctx) => {
  if (!isAdmin(ctx) && ctx.chat?.type === "private") {
    await ctx.reply("❌ Добавьте бота в группу для заказов и выполните команду /set_orders_chat внутри этой группы.");
    return;
  }
  const chatId = ctx.chat?.id;
  if (chatId) {
    dbService.setOrdersChatId(chatId);
    await ctx.reply(`✅ Эта группа успешно привязана для входящих заявок! (ID: \`${chatId}\`)\nВсе новые заказы будут приходить сюда.`, {
      parse_mode: "Markdown"
    });
  }
});

bot.command("set_venue", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const newName = ctx.message?.text?.replace("/set_venue", "").trim();
  if (newName) {
    dbService.setVenueName(newName);
    await ctx.reply(`✅ Название заведения обновлено: **${newName}**!`, {
      parse_mode: "Markdown",
      reply_markup: getBottomKeyboard(ctx)
    });
  } else {
    await ctx.reply("Напишите: `/set_venue Название Заведения`", { parse_mode: "Markdown" });
  }
});

// ======================== ОБРАБОТЧИКИ НИЖНИХ КНОПОК ========================

bot.hears(/^📁\s*(Склад|Мой Склад|Каталог)$/i, async (ctx) => {
  await deleteUserMessage(ctx);
  await renderWarehouseView(ctx, null);
});

bot.hears(/^🛒\s*Корзина.*$/i, async (ctx) => {
  await deleteUserMessage(ctx);
  await renderCartView(ctx);
});

bot.hears(/^📋\s*(Заявки|Мои заказы).*$/i, async (ctx) => {
  await deleteUserMessage(ctx);
  await renderOrdersList(ctx);
});

bot.hears(/^⚙️\s*(Управление|Админ-панель).*$/i, async (ctx) => {
  await deleteUserMessage(ctx);
  if (!isAdmin(ctx)) {
    await ctx.reply("❌ Доступ в панель управления запрещен.");
    return;
  }
  await showAdminPanel(ctx);
});

bot.hears(/^🏢\s*(.*)$/, async (ctx) => {
  await deleteUserMessage(ctx);
  await showVenueInfo(ctx);
});

bot.callbackQuery("menu_main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Главное меню:", { reply_markup: getMainMenu(ctx) });
});

bot.callbackQuery("admin_main", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await showAdminPanel(ctx);
});

bot.callbackQuery("admin_refresh", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Обновлено" });
  if (!isAdmin(ctx)) return;
  await showAdminPanel(ctx);
});

// ======================== УПРАВЛЕНИЕ ЗАЯВКАМИ ========================

const STATUS_ICONS: Record<string, string> = {
  new: "🆕 Новая",
  in_progress: "⏳ В работе",
  completed: "✅ Выполнена",
  cancelled: "❌ Отменена"
};

async function renderOrdersList(ctx: MyContext, filterStatus?: string) {
  const isAdm = isAdmin(ctx);
  const userId = ctx.from?.id;
  if (!userId) return;

  const orders: OrderRecord[] = isAdm
    ? dbService.getOrders(filterStatus)
    : dbService.getUserOrders(userId);

  const kb = new InlineKeyboard();

  if (isAdm) {
    kb.text(filterStatus ? "Все" : "• Все •", "orders_filter_all")
      .text(filterStatus === "new" ? "• 🆕 Новые •" : "🆕 Новые", "orders_filter_new")
      .text(filterStatus === "in_progress" ? "• ⏳ В работе •" : "⏳ В работе", "orders_filter_in_progress")
      .row();
  }

  if (orders.length === 0) {
    kb.text("📁 Открыть Склад", "cat_nav_root").row();
    const emptyText = isAdm
      ? "📋 **Заявок пока нет.**\nВсе оформленные заказы будут отображаться здесь."
      : "📋 **У вас пока нет оформленных заказов.**\nСоберите товары на складе и оформите заявку!";

    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(emptyText, { parse_mode: "Markdown", reply_markup: kb });
      } catch {}
    } else {
      await ctx.reply(emptyText, { parse_mode: "Markdown", reply_markup: kb });
    }
    return;
  }

  orders.slice(0, 15).forEach((o) => {
    const icon = STATUS_ICONS[o.status] || o.status;
    const title = `#${o.id} | ${o.user_name?.slice(0, 14)} | ${o.total_price} ₽ (${icon})`;
    kb.text(title, `order_view_${o.id}`).row();
  });

  kb.text("📁 Вернуться на Склад", "cat_nav_root");

  let header = isAdm
    ? `📋 **Журнал заявок склада** (${orders.length} шт.):\n_Нажмите на заявку для просмотра и управления:_`
    : `📋 **Ваши заказы** (${orders.length} шт.):`;

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(header, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(header, { parse_mode: "Markdown", reply_markup: kb });
    }
  } else {
    await ctx.reply(header, { parse_mode: "Markdown", reply_markup: kb });
  }
}

bot.callbackQuery("view_orders_all", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderOrdersList(ctx);
});

bot.callbackQuery("orders_filter_all", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderOrdersList(ctx);
});

bot.callbackQuery("orders_filter_new", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderOrdersList(ctx, "new");
});

bot.callbackQuery("orders_filter_in_progress", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderOrdersList(ctx, "in_progress");
});

bot.callbackQuery("user_orders", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderOrdersList(ctx);
});

bot.callbackQuery(/^order_view_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const orderId = parseInt(ctx.match[1], 10);
  const order = dbService.getOrderById(orderId);
  const isAdm = isAdmin(ctx);

  if (!order) {
    await ctx.editMessageText("Заявка не найдена.", {
      reply_markup: new InlineKeyboard().text("◀️ К заявкам", "view_orders_all")
    });
    return;
  }

  let items: OrderItem[] = [];
  try {
    items = JSON.parse(order.items_json);
  } catch {}

  const statusName = STATUS_ICONS[order.status] || order.status;

  let text = `📋 **Заявка #${order.id}** [${statusName}]\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `👤 **Клиент:** ${order.user_name}\n`;
  text += `📞 **Телефон:** ${order.phone || "не указан"}\n`;
  if (order.comment && order.comment !== "Без комментария") {
    text += `💬 **Пожелание:** ${order.comment}\n`;
  }
  text += `🕒 **Дата:** ${order.created_at}\n\n`;

  text += `📦 **Состав заявки:**\n`;
  for (const item of items) {
    text += `• ${item.name} — ${item.quantity} шт. × ${item.price} ₽ = ${item.subtotal} ₽\n`;
  }
  text += `\n💰 **ИТОГО:** **${order.total_price} ₽**\n`;

  const kb = new InlineKeyboard();

  if (isAdm) {
    if (order.status === "new") {
      kb.text("⏳ Взять в работу", `order_status_${order.id}_in_progress`).row();
    }
    if (order.status !== "completed" && order.status !== "cancelled") {
      kb.text("✅ Завершить заказ", `order_status_${order.id}_completed`).row();
      kb.text("❌ Отменить (вернуть на склад)", `order_cancel_${order.id}`).row();
    }
  }

  kb.text("◀️ Назад к заявкам", "view_orders_all");

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

bot.callbackQuery(/^order_status_(\d+)_(in_progress|completed)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery({ text: "Только для администратора!", show_alert: true });
    return;
  }
  const orderId = parseInt(ctx.match[1], 10);
  const status = ctx.match[2] as "in_progress" | "completed";

  dbService.updateOrderStatus(orderId, status);
  await ctx.answerCallbackQuery({ text: `Статус заявки #${orderId} изменен!` });

  const order = dbService.getOrderById(orderId);
  if (order) {
    const statusText = status === "in_progress"
      ? `⏳ Ваша заявка #${order.id} принята в работу!`
      : `✅ Ваша заявка #${order.id} выполнена! Ждём вас снова.`;
    try {
      await ctx.api.sendMessage(order.user_id, statusText);
    } catch {}
  }

  const kb = new InlineKeyboard()
    .text("◀️ К заявкам", "view_orders_all")
    .text("📁 На Склад", "cat_nav_root");
  await ctx.editMessageReplyMarkup({ reply_markup: kb });
});

bot.callbackQuery(/^order_cancel_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery({ text: "Только для администратора!", show_alert: true });
    return;
  }
  const orderId = parseInt(ctx.match[1], 10);
  const res = dbService.cancelOrderWithStockRefund(orderId);

  if (!res.success) {
    await ctx.answerCallbackQuery({ text: `Ошибка: ${res.error}`, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: `Заявка #${orderId} отменена, товары возвращены на склад!` });

  const order = dbService.getOrderById(orderId);
  if (order) {
    try {
      await ctx.api.sendMessage(order.user_id, `❌ Ваша заявка #${order.id} была отменена менеджером. Товары возвращены на склад.`);
    } catch {}
  }

  const kb = new InlineKeyboard().text("◀️ К заявкам", "view_orders_all");
  await ctx.editMessageReplyMarkup({ reply_markup: kb });
});

// ======================== ИНТУИТИВНЫЙ СКЛАД ========================

async function renderWarehouseView(ctx: MyContext, categoryId: number | null) {
  const isAdm = isAdmin(ctx);
  const userId = ctx.from?.id;
  if (userId) activeCategoryMap.set(userId, categoryId);

  const subcategories = dbService.getCategoriesWithStats(categoryId);
  const products = categoryId !== null ? dbService.getProductsByCategory(categoryId) : [];
  const currentCategory = categoryId !== null ? dbService.getCategoryById(categoryId) : null;
  const pathTitle = dbService.getCategoryPathString(categoryId);

  const kb = new InlineKeyboard();

  // 1. Папки
  subcategories.forEach((sub, idx) => {
    const countTag = sub.products_count > 0 ? ` [${sub.products_count} 📦]` : "";
    kb.text(`📁 ${sub.name}${countTag}`, `cat_nav_${sub.id}`);
    if (idx % 2 === 1) kb.row();
  });
  if (subcategories.length % 2 !== 0) kb.row();

  // 2. Товары
  products.forEach((p) => {
    const status = p.stock > 0 ? `${p.price} ₽ | ${p.stock} шт.` : "❌ Нет";
    kb.text(`📦 ${p.name} — ${status}`, `prod_${p.id}`).row();
  });

  // 3. Только 2 главные кнопки для админа
  if (isAdm) {
    if (categoryId !== null) {
      kb.text("📁 + Папка", `admin_add_subcat_${categoryId}`);
      kb.text("📦 + Товар", `admin_add_single_${categoryId}`).row();
      kb.text("🗑 Удалить эту папку", `admin_del_cat_${categoryId}`).row();
    } else {
      kb.text("📁 + Создать папки", "admin_create_root_cat").row();
    }
  }

  // 4. Лаконичная навигация
  const cartCount = userId ? dbService.getCartTotalCount(userId) : 0;
  const cartLabel = cartCount > 0 ? `🛒 Корзина (${cartCount})` : "🛒 Корзина";

  kb.text(cartLabel, "menu_cart");
  if (categoryId !== null && currentCategory) {
    const backTarget = currentCategory.parent_id !== null ? `cat_nav_${currentCategory.parent_id}` : "cat_nav_root";
    kb.text("◀️ Назад", backTarget);
    if (currentCategory.parent_id !== null) {
      kb.text("🏠 В корень", "cat_nav_root");
    }
    kb.row();
  }

  let text = `📍 **${pathTitle}**\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (subcategories.length === 0 && products.length === 0) {
    text += isAdm
      ? `_В этой папке пока пусто._\n_Используйте кнопки «📁 + Папка» или «📦 + Товар» ниже._`
      : `_В этом разделе пока нет товаров._`;
  } else {
    text += `Папок: **${subcategories.length}** | Товаров: **${products.length}**\n`;
  }

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

bot.callbackQuery("cat_nav_root", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderWarehouseView(ctx, null);
});

bot.callbackQuery(/^cat_nav_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const catId = parseInt(ctx.match[1], 10);
  await renderWarehouseView(ctx, catId);
});

bot.callbackQuery("admin_create_root_cat", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const userId = ctx.from?.id;
  if (userId) activeCategoryMap.set(userId, null);
  await ctx.conversation.enter("addCategoryConversation");
});

bot.callbackQuery(/^admin_add_subcat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const parentId = parseInt(ctx.match[1], 10);
  const userId = ctx.from?.id;
  if (userId) activeCategoryMap.set(userId, parentId);
  await ctx.conversation.enter("addCategoryConversation");
});

bot.callbackQuery(/^admin_add_single_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  const userId = ctx.from?.id;
  if (userId) activeCategoryMap.set(userId, catId);
  await ctx.conversation.enter("addSingleProductConversation");
});

bot.callbackQuery(/^admin_del_cat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  const cat = dbService.getCategoryById(catId);
  const parentId = cat?.parent_id ?? null;

  dbService.deleteCategory(catId);
  await ctx.answerCallbackQuery({ text: "Папка удалена" });
  await renderWarehouseView(ctx, parentId);
});

// ======================== КАРТОЧКА ТОВАРА (ВСЕГО 2-3 КНОПКИ) ========================

bot.callbackQuery(/^prod_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = parseInt(ctx.match[1], 10);
  const product = dbService.getProductById(productId);

  if (!product) {
    await ctx.editMessageText("Товар не найден.", { reply_markup: getMainMenu(ctx) });
    return;
  }

  const inStock = product.stock > 0;
  const stockText = inStock ? `🟢 В наличии: **${product.stock} шт.**` : "🔴 **Нет в наличии**";
  const pathStr = dbService.getCategoryPathString(product.category_id);

  let text = `📦 **${product.name}**\n`;
  text += `📍 Раздел: _${pathStr}_\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (product.description) {
    text += `${product.description}\n\n`;
  }
  text += `💰 Цена: **${product.price} ₽**\n`;
  text += `📊 На складе: ${stockText}\n`;

  const kb = new InlineKeyboard();

  if (inStock) {
    kb.text("🛒 В корзину (+1)", `cart_add_${product.id}`).row();
  }

  // Для админа — управление
  if (isAdmin(ctx)) {
    kb.text("✏️ Изменить остаток", `edit_stock_${product.id}`);
    kb.text("🗑 Удалить", `admin_del_prod_${product.id}`).row();
  }

  // Назад строго в папку товара
  kb.text("◀️ Назад", `cat_nav_${product.category_id}`);

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

bot.callbackQuery(/^cart_add_(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const productId = parseInt(ctx.match[1], 10);
  const result = dbService.addToCart(userId, productId, 1);

  if (!result.success) {
    await ctx.answerCallbackQuery({ text: `❌ ${result.error}`, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "✅ Добавлено в корзину!" });

  const product = dbService.getProductById(productId);
  if (product) {
    const inStock = product.stock > 0;
    const kb = new InlineKeyboard();
    if (inStock) {
      kb.text("➕ Добавить ещё (+1)", `cart_add_${product.id}`).row();
    }
    if (isAdmin(ctx)) {
      kb.text("✏️ Изменить остаток", `edit_stock_${product.id}`);
      kb.text("🗑 Удалить", `admin_del_prod_${product.id}`).row();
    }
    kb.text("🛒 Открыть корзину", "menu_cart");
    kb.text("◀️ Назад", `cat_nav_${product.category_id}`);

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch {}
  }
});

bot.callbackQuery(/^edit_stock_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await ctx.conversation.enter("updateStockConversation");
});

bot.callbackQuery(/^admin_del_prod_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Товар удалён!" });
  if (!isAdmin(ctx)) return;
  const prodId = parseInt(ctx.match[1], 10);
  const prod = dbService.getProductById(prodId);
  if (prod) {
    const catId = prod.category_id;
    dbService.deleteProduct(prodId);
    await renderWarehouseView(ctx, catId);
  }
});

// ======================== КОРЗИНА И ОФОРМЛЕНИЕ ========================

async function renderCartView(ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cart = dbService.getCart(userId);

  if (cart.length === 0) {
    const kb = new InlineKeyboard()
      .text("📁 Открыть Склад", "cat_nav_root");

    const emptyText = "🛒 **Ваша корзина пуста.**\n\nВыберите товары на складе, чтобы сформировать заявку.";
    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(emptyText, { parse_mode: "Markdown", reply_markup: kb });
      } catch {}
    } else {
      await ctx.reply(emptyText, { parse_mode: "Markdown", reply_markup: kb });
    }
    return;
  }

  let text = "🛒 **Ваша корзина:**\n\n";
  let total = 0;
  const kb = new InlineKeyboard();

  cart.forEach((item) => {
    const subtotal = item.quantity * item.price;
    total += subtotal;
    text += `• **${item.name}**\n  ${item.quantity} шт. × ${item.price} ₽ = **${subtotal} ₽**\n\n`;

    kb.text(`➖`, `cart_decr_${item.product_id}`)
      .text(`${item.quantity} шт.`, `cart_qty_info`)
      .text(`➕`, `cart_incr_${item.product_id}`)
      .text(`🗑`, `cart_del_${item.product_id}`)
      .row();
  });

  text += `💰 **ИТОГО:** **${total} ₽**`;

  kb.text("✅ Оформить заявку", "cart_checkout").row();
  kb.text("📁 Продолжить покупки", "cat_nav_root");
  kb.text("🗑 Очистить", "cart_clear").row();

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {}
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

bot.callbackQuery("menu_cart", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderCartView(ctx);
});

bot.callbackQuery(/^cart_incr_(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const productId = parseInt(ctx.match[1], 10);
  const res = dbService.addToCart(userId, productId, 1);
  if (!res.success) {
    await ctx.answerCallbackQuery({ text: `❌ ${res.error}`, show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await renderCartView(ctx);
});

bot.callbackQuery(/^cart_decr_(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const productId = parseInt(ctx.match[1], 10);
  const cart = dbService.getCart(userId);
  const item = cart.find(c => c.product_id === productId);

  if (item) {
    if (item.quantity > 1) {
      dbService.addToCart(userId, productId, -1);
    } else {
      dbService.removeFromCart(userId, productId);
    }
  }
  await ctx.answerCallbackQuery();
  await renderCartView(ctx);
});

bot.callbackQuery(/^cart_del_(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const productId = parseInt(ctx.match[1], 10);
  dbService.removeFromCart(userId, productId);
  await ctx.answerCallbackQuery({ text: "Позиция удалена" });
  await renderCartView(ctx);
});

bot.callbackQuery("cart_clear", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  dbService.clearCart(userId);
  await ctx.answerCallbackQuery({ text: "Корзина очищена" });
  await renderCartView(ctx);
});

bot.callbackQuery("cart_qty_info", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Используйте ➖ и ➕ для изменения количества" });
});

bot.callbackQuery("cart_checkout", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("checkoutConversation");
});

bot.catch((err) => {
  console.error("Ошибка бота:", err);
});

// HTTP healthcheck для Render
const PORT = process.env.PORT || 3000;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot is running!");
});
server.listen(PORT, () => {
  console.log(`HTTP сервер на порту ${PORT}`);
});

console.log("Запуск @LVoptBot...");
bot.start({
  onStart: (info) => {
    console.log(`Бот @${info.username} успешно запущен!`);
  }
});
