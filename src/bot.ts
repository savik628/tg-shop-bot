import { Bot, InlineKeyboard, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import dotenv from "dotenv";
import http from "node:http";
import { MyContext } from "./types.js";
import { dbService } from "./database.js";
import {
  checkoutConversation,
  addCategoryConversation,
  addProductConversation,
  updateStockConversation,
  updatePriceConversation
} from "./conversations.js";

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("ОШИБКА: BOT_TOKEN не указан в файле .env!");
  process.exit(1);
}

export const bot = new Bot<MyContext>(token);

// Middleware сессий и диалогов
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

bot.use(createConversation(checkoutConversation));
bot.use(createConversation(addCategoryConversation));
bot.use(createConversation(addProductConversation));
bot.use(createConversation(updateStockConversation));
bot.use(createConversation(updatePriceConversation));

// Проверка на админа
function isAdmin(ctx: MyContext): boolean {
  const currentAdmin = dbService.getAdminId();
  return Boolean(currentAdmin && ctx.from?.id === currentAdmin);
}

// Главная клавиатура
function getMainMenu(ctx: MyContext): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("🛍 Каталог товаров", "menu_catalog")
    .row()
    .text("🛒 Моя корзина", "menu_cart")
    .row();

  if (isAdmin(ctx)) {
    kb.text("⚙️ Панель управления", "admin_main").row();
  }

  return kb;
}

// Команда /start
bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "друг";
  const text = `👋 Привет, ${name}!\n\nДобро пожаловать в наш онлайн-каталог.\nВыберите действие ниже:`;
  await ctx.reply(text, { reply_markup: getMainMenu(ctx) });
});

// Команда /id
bot.command("id", async (ctx) => {
  const uid = ctx.from?.id;
  const currentAdmin = dbService.getAdminId();
  const isAdm = currentAdmin === uid;
  await ctx.reply(
    `🆔 Ваш Telegram ID: \`${uid}\`\n👑 Статус: ${isAdm ? "**Владелец (Администратор)**" : "Покупатель"}\n\n${
      !currentAdmin
        ? "⚠️ Владелец бота ещё не назначен! Отправьте команду /claim_admin, чтобы стать владельцем."
        : ""
    }`,
    { parse_mode: "Markdown" }
  );
});

// Команда /claim_admin (быстрое назначение владельца)
bot.command("claim_admin", async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) return;

  const currentAdmin = dbService.getAdminId();
  if (currentAdmin && currentAdmin !== uid) {
    await ctx.reply("❌ У этого бота уже назначен другой владелец.");
    return;
  }

  dbService.setAdminId(uid);
  await ctx.reply(`🎉 Поздравляем! Вы успешно назначены владельцем бота (ID: \`${uid}\`).\nТеперь вам доступна кнопка «⚙️ Панель управления» в меню.`, {
    parse_mode: "Markdown",
    reply_markup: getMainMenu(ctx)
  });
});

// Кнопка перехода в главное меню
bot.callbackQuery("menu_main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Главное меню:", { reply_markup: getMainMenu(ctx) });
});

// ======================= КАТАЛОГ =======================

bot.callbackQuery("menu_catalog", async (ctx) => {
  await ctx.answerCallbackQuery();
  const categories = dbService.getCategories();

  if (categories.length === 0) {
    const kb = new InlineKeyboard();
    if (isAdmin(ctx)) {
      kb.text("➕ Добавить категорию", "admin_add_cat").row();
    }
    kb.text("◀️ Главное меню", "menu_main");
    await ctx.editMessageText("Каталог пока пуст. Скоро здесь появятся товары!", { reply_markup: kb });
    return;
  }

  const kb = new InlineKeyboard();
  categories.forEach((cat, index) => {
    kb.text(cat.name, `cat_${cat.id}`);
    if (index % 2 === 1) kb.row();
  });
  if (categories.length % 2 !== 0) kb.row();
  kb.text("🛒 Корзина", "menu_cart").row();
  kb.text("◀️ Главное меню", "menu_main");

  await ctx.editMessageText("📂 **Выберите категорию:**", {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

// Просмотр категории (список товаров)
bot.callbackQuery(/^cat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const categoryId = parseInt(ctx.match[1], 10);
  const category = dbService.getCategoryById(categoryId);

  if (!category) {
    await ctx.editMessageText("Категория не найдена.", { reply_markup: getMainMenu(ctx) });
    return;
  }

  const products = dbService.getProductsByCategory(categoryId);
  const kb = new InlineKeyboard();

  if (products.length === 0) {
    kb.text("◀️ Назад к категориям", "menu_catalog");
    await ctx.editMessageText(`В категории **"${category.name}"** пока нет товаров.`, {
      parse_mode: "Markdown",
      reply_markup: kb
    });
    return;
  }

  products.forEach((p) => {
    const status = p.stock > 0 ? `${p.price} ₽` : "❌ Нет в наличии";
    kb.text(`${p.name} (${status})`, `prod_${p.id}`).row();
  });

  kb.text("🛒 Корзина", "menu_cart").row();
  kb.text("◀️ Назад к категориям", "menu_catalog");

  await ctx.editMessageText(`📂 Категория: **${category.name}**\nВыберите товар:`, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

// Карточка товара
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
  kb.text("🛒 Перейти в корзину", "menu_cart").row();
  kb.text("◀️ Назад к списку", `cat_${product.category_id}`);

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

  await ctx.answerCallbackQuery({ text: "✅ Товар добавлен в корзину!" });

  // Обновим клавиатуру на экране товара с индикацией
  const product = dbService.getProductById(productId);
  if (product) {
    const kb = new InlineKeyboard()
      .text("➕ Добавить ещё (+1)", `cart_add_${product.id}`).row()
      .text("🛒 Перейти в корзину", "menu_cart").row()
      .text("◀️ Назад к списку", `cat_${product.category_id}`);

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch {}
  }
});

// ======================= КОРЗИНА =======================

bot.callbackQuery("menu_cart", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const cart = dbService.getCart(userId);

  if (cart.length === 0) {
    const kb = new InlineKeyboard()
      .text("🛍 Перейти в каталог", "menu_catalog")
      .row()
      .text("◀️ Главное меню", "menu_main");

    await ctx.editMessageText("🛒 **Ваша корзина пуста.**\n\nВыберите товары в каталоге, чтобы оформить заявку.", {
      parse_mode: "Markdown",
      reply_markup: kb
    });
    return;
  }

  let text = "🛒 **Ваша корзина:**\n\n";
  let total = 0;
  const kb = new InlineKeyboard();

  cart.forEach((item) => {
    const subtotal = item.quantity * item.price;
    total += subtotal;
    text += `• **${item.name}**\n  ${item.quantity} шт. × ${item.price} ₽ = **${subtotal} ₽** (на складе: ${item.stock} шт.)\n\n`;

    // Кнопки управления количеством для каждой позиции
    kb.text(`➖`, `cart_decr_${item.product_id}`)
      .text(`${item.quantity} шт.`, `cart_qty_info`)
      .text(`➕`, `cart_incr_${item.product_id}`)
      .text(`🗑`, `cart_del_${item.product_id}`)
      .row();
  });

  text += `💰 **ИТОГО К ОПЛАТЕ:** **${total} ₽**`;

  kb.text("✅ Оформить заявку", "cart_checkout").row();
  kb.text("🗑 Очистить всю корзину", "cart_clear").row();
  kb.text("🛍 Продолжить покупки", "menu_catalog").row();
  kb.text("◀️ Главное меню", "menu_main");

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

// Изменение количества в корзине
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
  // Перерисовываем корзину
  await redrawCart(ctx);
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
  await redrawCart(ctx);
});

bot.callbackQuery(/^cart_del_(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const productId = parseInt(ctx.match[1], 10);
  dbService.removeFromCart(userId, productId);
  await ctx.answerCallbackQuery({ text: "Товар удален из корзины" });
  await redrawCart(ctx);
});

bot.callbackQuery("cart_clear", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  dbService.clearCart(userId);
  await ctx.answerCallbackQuery({ text: "Корзина очищена" });
  await redrawCart(ctx);
});

bot.callbackQuery("cart_qty_info", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Используйте ➖ и ➕ для изменения количества" });
});

async function redrawCart(ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;
  const cart = dbService.getCart(userId);

  if (cart.length === 0) {
    const kb = new InlineKeyboard()
      .text("🛍 Перейти в каталог", "menu_catalog")
      .row()
      .text("◀️ Главное меню", "menu_main");

    try {
      await ctx.editMessageText("🛒 **Ваша корзина пуста.**\n\nВыберите товары в каталоге, чтобы оформить заявку.", {
        parse_mode: "Markdown",
        reply_markup: kb
      });
    } catch {}
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
  kb.text("🛍 Продолжить покупки", "menu_catalog").row();
  kb.text("◀️ Главное меню", "menu_main");

  try {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: kb
    });
  } catch {}
}

// Запуск оформления заказа
bot.callbackQuery("cart_checkout", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("checkoutConversation");
});

// ======================= АДМИН-ПАНЕЛЬ =======================

bot.callbackQuery("admin_main", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) {
    await ctx.editMessageText("Доступ запрещен. Укажите свой ID в ADMIN_ID.");
    return;
  }

  const kb = new InlineKeyboard()
    .text("➕ Добавить товар", "admin_add_prod").row()
    .text("📦 Склад и остатки (изменить/удалить)", "admin_products_list").row()
    .text("🏷 Добавить категорию", "admin_add_cat").row()
    .text("🗑 Удалить категорию", "admin_del_cat").row()
    .text("◀️ Главное меню", "menu_main");

  await ctx.editMessageText("⚙️ **Панель управления магазином**\n\nВыберите действие:", {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

bot.callbackQuery("admin_add_cat", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await ctx.conversation.enter("addCategoryConversation");
});

bot.callbackQuery("admin_del_cat", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const categories = dbService.getCategories();
  if (categories.length === 0) {
    await ctx.editMessageText("Категорий пока нет.", {
      reply_markup: new InlineKeyboard().text("◀️ В админку", "admin_main")
    });
    return;
  }

  const kb = new InlineKeyboard();
  categories.forEach((cat) => {
    kb.text(`🗑 ${cat.name}`, `admin_confirm_del_cat_${cat.id}`).row();
  });
  kb.text("◀️ В админку", "admin_main");

  await ctx.editMessageText("⚠️ Выберите категорию для удаления (все товары внутри также удалятся):", {
    reply_markup: kb
  });
});

bot.callbackQuery(/^admin_confirm_del_cat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  dbService.deleteCategory(catId);
  await ctx.editMessageText("✅ Категория удалена.", {
    reply_markup: new InlineKeyboard().text("◀️ В админку", "admin_main")
  });
});

bot.callbackQuery("admin_add_prod", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await ctx.conversation.enter("addProductConversation");
});

bot.callbackQuery("admin_cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Действие отменено.", {
    reply_markup: new InlineKeyboard().text("◀️ В админку", "admin_main")
  });
});

// Просмотр всех товаров для редактирования остатка, цены или удаления
bot.callbackQuery("admin_products_list", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;

  const categories = dbService.getCategories();
  if (categories.length === 0) {
    await ctx.editMessageText("Категорий и товаров пока нет.", {
      reply_markup: new InlineKeyboard().text("◀️ В админку", "admin_main")
    });
    return;
  }

  let text = "📦 **Управление складом и товарами:**\nВыберите категорию для редактирования товаров:";
  const kb = new InlineKeyboard();

  categories.forEach((cat) => {
    kb.text(cat.name, `admin_cat_prods_${cat.id}`).row();
  });
  kb.text("◀️ В админку", "admin_main");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery(/^admin_cat_prods_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;

  const catId = parseInt(ctx.match[1], 10);
  const cat = dbService.getCategoryById(catId);
  const products = dbService.getProductsByCategory(catId);

  const kb = new InlineKeyboard();
  if (products.length === 0) {
    kb.text("◀️ Назад", "admin_products_list");
    await ctx.editMessageText(`В категории "${cat?.name}" нет товаров.`, { reply_markup: kb });
    return;
  }

  products.forEach((p) => {
    kb.text(`${p.name} | ${p.stock} шт. | ${p.price} ₽`, `admin_manage_prod_${p.id}`).row();
  });
  kb.text("◀️ Назад к категориям", "admin_products_list");

  await ctx.editMessageText(`Товары в категории **${cat?.name}**:\n(Нажмите на товар для изменения остатка/цены/удаления)`, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

// Меню управления конкретным товаром
bot.callbackQuery(/^admin_manage_prod_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;

  const prodId = parseInt(ctx.match[1], 10);
  const prod = dbService.getProductById(prodId);
  if (!prod) {
    await ctx.editMessageText("Товар не найден.", {
      reply_markup: new InlineKeyboard().text("◀️ Назад", "admin_products_list")
    });
    return;
  }

  const kb = new InlineKeyboard()
    .text("📦 Изменить остаток на складе", `edit_stock_${prod.id}`).row()
    .text("💰 Изменить цену", `edit_price_${prod.id}`).row()
    .text("❌ Удалить товар", `admin_del_prod_${prod.id}`).row()
    .text("◀️ Назад к списку", `admin_cat_prods_${prod.category_id}`);

  const msg = `📦 **${prod.name}**\n\n💰 Цена: **${prod.price} ₽**\n📊 Остаток на складе: **${prod.stock} шт.**\n${prod.description ? `📝 Описание: ${prod.description}\n` : ""}\nВыберите действие:`;

  await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery(/^edit_stock_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await ctx.conversation.enter("updateStockConversation");
});

bot.callbackQuery(/^edit_price_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  await ctx.conversation.enter("updatePriceConversation");
});

bot.callbackQuery(/^admin_del_prod_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const prodId = parseInt(ctx.match[1], 10);
  const prod = dbService.getProductById(prodId);
  if (prod) {
    dbService.deleteProduct(prodId);
    await ctx.editMessageText(`✅ Товар **"${prod.name}"** удален.`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("◀️ К списку категорий", "admin_products_list")
    });
  }
});

// Обработка ошибок
bot.catch((err) => {
  console.error("Ошибка в боте:", err);
});

// Легковесный HTTP healthcheck сервер для хостингов (Render, Railway, Fly.io)
const PORT = process.env.PORT || 3000;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot is running!");
});
server.listen(PORT, () => {
  console.log(`Healthcheck HTTP сервер слушает порт ${PORT}`);
});

// Запуск бота
console.log("Бот запускается...");
bot.start({
  onStart: (info) => {
    console.log(`Бот @${info.username} успешно запущен!`);
  }
});
