import { MyConversation, MyContext } from "./types.js";
import { dbService } from "./database.js";
import { InlineKeyboard, Keyboard } from "grammy";

// Утилита очистки временных сообщений
async function cleanupMessages(ctx: MyContext, ids: number[]) {
  if (!ctx.chat?.id) return;
  for (const id of ids) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, id);
    } catch {}
  }
}

// ======================== ОФОРМЛЕНИЕ ЗАКАЗА ========================
export async function checkoutConversation(conversation: MyConversation, ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const toClean: number[] = [];

  const cart = dbService.getCart(userId);
  if (cart.length === 0) {
    const m = await ctx.reply("❌ Ваша корзина пуста.");
    setTimeout(() => {
      ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {});
    }, 4000);
    return;
  }

  // 1. Запрос телефона
  const contactKeyboard = new Keyboard()
    .requestContact("📱 Поделиться номером телефона")
    .row()
    .text("❌ Отменить оформление")
    .resized()
    .oneTime();

  const q1 = await ctx.reply(
    "📝 **Оформление заявки**\n\nОтправьте номер телефона (нажмите кнопку ниже или напишите сообщением):",
    { parse_mode: "Markdown", reply_markup: contactKeyboard }
  );
  toClean.push(q1.message_id);

  let phone = "";
  while (true) {
    const response = await conversation.wait();
    if (response.message?.message_id) toClean.push(response.message.message_id);

    if (response.message?.text === "❌ Отменить оформление") {
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply("Оформление отменено.", { reply_markup: { remove_keyboard: true } });
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      return;
    }

    if (response.message?.contact?.phone_number) {
      phone = response.message.contact.phone_number;
      break;
    } else if (response.message?.text && response.message.text.trim().length >= 6) {
      phone = response.message.text.trim();
      break;
    } else {
      const retry = await ctx.reply("Пожалуйста, нажмите кнопку «📱 Поделиться номером телефона» или введите номер:");
      toClean.push(retry.message_id);
    }
  }

  // 2. Запрос комментария
  const skipKeyboard = new Keyboard()
    .text("⏩ Пропустить комментарий")
    .row()
    .text("❌ Отменить оформление")
    .resized()
    .oneTime();

  const q2 = await ctx.reply(
    "💬 Укажите комментарий к заказу (адрес, время) или нажмите «Пропустить»:",
    { reply_markup: skipKeyboard }
  );
  toClean.push(q2.message_id);

  let comment = "Без комментария";
  const commentResponse = await conversation.wait();
  if (commentResponse.message?.message_id) toClean.push(commentResponse.message.message_id);

  if (commentResponse.message?.text === "❌ Отменить оформление") {
    await cleanupMessages(ctx, toClean);
    const m = await ctx.reply("Оформление отменено.", { reply_markup: { remove_keyboard: true } });
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
    return;
  }
  if (commentResponse.message?.text && commentResponse.message.text !== "⏩ Пропустить комментарий") {
    comment = commentResponse.message.text.trim();
  }

  await cleanupMessages(ctx, toClean);

  const userName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Покупатель";
  const userTag = ctx.from?.username ? `@${ctx.from.username}` : "нет юзернейма";

  const result = dbService.checkoutOrder(userId, `${userName} (${userTag})`, phone, comment);

  if (!result.success || !result.items) {
    await ctx.reply(`❌ Не удалось оформить заявку: ${result.error}`, {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  let userSummary = `✅ **Заявка #${result.orderId} принята!**\n\n`;
  userSummary += `📦 **Состав:**\n`;
  for (const item of result.items) {
    userSummary += `• ${item.name} — ${item.quantity} шт. × ${item.price} ₽ = ${item.subtotal} ₽\n`;
  }
  userSummary += `\n💰 **Итого:** ${result.total} ₽\n`;
  userSummary += `📞 **Телефон:** ${phone}\n`;
  userSummary += `💬 **Комментарий:** ${comment}\n\n`;
  userSummary += `Владелец получил заявку и свяжется с вами!`;

  await ctx.reply(userSummary, {
    parse_mode: "Markdown",
    reply_markup: { remove_keyboard: true }
  });

  const adminId = dbService.getAdminId();
  if (adminId && adminId > 0) {
    let adminMsg = `🔔 **НОВАЯ ЗАЯВКА #${result.orderId}**\n\n`;
    adminMsg += `👤 **Покупатель:** ${userName} (${userTag})\n`;
    adminMsg += `🆔 **Telegram ID:** \`${userId}\`\n`;
    adminMsg += `📞 **Телефон:** ${phone}\n`;
    adminMsg += `💬 **Комментарий:** ${comment}\n\n`;
    adminMsg += `📦 **Состав:**\n`;
    for (const item of result.items) {
      adminMsg += `• ${item.name} — ${item.quantity} шт. × ${item.price} ₽ = ${item.subtotal} ₽\n`;
    }
    adminMsg += `\n💰 **ИТОГО:** ${result.total} ₽`;

    try {
      await ctx.api.sendMessage(adminId, adminMsg, { parse_mode: "Markdown" });
    } catch (e: any) {
      console.error("Не удалось уведомить владельца:", e?.message);
    }
  }
}

// ======================== СОЗДАНИЕ ПАПОК ========================
export async function addCategoryConversation(conversation: MyConversation, ctx: MyContext) {
  const toClean: number[] = [];
  const parentId = (ctx as any).session?.targetCategoryId ?? null;

  const currentPath = dbService.getCategoryPathString(parentId);
  const helpText = `📁 **Создание папок**\n` +
    `📍 Раздел: **${currentPath}**\n\n` +
    `Введите название папки или **несколько названий через запятую**:\n\n` +
    `_Пример:_\n` +
    `\`Спектрум, Блэкберн, Мастхэв, Трофимов\`\n\n` +
    `_Или отправьте /cancel для отмены:_`;

  const q = await ctx.reply(helpText, { parse_mode: "Markdown" });
  toClean.push(q.message_id);

  const response = await conversation.wait();
  if (response.message?.message_id) toClean.push(response.message.message_id);
  const text = response.message?.text?.trim();

  await cleanupMessages(ctx, toClean);

  if (!text || text === "/cancel") {
    const m = await ctx.reply("Отменено.");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
    return;
  }

  const names = text
    .split(/[\n,]/)
    .map(n => n.trim())
    .filter(n => n.length > 0);

  if (names.length === 0) {
    const m = await ctx.reply("❌ Не указано названий.");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
    return;
  }

  const createdCount = dbService.addCategoriesBatch(names, parentId);
  const m = await ctx.reply(
    `✅ Создано папок: **${createdCount}**\n${names.map(n => `└ 📁 ${n}`).join("\n")}`,
    { parse_mode: "Markdown" }
  );
  setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 4000);
}

// ======================== ПЕРЕИМЕНОВАНИЕ ПАПКИ ========================
export async function renameCategoryConversation(conversation: MyConversation, ctx: MyContext) {
  const toClean: number[] = [];
  const categoryId = (ctx as any).session?.targetCategoryId;
  if (!categoryId) return;

  const cat = dbService.getCategoryById(categoryId);
  if (!cat) return;

  const q = await ctx.reply(`✏️ Введите новое название для папки **"${cat.name}"** (или /cancel):`, {
    parse_mode: "Markdown"
  });
  toClean.push(q.message_id);

  const response = await conversation.wait();
  if (response.message?.message_id) toClean.push(response.message.message_id);
  const text = response.message?.text?.trim();

  await cleanupMessages(ctx, toClean);

  if (!text || text === "/cancel") {
    const m = await ctx.reply("Отменено.");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
    return;
  }

  dbService.renameCategory(categoryId, text);
  const m = await ctx.reply(`✅ Папка переименована в **"${text}"**!`, { parse_mode: "Markdown" });
  setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
}

// ======================== МАКСИМАЛЬНО ПРОСТОЕ ДОБАВЛЕНИЕ ТОВАРА ========================
export async function addSingleProductConversation(conversation: MyConversation, ctx: MyContext) {
  const categoryId = (ctx as any).session?.targetCategoryId;
  if (!categoryId) {
    await ctx.reply("❌ Папка не выбрана.");
    return;
  }

  const pathStr = dbService.getCategoryPathString(categoryId);
  const toClean: number[] = [];

  const promptText = `➕ **Добавление товара**\n` +
    `📍 Раздел: **${pathStr}**\n\n` +
    `Отправьте **Название и Цену** через дефис:\n\n` +
    `_Примеры:_\n` +
    `\`Pinkman - 850\`\n` +
    `\`Ананас - 850 - 20\` _(название - цена - остаток)_\n\n` +
    `_Или отправьте /cancel для отмены:_`;

  const q = await ctx.reply(promptText, { parse_mode: "Markdown" });
  toClean.push(q.message_id);

  while (true) {
    const response = await conversation.wait();
    if (response.message?.message_id) toClean.push(response.message.message_id);
    const text = response.message?.text?.trim();

    if (!text || text === "/cancel") {
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply("Добавление отменено.");
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      return;
    }

    const parts = text.split(/[-|;/]/).map(p => p.trim());
    if (parts.length >= 2) {
      const name = parts[0];
      const priceVal = parseFloat(parts[1].replace(",", "."));
      const stockVal = parts[2] ? parseInt(parts[2], 10) : 50;

      if (name && !isNaN(priceVal) && priceVal >= 0) {
        await cleanupMessages(ctx, toClean);
        dbService.addProduct(categoryId, name, "", priceVal, isNaN(stockVal) ? 50 : stockVal);

        const kb = new InlineKeyboard()
          .text("➕ Добавить ещё товар сюда", `admin_add_single_${categoryId}`).row()
          .text("📁 Вернуться в папку", `cat_nav_${categoryId}`);

        await ctx.reply(`✅ Товар **"${name}"** успешно добавлен!\n💰 Цена: **${priceVal} ₽** | 📦 Наличие: **${stockVal} шт.**`, {
          parse_mode: "Markdown",
          reply_markup: kb
        });
        return;
      }
    }

    // Если ввели просто название без дефиса
    const err = await ctx.reply("Пожалуйста, укажите цену через дефис, например:\n`Pinkman - 850`", { parse_mode: "Markdown" });
    toClean.push(err.message_id);
  }
}

// ======================== МАССОВОЕ ДОБАВЛЕНИЕ СПИСКОМ ========================
export async function addBatchProductsConversation(conversation: MyConversation, ctx: MyContext) {
  const categoryId = (ctx as any).session?.targetCategoryId;
  if (!categoryId) {
    await ctx.reply("❌ Папка не выбрана.");
    return;
  }

  const pathStr = dbService.getCategoryPathString(categoryId);
  const toClean: number[] = [];

  const helpText = `⚡️ **Массовое добавление товаров списком**\n` +
    `📍 Раздел: **${pathStr}**\n\n` +
    `Отправьте список товаров строками:\n` +
    `\`Название - Цена - Количество\`\n\n` +
    `_Пример:_\n` +
    `\`Pinkman - 850 - 20\`\n` +
    `\`Pineapple - 850 - 15\`\n` +
    `\`Grapefruit - 850\` _(по умолчанию 50 шт.)_\n\n` +
    `_Или отправьте /cancel для отмены:_`;

  const q = await ctx.reply(helpText, { parse_mode: "Markdown" });
  toClean.push(q.message_id);

  const response = await conversation.wait();
  if (response.message?.message_id) toClean.push(response.message.message_id);
  const text = response.message?.text?.trim();

  await cleanupMessages(ctx, toClean);

  if (!text || text === "/cancel") {
    const m = await ctx.reply("Отменено.");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
    return;
  }

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const itemsToAdd: Array<{ name: string; price: number; stock: number }> = [];

  for (const line of lines) {
    const parts = line.split(/[-|;/]/).map(p => p.trim());
    if (parts.length >= 2) {
      const name = parts[0];
      const priceVal = parseFloat(parts[1].replace(",", "."));
      const stockVal = parts[2] ? parseInt(parts[2], 10) : 50;

      if (name && !isNaN(priceVal) && priceVal >= 0) {
        itemsToAdd.push({
          name,
          price: priceVal,
          stock: isNaN(stockVal) || stockVal < 0 ? 0 : stockVal
        });
      }
    }
  }

  if (itemsToAdd.length === 0) {
    const m = await ctx.reply("❌ Не удалось распознать формат. Пример: `Pinkman - 850`");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 4000);
    return;
  }

  const addedCount = dbService.addBatchProducts(categoryId, itemsToAdd);
  const resultMsg = `🎉 **Добавлено товаров: ${addedCount} шт.!**\n\n` +
    itemsToAdd.map(i => `• ${i.name} — ${i.price} ₽ (${i.stock} шт.)`).slice(0, 15).join("\n") +
    (itemsToAdd.length > 15 ? `\n...и ещё ${itemsToAdd.length - 15} поз.` : "");

  const kb = new InlineKeyboard().text("📁 Открыть эту папку", `cat_nav_${categoryId}`);
  await ctx.reply(resultMsg, { parse_mode: "Markdown", reply_markup: kb });
}

// ======================== ИЗМЕНЕНИЕ ОСТАТКА ========================
export async function updateStockConversation(conversation: MyConversation, ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^edit_stock_(\d+)$/);
  const productId = match ? parseInt(match[1], 10) : 0;
  const product = dbService.getProductById(productId);
  if (!product) return;

  const toClean: number[] = [];
  const q = await ctx.reply(`📦 **${product.name}**\nТекущий остаток: **${product.stock} шт.**\n\nВведите **новое количество** (или /cancel):`, {
    parse_mode: "Markdown"
  });
  toClean.push(q.message_id);

  while (true) {
    const msg = await conversation.wait();
    if (msg.message?.message_id) toClean.push(msg.message.message_id);
    if (msg.message?.text === "/cancel") {
      await cleanupMessages(ctx, toClean);
      return;
    }
    const val = parseInt(msg.message?.text || "", 10);
    if (!isNaN(val) && val >= 0) {
      dbService.updateProductStock(productId, val);
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply(`✅ Остаток **${product.name}**: **${val} шт.**`, { parse_mode: "Markdown" });
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      break;
    }
    const errM = await ctx.reply("Введите целое неотрицательное число:");
    toClean.push(errM.message_id);
  }
}

// ======================== ИЗМЕНЕНИЕ ЦЕНЫ ========================
export async function updatePriceConversation(conversation: MyConversation, ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^edit_price_(\d+)$/);
  const productId = match ? parseInt(match[1], 10) : 0;
  const product = dbService.getProductById(productId);
  if (!product) return;

  const toClean: number[] = [];
  const q = await ctx.reply(`💰 **${product.name}**\nТекущая цена: **${product.price} ₽**\n\nВведите **новую цену** (или /cancel):`, {
    parse_mode: "Markdown"
  });
  toClean.push(q.message_id);

  while (true) {
    const msg = await conversation.wait();
    if (msg.message?.message_id) toClean.push(msg.message.message_id);
    if (msg.message?.text === "/cancel") {
      await cleanupMessages(ctx, toClean);
      return;
    }
    const val = parseFloat((msg.message?.text || "").replace(",", "."));
    if (!isNaN(val) && val >= 0) {
      dbService.updateProductPrice(productId, val);
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply(`✅ Цена **${product.name}**: **${val} ₽**`, { parse_mode: "Markdown" });
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      break;
    }
    const errM = await ctx.reply("Введите корректное число для цены:");
    toClean.push(errM.message_id);
  }
}
