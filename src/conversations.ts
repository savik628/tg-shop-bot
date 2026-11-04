import { MyConversation, MyContext } from "./types.js";
import { dbService } from "./database.js";
import { InlineKeyboard, Keyboard } from "grammy";

// Утилита безопасного удаления списка сообщений
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
    "📝 **Оформление заказа**\n\nПожалуйста, отправьте ваш номер телефона (нажмите кнопку ниже или введите номер сообщением):",
    { parse_mode: "Markdown", reply_markup: contactKeyboard }
  );
  toClean.push(q1.message_id);

  let phone = "";
  while (true) {
    const response = await conversation.wait();
    if (response.message?.message_id) toClean.push(response.message.message_id);

    if (response.message?.text === "❌ Отменить оформление") {
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply("Оформление заказа отменено.", { reply_markup: { remove_keyboard: true } });
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
      const retry = await ctx.reply("Пожалуйста, нажмите кнопку «📱 Поделиться номером телефона» или введите корректный номер:");
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
    "💬 Укажите комментарий к заказу (адрес доставки, время) или нажмите «Пропустить»:",
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

  // Удаляем все служебные сообщения ввода
  await cleanupMessages(ctx, toClean);

  // Оформление в БД со списанием остатков
  const userName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Покупатель";
  const userTag = ctx.from?.username ? `@${ctx.from.username}` : "нет юзернейма";

  const result = dbService.checkoutOrder(userId, `${userName} (${userTag})`, phone, comment);

  if (!result.success || !result.items) {
    await ctx.reply(`❌ Не удалось оформить заказ: ${result.error}`, {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  // Сообщение покупателю
  let userSummary = `✅ **Ваша заявка #${result.orderId} успешно принята!**\n\n`;
  userSummary += `📦 **Состав заказа:**\n`;
  for (const item of result.items) {
    userSummary += `• ${item.name} — ${item.quantity} шт. × ${item.price} ₽ = ${item.subtotal} ₽\n`;
  }
  userSummary += `\n💰 **Итого к оплате:** ${result.total} ₽\n`;
  userSummary += `📞 **Контакт:** ${phone}\n`;
  userSummary += `💬 **Комментарий:** ${comment}\n\n`;
  userSummary += `Владелец получил заявку и свяжется с вами!`;

  await ctx.reply(userSummary, {
    parse_mode: "Markdown",
    reply_markup: { remove_keyboard: true }
  });

  // Уведомление владельцу
  const adminId = dbService.getAdminId();
  if (adminId && adminId > 0) {
    let adminMsg = `🔔 **НОВАЯ ЗАЯВКА #${result.orderId}**\n\n`;
    adminMsg += `👤 **Покупатель:** ${userName} (${userTag})\n`;
    adminMsg += `🆔 **Telegram ID:** \`${userId}\`\n`;
    adminMsg += `📞 **Телефон:** ${phone}\n`;
    adminMsg += `💬 **Комментарий:** ${comment}\n\n`;
    adminMsg += `📦 **Состав заявки:**\n`;
    for (const item of result.items) {
      adminMsg += `• ${item.name} — ${item.quantity} шт. × ${item.price} ₽ = ${item.subtotal} ₽\n`;
    }
    adminMsg += `\n💰 **СУММА:** ${result.total} ₽`;

    try {
      await ctx.api.sendMessage(adminId, adminMsg, { parse_mode: "Markdown" });
    } catch (e: any) {
      console.error("Не удалось уведомить владельца:", e?.message);
    }
  }
}

// ======================== ДОБАВЛЕНИЕ КАТЕГОРИИ ========================
export async function addCategoryConversation(conversation: MyConversation, ctx: MyContext) {
  const toClean: number[] = [];
  const parentId = (ctx as any).session?.targetCategoryId ?? null;

  let prompt = "🏷 Введите название новой корневой категории:";
  if (parentId) {
    const parent = dbService.getCategoryById(parentId);
    prompt = `🏷 Введите название новой **подкатегории** для **"${parent?.name}"**:`;
  }

  const q = await ctx.reply(`${prompt}\n\n(Отправьте /cancel для отмены)`, { parse_mode: "Markdown" });
  toClean.push(q.message_id);

  const response = await conversation.wait();
  if (response.message?.message_id) toClean.push(response.message.message_id);
  const text = response.message?.text?.trim();

  await cleanupMessages(ctx, toClean);

  if (!text || text === "/cancel") {
    const m = await ctx.reply("Действие отменено.");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
    return;
  }

  try {
    dbService.addCategory(text, parentId);
    const m = await ctx.reply(`✅ Категория **"${text}"** успешно создана!`, { parse_mode: "Markdown" });
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 4000);
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка добавления категории: ${err.message}`);
  }
}

// ======================== МАССОВОЕ ДОБАВЛЕНИЕ ТОВАРОВ СПИСКОМ ========================
export async function addBatchProductsConversation(conversation: MyConversation, ctx: MyContext) {
  const categoryId = (ctx as any).session?.targetCategoryId;
  if (!categoryId) {
    await ctx.reply("❌ Категория не выбрана.");
    return;
  }

  const category = dbService.getCategoryById(categoryId);
  const pathStr = dbService.getCategoryPathString(categoryId);
  const toClean: number[] = [];

  const helpText = `⚡️ **Массовое добавление товаров**\n` +
    `📂 Категория: **${pathStr}**\n\n` +
    `Отправьте список товаров одним сообщением в формате:\n` +
    `\`Название - Цена - Количество\`\n\n` +
    `_Пример:_\n` +
    `\`Футболка белая - 1200 - 20\`\n` +
    `\`Футболка черная - 1200 - 15\`\n` +
    `\`Худи оверсайз - 3500 - 8\`\n` +
    `\`Кепка - 800\` _(если количество не указано, будет 10 шт.)_\n\n` +
    `Или отправьте /cancel для отмены:`;

  const q = await ctx.reply(helpText, { parse_mode: "Markdown" });
  toClean.push(q.message_id);

  const response = await conversation.wait();
  if (response.message?.message_id) toClean.push(response.message.message_id);
  const text = response.message?.text?.trim();

  await cleanupMessages(ctx, toClean);

  if (!text || text === "/cancel") {
    const m = await ctx.reply("Массовое добавление отменено.");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
    return;
  }

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const itemsToAdd: Array<{ name: string; price: number; stock: number }> = [];

  for (const line of lines) {
    // Поддерживаем разделители: -, |, ;, /
    const parts = line.split(/[-|;/]/).map(p => p.trim());
    if (parts.length >= 2) {
      const name = parts[0];
      const priceVal = parseFloat(parts[1].replace(",", "."));
      const stockVal = parts[2] ? parseInt(parts[2], 10) : 10;

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
    const m = await ctx.reply("❌ Не удалось распознать ни одного товара. Проверьте формат и попробуйте снова.");
    setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 4000);
    return;
  }

  const addedCount = dbService.addBatchProducts(categoryId, itemsToAdd);
  const resultMsg = `🎉 **Успешно добавлено товаров: ${addedCount} шт.!**\n\n` +
    itemsToAdd.map(i => `• ${i.name} — ${i.price} ₽ (${i.stock} шт.)`).slice(0, 15).join("\n") +
    (itemsToAdd.length > 15 ? `\n...и ещё ${itemsToAdd.length - 15} поз.` : "");

  const m = await ctx.reply(resultMsg, { parse_mode: "Markdown" });
  setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 7000);
}

// ======================== ОДИНОЧНОЕ ДОБАВЛЕНИЕ ТОВАРА ========================
export async function addSingleProductConversation(conversation: MyConversation, ctx: MyContext) {
  const categoryId = (ctx as any).session?.targetCategoryId;
  if (!categoryId) {
    await ctx.reply("❌ Категория не выбрана.");
    return;
  }

  const category = dbService.getCategoryById(categoryId);
  const pathStr = dbService.getCategoryPathString(categoryId);
  const toClean: number[] = [];

  // 1. Название
  const q1 = await ctx.reply(
    `📂 Категория: **${pathStr}**\n\nВведите **название товара** (или /cancel):`,
    { parse_mode: "Markdown" }
  );
  toClean.push(q1.message_id);

  const nameMsg = await conversation.wait();
  if (nameMsg.message?.message_id) toClean.push(nameMsg.message.message_id);
  if (!nameMsg.message?.text || nameMsg.message.text === "/cancel") {
    await cleanupMessages(ctx, toClean);
    return;
  }
  const name = nameMsg.message.text.trim();

  // 2. Описание
  const descKb = new Keyboard().text("⏩ Без описания").row().text("❌ Отмена").resized().oneTime();
  const q2 = await ctx.reply("Введите **описание товара** или нажмите кнопку:", {
    parse_mode: "Markdown",
    reply_markup: descKb
  });
  toClean.push(q2.message_id);

  const descMsg = await conversation.wait();
  if (descMsg.message?.message_id) toClean.push(descMsg.message.message_id);
  if (descMsg.message?.text === "❌ Отмена" || descMsg.message?.text === "/cancel") {
    await cleanupMessages(ctx, toClean);
    await ctx.reply("Отменено.", { reply_markup: { remove_keyboard: true } });
    return;
  }
  const description = descMsg.message?.text === "⏩ Без описания" ? "" : (descMsg.message?.text?.trim() || "");

  // 3. Цена
  const q3 = await ctx.reply("Укажите **цену в рублях** (число, например `1200`):", {
    parse_mode: "Markdown",
    reply_markup: { remove_keyboard: true }
  });
  toClean.push(q3.message_id);

  let price = 0;
  while (true) {
    const priceMsg = await conversation.wait();
    if (priceMsg.message?.message_id) toClean.push(priceMsg.message.message_id);
    if (priceMsg.message?.text === "/cancel") {
      await cleanupMessages(ctx, toClean);
      return;
    }
    const val = parseFloat((priceMsg.message?.text || "").replace(",", "."));
    if (!isNaN(val) && val >= 0) {
      price = val;
      break;
    }
    const errM = await ctx.reply("Введите корректное положительное число для цены:");
    toClean.push(errM.message_id);
  }

  // 4. Количество
  const q4 = await ctx.reply("Укажите **начальное количество на складе** (например `20`):", {
    parse_mode: "Markdown"
  });
  toClean.push(q4.message_id);

  let stock = 0;
  while (true) {
    const stockMsg = await conversation.wait();
    if (stockMsg.message?.message_id) toClean.push(stockMsg.message.message_id);
    if (stockMsg.message?.text === "/cancel") {
      await cleanupMessages(ctx, toClean);
      return;
    }
    const val = parseInt(stockMsg.message?.text || "", 10);
    if (!isNaN(val) && val >= 0) {
      stock = val;
      break;
    }
    const errM = await ctx.reply("Введите целое неотрицательное число:");
    toClean.push(errM.message_id);
  }

  await cleanupMessages(ctx, toClean);

  dbService.addProduct(categoryId, name, description, price, stock);
  const m = await ctx.reply(
    `✅ Товар **"${name}"** добавлен!\n💰 Цена: ${price} ₽ | 📦 Остаток: ${stock} шт.`,
    { parse_mode: "Markdown" }
  );
  setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 4000);
}

// ======================== ИЗМЕНЕНИЕ ОСТАТКА ========================
export async function updateStockConversation(conversation: MyConversation, ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^edit_stock_(\d+)$/);
  const productId = match ? parseInt(match[1], 10) : 0;
  const product = dbService.getProductById(productId);
  if (!product) return;

  const toClean: number[] = [];
  const q = await ctx.reply(`📦 Товар: **${product.name}**\nТекущий остаток: **${product.stock} шт.**\n\nВведите **новое количество** (или /cancel):`, {
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
      const m = await ctx.reply(`✅ Остаток **${product.name}** изменён на: **${val} шт.**`, { parse_mode: "Markdown" });
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      break;
    }
    const errM = await ctx.reply("Введите целое число:");
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
  const q = await ctx.reply(`💰 Товар: **${product.name}**\nТекущая цена: **${product.price} ₽**\n\nВведите **новую цену** (или /cancel):`, {
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
      const m = await ctx.reply(`✅ Цена **${product.name}** изменена на: **${val} ₽**`, { parse_mode: "Markdown" });
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      break;
    }
    const errM = await ctx.reply("Введите корректное число для цены:");
    toClean.push(errM.message_id);
  }
}
