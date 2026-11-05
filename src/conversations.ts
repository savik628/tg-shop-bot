import { MyConversation, MyContext } from "./types.js";
import { dbService } from "./database.js";
import { activeCategoryMap, activeScreenMessageMap } from "./state.js";
import { InlineKeyboard, Keyboard } from "grammy";
import { md } from "./format.js";
import { fetchGoogleSheetsBuffer } from "./googleSheets.js";
import { parseExcelBuffer, importProductsToDb } from "./excel.js";

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

  const customName = dbService.getUserProfileName(userId);
  const baseName = customName || [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Покупатель";
  const userTag = ctx.from?.username ? `@${ctx.from.username}` : "нет юзернейма";
  const clientDisplayName = customName ? `${customName} (${userTag})` : `${baseName} (${userTag})`;

  const result = await conversation.external(() =>
    dbService.checkoutOrder(userId, clientDisplayName, phone, comment)
  );

  if (!result.success || !result.items) {
    await ctx.reply(`❌ Не удалось оформить заявку: ${result.error}`, {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  // Компактное подтверждение покупателю без спама
  let userSummary = `✅ **Заявка #${result.orderId} принята!**\n\n`;
  userSummary += `💰 Сумма к оплате: **${result.total} ₽**\n`;
  userSummary += `📞 Контакт: **${md(phone)}**\n`;
  if (comment && comment !== "Без комментария") {
    userSummary += `💬 Пожелание: ${md(comment)}\n`;
  }
  userSummary += `\nЗаявка отправлена менеджеру!`;

  const backKb = new InlineKeyboard()
    .text("📁 Вернуться на Склад", "cat_nav_root").row()
    .text("📋 Мои заказы", "user_orders");

  const confMsg = await ctx.reply(userSummary, {
    parse_mode: "Markdown",
    reply_markup: backKb
  });
  if (ctx.chat?.id) {
    activeScreenMessageMap.set(ctx.chat.id, confMsg.message_id);
  }

  // Отправка заявки администратору или в группу заказов
  const targetChat = dbService.getOrdersChatId() || dbService.getAdminId();
  if (targetChat) {
    let orderMsg = `🔔 **НОВАЯ ЗАЯВКА #${result.orderId}**\n`;
    orderMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    orderMsg += `👤 **Клиент / Заведение:** ${md(clientDisplayName)}\n`;
    orderMsg += `🆔 **Telegram ID:** \`${userId}\`\n`;
    orderMsg += `📞 **Телефон:** ${md(phone)}\n`;
    if (comment && comment !== "Без комментария") {
      orderMsg += `💬 **Комментарий:** ${md(comment)}\n`;
    }
    orderMsg += `\n📦 **Состав заказа:**\n`;
    for (const item of result.items) {
      orderMsg += `• ${md(item.name)} — ${item.quantity} шт. × ${item.price} ₽ = ${item.subtotal} ₽\n`;
    }
    orderMsg += `\n💰 **ИТОГО:** **${result.total} ₽**`;

    const manageKb = new InlineKeyboard()
      .text("⏳ В работу", `order_status_${result.orderId}_in_progress`)
      .text("✅ Выполнен", `order_status_${result.orderId}_completed`).row()
      .text("❌ Отменить (вернуть на склад)", `order_cancel_${result.orderId}`);

    if (ctx.from?.username) {
      manageKb.row().url("💬 Написать клиенту", `https://t.me/${ctx.from.username}`);
    }

    try {
      await ctx.api.sendMessage(targetChat, orderMsg, {
        parse_mode: "Markdown",
        reply_markup: manageKb
      });
    } catch (e: any) {
      console.error("Не удалось уведомить чат заказов:", e?.message);
    }
  }
}

// ======================== ПОТОКОВОЕ СОЗДАНИЕ ПАПОК ========================
export async function addCategoryConversation(conversation: MyConversation, ctx: MyContext) {
  const userId = ctx.from?.id;
  const parentId = userId ? (activeCategoryMap.get(userId) ?? null) : null;
  const currentPath = dbService.getCategoryPathString(parentId);
  const toClean: number[] = [];

  const doneKb = new InlineKeyboard().text("◀️ Закончить и вернуться", "done_stream_cat");

  const helpText = `📁 **Потоковое создание папок**\n` +
    `📍 Расположение: **${md(currentPath)}**\n` +
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
      await conversation.external(() => dbService.addCategoriesBatch(names, parentId));
      const ack = await ctx.reply(
        `✅ Создано: ${names.map(n => `📁 **${md(n)}**`).join(", ")}\n` +
        `📍 Внутри: ${md(currentPath)}\n\n` +
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
  const userId = ctx.from?.id;
  const categoryId = userId ? activeCategoryMap.get(userId) : null;

  if (!categoryId) {
    await ctx.reply("❌ Сначала откройте папку, в которую хотите добавить товары (например: «Табак ➔ Мастхэв»), и нажмите кнопку «📦 + Товар».", {
      reply_markup: new InlineKeyboard().text("📁 Открыть Склад", "cat_nav_root")
    });
    return;
  }

  const pathStr = dbService.getCategoryPathString(categoryId);
  const toClean: number[] = [];

  const doneKb = new InlineKeyboard().text("◀️ Закончить и вернуться в папку", "done_stream_prod");

  const promptText = `📦 **Потоковое добавление товаров**\n` +
    `📍 Раздел: **${md(pathStr)}**\n` +
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
          const res = await conversation.external(() =>
            dbService.addProduct(categoryId, name, "", price, stock)
          );
          addedCount++;
          if (res.isUpdated) {
            addedNames.push(`🔄 **${md(res.name)}** (остаток +${stock} ➔ всего **${res.totalStock} шт.**, цена: **${res.price} ₽**)`);
          } else {
            addedNames.push(`✅ **${md(res.name)}** (**${res.price} ₽** | **${res.totalStock} шт.**)`);
          }
        }
      }
    }

    if (addedCount > 0) {
      const ack = await ctx.reply(
        `${addedNames.join("\n")}\n` +
        `📍 В папку: ${md(pathStr)}\n\n` +
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

// Быстрое изменение остатка товара
export async function updateStockConversation(conversation: MyConversation, ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^edit_stock_(\d+)$/);
  const productId = match ? parseInt(match[1], 10) : 0;
  const product = dbService.getProductById(productId);
  if (!product) return;

  const toClean: number[] = [];
  const q = await ctx.reply(`📦 **${md(product.name)}**\nТекущий остаток: **${product.stock} шт.**\n\nВведите **новое точное количество** (например \`70\`):`, {
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
      await conversation.external(() => dbService.updateProductStock(productId, val));
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply(`✅ Остаток **${md(product.name)}** обновлён: **${val} шт.**`, { parse_mode: "Markdown" });
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      break;
    }
    const errM = await ctx.reply("Введите целое число:");
    toClean.push(errM.message_id);
  }
}

export async function updatePriceConversation(conversation: MyConversation, ctx: MyContext) {
  // Упрощено: удаление и добавление
}

// ======================== СМЕНА ВЛАДЕЛЬЦА ========================
export async function transferOwnerConversation(conversation: MyConversation, ctx: MyContext) {
  const currentAdmin = dbService.getAdminId();
  if (!currentAdmin || ctx.from?.id !== currentAdmin) {
    await ctx.reply("❌ Доступно только действующему владельцу.");
    return;
  }

  const toClean: number[] = [];
  const kbCancel = new InlineKeyboard().text("❌ Отмена", "cancel_transfer");

  const q = await ctx.reply(
    `👑 **Смена владельца бота**\n\n` +
    `Текущий владелец: \`${currentAdmin}\`\n\n` +
    `Отправьте **Telegram ID** нового владельца (только цифры) или перешлите любое сообщение от него.\n\n` +
    `_Для отмены отправьте /cancel или нажмите кнопку:_`,
    { parse_mode: "Markdown", reply_markup: kbCancel }
  );
  toClean.push(q.message_id);

  let targetId: number | null = null;

  while (true) {
    const res = await conversation.wait();

    if (res.callbackQuery?.data === "cancel_transfer") {
      await res.answerCallbackQuery().catch(() => {});
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply("❌ Смена владельца отменена.");
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      return;
    }

    if (res.message?.message_id) {
      toClean.push(res.message.message_id);
    }

    if (res.message?.text === "/cancel" || res.message?.text === "❌ Отмена") {
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply("❌ Смена владельца отменена.");
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      return;
    }

    // Проверка пересланного сообщения
    const forwardOrigin = (res.message as any)?.forward_origin;
    if (forwardOrigin?.type === "user" && forwardOrigin.sender_user?.id) {
      targetId = forwardOrigin.sender_user.id;
    } else if ((res.message as any)?.forward_from?.id) {
      targetId = (res.message as any).forward_from.id;
    } else if (res.message?.text) {
      const parsed = parseInt(res.message.text.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        targetId = parsed;
      }
    }

    if (targetId) {
      if (targetId === currentAdmin) {
        const err = await ctx.reply("⚠️ Этот пользователь уже является владельцем. Введите другой ID:");
        toClean.push(err.message_id);
        targetId = null;
        continue;
      }
      break;
    }

    const err = await ctx.reply("⚠️ Не удалось распознать ID. Отправьте числовой Telegram ID (например `123456789`) или перешлите сообщение пользователя:");
    toClean.push(err.message_id);
  }

  // Запрос подтверждения
  const confirmKb = new InlineKeyboard()
    .text("✅ Да, передать права", `confirm_transfer_${targetId}`)
    .text("❌ Отмена", "cancel_transfer");

  const confirmMsg = await ctx.reply(
    `⚠️ **Подтверждение передачи прав**\n\n` +
    `Вы собираетесь передать права владельца пользователю с ID:\n` +
    `🆔 **${targetId}**\n\n` +
    `❗️ **Внимание:** После подтверждения вы потеряете доступ к панели управления.\n\n` +
    `Передать права?`,
    { parse_mode: "Markdown", reply_markup: confirmKb }
  );
  toClean.push(confirmMsg.message_id);

  while (true) {
    const nextRes = await conversation.wait();

    if (nextRes.callbackQuery?.data === `confirm_transfer_${targetId}`) {
      await nextRes.answerCallbackQuery().catch(() => {});
      await conversation.external(() => dbService.setAdminId(targetId!));
      await cleanupMessages(ctx, toClean);

      await ctx.reply(
        `🎉 **Права владельца успешно переданы!**\n\nНовый владелец: \`${targetId}\`\nВаша панель управления деактивирована.`,
        { parse_mode: "Markdown" }
      );

      // Оповещение новому владельцу
      try {
        await ctx.api.sendMessage(
          targetId,
          `👑 **Поздравляем!**\n\nВам были переданы права владельца бота.\nДля открытия панели управления нажмите /admin или /start.`
        );
      } catch {}

      return;
    }

    if (nextRes.callbackQuery?.data === "cancel_transfer" || nextRes.message?.text === "/cancel") {
      await nextRes.answerCallbackQuery().catch(() => {});
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply("❌ Передача прав отменена.");
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      return;
    }
  }
}

// ======================== ИЗМЕНЕНИЕ ИМЕНИ / ЗАВЕДЕНИЯ ПОКУПАТЕЛЯ ========================
export async function editCustomerNameConversation(conversation: MyConversation, ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const current = dbService.getUserProfileName(userId);
  const toClean: number[] = [];

  const kb = new InlineKeyboard().text("❌ Отмена", "cancel_edit_name");
  const q = await ctx.reply(
    `👤 **Укажите ваше имя или название заведения**\n\n` +
    (current ? `Текущее значение: **${md(current)}**\n\n` : "") +
    `Напишите имя или название сообщением (например \`Мята Lounge\` или \`Алексей\`):\n` +
    `_Для отмены нажмите кнопку ниже:_`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
  toClean.push(q.message_id);

  while (true) {
    const res = await conversation.wait();

    if (res.callbackQuery?.data === "cancel_edit_name") {
      await res.answerCallbackQuery().catch(() => {});
      await cleanupMessages(ctx, toClean);
      return;
    }

    if (res.message?.message_id) {
      toClean.push(res.message.message_id);
    }

    if (res.message?.text === "/cancel" || res.message?.text === "❌ Отмена") {
      await cleanupMessages(ctx, toClean);
      return;
    }

    const text = res.message?.text?.trim();
    if (text && text.length > 0 && text.length <= 50) {
      await conversation.external(() => dbService.setUserProfileName(userId, text));
      await cleanupMessages(ctx, toClean);
      const m = await ctx.reply(`✅ Сохранено: **${md(text)}**`, {
        parse_mode: "Markdown"
      });
      setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, m.message_id).catch(() => {}), 3000);
      break;
    }

    const err = await ctx.reply("Введите текст (от 1 до 50 символов) или /cancel:");
    toClean.push(err.message_id);
  }
}

// ======================== ПРИВЯЗКА GOOGLE ТАБЛИЦЫ ========================
export async function bindGoogleSheetsConversation(conversation: MyConversation, ctx: MyContext) {
  const currentAdmin = dbService.getAdminId();
  if (!currentAdmin || ctx.from?.id !== currentAdmin) {
    await ctx.reply("❌ Доступно только администратору.");
    return;
  }

  const currentUrl = dbService.getGoogleSheetsUrl();
  const toClean: number[] = [];

  const kb = new InlineKeyboard().text("❌ Отмена", "cancel_sheets_bind");
  let promptText = `📊 **Привязка Google Таблицы к складу**\n\n`;
  if (currentUrl) {
    promptText += `Текущая привязанная таблица:\n\`${currentUrl}\`\n\n`;
    promptText += `Отправьте **новую ссылку** на Google Таблицу:\n`;
  } else {
    promptText += `Отправьте **ссылку на Google Таблицу** в чат:\n`;
  }
  promptText += `\n💡 **Требования к доступу:**\n` +
    `В таблице должен быть открыт доступ по ссылке:\n` +
    `_«Все, у кого есть ссылка — Читатель»_\n\n` +
    `_Для отмены нажмите кнопку ниже:_`;

  const q = await ctx.reply(promptText, { parse_mode: "Markdown", reply_markup: kb });
  toClean.push(q.message_id);

  while (true) {
    const res = await conversation.wait();

    if (res.callbackQuery?.data === "cancel_sheets_bind") {
      await res.answerCallbackQuery().catch(() => {});
      await cleanupMessages(ctx, toClean);
      return;
    }

    if (res.message?.message_id) {
      toClean.push(res.message.message_id);
    }

    if (res.message?.text === "/cancel" || res.message?.text === "❌ Отмена") {
      await cleanupMessages(ctx, toClean);
      return;
    }

    const text = res.message?.text?.trim();
    if (!text || !text.includes("docs.google.com/spreadsheets")) {
      const err = await ctx.reply("⚠️ Пожалуйста, отправьте корректную ссылку на Google Таблицу (вида https://docs.google.com/spreadsheets/d/.../edit) или /cancel:");
      toClean.push(err.message_id);
      continue;
    }

    const checkingMsg = await ctx.reply("⏳ Проверяю доступ к таблице и загружаю структуру...");
    toClean.push(checkingMsg.message_id);

    const fetchRes = await conversation.external(() => fetchGoogleSheetsBuffer(text));
    if (!fetchRes.success || !fetchRes.buffer) {
      const err = await ctx.reply(`❌ **Не удалось загрузить таблицу:**\n\n${fetchRes.error || "ошибка"}\n\nПроверьте доступ и отправьте ссылку снова или /cancel:`, { parse_mode: "Markdown" });
      toClean.push(err.message_id);
      continue;
    }

    const parseRes = parseExcelBuffer(fetchRes.buffer);
    if (parseRes.items.length === 0) {
      const err = await ctx.reply("❌ В таблице не найдены строки с товарами. Убедитесь, что заполнены колонки `Категория`, `Товар`, `Цена`, `Количество`.\n\nПопробуйте снова или /cancel:");
      toClean.push(err.message_id);
      continue;
    }

    // Сохраняем URL и проводим первичную синхронизацию
    await conversation.external(() => {
      dbService.setGoogleSheetsUrl(text);
      const nowStr = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
      dbService.setGoogleSheetsLastSync(nowStr);
    });

    const importRes = await conversation.external(() => importProductsToDb(parseRes.items, "replace_stock"));

    await cleanupMessages(ctx, toClean);

    let summaryText = `🎉 **Google Таблица успешно подключена!**\n`;
    summaryText += `━━━━━━━━━━━━━━━━━━━━\n`;
    summaryText += `📦 Распознано товаров: **${parseRes.items.length} шт.**\n`;
    summaryText += `📁 Создано новых папок: **${importRes.categoriesCreated}**\n`;
    summaryText += `📦 Создано новых позиций: **${importRes.productsCreated}**\n`;
    summaryText += `🔄 Обновлено позиций: **${importRes.productsUpdated}**\n\n`;
    summaryText += `Теперь при любом изменении в Google Таблице просто нажмите кнопку **«🔄 Синхронизировать»** в панели управления!`;

    const backKb = new InlineKeyboard()
      .text("📁 Открыть Склад", "cat_nav_root").row()
      .text("⚙️ В управление", "admin_main");

    await ctx.reply(summaryText, { parse_mode: "Markdown", reply_markup: backKb });
    break;
  }
}
