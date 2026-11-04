import { Bot, InlineKeyboard, Keyboard, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import dotenv from "dotenv";
import http from "node:http";
import { MyContext, SessionData } from "./types.js";
import { dbService } from "./database.js";
import {
  checkoutConversation,
  addCategoryConversation,
  addBatchProductsConversation,
  addSingleProductConversation,
  updateStockConversation,
  updatePriceConversation
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
bot.use(createConversation(addBatchProductsConversation));
bot.use(createConversation(addSingleProductConversation));
bot.use(createConversation(updateStockConversation));
bot.use(createConversation(updatePriceConversation));

// Проверка на админа
function isAdmin(ctx: MyContext): boolean {
  const currentAdmin = dbService.getAdminId();
  return Boolean(currentAdmin && ctx.from?.id === currentAdmin);
}

// Постоянная нижняя клавиатура
function getBottomKeyboard(ctx: MyContext): Keyboard {
  const kb = new Keyboard()
    .text("🛍 Каталог")
    .text("🛒 Корзина")
    .row();

  if (isAdmin(ctx)) {
    kb.text("⚙️ Админ-панель").text("ℹ️ Мой ID");
  } else {
    kb.text("ℹ️ Мой ID");
  }

  return kb.resized();
}

// Главное меню
function getMainMenu(ctx: MyContext): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("🛍 Открыть каталог", "cat_nav_root")
    .row()
    .text("🛒 Моя корзина", "menu_cart")
    .row();

  if (isAdmin(ctx)) {
    kb.text("⚙️ Админ-панель", "admin_main").row();
  }

  return kb;
}

// Функция отображения админ-панели
async function showAdminPanel(ctx: MyContext) {
  const stats = dbService.getStats();
  const text = `⚙️ **Панель управления магазином**\n\n` +
    `📊 **Статистика склада и продаж:**\n` +
    `• Всего товаров: **${stats.productsCount} шт.**\n` +
    `• Оформлено заявок: **${stats.ordersCount}**\n` +
    `• Сумма продаж: **${stats.totalSales} ₽**\n\n` +
    `📁 _В многоуровневом каталоге вы можете добавлять категории любой вложенности и массово загружать товары списком._`;

  const kb = new InlineKeyboard()
    .text("🏷 Создать корневую категорию", "admin_create_root_cat").row()
    .text("🗂 Управление каталогом и товарами", "cat_nav_root").row()
    .text("🔄 Обновить статистику", "admin_refresh").row()
    .text("◀️ Главное меню", "menu_main");

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

// Удаление сообщения пользователя для поддержания чистоты чата
async function deleteUserMessage(ctx: MyContext) {
  try {
    await ctx.deleteMessage();
  } catch {}
}

// ======================== КОМАНДЫ ========================

bot.command("start", async (ctx) => {
  await deleteUserMessage(ctx);
  const name = ctx.from?.first_name || "друг";
  const text = `👋 Привет, ${name}!\n\nДобро пожаловать в каталог товаров.\nДля быстрого перехода используйте меню ниже:`;
  await ctx.reply(text, { reply_markup: getBottomKeyboard(ctx) });
  await ctx.reply("Выберите раздел:", { reply_markup: getMainMenu(ctx) });
});

bot.command("admin", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  if (!uid) return;

  const currentAdmin = dbService.getAdminId();
  if (!currentAdmin) {
    const kb = new InlineKeyboard().text("👑 Назначить себя владельцем", "claim_admin_click");
    await ctx.reply("⚠️ Владелец бота ещё не назначен!\nНажмите кнопку, чтобы стать администратором:", {
      reply_markup: kb
    });
    return;
  }

  if (currentAdmin !== uid) {
    await ctx.reply("❌ Доступ в панель управления запрещен.");
    return;
  }

  await showAdminPanel(ctx);
});

bot.callbackQuery("claim_admin_click", async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) return;
  const currentAdmin = dbService.getAdminId();
  if (currentAdmin && currentAdmin !== uid) {
    await ctx.answerCallbackQuery({ text: "У бота уже есть владелец!", show_alert: true });
    return;
  }
  dbService.setAdminId(uid);
  await ctx.answerCallbackQuery({ text: "Вы назначены владельцем!" });
  await ctx.reply(`🎉 Вы успешно назначены владельцем бота.`, {
    reply_markup: getBottomKeyboard(ctx)
  });
  await showAdminPanel(ctx);
});

bot.command("id", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  const currentAdmin = dbService.getAdminId();
  const isAdm = currentAdmin === uid;
  await ctx.reply(
    `🆔 Ваш Telegram ID: \`${uid}\`\n👑 Статус: ${isAdm ? "**Владелец (Администратор)**" : "Покупатель"}\n\n${
      !currentAdmin ? "⚠️ Владелец бота не назначен! Используйте /claim_admin" : ""
    }`,
    { parse_mode: "Markdown" }
  );
});

bot.command("claim_admin", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  if (!uid) return;
  const currentAdmin = dbService.getAdminId();
  if (currentAdmin && currentAdmin !== uid) {
    await ctx.reply("❌ У этого бота уже назначен другой владелец.");
    return;
  }
  dbService.setAdminId(uid);
  await ctx.reply(`🎉 Поздравляем! Вы назначены владельцем бота.`, {
    reply_markup: getBottomKeyboard(ctx)
  });
  await showAdminPanel(ctx);
});

// ======================== ОБРАБОТЧИКИ НИЖНИХ КНОПОК ========================

bot.hears("🛍 Каталог", async (ctx) => {
  await deleteUserMessage(ctx);
  await renderCategoryView(ctx, null);
});

bot.hears("🛒 Корзина", async (ctx) => {
  await deleteUserMessage(ctx);
  await renderCartView(ctx);
});

bot.hears("⚙️ Админ-панель", async (ctx) => {
  await deleteUserMessage(ctx);
  if (!isAdmin(ctx)) {
    await ctx.reply("❌ Доступ в панель управления запрещен.");
    return;
  }
  await showAdminPanel(ctx);
});

bot.hears("ℹ️ Мой ID", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  const isAdm = dbService.getAdminId() === uid;
  await ctx.reply(`🆔 Ваш Telegram ID: \`${uid}\`\n👑 Статус: ${isAdm ? "**Владелец**" : "Покупатель"}`, {
    parse_mode: "Markdown"
  });
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
  await ctx.answerCallbackQuery({ text: "Статистика обновлена" });
  if (!isAdmin(ctx)) return;
  await showAdminPanel(ctx);
});

// ======================== МНОГОУРОВНЕВЫЙ КАТАЛОГ ========================

async function renderCategoryView(ctx: MyContext, categoryId: number | null) {
  const isAdm = isAdmin(ctx);
  const subcategories = dbService.getCategories(categoryId);
  const products = categoryId !== null ? dbService.getProductsByCategory(categoryId) : [];
  const currentCategory = categoryId !== null ? dbService.getCategoryById(categoryId) : null;
  const pathTitle = categoryId !== null ? dbService.getCategoryPathString(categoryId) : "Каталог товаров";

  const kb = new InlineKeyboard();

  // Кнопки подкатегорий
  subcategories.forEach((sub, idx) => {
    kb.text(`📁 ${sub.name}`, `cat_nav_${sub.id}`);
    if (idx % 2 === 1) kb.row();
  });
  if (subcategories.length % 2 !== 0) kb.row();

  // Кнопки товаров внутри этой категории
  products.forEach((p) => {
    const status = p.stock > 0 ? `${p.price} ₽` : "❌ Нет в наличии";
    kb.text(`📦 ${p.name} (${status})`, `prod_${p.id}`).row();
  });

  // Админские действия для текущей категории
  if (isAdm) {
    if (categoryId !== null) {
      kb.text("⚡️ Добавить товары списком", `admin_add_batch_${categoryId}`).row();
      kb.text("➕ Добавить товар (поштучно)", `admin_add_single_${categoryId}`).row();
      kb.text("📁 Создать подкатегорию здесь", `admin_add_subcat_${categoryId}`).row();
      kb.text("🗑 Удалить эту категорию", `admin_del_cat_${categoryId}`).row();
    } else {
      kb.text("🏷 Создать категорию", "admin_create_root_cat").row();
    }
  }

  // Кнопки навигации
  kb.text("🛒 Корзина", "menu_cart");
  if (categoryId !== null && currentCategory) {
    const backTarget = currentCategory.parent_id !== null ? `cat_nav_${currentCategory.parent_id}` : "cat_nav_root";
    kb.text("◀️ Назад", backTarget).row();
  } else {
    kb.text("◀️ Главное меню", "menu_main").row();
  }

  let text = `📂 **${pathTitle}**\n\n`;
  if (subcategories.length === 0 && products.length === 0) {
    text += isAdm
      ? "_Здесь пока нет товаров и подкатегорий. Используйте кнопки ниже для добавления._"
      : "_В этом разделе пока нет товаров._";
  } else {
    text += `Выберите подкатегорию или товар:`;
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
  await renderCategoryView(ctx, null);
});

bot.callbackQuery(/^cat_nav_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const catId = parseInt(ctx.match[1], 10);
  await renderCategoryView(ctx, catId);
});

// Создание категории в корне
bot.callbackQuery("admin_create_root_cat", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  (ctx.session as any).targetCategoryId = null;
  await ctx.conversation.enter("addCategoryConversation");
});

// Создание подкатегории
bot.callbackQuery(/^admin_add_subcat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const parentId = parseInt(ctx.match[1], 10);
  (ctx.session as any).targetCategoryId = parentId;
  await ctx.conversation.enter("addCategoryConversation");
});

// Массовое добавление товаров
bot.callbackQuery(/^admin_add_batch_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  (ctx.session as any).targetCategoryId = catId;
  await ctx.conversation.enter("addBatchProductsConversation");
});

// Одиночное добавление товара
bot.callbackQuery(/^admin_add_single_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  (ctx.session as any).targetCategoryId = catId;
  await ctx.conversation.enter("addSingleProductConversation");
});

// Удаление категории
bot.callbackQuery(/^admin_del_cat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  const cat = dbService.getCategoryById(catId);
  const parentId = cat?.parent_id ?? null;

  dbService.deleteCategory(catId);
  await ctx.answerCallbackQuery({ text: "Категория и её содержимое удалены" });
  await renderCategoryView(ctx, parentId);
});

// ======================== КАРТОЧКА ТОВАРА ========================

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

  let text = `📦 **${product.name}**\n\n`;
  if (product.description) {
    text += `${product.description}\n\n`;
  }
  text += `💰 Цена: **${product.price} ₽**\n`;
  text += `📊 Статус: ${stockText}\n`;

  const kb = new InlineKeyboard();
  if (inStock) {
    kb.text("➕ Добавить в корзину", `cart_add_${product.id}`).row();
  }

  if (isAdmin(ctx)) {
    kb.text("✏️ Изменить остаток", `edit_stock_${product.id}`);
    kb.text("💰 Изменить цену", `edit_price_${product.id}`).row();
    kb.text("❌ Удалить этот товар", `admin_del_prod_${product.id}`).row();
  }

  kb.text("🛒 В корзину", "menu_cart");
  kb.text("◀️ Назад к категории", `cat_nav_${product.category_id}`).row();

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

// Добавление товара в корзину
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
      kb.text("💰 Изменить цену", `edit_price_${product.id}`).row();
      kb.text("❌ Удалить этот товар", `admin_del_prod_${product.id}`).row();
    }
    kb.text("🛒 В корзину", "menu_cart");
    kb.text("◀️ Назад к категории", `cat_nav_${product.category_id}`).row();

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch {}
  }
});

// Изменение остатка
bot.callbackQuery(/^edit_stock_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await ctx.conversation.enter("updateStockConversation");
});

// Изменение цены
bot.callbackQuery(/^edit_price_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await ctx.conversation.enter("updatePriceConversation");
});

// Удаление товара
bot.callbackQuery(/^admin_del_prod_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const prodId = parseInt(ctx.match[1], 10);
  const prod = dbService.getProductById(prodId);
  if (prod) {
    const catId = prod.category_id;
    dbService.deleteProduct(prodId);
    await ctx.answerCallbackQuery({ text: `Товар "${prod.name}" удалён` });
    await renderCategoryView(ctx, catId);
  }
});

// ======================== КОРЗИНА И ОФОРМЛЕНИЕ ========================

async function renderCartView(ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cart = dbService.getCart(userId);

  if (cart.length === 0) {
    const kb = new InlineKeyboard()
      .text("🛍 Перейти в каталог", "cat_nav_root")
      .row()
      .text("◀️ Главное меню", "menu_main");

    const emptyText = "🛒 **Ваша корзина пуста.**\n\nВыберите товары в каталоге, чтобы оформить заявку.";
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
    text += `• **${item.name}**\n  ${item.quantity} шт. × ${item.price} ₽ = **${subtotal} ₽** (на складе: ${item.stock} шт.)\n\n`;

    kb.text(`➖`, `cart_decr_${item.product_id}`)
      .text(`${item.quantity} шт.`, `cart_qty_info`)
      .text(`➕`, `cart_incr_${item.product_id}`)
      .text(`🗑`, `cart_del_${item.product_id}`)
      .row();
  });

  text += `💰 **ИТОГО К ОПЛАТЕ:** **${total} ₽**`;

  kb.text("✅ Оформить заявку", "cart_checkout").row();
  kb.text("🗑 Очистить всю корзину", "cart_clear").row();
  kb.text("🛍 В каталог", "cat_nav_root").row();
  kb.text("◀️ Главное меню", "menu_main");

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

// Обработка ошибок
bot.catch((err) => {
  console.error("Ошибка бота:", err);
});

// HTTP сервер для healthcheck
const PORT = process.env.PORT || 3000;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot is running!");
});
server.listen(PORT, () => {
  console.log(`HTTP сервер на порту ${PORT}`);
});

// Старт бота
console.log("Запуск @LVoptBot...");
bot.start({
  onStart: (info) => {
    console.log(`Бот @${info.username} успешно запущен!`);
  }
});
