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
  userSummary += `Владелец склада получил заявку и свяжется с вами!`;

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

// ======================== ПОТОКОВОЕ СОЗДАНИЕ ПАПОК ========================
export async function addCategoryConversation(conversation: MyConversation, ctx: MyContext) {
  const parentId = (ctx as any).session?.targetCategoryId ?? null;
  const currentPath = dbService.getCategoryPathString(parentId);
  const toClean: number[] = [];

  const doneKb = new InlineKeyboard().text("◀️ Закончить и вернуться", "done_stream_cat");

  const helpText = `📁 **Потоковое создание папок**\n` +
    `📍 Расположение: **${currentPath}**\n` +
    `_(Все созданные папки будут вложены строго сюда)_\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Отправляйте названия папок сообщениями подряд:\n\n` +
    `_Примеры сообщений:_\n` +
    `\`Крепкая линейка\`\n` +
    `\`Легкая, Средняя, Крепкая\` _(можно несколько через запятую)_\n\n` +
    `Когда закончите, нажмите кнопку ниже:`;

  const q = await ctx.reply(helpText, { parse_mode: "Markdown", reply_markup: doneKb });
  toClean.push(q.message_id);

  while (true) {
    const update = await conversation.wait();

    // Завершение по кнопке
    if (update.callbackQuery?.data === "done_stream_cat") {
      await update.answerCallbackQuery();
      break;
    }

    if (update.message?.message_id) toClean.push(update.message.message_id);
    const text = update.message?.text?.trim();

    if (!text || text === "/cancel" || text === "/done" || text === "Назад") {
      break;
    }

    const names = text
      .split(/[\n,]/)
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (names.length > 0) {
      dbService.addCategoriesBatch(names, parentId);
      const ack = await ctx.reply(
        `✅ Создано: ${names.map(n => `📁 **${n}**`).join(", ")}\n` +
        `📍 Внутри: _${currentPath}_\n\n` +
        `_Отправьте следующее название папки или нажмите кнопку ниже:_`,
        { parse_mode: "Markdown", reply_markup: doneKb }
      );
      toClean.push(ack.message_id);
    } else {
      const err = await ctx.reply("Введите корректное имя папки:", { reply_markup: doneKb });
      toClean.push(err.message_id);
    }
  }

  await cleanupMessages(ctx, toClean);
  const exitMsg = await ctx.reply(`📁 Создание папок завершено.`);
  setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, exitMsg.message_id).catch(() => {}), 2500);
}

// ======================== ПОТОКОВОЕ ДОБАВЛЕНИЕ ТОВАРОВ (ЧЕРЕЗ ПРОБЕЛ) ========================
export async function addSingleProductConversation(conversation: MyConversation, ctx: MyContext) {
  const categoryId = (ctx as any).session?.targetCategoryId;
  if (!categoryId) {
    await ctx.reply("❌ Папка не выбрана.");
    return;
  }

  const pathStr = dbService.getCategoryPathString(categoryId);
  const toClean: number[] = [];

  const doneKb = new InlineKeyboard().text("◀️ Закончить и вернуться в папку", "done_stream_prod");

  const promptText = `📦 **Потоковое добавление товаров**\n` +
    `📍 Раздел: **${pathStr}**\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Вводите товары через пробел: \`Название Цена Количество\`\n\n` +
    `_Примеры сообщений:_\n` +
    `\`Pinkman 850 20\`\n` +
    `\`Двойное яблоко 900 15\`\n` +
    `\`Мята 750\` _(если не указывать остаток, будет 50 шт.)_\n\n` +
    `💡 **Просто отправляйте товары сообщениями подряд!**\n` +
    `Они будут мгновенно добавляться в эту папку. Для завершения нажмите кнопку ниже:`;

  const q = await ctx.reply(promptText, { parse_mode: "Markdown", reply_markup: doneKb });
  toClean.push(q.message_id);

  while (true) {
    const update = await conversation.wait();

    // Завершение по кнопке
    if (update.callbackQuery?.data === "done_stream_prod") {
      await update.answerCallbackQuery();
      break;
    }

    if (update.message?.message_id) toClean.push(update.message.message_id);
    const text = update.message?.text?.trim();

    if (!text || text === "/cancel" || text === "/done" || text === "Назад") {
      break;
    }

    // Если отправили список из нескольких строк
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let addedCount = 0;
    const addedNames: string[] = [];

    for (const line of lines) {
      // Поддержка дефиса, слэша или чистого пробела
      // Заменяем разделители на пробелы для унификации
      const normalized = line.replace(/[-|;/]/g, " ").trim();
      const tokens = normalized.split(/\s+/).filter(Boolean);

      if (tokens.length >= 2) {
        let name = "";
        let price = 0;
        let stock = 50;

        const lastToken = tokens[tokens.length - 1];
        const prevToken = tokens[tokens.length - 2];

        const lastNum = parseFloat(lastToken.replace(",", "."));
        const prevNum = parseFloat(prevToken.replace(",", "."));

        if (!isNaN(lastNum) && !isNaN(prevNum) && tokens.length >= 3) {
          // Формат: Название Цена Количество
          stock = Math.floor(lastNum);
          price = prevNum;
          name = tokens.slice(0, tokens.length - 2).join(" ");
        } else if (!isNaN(lastNum)) {
          // Формат: Название Цена (остаток 50 по умолч.)
          price = lastNum;
          name = tokens.slice(0, tokens.length - 1).join(" ");
        }

        if (name && price >= 0 && stock >= 0) {
          dbService.addProduct(categoryId, name, "", price, stock);
          addedCount++;
          addedNames.push(`${name} (${price} ₽, ${stock} шт.)`);
        }
      }
    }

    if (addedCount > 0) {
      const ack = await ctx.reply(
        `✅ Добавлено: **${addedNames.join(", ")}**\n` +
        `📍 В папку: _${pathStr}_\n\n` +
        `_Отправьте следующий товар или нажмите кнопку ниже:_`,
        { parse_mode: "Markdown", reply_markup: doneKb }
      );
      toClean.push(ack.message_id);
    } else {
      const err = await ctx.reply(
        "❌ Не удалось распознать формат.\nНапишите: `Название Цена Количество` (например: `Pinkman 850 20`):",
        { parse_mode: "Markdown", reply_markup: doneKb }
      );
      toClean.push(err.message_id);
    }
  }

  await cleanupMessages(ctx, toClean);
  const exitMsg = await ctx.reply(`📦 Добавление товаров завершено.`);
  setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, exitMsg.message_id).catch(() => {}), 2500);
}

// Заглушки для сохранения совместимости
export async function addBatchProductsConversation(conversation: MyConversation, ctx: MyContext) {
  await addSingleProductConversation(conversation, ctx);
}

export async function renameCategoryConversation(conversation: MyConversation, ctx: MyContext) {
  // Упрощено: не используется
}

export async function updateStockConversation(conversation: MyConversation, ctx: MyContext) {
  // Упрощено: удаление и добавление
}

export async function updatePriceConversation(conversation: MyConversation, ctx: MyContext) {
  // Упрощено: удаление и добавление
}
