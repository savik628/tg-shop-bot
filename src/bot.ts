import { Bot, InlineKeyboard, Keyboard, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import dotenv from "dotenv";
import http from "node:http";
import { MyContext, SessionData } from "./types.js";
import { dbService } from "./database.js";
import {
  checkoutConversation,
  addCategoryConversation,
  renameCategoryConversation,
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
bot.use(createConversation(renameCategoryConversation));
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
    .text("📁 Мой Склад")
    .text("🛒 Корзина")
    .row();

  if (isAdmin(ctx)) {
    kb.text("⚙️ Управление").text("ℹ️ Мой ID");
  } else {
    kb.text("ℹ️ Мой ID");
  }

  return kb.resized();
}

// Удаление сообщения пользователя для поддержания чистоты чата
async function deleteUserMessage(ctx: MyContext) {
  try {
    await ctx.deleteMessage();
  } catch {}
}

// Главная инлайн-клавиатура
function getMainMenu(ctx: MyContext): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("📁 Открыть Мой Склад", "cat_nav_root")
    .row()
    .text("🛒 Корзина заказов", "menu_cart")
    .row();

  if (isAdmin(ctx)) {
    kb.text("⚙️ Панель управления", "admin_main").row();
  }

  return kb;
}

// Панель управления
async function showAdminPanel(ctx: MyContext) {
  const stats = dbService.getStats();
  const text = `⚙️ **Панель управления магазином и складом**\n\n` +
    `📊 **Сводка по складу:**\n` +
    `• Всего товаров на складе: **${stats.productsCount} шт.**\n` +
    `• Оформлено заявок: **${stats.ordersCount}**\n` +
    `• Общая сумма продаж: **${stats.totalSales} ₽**\n\n` +
    `📁 _Вы можете переходить в любые папки склада, создавать вложенные подпапки списком и массово загружать товары._`;

  const kb = new InlineKeyboard()
    .text("📁 Перейти к папкам склада", "cat_nav_root").row()
    .text("📁 + Создать корневые папки", "admin_create_root_cat").row()
    .text("🔄 Обновить статистику", "admin_refresh").row()
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

// ======================== КОМАНДЫ ========================

bot.command("start", async (ctx) => {
  await deleteUserMessage(ctx);
  const name = ctx.from?.first_name || "друг";
  const text = `👋 Здравствуйте, ${name}!\n\nДобро пожаловать в систему онлайн-склада.\nДля навигации используйте кнопки внизу:`;
  await ctx.reply(text, { reply_markup: getBottomKeyboard(ctx) });
  await renderWarehouseView(ctx, null);
});

bot.command("admin", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  if (!uid) return;

  const currentAdmin = dbService.getAdminId();
  if (!currentAdmin) {
    const kb = new InlineKeyboard().text("👑 Назначить себя владельцем", "claim_admin_click");
    await ctx.reply("⚠️ Владелец склада ещё не назначен!\nНажмите кнопку ниже, чтобы получить доступ:", {
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
  await ctx.reply(`🎉 Вы успешно назначены владельцем склада.`, {
    reply_markup: getBottomKeyboard(ctx)
  });
  await showAdminPanel(ctx);
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

bot.command("id", async (ctx) => {
  await deleteUserMessage(ctx);
  const uid = ctx.from?.id;
  const isAdm = dbService.getAdminId() === uid;
  await ctx.reply(`🆔 Ваш Telegram ID: \`${uid}\`\n👑 Статус: ${isAdm ? "**Владелец (Админ)**" : "Покупатель"}`, {
    parse_mode: "Markdown"
  });
});

// ======================== ОБРАБОТЧИКИ НИЖНИХ КНОПОК ========================

bot.hears(["📁 Мой Склад", "🛍 Каталог"], async (ctx) => {
  await deleteUserMessage(ctx);
  await renderWarehouseView(ctx, null);
});

bot.hears(["🛒 Корзина", "🛒 Моя корзина"], async (ctx) => {
  await deleteUserMessage(ctx);
  await renderCartView(ctx);
});

bot.hears(["⚙️ Управление", "⚙️ Админ-панель"], async (ctx) => {
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
  await ctx.answerCallbackQuery({ text: "Данные обновлены" });
  if (!isAdmin(ctx)) return;
  await showAdminPanel(ctx);
});

// ======================== СИСТЕМА «МОЙ СКЛАД» (ПАПКИ И ТОВАРЫ) ========================

async function renderWarehouseView(ctx: MyContext, categoryId: number | null) {
  const isAdm = isAdmin(ctx);
  const subcategories = dbService.getCategoriesWithStats(categoryId);
  const products = categoryId !== null ? dbService.getProductsByCategory(categoryId) : [];
  const currentCategory = categoryId !== null ? dbService.getCategoryById(categoryId) : null;
  const pathTitle = dbService.getCategoryPathString(categoryId);

  const kb = new InlineKeyboard();

  // 1. Отображение вложенных папок
  subcategories.forEach((sub, idx) => {
    const metaParts = [];
    if (sub.subfolders_count > 0) metaParts.push(`${sub.subfolders_count} 📁`);
    if (sub.products_count > 0) metaParts.push(`${sub.products_count} 📦`);
    const meta = metaParts.length > 0 ? ` [${metaParts.join(" | ")}]` : "";

    kb.text(`📁 ${sub.name}${meta}`, `cat_nav_${sub.id}`);
    if (idx % 2 === 1) kb.row();
  });
  if (subcategories.length % 2 !== 0) kb.row();

  // 2. Отображение товаров в текущей папке
  products.forEach((p) => {
    const status = p.stock > 0 ? `${p.price} ₽ | ${p.stock} шт.` : "❌ Нет в наличии";
    kb.text(`📦 ${p.name} (${status})`, `prod_${p.id}`).row();
  });

  // 3. Блок управления для администратора внутри папки
  if (isAdm) {
    if (categoryId !== null) {
      kb.text("📁 + Создать папки", `admin_add_subcat_${categoryId}`);
      kb.text("⚡️ + Товары списком", `admin_add_batch_${categoryId}`).row();
      kb.text("➕ Товар (поштучно)", `admin_add_single_${categoryId}`);
      kb.text("✏️ Переименовать", `admin_rename_cat_${categoryId}`).row();
      kb.text("🗑 Удалить эту папку", `admin_del_cat_${categoryId}`).row();
    } else {
      kb.text("📁 + Создать папки (категории)", "admin_create_root_cat").row();
    }
  }

  // 4. Навигация
  kb.text("🛒 Корзина", "menu_cart");
  if (categoryId !== null && currentCategory) {
    const backTarget = currentCategory.parent_id !== null ? `cat_nav_${currentCategory.parent_id}` : "cat_nav_root";
    kb.text("◀️ Назад", backTarget);
    if (currentCategory.parent_id !== null) {
      kb.text("🏠 В корень", "cat_nav_root");
    }
    kb.row();
  } else {
    kb.text("◀️ Главное меню", "menu_main").row();
  }

  // Текст сообщения
  let text = `${pathTitle}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📊 **Внутри:** папок: **${subcategories.length}**, товаров: **${products.length}**\n\n`;

  if (subcategories.length === 0 && products.length === 0) {
    text += isAdm
      ? `_Папка пуста. Нажмите «📁 + Создать папки» или «⚡️ + Товары списком» ниже._`
      : `_В этом разделе пока нет товаров._`;
  } else {
    text += `Выберите подпапку или товар:`;
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

// Создание корневых папок (поддерживает несколько подряд)
bot.callbackQuery("admin_create_root_cat", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  (ctx.session as any).targetCategoryId = null;
  await ctx.conversation.enter("addCategoryConversation");
});

// Создание подпапок внутри текущей папки (поддерживает несколько подряд)
bot.callbackQuery(/^admin_add_subcat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const parentId = parseInt(ctx.match[1], 10);
  (ctx.session as any).targetCategoryId = parentId;
  await ctx.conversation.enter("addCategoryConversation");
});

// Переименование папки
bot.callbackQuery(/^admin_rename_cat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  (ctx.session as any).targetCategoryId = catId;
  await ctx.conversation.enter("renameCategoryConversation");
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

// Удаление папки
bot.callbackQuery(/^admin_del_cat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  const cat = dbService.getCategoryById(catId);
  const parentId = cat?.parent_id ?? null;

  dbService.deleteCategory(catId);
  await ctx.answerCallbackQuery({ text: "Папка и всё её содержимое удалены" });
  await renderWarehouseView(ctx, parentId);
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
  const pathStr = dbService.getCategoryPathString(product.category_id);

  let text = `📦 **${product.name}**\n`;
  text += `📍 Раздел: _${pathStr}_\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (product.description) {
    text += `${product.description}\n\n`;
  }
  text += `💰 Цена: **${product.price} ₽**\n`;
  text += `📊 Складской остаток: ${stockText}\n`;

  const kb = new InlineKeyboard();
  if (inStock) {
    kb.text("🛒 Добавить в корзину (+1)", `cart_add_${product.id}`).row();
  }

  if (isAdmin(ctx)) {
    kb.text("✏️ Изменить остаток", `edit_stock_${product.id}`);
    kb.text("💰 Изменить цену", `edit_price_${product.id}`).row();
    kb.text("❌ Удалить этот товар", `admin_del_prod_${product.id}`).row();
  }

  kb.text("🛒 В корзину", "menu_cart");
  kb.text("◀️ Назад в папку", `cat_nav_${product.category_id}`).row();

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
    kb.text("◀️ Назад в папку", `cat_nav_${product.category_id}`).row();

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
      .text("📁 Открыть Мой Склад", "cat_nav_root")
      .row()
      .text("◀️ Главное меню", "menu_main");

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
    text += `• **${item.name}**\n  ${item.quantity} шт. × ${item.price} ₽ = **${subtotal} ₽** (на складе: ${item.stock} шт.)\n\n`;

    kb.text(`➖`, `cart_decr_${item.product_id}`)
      .text(`${item.quantity} шт.`, `cart_qty_info`)
      .text(`➕`, `cart_incr_${item.product_id}`)
      .text(`🗑`, `cart_del_${item.product_id}`)
      .row();
  });

  text += `💰 **ИТОГО К ОПЛАТЕ:** **${total} ₽**`;

  kb.text("✅ Оформить заявку", "cart_checkout").row();
  kb.text("🗑 Очистить корзину", "cart_clear").row();
  kb.text("📁 Продолжить выбор", "cat_nav_root").row();
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
console.log("Запуск @LVoptBot в режиме «Мой Склад»...");
bot.start({
  onStart: (info) => {
    console.log(`Бот @${info.username} успешно запущен в режиме «Мой Склад»!`);
  }
});
