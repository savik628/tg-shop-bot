import { Bot, InlineKeyboard, Keyboard, InputFile, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import dotenv from "dotenv";
import http from "node:http";
import { MyContext, SessionData } from "./types.js";
import { dbService, OrderRecord, OrderItem, Product } from "./database.js";
import { activeCategoryMap, activeScreenMessageMap } from "./state.js";
import { md } from "./format.js";
import {
  generateExcelTemplate,
  parseExcelBuffer,
  importProductsToDb,
  ParsedItem
} from "./excel.js";
import { fetchGoogleSheetsBuffer, extractSpreadsheetId } from "./googleSheets.js";
import {
  checkoutConversation,
  addCategoryConversation,
  addSingleProductConversation,
  updateStockConversation,
  transferOwnerConversation,
  editCustomerNameConversation,
  bindGoogleSheetsConversation
} from "./conversations.js";

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("ОШИБКА: BOT_TOKEN не указан!");
  process.exit(1);
}

export const bot = new Bot<MyContext>(token);

// Кэш для подтверждения импорта Excel
const pendingExcelImports = new Map<string, { items: ParsedItem[]; filename: string; timestamp: number }>();

bot.use(session({ initial: (): SessionData => ({ targetCategoryId: null }) }));
bot.use(conversations());

bot.use(createConversation(checkoutConversation));
bot.use(createConversation(addCategoryConversation));
bot.use(createConversation(addSingleProductConversation));
bot.use(createConversation(updateStockConversation));
bot.use(createConversation(transferOwnerConversation));
bot.use(createConversation(editCustomerNameConversation));
bot.use(createConversation(bindGoogleSheetsConversation));

// Официальное меню Telegram
bot.api.setMyCommands([
  { command: "start", description: "📁 Каталог и Склад" },
  { command: "cart", description: "🛒 Корзина заказа" },
  { command: "orders", description: "📋 Мои заказы / Заявки" },
  { command: "sync", description: "🔄 Синхронизировать склад" },
  { command: "contacts", description: "🏢 Контакты и время работы" },
  { command: "profile", description: "👤 Моё имя / профиль" },
  { command: "admin", description: "⚙️ Управление складом" }
]).catch(() => {});

function isAdmin(ctx: MyContext): boolean {
  const currentAdmin = dbService.getAdminId();
  return Boolean(currentAdmin && ctx.from?.id === currentAdmin && !dbService.isBuyerMode(ctx.from!.id));
}

function isOwner(ctx: MyContext): boolean {
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
    const customName = uid ? dbService.getUserProfileName(uid) : null;
    const profileLabel = customName ? `👤 ${customName}` : "👤 Моё имя";
    kb.text("📋 Мои заказы").text(profileLabel).row();
    kb.text(`🏢 ${dbService.getVenueName()}`);
  }

  return kb.resized();
}

async function deleteUserMessage(ctx: MyContext) {
  try {
    await ctx.deleteMessage();
  } catch {}
}

export async function sendOrEditScreen(ctx: MyContext, text: string, kb?: InlineKeyboard) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const isPrivate = ctx.chat?.type === "private";

  // 1. В приватном диалоге сразу удаляем входящее сообщение пользователя
  if (isPrivate && ctx.message?.message_id) {
    await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => {});
  }

  // 2. Если есть callback_query, пробуем мгновенно отредактировать экран на месте без прыжков
  if (ctx.callbackQuery?.message?.message_id) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        reply_markup: kb
      });
      activeScreenMessageMap.set(chatId, ctx.callbackQuery.message.message_id);
      return;
    } catch (err: any) {
      if (err?.description?.includes("message is not modified")) {
        return;
      }
    }
  }

  // 3. Удаляем предыдущий экран бота, обеспечивая Single-Window ощущение Web-App
  const prevMsgId = activeScreenMessageMap.get(chatId);
  if (prevMsgId && isPrivate) {
    await ctx.api.deleteMessage(chatId, prevMsgId).catch(() => {});
  }

  // 4. Отправляем единственный актуальный экран
  try {
    const sent = await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: kb
    });
    activeScreenMessageMap.set(chatId, sent.message_id);
  } catch (err: any) {
    console.error("Ошибка отображения экрана:", err?.message);
  }
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
  const sheetsUrl = dbService.getGoogleSheetsUrl();
  const sheetsSync = dbService.getGoogleSheetsLastSync();

  let text = `⚙️ **Управление складом и заказами**\n\n`;
  text += `🏢 Заведение: **${md(venue)}**\n`;
  text += `📢 Чат заказов: **${ordersChat ? `Подключен (${ordersChat})` : "В личку админу"}**\n`;
  if (sheetsUrl) {
    text += `📊 Google Таблица: **Подключена**\n`;
    if (sheetsSync) text += `🕒 Синхронизировано: **${sheetsSync}**\n`;
  } else {
    text += `📊 Google Таблица: _не подключена_\n`;
  }
  text += `\n📊 **Сводка:**\n`;
  text += `• Всего товаров: **${stats.productsCount} шт.**\n`;
  text += `• Заказов: **${stats.ordersCount}**\n`;
  text += `• Выручка: **${stats.totalSales} ₽**\n\n`;
  text += `_Быстрые команды: /sync — синхронизация, /contacts — контакты_`;

  const kb = new InlineKeyboard()
    .text("📁 Открыть Склад", "cat_nav_root").row()
    .text("📋 Все заявки склада", "view_orders_all").row();

  if (sheetsUrl) {
    kb.text("🔄 Синхронизировать склад", "admin_sheets_quick_sync").row();
    kb.text("📊 Настройки Google Таблицы", "admin_sheets_menu");
  } else {
    kb.text("📊 Подключить Google Таблицу", "admin_sheets_menu");
  }
  kb.text("📁 + Папки", "admin_create_root_cat").row();

  kb.text("📊 Загрузить Excel", "admin_excel_start")
    .text("📥 Шаблон Excel", "admin_excel_template").row()
    .text("👑 Сменить владельца", "admin_transfer_owner").row()
    .text("👤 Режим покупателя", "admin_drop_role").row()
    .text("🔄 Обновить сводку", "admin_refresh").row()
    .text("◀️ В меню", "menu_main");

  await sendOrEditScreen(ctx, text, kb);
}

// Профиль покупателя (имя / заведение)
async function showCustomerProfile(ctx: MyContext) {
  const uid = ctx.from?.id;
  if (!uid) return;

  const profileName = dbService.getUserProfileName(uid);

  let text = `👤 **Профиль покупателя**\n\n`;
  text += `Имя / Заведение: **${md(profileName || "Не указано")}**\n\n`;
  text += `_Вы можете указать своё имя или название заведения, чтобы при заказе со склада было понятно, от кого поступила заявка._`;

  const kb = new InlineKeyboard()
    .text("✏️ Написать имя / заведение", "customer_edit_name").row()
    .text("📁 Перейти к товарам", "cat_nav_root");

  await sendOrEditScreen(ctx, text, kb);
}

// Контакты заведения для покупателя
async function showContacts(ctx: MyContext) {
  const venue = dbService.getVenueName();
  const contacts = dbService.getVenueContacts();
  const body = contacts ? md(contacts) : "Контакты пока не указаны.";
  const text = `🏢 **${md(venue)}**\n\n${body}`;

  const kb = new InlineKeyboard().text("📁 Перейти к товарам", "cat_nav_root");

  await sendOrEditScreen(ctx, text, kb);
}

// ======================== КОМАНДЫ ========================

bot.command("start", async (ctx) => {
  await deleteUserMessage(ctx);
  const chatId = ctx.chat?.id;
  if (chatId) {
    const prev = activeScreenMessageMap.get(chatId);
    if (prev) {
      await ctx.api.deleteMessage(chatId, prev).catch(() => {});
    }
    const init = await ctx.reply("⚡️ Загрузка каталога...", { reply_markup: getBottomKeyboard(ctx) });
    setTimeout(() => {
      ctx.api.deleteMessage(chatId, init.message_id).catch(() => {});
    }, 1200);
  }
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

bot.command(["profile", "name", "info"], async (ctx) => {
  await deleteUserMessage(ctx);
  await showCustomerProfile(ctx);
});

bot.command("contacts", async (ctx) => {
  await deleteUserMessage(ctx);
  await showContacts(ctx);
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

  // Владелец в buyer mode — выключить и показать панель
  if (dbService.isBuyerMode(uid)) {
    dbService.setBuyerMode(uid, false);
  }

  await showAdminPanel(ctx);
});

bot.callbackQuery("admin_transfer_owner", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) {
    return ctx.reply("❌ Доступно только владельцу.");
  }
  await ctx.conversation.enter("transferOwnerConversation");
});

bot.command("transfer_owner", async (ctx) => {
  await deleteUserMessage(ctx);
  if (!isOwner(ctx)) {
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

  if (currentAdmin === uid) {
    // Владелец — выключить buyer mode и показать панель
    dbService.setBuyerMode(uid, false);
    await ctx.answerCallbackQuery({ text: "Вы назначены владельцем!" });
    await showAdminPanel(ctx);
    return;
  }

  if (currentAdmin !== null) {
    await ctx.answerCallbackQuery({ text: "Владелец уже назначен!" });
    await ctx.reply("❌ Владелец уже назначен.");
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

  if (currentAdmin === uid) {
    // Владелец — выключить buyer mode и показать панель
    dbService.setBuyerMode(uid, false);
    await showAdminPanel(ctx);
    return;
  }

  if (currentAdmin !== null) {
    await ctx.reply("❌ Владелец уже назначен.");
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

bot.callbackQuery("admin_drop_role", async (ctx) => {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery();
    return;
  }
  const uid = ctx.from!.id;
  dbService.setBuyerMode(uid, true);
  await ctx.answerCallbackQuery({ text: "Режим покупателя включён" });
  await ctx.reply(
    "🔄 Вы в режиме покупателя. Владение сохранено.\n\nЧтобы вернуться в панель — /admin",
    {
      reply_markup: getBottomKeyboard(ctx)
    }
  );
});

async function handleResetAdmin(ctx: MyContext) {
  await deleteUserMessage(ctx);
  if (!isOwner(ctx)) return;
  const uid = ctx.from!.id;
  dbService.setBuyerMode(uid, true);
  await ctx.reply(
    "🔄 Вы в режиме покупателя. Владение сохранено.\n\nЧтобы вернуться в панель — /admin",
    {
      reply_markup: getBottomKeyboard(ctx)
    }
  );
}

bot.command("reset_admin", handleResetAdmin);
bot.hears(/^(убери владельца|сбросить владельца|сброс админа)$/i, handleResetAdmin);

bot.command("set_orders_chat", async (ctx) => {
  if (!isOwner(ctx)) {
    if (ctx.chat?.type === "private") {
      await ctx.reply("❌ Добавьте бота в группу для заказов и выполните команду /set_orders_chat внутри этой группы.");
    }
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
  if (!isOwner(ctx)) return;
  const newName = ctx.message?.text?.replace("/set_venue", "").trim();
  if (newName) {
    dbService.setVenueName(newName);
    await ctx.reply(`✅ Название заведения обновлено: **${md(newName)}**!`, {
      parse_mode: "Markdown",
      reply_markup: getBottomKeyboard(ctx)
    });
  } else {
    await ctx.reply("Напишите: `/set_venue Название Заведения`", { parse_mode: "Markdown" });
  }
});

bot.command("set_contacts", async (ctx) => {
  if (!isOwner(ctx)) return;
  const rawText = ctx.message?.text || "";
  const match = rawText.match(/^\/set_contacts(?:@\S+)?(?:\s+([\s\S]+))?$/);
  const newContacts = match?.[1]?.trim();
  if (newContacts) {
    dbService.setVenueContacts(newContacts);
    await ctx.reply("✅ Контакты обновлены");
    await showContacts(ctx);
  } else {
    await ctx.reply("Напишите: /set_contacts Адрес, телефон, часы работы");
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

bot.hears(/^👤\s*(.*)$/, async (ctx) => {
  await deleteUserMessage(ctx);
  if (isAdmin(ctx)) {
    await showAdminPanel(ctx);
  } else {
    await showCustomerProfile(ctx);
  }
});

bot.hears(/^🏢\s*(.*)$/, async (ctx) => {
  await deleteUserMessage(ctx);
  await showContacts(ctx);
});

bot.callbackQuery("customer_edit_name", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("editCustomerNameConversation");
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

// ======================== ИМПОРТ ИЗ EXCEL ========================

async function showExcelImportInfo(ctx: MyContext) {
  if (!isAdmin(ctx)) return;

  const text =
    `📊 **Импорт товаров и категорий из Excel**\n\n` +
    `Вы можете загрузить весь склад одним файлом формата **.xlsx**, **.xls** или **.csv**.\n\n` +
    `📋 **Требуемые колонки таблицы:**\n` +
    `• **Категория** — папка товара (подпапки через слэш, напр. \`Табак / Darkside\`)\n` +
    `• **Товар** — название товара\n` +
    `• **Цена** — стоимость в рублях\n` +
    `• **Количество** — остаток на складе (шт)\n\n` +
    `📎 **Как загрузить:**\n` +
    `Просто прикрепите и **отправьте Excel файл документом** в этот чат.\n\n` +
    `Если у вас нет готового файла, скачайте наш готовый шаблон:`;

  const kb = new InlineKeyboard()
    .text("📥 Скачать шаблон Excel", "admin_excel_template").row()
    .text("◀️ В управление", "admin_main");

  await sendOrEditScreen(ctx, text, kb);
}

bot.command(["excel", "import"], async (ctx) => {
  await deleteUserMessage(ctx);
  await showExcelImportInfo(ctx);
});

bot.callbackQuery("admin_excel_start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showExcelImportInfo(ctx);
});

bot.callbackQuery("admin_excel_template", async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const buf = generateExcelTemplate();
    await ctx.replyWithDocument(new InputFile(buf, "shablon_sklada.xlsx"), {
      caption: "📥 **Шаблон для заполнения склада**\n\nЗаполните строки своими товарами и отправьте файл обратно боту документом.",
      parse_mode: "Markdown"
    });
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка генерации шаблона: ${err?.message || "сбой"}`);
  }
});

bot.on("message:document", async (ctx) => {
  if (!isAdmin(ctx)) return;

  const doc = ctx.message.document;
  const fileName = doc.file_name || "file.xlsx";
  const isExcel = /\.(xlsx|xls|csv)$/i.test(fileName);
  if (!isExcel) return;

  const waitMsg = await ctx.reply("⏳ Загружаю и анализирую Excel файл...");

  try {
    const file = await ctx.api.getFile(doc.file_id);
    if (!file.file_path) {
      throw new Error("Не удалось получить путь к файлу Telegram");
    }

    const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseResult = parseExcelBuffer(buffer);

    if (parseResult.items.length === 0) {
      await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      const kb = new InlineKeyboard().text("📥 Скачать пример шаблона", "admin_excel_template");
      await ctx.reply(
        "❌ **В файле не найдено строк с товарами.**\n\nУбедитесь, что в файле есть колонки `Категория`, `Товар`, `Цена`, `Количество`.\nИли скачайте шаблон:",
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    const importId = Math.random().toString(36).substring(2, 9);
    pendingExcelImports.set(importId, {
      items: parseResult.items,
      filename: fileName,
      timestamp: Date.now()
    });

    const now = Date.now();
    for (const [k, v] of pendingExcelImports.entries()) {
      if (now - v.timestamp > 30 * 60 * 1000) pendingExcelImports.delete(k);
    }

    const uniqueCats = new Set(parseResult.items.map(i => i.categoryPath.join(" / ")));

    let previewText = `📊 **Анализ Excel: \`${md(fileName)}\`**\n`;
    previewText += `━━━━━━━━━━━━━━━━━━━━\n`;
    previewText += `📦 Найдено товаров: **${parseResult.items.length} шт.**\n`;
    previewText += `📁 Папок / категорий: **${uniqueCats.size}**\n\n`;
    previewText += `**Примеры распознанных позиций:**\n`;

    const sample = parseResult.items.slice(0, 4);
    for (const item of sample) {
      previewText += `• _${md(item.categoryPath.join(" / "))}_ — **${md(item.name)}** (${item.price} ₽, ${item.stock} шт.)\n`;
    }
    if (parseResult.items.length > 4) {
      previewText += `_...и ещё ${parseResult.items.length - 4} позиций_\n`;
    }

    previewText += `\n**Выберите способ загрузки:**\n`;
    previewText += `1️⃣ **Добавить к остаткам** — существующие товары суммируют кол-во, новые добавятся.\n`;
    previewText += `2️⃣ **Обновить остатки** — остатки товаров перезапишутся числами из файла.\n`;
    previewText += `3️⃣ **Полная замена** — очистит текущий каталог и загрузит склад с нуля.`;

    const kb = new InlineKeyboard()
      .text("➕ 1. Добавить к остаткам", `excel_run_add_${importId}`).row()
      .text("🔄 2. Обновить остатки", `excel_run_replace_${importId}`).row()
      .text("⚠️ 3. Полная замена склада", `excel_run_wipe_${importId}`).row()
      .text("❌ Отмена", `excel_cancel_${importId}`);

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply(previewText, { parse_mode: "Markdown", reply_markup: kb });
  } catch (err: any) {
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply(`❌ Ошибка обработки Excel файла: ${err?.message || "неизвестная ошибка"}`);
  }
});

bot.callbackQuery(/^excel_run_(add|replace|wipe)_(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery({ text: "Только для администратора!", show_alert: true });
    return;
  }

  const rawMode = ctx.match[1];
  const importId = ctx.match[2];
  const pending = pendingExcelImports.get(importId);

  if (!pending) {
    await ctx.answerCallbackQuery({ text: "Время сессии истекло, отправьте файл повторно.", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Выполняю импорт..." });

  const mode = rawMode === "add" ? "add" : rawMode === "replace" ? "replace_stock" : "wipe_all";
  const result = importProductsToDb(pending.items, mode);
  pendingExcelImports.delete(importId);

  let resultText = `✅ **Импорт из Excel успешно завершён!**\n`;
  resultText += `━━━━━━━━━━━━━━━━━━━━\n`;
  resultText += `📁 Создано новых папок: **${result.categoriesCreated}**\n`;
  resultText += `📦 Создано новых товаров: **${result.productsCreated} шт.**\n`;
  resultText += `🔄 Обновлено товаров: **${result.productsUpdated} шт.**\n`;
  resultText += `📊 Всего обработано: **${result.totalProcessed} шт.**\n`;

  if (result.errors.length > 0) {
    resultText += `\n⚠️ _Ошибки в ${result.errors.length} строках:_ \n${result.errors.slice(0, 3).join("\n")}`;
  }

  const kb = new InlineKeyboard()
    .text("📁 Открыть Склад", "cat_nav_root").row()
    .text("⚙️ В управление", "admin_main");

  try {
    await ctx.editMessageText(resultText, { parse_mode: "Markdown", reply_markup: kb });
  } catch {
    await ctx.reply(resultText, { parse_mode: "Markdown", reply_markup: kb });
  }
});

bot.callbackQuery(/^excel_cancel_(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Отменено" });
  const importId = ctx.match[1];
  pendingExcelImports.delete(importId);
  try {
    await ctx.deleteMessage();
  } catch {}
});

// ======================== ИНТЕГРАЦИЯ С GOOGLE ТАБЛИЦАМИ ========================

async function showGoogleSheetsDashboard(ctx: MyContext) {
  if (!isAdmin(ctx)) return;

  const url = dbService.getGoogleSheetsUrl();
  const lastSync = dbService.getGoogleSheetsLastSync();

  let text = `📊 **Управление Google Таблицей**\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;

  const kb = new InlineKeyboard();

  if (url) {
    text += `🔗 **Подключенная таблица:**\n\`${url}\`\n\n`;
    text += `🕒 Последняя синхронизация: **${lastSync || "ещё не проводилась"}**\n\n`;
    text += `_Вы можете редактировать категории, товары, цены и остатки прямо в Google Таблице, а затем нажать «Синхронизировать сейчас»._`;

    kb.text("🔄 Синхронизировать сейчас", "admin_sheets_quick_sync").row();
    kb.text("✏️ Сменить ссылку", "admin_sheets_bind_start");
    kb.text("❌ Отвязать", "admin_sheets_unlink").row();
  } else {
    text += `Статус: _Таблица не подключена_\n\n`;
    text += `Подключите Google Таблицу, чтобы склад автоматически обновлялся по ссылке!\n\n`;
    text += `💡 **Как подключить:**\n`;
    text += `1. Откройте таблицу в Google Документах\n`;
    text += `2. Нажмите «Настройки доступа» ➔ выберите **«Все, у кого есть ссылка — Читатель»**\n`;
    text += `3. Нажмите кнопку «Привязать таблицу» ниже или просто отправьте ссылку в чат.`;

    kb.text("🔗 Привязать Google Таблицу", "admin_sheets_bind_start").row();
    kb.text("📥 Скачать шаблон таблицы", "admin_excel_template").row();
  }

  kb.text("◀️ В управление", "admin_main");

  await sendOrEditScreen(ctx, text, kb);
}

async function syncGoogleSheetsAction(ctx: MyContext) {
  if (!isAdmin(ctx)) {
    return ctx.reply("❌ Доступно только администратору.");
  }

  const url = dbService.getGoogleSheetsUrl();
  if (!url) {
    const kb = new InlineKeyboard().text("🔗 Привязать Google Таблицу", "admin_sheets_bind_start");
    return ctx.reply(
      "❌ **Google Таблица ещё не подключена.**\n\nПривяжите таблицу по кнопке ниже:",
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }

  const waitMsg = await ctx.reply("⏳ Загружаю актуальные данные из Google Таблицы...");

  try {
    const fetchRes = await fetchGoogleSheetsBuffer(url);
    if (!fetchRes.success || !fetchRes.buffer) {
      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
      return ctx.reply(`❌ **Ошибка загрузки Google Таблицы:**\n\n${fetchRes.error || "сбой соединения"}\n\nПроверьте доступ: «Все, у кого есть ссылка — Читатель».`, { parse_mode: "Markdown" });
    }

    const parseRes = parseExcelBuffer(fetchRes.buffer);
    if (parseRes.items.length === 0) {
      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
      return ctx.reply("❌ В Google Таблице не найдены строки с товарами. Проверьте заголовки колонок: `Категория`, `Товар`, `Цена`, `Количество`.");
    }

    const importRes = importProductsToDb(parseRes.items, "replace_stock");
    const nowStr = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    dbService.setGoogleSheetsLastSync(nowStr);

    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});

    let text = `✅ **Склад успешно синхронизирован с Google Таблицей!**\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🕒 Время: **${nowStr}**\n`;
    text += `📦 Товаров в таблице: **${parseRes.items.length} шт.**\n`;
    text += `📁 Создано новых папок: **${importRes.categoriesCreated}**\n`;
    text += `📦 Новых позиций создано: **${importRes.productsCreated} шт.**\n`;
    text += `🔄 Существующих позиций обновлено: **${importRes.productsUpdated} шт.**\n`;

    const kb = new InlineKeyboard()
      .text("📁 Открыть Склад", "cat_nav_root").row()
      .text("⚙️ В управление", "admin_main");

    await sendOrEditScreen(ctx, text, kb);
  } catch (err: any) {
    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    await ctx.reply(`❌ Сбой синхронизации: ${err?.message || "неизвестная ошибка"}`);
  }
}

bot.command(["sheets", "googlesheets"], async (ctx) => {
  await deleteUserMessage(ctx);
  if (!isAdmin(ctx)) return;
  const match = ctx.message?.text?.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^\s]+/);
  if (match) {
    const rawUrl = match[0];
    dbService.setGoogleSheetsUrl(rawUrl);
    await ctx.reply(`✅ Ссылка на Google Таблицу привязана:\n\`${rawUrl}\`\n\nЗапускаю синхронизацию...`, { parse_mode: "Markdown" });
    await syncGoogleSheetsAction(ctx);
    return;
  }
  await showGoogleSheetsDashboard(ctx);
});

bot.command("sync", async (ctx) => {
  await deleteUserMessage(ctx);
  await syncGoogleSheetsAction(ctx);
});

bot.callbackQuery("admin_sheets_menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showGoogleSheetsDashboard(ctx);
});

bot.callbackQuery("admin_sheets_bind_start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("bindGoogleSheetsConversation");
});

bot.callbackQuery("admin_sheets_quick_sync", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Запуск синхронизации..." });
  await syncGoogleSheetsAction(ctx);
});

bot.callbackQuery("admin_sheets_unlink", async (ctx) => {
  dbService.setGoogleSheetsUrl(null);
  await ctx.answerCallbackQuery({ text: "Google Таблица отвязана" });
  await showGoogleSheetsDashboard(ctx);
});

bot.hears(/https:\/\/docs\.google\.com\/spreadsheets\/[^\s]+/i, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const match = ctx.message?.text?.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^\s]+/i);
  if (!match) return;
  const url = match[0];

  const currentUrl = dbService.getGoogleSheetsUrl();
  if (currentUrl === url) {
    await ctx.reply("🔄 Запускаю синхронизацию со склада с привязанной Google Таблицей...");
    await syncGoogleSheetsAction(ctx);
    return;
  }

  dbService.setGoogleSheetsUrl(url);
  await ctx.reply(`✅ Google Таблица привязана!\n\`${url}\`\n\nЗапускаю первичную синхронизацию склада...`, { parse_mode: "Markdown" });
  await syncGoogleSheetsAction(ctx);
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

    await sendOrEditScreen(ctx, emptyText, kb);
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

  await sendOrEditScreen(ctx, header, kb);
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
  text += `👤 **Клиент:** ${md(order.user_name)}\n`;
  text += `📞 **Телефон:** ${md(order.phone || "не указан")}\n`;
  if (order.comment && order.comment !== "Без комментария") {
    text += `💬 **Пожелание:** ${md(order.comment)}\n`;
  }
  text += `🕒 **Дата:** ${order.created_at}\n\n`;

  text += `📦 **Состав заявки:**\n`;
  for (const item of items) {
    text += `• ${md(item.name)} — ${item.quantity} шт. × ${item.price} ₽ = ${item.subtotal} ₽\n`;
  }
  text += `\n💰 **ИТОГО:** **${order.total_price} ₽**\n`;

  const buildKb = (withContact: boolean) => {
    const kb = new InlineKeyboard();
    if (isAdm) {
      if (withContact) {
        kb.url("💬 Написать клиенту", `tg://user?id=${order.user_id}`).row();
      }
      if (order.status === "new") {
        kb.text("⏳ Взять в работу", `order_status_${order.id}_in_progress`).row();
      }
      if (order.status !== "completed" && order.status !== "cancelled") {
        kb.text("✅ Завершить заказ", `order_status_${order.id}_completed`).row();
        kb.text("❌ Отменить (вернуть на склад)", `order_cancel_${order.id}`).row();
      }
    }
    kb.text("◀️ Назад к заявкам", "view_orders_all");
    return kb;
  };

  try {
    await sendOrEditScreen(ctx, text, buildKb(isAdm));
  } catch {
    // Telegram отклоняет tg://user ссылку, если клиент запретил её настройками приватности
    await sendOrEditScreen(ctx, text, buildKb(false));
  }
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

  let subcategories = dbService.getCategoriesWithStats(categoryId);
  if (!isAdm) {
    subcategories = subcategories.filter(sub => dbService.countProductsInSubtree(sub.id) > 0);
  }
  const products = categoryId !== null ? dbService.getProductsByCategory(categoryId) : [];
  const currentCategory = categoryId !== null ? dbService.getCategoryById(categoryId) : null;
  const pathTitle = dbService.getCategoryPathString(categoryId);

  const cartMap = userId ? dbService.getCartItemsMap(userId) : new Map<number, number>();

  const kb = new InlineKeyboard();

  // 1. Папки
  subcategories.forEach((sub, idx) => {
    const countTag = sub.products_count > 0 ? ` [${sub.products_count} 📦]` : "";
    kb.text(`📁 ${sub.name}${countTag}`, `cat_nav_${sub.id}`);
    if (idx % 2 === 1) kb.row();
  });
  if (subcategories.length % 2 !== 0) kb.row();

  // 2. Товары: для покупателя мгновенный выбор с бейджем количества, для админа статус
  products.forEach((p) => {
    if (isAdm) {
      const status = p.stock > 0 ? `${p.price} ₽ | ${p.stock} шт.` : "❌ Нет";
      kb.text(`📦 ${p.name} — ${status}`, `prod_${p.id}`).row();
    } else {
      const inCartQty = cartMap.get(p.id) || 0;
      if (p.stock <= 0) {
        kb.text(`❌ ${p.name} — Нет в наличии`, `prod_${p.id}`).row();
      } else if (inCartQty > 0) {
        kb.text(`🛒 ${inCartQty} шт. | ${p.name} — ${p.price} ₽`, `prod_${p.id}`).row();
      } else {
        kb.text(`📦 ${p.name} — ${p.price} ₽`, `prod_${p.id}`).row();
      }
    }
  });

  // 3. Только 2 главные кнопки для админа
  if (isAdm) {
    if (categoryId !== null) {
      kb.text("📁 + Папка", `admin_add_subcat_${categoryId}`);
      kb.text("📦 + Товар", `admin_add_single_${categoryId}`).row();
    } else {
      kb.text("📁 + Создать папки", "admin_create_root_cat");
      kb.text("📊 Загрузить Excel", "admin_excel_start").row();
      const sheetsUrl = dbService.getGoogleSheetsUrl();
      if (sheetsUrl) {
        kb.text("🔄 Синхронизировать с Google", "admin_sheets_quick_sync").row();
      }
    }
  }

  // 4. Минималистичная навигация (Назад и Корзина)
  const cartCount = userId ? dbService.getCartTotalCount(userId) : 0;
  const cartLabel = cartCount > 0 ? `🛒 Корзина (${cartCount})` : "🛒 Корзина";

  if (categoryId !== null && currentCategory) {
    const backTarget = currentCategory.parent_id !== null ? `cat_nav_${currentCategory.parent_id}` : "cat_nav_root";
    kb.text("◀️ Назад", backTarget);
    kb.text(cartLabel, "menu_cart").row();
  } else {
    kb.text(cartLabel, "menu_cart").row();
  }

  if (isAdm && categoryId !== null) {
    kb.text("🗑 Удалить эту папку", `admin_del_cat_${categoryId}`).row();
  }

  let text = `📍 **${md(pathTitle)}**\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (subcategories.length === 0 && products.length === 0) {
    text += isAdm
      ? `_В этой папке пока пусто._\n_Используйте кнопки «📁 + Папка» или «📦 + Товар» ниже._`
      : `_В этом разделе пока нет товаров._`;
  } else {
    text += `Папок: **${subcategories.length}** | Товаров: **${products.length}**\n`;
  }

  await sendOrEditScreen(ctx, text, kb);
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
  await renderWarehouseView(ctx, null);
});

bot.callbackQuery(/^admin_add_subcat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const parentId = parseInt(ctx.match[1], 10);
  const userId = ctx.from?.id;
  if (userId) activeCategoryMap.set(userId, parentId);
  await ctx.conversation.enter("addCategoryConversation");
  await renderWarehouseView(ctx, parentId);
});

bot.callbackQuery(/^admin_add_single_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  const userId = ctx.from?.id;
  if (userId) activeCategoryMap.set(userId, catId);
  await ctx.conversation.enter("addSingleProductConversation");
  await renderWarehouseView(ctx, catId);
});

bot.callbackQuery(/^admin_del_cat_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const catId = parseInt(ctx.match[1], 10);
  const cat = dbService.getCategoryById(catId);
  if (!cat) {
    await renderWarehouseView(ctx, null);
    return;
  }

  const count = dbService.countAllProductsInSubtree(catId);
  const text = `🗑 Удалить папку **${md(cat.name)}** со всеми вложенными папками и товарами (${count} шт.)?`;
  const kb = new InlineKeyboard()
    .text("✅ Да, удалить", `admin_del_cat_yes_${catId}`)
    .text("◀️ Отмена", `cat_nav_${catId}`);

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: kb
  });
});

bot.callbackQuery(/^admin_del_cat_yes_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery();
    return;
  }
  const catId = parseInt(ctx.match[1], 10);
  const cat = dbService.getCategoryById(catId);
  const parentId = cat?.parent_id ?? null;

  dbService.deleteCategory(catId);
  await ctx.answerCallbackQuery({ text: "Папка удалена" });
  await renderWarehouseView(ctx, parentId);
});

// ======================== КАРТОЧКА ТОВАРА И 1-CLICK ДОБАВЛЕНИЕ ========================

async function renderProductAdminCard(ctx: MyContext, product: Product) {
  const inStock = product.stock > 0;
  const stockText = inStock ? `🟢 В наличии: **${product.stock} шт.**` : "🔴 **Нет в наличии**";
  const pathStr = dbService.getCategoryPathString(product.category_id);

  let text = `📦 **${md(product.name)}**\n`;
  text += `📍 Раздел: ${md(pathStr)}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (product.description) {
    text += `${md(product.description)}\n\n`;
  }
  text += `💰 Цена: **${product.price} ₽**\n`;
  text += `📊 На складе: ${stockText}\n`;

  const kb = new InlineKeyboard();
  if (inStock) {
    kb.text("🛒 В корзину (+1)", `cart_add_${product.id}`).row();
  }
  kb.text("✏️ Изменить остаток", `edit_stock_${product.id}`);
  kb.text("🗑 Удалить", `admin_del_prod_${product.id}`).row();
  kb.text("◀️ Назад в папку", `cat_nav_${product.category_id}`);

  await sendOrEditScreen(ctx, text, kb);
}

bot.callbackQuery(/^prod_(\d+)$/, async (ctx) => {
  const productId = parseInt(ctx.match[1], 10);
  const product = dbService.getProductById(productId);

  if (!product) {
    await ctx.answerCallbackQuery({ text: "Товар не найден", show_alert: true });
    return;
  }

  // Для администратора — карточка управления остатком и удалением
  if (isAdmin(ctx)) {
    await ctx.answerCallbackQuery();
    await renderProductAdminCard(ctx, product);
    return;
  }

  // Для покупателя — моментальное добавление в корзину (1 клик)
  const userId = ctx.from?.id;
  if (!userId) return;

  if (product.stock <= 0) {
    await ctx.answerCallbackQuery({ text: "❌ Товар закончился на складе", show_alert: true });
    return;
  }

  const result = dbService.addToCart(userId, productId, 1);
  if (!result.success) {
    await ctx.answerCallbackQuery({ text: `❌ ${result.error}`, show_alert: true });
    return;
  }

  const cartMap = dbService.getCartItemsMap(userId);
  const currentQty = cartMap.get(productId) || 1;
  const totalCart = dbService.getCartTotalCount(userId);

  await ctx.answerCallbackQuery({
    text: `🛒 ${product.name}: ${currentQty} шт. (всего ${totalCart} шт.)`
  });

  // Моментально обновляем склад на месте (появляется бейдж "🛒 X шт.")
  await renderWarehouseView(ctx, product.category_id);
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
  const prodId = parseInt(ctx.match[1], 10);
  const prod = dbService.getProductById(prodId);
  await ctx.conversation.enter("updateStockConversation");
  if (prod) {
    await renderWarehouseView(ctx, prod.category_id);
  } else {
    await renderWarehouseView(ctx, null);
  }
});

bot.callbackQuery(/^admin_del_prod_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: "Товар удалён!" });
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
    await sendOrEditScreen(ctx, emptyText, kb);
    return;
  }

  let text = "🛒 **Ваша корзина:**\n\n";
  let total = 0;
  const kb = new InlineKeyboard();

  cart.forEach((item) => {
    const subtotal = item.quantity * item.price;
    total += subtotal;
    text += `• **${md(item.name)}**\n  ${item.quantity} шт. × ${item.price} ₽ = **${subtotal} ₽**\n\n`;

    const displayName = item.name.length > 40 ? item.name.slice(0, 38) + "…" : item.name;
    kb.text(`📦 ${displayName}`, `cart_item_info_${item.product_id}`).row();
    kb.text(`➖`, `cart_decr_${item.product_id}`)
      .text(`${item.quantity} шт.`, `cart_qty_info`)
      .text(`➕`, `cart_incr_${item.product_id}`)
      .text(`🗑`, `cart_del_${item.product_id}`)
      .row();
  });

  text += `💰 **ИТОГО:** **${total} ₽**`;

  const lastCatId = userId ? activeCategoryMap.get(userId) : null;
  const backShopTarget = lastCatId ? `cat_nav_${lastCatId}` : "cat_nav_root";

  kb.text("✅ Оформить заявку", "cart_checkout").row();
  kb.text("📁 Продолжить покупки", backShopTarget);
  kb.text("🗑 Очистить", "cart_clear").row();

  await sendOrEditScreen(ctx, text, kb);
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

bot.callbackQuery(/^cart_item_info_(\d+)$/, async (ctx) => {
  const prodId = parseInt(ctx.match[1], 10);
  const prod = dbService.getProductById(prodId);
  if (prod) {
    await ctx.answerCallbackQuery({
      text: `📦 ${prod.name}\n💰 ${prod.price} ₽ | В наличии: ${prod.stock} шт.`
    });
  } else {
    await ctx.answerCallbackQuery();
  }
});

bot.callbackQuery("cart_qty_info", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Используйте ➖ и ➕ для изменения количества" });
});

bot.callbackQuery("cart_checkout", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("checkoutConversation");
});

// Автоматическая очистка любых посторонних сообщений пользователя в приватном чате (Single-Window / App-режим)
bot.on([
  "message:text",
  "message:sticker",
  "message:voice",
  "message:video",
  "message:photo"
], async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.deleteMessage().catch(() => {});
  const chatId = ctx.chat.id;
  if (!activeScreenMessageMap.get(chatId)) {
    await renderWarehouseView(ctx, null);
  }
});

bot.catch((err) => {
  console.error("Ошибка бота:", err);
});

// ======================== HTTP СЕРВЕР, ANTI-SLEEP И АВТОВОССТАНОВЛЕНИЕ ========================

function startKeepAliveEngine() {
  const pingUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || process.env.PING_URL || "https://tg-shop-bot-obnn.onrender.com";
  if (!pingUrl) {
    console.log("ℹ️ Keep-Alive: URL не задан. Если вы на Render, добавьте переменную APP_URL со ссылкой на ваш сервис.");
    return;
  }

  const target = pingUrl.endsWith("/") ? `${pingUrl}health` : `${pingUrl}/health`;
  console.log(`⏱ Запущен Anti-Sleep пингер на: ${target} (интервал: каждые 10 минут)`);

  // Пинг каждые 10 минут (Render засыпает через 15 минут)
  setInterval(async () => {
    try {
      const res = await fetch(target);
      console.log(`[Keep-Alive] Ping: ${res.status} at ${new Date().toLocaleTimeString("ru-RU")}`);
    } catch (err: any) {
      console.error("[Keep-Alive] Ошибка ping:", err?.message);
    }
  }, 10 * 60 * 1000);
}

async function autoRestoreFromGoogleSheetsIfEmpty() {
  try {
    const stats = dbService.getStats();
    if (stats.productsCount === 0) {
      const url = dbService.getGoogleSheetsUrl() || process.env.GOOGLE_SHEETS_URL;
      if (url) {
        console.log("🔄 База пуста после перезапуска контейнера. Восстанавливаю склад из Google Таблицы...");
        const fetchRes = await fetchGoogleSheetsBuffer(url);
        if (fetchRes.success && fetchRes.buffer) {
          const parseRes = parseExcelBuffer(fetchRes.buffer);
          if (parseRes.items.length > 0) {
            const importRes = importProductsToDb(parseRes.items, "replace_stock");
            console.log(`✅ Автовосстановление завершено: создано ${importRes.productsCreated} товаров, ${importRes.categoriesCreated} папок!`);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Ошибка автовосстановления из Google Sheets:", err?.message);
  }
}

// HTTP healthcheck для Render и мониторингов
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/ping" || req.url === "/") {
    const stats = dbService.getStats();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      productsCount: stats.productsCount,
      timestamp: new Date().toISOString()
    }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});
server.listen(PORT, () => {
  console.log(`HTTP сервер на порту ${PORT}`);
});

console.log("Запуск @LVoptBot...");
bot.start({
  onStart: async (info) => {
    console.log(`Бот @${info.username} успешно запущен!`);
    startKeepAliveEngine();
    await autoRestoreFromGoogleSheetsIfEmpty();
  }
});
