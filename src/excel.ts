import { dbService, db } from "./database.js";

export interface ParsedItem {
  categoryPath: string[];
  name: string;
  price: number;
  stock: number;
  description?: string;
}

export interface ParseResult {
  items: ParsedItem[];
  errors: string[];
  totalRows: number;
}

export interface ImportResult {
  categoriesCreated: number;
  productsCreated: number;
  productsUpdated: number;
  totalProcessed: number;
  errors: string[];
}

/** Нормализация имени колонки для нечувствительного поиска */
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_\-\(\)\,\.\/\\₽]/g, "");
}

/** Очистка и парсинг числа цены */
function parsePrice(raw: any): number {
  if (typeof raw === "number") return isNaN(raw) || raw < 0 ? 0 : raw;
  const cleaned = String(raw ?? "")
    .replace(/\s+/g, "")
    .replace(/руб\.?|₽|р\.?/gi, "")
    .replace(/,/g, ".");
  const num = parseFloat(cleaned);
  return isNaN(num) || num < 0 ? 0 : num;
}

/** Очистка и парсинг количества */
function parseStock(raw: any): number {
  if (typeof raw === "number") return isNaN(raw) || raw < 0 ? 0 : Math.floor(raw);
  const cleaned = String(raw ?? "")
    .replace(/\s+/g, "")
    .replace(/шт\.?/gi, "")
    .replace(/,/g, ".");
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num < 0 ? 0 : num;
}

/** Разбор категории по разделителям (/ > \ |) */
function parseCategoryPath(rawCat: string, fallbackSheetName: string = ""): string[] {
  const cat = (rawCat || "").trim();
  if (!cat) {
    // Если колонка категории пуста, используем имя листа (если это не Лист1 / Sheet1)
    if (fallbackSheetName && !/^sheet\d*$/i.test(fallbackSheetName) && !/^лист\d*$/i.test(fallbackSheetName)) {
      return [fallbackSheetName.trim()];
    }
    return ["Разное"];
  }

  const parts = cat
    .split(/[\/>\\|→]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return parts.length > 0 ? parts : ["Разное"];
}

/**
 * Парсер CSV без внешних зависимостей (RFC 4180)
 */
export function parseCsv(text: string): string[][] {
  let cleanText = text;
  if (cleanText.startsWith("\uFEFF")) {
    cleanText = cleanText.slice(1);
  }

  const firstLine = cleanText.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\r") {
        if (i + 1 < cleanText.length && cleanText[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentRow.length > 0 || currentField !== "") {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.every(cell => !cell || cell.trim() === "")) {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

/**
 * Парсит буфер CSV файла
 */
export function parseCsvBuffer(buffer: Buffer): ParseResult {
  const items: ParsedItem[] = [];
  const errors: string[] = [];
  let totalRows = 0;

  const rows = parseCsv(buffer.toString("utf8"));
  if (!rows || rows.length < 2) return { items, errors, totalRows };

  // Поиск строки заголовков (может быть на 1 или 2 строке)
  let headerRowIdx = -1;
  let nameColIdx = -1;
  let priceColIdx = -1;
  let stockColIdx = -1;
  let catColIdx = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const colName = normalizeHeader(String(row[c] || ""));
      if (!colName) continue;

      if (nameColIdx === -1 && /^(товар|название|наименование|продукт|позиция|номенклатура|name|product|item|title)$/.test(colName)) {
        nameColIdx = c;
      } else if (priceColIdx === -1 && /^(цена|стоимость|прайс|price|cost|rate)$/.test(colName)) {
        priceColIdx = c;
      } else if (stockColIdx === -1 && /^(количество|колво|остаток|склад|штук|наличие|stock|quantity|qty|count)$/.test(colName)) {
        stockColIdx = c;
      } else if (catColIdx === -1 && /^(категория|раздел|папка|группа|подкатегория|category|folder|group)$/.test(colName)) {
        catColIdx = c;
      }
    }

    // Если нашли хотя бы название товара и цену — считаем это строкой заголовков
    if (nameColIdx !== -1 && priceColIdx !== -1) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    // Попробуем fallback по порядку: 0: Категория, 1: Товар, 2: Цена, 3: Кол-во
    if (rows[0] && rows[0].length >= 3) {
      catColIdx = 0;
      nameColIdx = 1;
      priceColIdx = 2;
      stockColIdx = rows[0].length >= 4 ? 3 : -1;
      headerRowIdx = 0;
    } else {
      return { items, errors, totalRows };
    }
  }

  // Обработка строк с данными
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawName = nameColIdx >= 0 ? String(row[nameColIdx] || "").trim() : "";
    if (!rawName) continue; // Пустые строки пропускаем

    totalRows++;

    const rawCat = catColIdx >= 0 ? String(row[catColIdx] || "") : "";
    const rawPrice = priceColIdx >= 0 ? row[priceColIdx] : 0;
    const rawStock = stockColIdx >= 0 ? row[stockColIdx] : 0;

    const price = parsePrice(rawPrice);
    const stock = parseStock(rawStock);
    const categoryPath = parseCategoryPath(rawCat, "");

    items.push({
      categoryPath,
      name: rawName,
      price,
      stock
    });
  }

  return { items, errors, totalRows };
}


/**
 * Записывает распарсенные товары в базу данных.
 * Режим 'add': обновляет цены и добавляет остатки (если товар есть).
 * Режим 'replace_stock': обновляет цены и перезаписывает остатки точным значением.
 * Режим 'wipe_all': полностью очищает каталог и заливает данные с нуля.
 */
export function importProductsToDb(
  items: ParsedItem[],
  mode: "add" | "replace_stock" | "wipe_all" = "add"
): ImportResult {
  let categoriesCreated = 0;
  let productsCreated = 0;
  let productsUpdated = 0;
  const errors: string[] = [];

  const tx = db.transaction(() => {
    if (mode === "wipe_all") {
      db.prepare("DELETE FROM products").run();
      db.prepare("DELETE FROM categories").run();
    }

    for (const item of items) {
      try {
        // Находим или создаем путь папок
        const catRes = dbService.findOrCreateCategoryPath(item.categoryPath);
        categoriesCreated += catRes.createdCount;

        const categoryId = catRes.categoryId;

        // Проверяем существующий товар
        const existing = db.prepare(`
          SELECT id, stock FROM products
          WHERE category_id = ? AND LOWER(name) = LOWER(?)
        `).get(categoryId, item.name.trim()) as { id: number; stock: number } | undefined;

        if (existing) {
          const newStock = mode === "add" ? existing.stock + item.stock : item.stock;
          db.prepare(`
            UPDATE products SET price = ?, stock = ? WHERE id = ?
          `).run(item.price, newStock, existing.id);
          productsUpdated++;
        } else {
          db.prepare(`
            INSERT INTO products (category_id, name, description, price, stock)
            VALUES (?, ?, '', ?, ?)
          `).run(categoryId, item.name.trim(), item.price, item.stock);
          productsCreated++;
        }
      } catch (err: any) {
        errors.push(`Товар "${item.name}": ${err?.message || "ошибка"}`);
      }
    }
  });

  tx();

  return {
    categoriesCreated,
    productsCreated,
    productsUpdated,
    totalProcessed: items.length,
    errors
  };
}

/**
 * Создает типовой CSV шаблон с примерами для администратора
 */
export function generateExcelTemplate(): Buffer {
  const sampleData = [
    {
      "Категория": "Табак / Darkside",
      "Товар": "Supernova 100g",
      "Цена (₽)": 950,
      "Количество (шт.)": 25
    },
    {
      "Категория": "Табак / Darkside",
      "Товар": "Bounty Hunter 100g",
      "Цена (₽)": 950,
      "Количество (шт.)": 15
    },
    {
      "Категория": "Табак / Musthave",
      "Товар": "Pinkman 25g",
      "Цена (₽)": 350,
      "Количество (шт.)": 40
    },
    {
      "Категория": "Табак / Musthave",
      "Товар": "Space Flavour 25g",
      "Цена (₽)": 350,
      "Количество (шт.)": 30
    },
    {
      "Категория": "Кальяны / Alpha Hookah",
      "Товар": "Model X Black",
      "Цена (₽)": 8900,
      "Количество (шт.)": 5
    },
    {
      "Категория": "Уголь",
      "Товар": "Cocoloco 25мм 1кг",
      "Цена (₽)": 450,
      "Количество (шт.)": 30
    },
    {
      "Категория": "Чаши",
      "Товар": "Upgrade Form Classic",
      "Цена (₽)": 600,
      "Количество (шт.)": 18
    }
  ];

  const headers = ["Категория", "Товар", "Цена (₽)", "Количество (шт.)"];
  const escapeCsv = (val: any) => {
    const s = String(val ?? "");
    if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = [
    headers.map(escapeCsv).join(";"),
    ...sampleData.map(item =>
      headers.map(h => escapeCsv((item as any)[h])).join(";")
    )
  ];

  const csv = rows.join("\r\n");
  return Buffer.from("\uFEFF" + csv, "utf8");
}

export const generateCsvTemplate = generateExcelTemplate;
