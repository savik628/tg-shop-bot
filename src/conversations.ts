import { MyConversation, MyContext } from "./types.js";
import { dbService } from "./database.js";
import { InlineKeyboard, Keyboard } from "grammy";

// Диалог оформления заказа
export async function checkoutConversation(conversation: MyConversation, ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cart = dbService.getCart(userId);
  if (cart.length === 0) {
    await ctx.reply("❌ Ваша корзина пуста. Добавьте товары из каталога перед оформлением.");
    return;
  }

  // 1. Запрос контакта
  const contactKeyboard = new Keyboard()
    .requestContact("📱 Поделиться номером телефона")
    .row()
    .text("❌ Отменить оформление")
    .resized()
    .oneTime();

  await ctx.reply(
    "📝 **Оформление заказа**\n\nПожалуйста, отправьте ваш номер телефона, нажав кнопку ниже или напишите его в чат сообщением:",
    { parse_mode: "Markdown", reply_markup: contactKeyboard }
  );

  let phone = "";
  while (true) {
    const response = await conversation.wait();
    if (response.message?.text === "❌ Отменить оформление") {
      await ctx.reply("Оформление заказа отменено.", { reply_markup: { remove_keyboard: true } });
      return;
    }

    if (response.message?.contact?.phone_number) {
      phone = response.message.contact.phone_number;
      break;
    } else if (response.message?.text && response.message.text.trim().length >= 6) {
      phone = response.message.text.trim();
      break;
    } else {
      await ctx.reply("Пожалуйста, нажмите кнопку «📱 Поделиться номером телефона» или введите корректный номер:");
    }
  }

  // 2. Запрос комментария
  const skipKeyboard = new Keyboard()
    .text("⏩ Пропустить комментарий")
    .row()
    .text("❌ Отменить оформление")
    .resized()
    .oneTime();

  await ctx.reply(
    "💬 Укажите комментарий к заказу (например: адрес доставки, пожелания по времени) или нажмите «Пропустить»:",
    { reply_markup: skipKeyboard }
  );

  let comment = "Без комментария";
  const commentResponse = await conversation.wait();
  if (commentResponse.message?.text === "❌ Отменить оформление") {
    await ctx.reply("Оформление заказа отменено.", { reply_markup: { remove_keyboard: true } });
    return;
  }
  if (commentResponse.message?.text && commentResponse.message.text !== "⏩ Пропустить комментарий") {
    comment = commentResponse.message.text.trim();
  }

  // Оформление в БД
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
  userSummary += `Владелец получил заявку и свяжется с вами в ближайшее время!`;

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
      console.error("Не удалось отправить уведомление админу:", e?.message);
    }
  }
}

// Диалог добавления категории
export async function addCategoryConversation(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("🏷 Введите название новой категории (или отправьте /cancel для отмены):");
  const response = await conversation.wait();
  const text = response.message?.text?.trim();

  if (!text || text === "/cancel") {
    await ctx.reply("Действие отменено.");
    return;
  }

  try {
    dbService.addCategory(text);
    await ctx.reply(`✅ Категория **"${text}"** успешно создана!`, { parse_mode: "Markdown" });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка добавления категории: ${err.message || "Возможно, такая категория уже существует"}`);
  }
}

// Диалог добавления товара
export async function addProductConversation(conversation: MyConversation, ctx: MyContext) {
  const categories = dbService.getCategories();
  if (categories.length === 0) {
    await ctx.reply("❌ Сначала создайте хотя бы одну категорию!");
    return;
  }

  const kb = new InlineKeyboard();
  categories.forEach((cat, index) => {
    kb.text(cat.name, `addprod_cat_${cat.id}`);
    if (index % 2 === 1) kb.row();
  });
  kb.row().text("❌ Отмена", "admin_cancel");

  await ctx.reply("Выберите категорию для нового товара:", { reply_markup: kb });

  const catCallback = await conversation.waitForCallbackQuery(/^addprod_cat_(\d+)$/);
  await catCallback.answerCallbackQuery();
  const categoryId = parseInt(catCallback.match[1], 10);
  const selectedCat = categories.find(c => c.id === categoryId);

  // 1. Название
  await ctx.reply(`Категория: **${selectedCat?.name}**.\n\nВведите **название товара** (или /cancel):`, { parse_mode: "Markdown" });
  const nameMsg = await conversation.wait();
  if (!nameMsg.message?.text || nameMsg.message.text === "/cancel") {
    await ctx.reply("Отменено.");
    return;
  }
  const name = nameMsg.message.text.trim();

  // 2. Описание
  const descKb = new Keyboard().text("⏩ Без описания").row().text("❌ Отмена").resized().oneTime();
  await ctx.reply("Введите **описание товара** или нажмите «Без описания»:", {
    parse_mode: "Markdown",
    reply_markup: descKb
  });
  const descMsg = await conversation.wait();
  if (descMsg.message?.text === "❌ Отмена" || descMsg.message?.text === "/cancel") {
    await ctx.reply("Отменено.", { reply_markup: { remove_keyboard: true } });
    return;
  }
  const description = descMsg.message?.text === "⏩ Без описания" ? "" : (descMsg.message?.text?.trim() || "");

  // 3. Цена
  await ctx.reply("Укажите **цену товара в рублях** (число, например `450` или `1299.90`):", {
    parse_mode: "Markdown",
    reply_markup: { remove_keyboard: true }
  });

  let price = 0;
  while (true) {
    const priceMsg = await conversation.wait();
    if (priceMsg.message?.text === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }
    const val = parseFloat((priceMsg.message?.text || "").replace(",", "."));
    if (!isNaN(val) && val >= 0) {
      price = val;
      break;
    }
    await ctx.reply("Пожалуйста, введите корректное положительное число для цены:");
  }

  // 4. Остаток на складе
  await ctx.reply("Укажите **начальное количество в наличии** (целое число, например `10` или `0`):", {
    parse_mode: "Markdown"
  });

  let stock = 0;
  while (true) {
    const stockMsg = await conversation.wait();
    if (stockMsg.message?.text === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }
    const val = parseInt(stockMsg.message?.text || "", 10);
    if (!isNaN(val) && val >= 0) {
      stock = val;
      break;
    }
    await ctx.reply("Пожалуйста, введите целое неотрицательное число для количества:");
  }

  // Сохранение
  const productId = dbService.addProduct(categoryId, name, description, price, stock);
  await ctx.reply(
    `✅ Товар успешно добавлен!\n\n🏷 **${name}**\n📂 Категория: ${selectedCat?.name}\n💰 Цена: ${price} ₽\n📦 В наличии: ${stock} шт.\n${description ? `📝 Описание: ${description}` : ""}`,
    { parse_mode: "Markdown" }
  );
}

// Диалог изменения остатка
export async function updateStockConversation(conversation: MyConversation, ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^edit_stock_(\d+)$/);
  const productId = match ? parseInt(match[1], 10) : 0;
  const product = dbService.getProductById(productId);

  if (!product) {
    await ctx.reply("Товар не найден.");
    return;
  }

  await ctx.reply(`📦 Товар: **${product.name}**\nТекущий остаток: **${product.stock} шт.**\n\nВведите **новое количество** на складе (или /cancel):`, {
    parse_mode: "Markdown"
  });

  while (true) {
    const msg = await conversation.wait();
    if (msg.message?.text === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }
    const val = parseInt(msg.message?.text || "", 10);
    if (!isNaN(val) && val >= 0) {
      dbService.updateProductStock(productId, val);
      await ctx.reply(`✅ Остаток товара **${product.name}** обновлён: **${val} шт.**`, { parse_mode: "Markdown" });
      break;
    }
    await ctx.reply("Введите целое неотрицательное число:");
  }
}

// Диалог изменения цены
export async function updatePriceConversation(conversation: MyConversation, ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^edit_price_(\d+)$/);
  const productId = match ? parseInt(match[1], 10) : 0;
  const product = dbService.getProductById(productId);

  if (!product) {
    await ctx.reply("Товар не найден.");
    return;
  }

  await ctx.reply(`💰 Товар: **${product.name}**\nТекущая цена: **${product.price} ₽**\n\nВведите **новую цену** в рублях (или /cancel):`, {
    parse_mode: "Markdown"
  });

  while (true) {
    const msg = await conversation.wait();
    if (msg.message?.text === "/cancel") {
      await ctx.reply("Отменено.");
      return;
    }
    const val = parseFloat((msg.message?.text || "").replace(",", "."));
    if (!isNaN(val) && val >= 0) {
      dbService.updateProductPrice(productId, val);
      await ctx.reply(`✅ Цена товара **${product.name}** обновлена: **${val} ₽**`, { parse_mode: "Markdown" });
      break;
    }
    await ctx.reply("Введите корректное число для цены:");
  }
}
