import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), "shop.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Инициализация таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cart (
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    phone TEXT,
    comment TEXT,
    total_price REAL NOT NULL,
    items_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Миграции схемы при обновлении
try {
  db.exec("ALTER TABLE categories ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE CASCADE");
} catch {}

try {
  db.exec("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'new'");
} catch {}

// Гарантированное создание структуры категорий по умолчанию
function ensureDefaultCategories() {
  const findCat = (name: string, parentId: number | null) => {
    return parentId === null
      ? (db.prepare("SELECT id FROM categories WHERE name = ? AND parent_id IS NULL").get(name) as { id: number } | undefined)
      : (db.prepare("SELECT id FROM categories WHERE name = ? AND parent_id = ?").get(name, parentId) as { id: number } | undefined);
  };

  const getOrCreate = (name: string, parentId: number | null = null): number => {
    const existing = findCat(name, parentId);
    if (existing) return existing.id;
    const info = db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)").run(name, parentId);
    return Number(info.lastInsertRowid);
  };

  getOrCreate("Чаши", null);
  const tabakId = getOrCreate("Табак", null);
  getOrCreate("Кальяны", null);

  getOrCreate("Спектрум", tabakId);
  getOrCreate("Блэкберн", tabakId);
  getOrCreate("Мастхэв", tabakId);
  getOrCreate("Трофимов", tabakId);
}
ensureDefaultCategories();

// Слияние уже созданных дубликатов с суммированием остатка
function mergeDuplicateProducts() {
  try {
    const duplicates = db.prepare(`
      SELECT category_id, LOWER(name) as lower_name, COUNT(*) as cnt
      FROM products
      GROUP BY category_id, LOWER(name)
      HAVING cnt > 1
    `).all() as { category_id: number; lower_name: string; cnt: number }[];

    for (const dup of duplicates) {
      const items = db.prepare(`
        SELECT id, name, price, stock FROM products
        WHERE category_id = ? AND LOWER(name) = ?
        ORDER BY id ASC
      `).all(dup.category_id, dup.lower_name) as { id: number; name: string; price: number; stock: number }[];

      if (items.length > 1) {
        const main = items[0];
        let totalStock = 0;
        let latestPrice = main.price;

        for (const item of items) {
          totalStock += item.stock;
          latestPrice = item.price;
        }

        db.prepare("UPDATE products SET stock = ?, price = ? WHERE id = ?").run(totalStock, latestPrice, main.id);

        for (let i = 1; i < items.length; i++) {
          db.prepare("DELETE FROM products WHERE id = ?").run(items[i].id);
        }
      }
    }
  } catch {}
}
mergeDuplicateProducts();

export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
}

export interface CategoryWithStats extends Category {
  subfolders_count: number;
  products_count: number;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
}

export interface CartItem {
  product_id: number;
  name: string;
  price: number;
  stock: number;
  quantity: number;
}

export interface OrderItem {
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderRecord {
  id: number;
  user_id: number;
  user_name: string;
  phone: string;
  comment: string;
  total_price: number;
  items_json: string;
  status: "new" | "in_progress" | "completed" | "cancelled";
  created_at: string;
}

export const dbService = {
  // Настройки (Admin ID)
  getAdminId(): number | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_id'").get() as { value: string } | undefined;
    if (row) {
      const val = parseInt(row.value, 10);
      if (val > 0) return val;
    }
    const envAdmin = process.env.ADMIN_ID;
    if (envAdmin && parseInt(envAdmin, 10) > 0) {
      return parseInt(envAdmin, 10);
    }
    return null;
  },

  getEnvAdminId(): number | null {
    const envAdmin = process.env.ADMIN_ID;
    if (envAdmin && parseInt(envAdmin, 10) > 0) {
      return parseInt(envAdmin, 10);
    }
    return null;
  },

  setAdminId(id: number): void {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('admin_id', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(id.toString());
  },

  isBuyerMode(userId: number): boolean {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`buyer_mode_${userId}`) as { value: string } | undefined;
    return row?.value === '1';
  },

  setBuyerMode(userId: number, on: boolean): void {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(`buyer_mode_${userId}`, on ? '1' : '0');
  },

  // Отдельная группа для заявок (ORDERS_CHAT_ID)
  getOrdersChatId(): number | null {
    const envChat = process.env.ORDERS_CHAT_ID;
    if (envChat && parseInt(envChat, 10)) {
      return parseInt(envChat, 10);
    }
    const row = db.prepare("SELECT value FROM settings WHERE key = 'orders_chat_id'").get() as { value: string } | undefined;
    if (row && parseInt(row.value, 10)) {
      return parseInt(row.value, 10);
    }
    return null;
  },

  setOrdersChatId(chatId: number): void {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('orders_chat_id', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(chatId.toString());
  },

  // Название и инфо о заведении
  getVenueName(): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'venue_name'").get() as { value: string } | undefined;
    return row?.value || process.env.VENUE_NAME || "LV Lounge";
  },

  setVenueName(name: string): void {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('venue_name', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(name.trim());
  },

  getVenueContacts(): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'venue_contacts'").get() as { value: string } | undefined;
    return row?.value || process.env.VENUE_CONTACTS || "";
  },

  setVenueContacts(text: string): void {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('venue_contacts', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(text.trim());
  },

  // Google Таблицы
  getGoogleSheetsUrl(): string | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'google_sheets_url'").get() as { value: string } | undefined;
    return row?.value || process.env.GOOGLE_SHEETS_URL || null;
  },

  setGoogleSheetsUrl(url: string | null): void {
    if (!url) {
      db.prepare("DELETE FROM settings WHERE key = 'google_sheets_url'").run();
      return;
    }
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('google_sheets_url', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(url.trim());
  },

  getGoogleSheetsLastSync(): string | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'google_sheets_last_sync'").get() as { value: string } | undefined;
    return row?.value || null;
  },

  setGoogleSheetsLastSync(val: string): void {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('google_sheets_last_sync', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(val);
  },

  // Профиль покупателя (имя / заведение)
  getUserProfileName(userId: number): string | null {
    const row = db.prepare("SELECT name FROM user_profiles WHERE user_id = ?").get(userId) as { name: string } | undefined;
    return row?.name || null;
  },

  setUserProfileName(userId: number, name: string): void {
    db.prepare(`
      INSERT INTO user_profiles (user_id, name, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
    `).run(userId, name.trim());
  },

  // Папки со счётчиками
  getCategoriesWithStats(parentId: number | null = null): CategoryWithStats[] {
    const query = `
      SELECT c.*,
        (SELECT COUNT(*) FROM categories sc WHERE sc.parent_id = c.id) as subfolders_count,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as products_count
      FROM categories c
      WHERE ${parentId === null ? "c.parent_id IS NULL" : "c.parent_id = ?"}
      ORDER BY c.name ASC
    `;
    const stmt = db.prepare(query);
    return (parentId === null ? stmt.all() : stmt.all(parentId)) as CategoryWithStats[];
  },

  getCategoryById(id: number): Category | undefined {
    return db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category | undefined;
  },

  getCategoryBreadcrumbs(categoryId: number): Category[] {
    const crumbs: Category[] = [];
    let currentId: number | null = categoryId;

    while (currentId !== null) {
      const cat = this.getCategoryById(currentId);
      if (!cat) break;
      crumbs.unshift(cat);
      currentId = cat.parent_id;
    }

    return crumbs;
  },

  getCategoryPathString(categoryId: number | null): string {
    if (categoryId === null) return "📁 Склад";
    const crumbs = this.getCategoryBreadcrumbs(categoryId);
    return "📁 Склад / " + crumbs.map(c => c.name).join(" / ");
  },

  addCategory(name: string, parentId: number | null = null): number {
    const stmt = db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)");
    const info = stmt.run(name.trim(), parentId);
    return Number(info.lastInsertRowid);
  },

  findOrCreateCategoryPath(pathSegments: string[]): { categoryId: number; createdCount: number } {
    let parentId: number | null = null;
    let createdCount = 0;

    for (const segment of pathSegments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      const existing: { id: number } | undefined = parentId === null
        ? (db.prepare("SELECT id FROM categories WHERE parent_id IS NULL AND LOWER(name) = LOWER(?)").get(trimmed) as { id: number } | undefined)
        : (db.prepare("SELECT id FROM categories WHERE parent_id = ? AND LOWER(name) = LOWER(?)").get(parentId, trimmed) as { id: number } | undefined);

      if (existing) {
        parentId = existing.id;
      } else {
        const info = db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)").run(trimmed, parentId);
        parentId = Number(info.lastInsertRowid);
        createdCount++;
      }
    }

    if (parentId === null) {
      const existing = db.prepare("SELECT id FROM categories WHERE parent_id IS NULL AND LOWER(name) = 'разное'").get() as { id: number } | undefined;
      if (existing) return { categoryId: existing.id, createdCount };
      const info = db.prepare("INSERT INTO categories (name, parent_id) VALUES ('Разное', NULL)").run();
      return { categoryId: Number(info.lastInsertRowid), createdCount: createdCount + 1 };
    }

    return { categoryId: parentId, createdCount };
  },

  addCategoriesBatch(names: string[], parentId: number | null = null): number {
    const stmt = db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)");
    const tx = db.transaction(() => {
      let count = 0;
      for (const rawName of names) {
        const name = rawName.trim();
        if (name.length > 0) {
          stmt.run(name, parentId);
          count++;
        }
      }
      return count;
    });
    return tx();
  },

  deleteCategory(id: number): void {
    const deleteRecursively = (catId: number) => {
      const children = db.prepare("SELECT id FROM categories WHERE parent_id = ?").all(catId) as { id: number }[];
      for (const child of children) {
        deleteRecursively(child.id);
      }
      db.prepare("DELETE FROM products WHERE category_id = ?").run(catId);
      db.prepare("DELETE FROM categories WHERE id = ?").run(catId);
    };

    const tx = db.transaction(() => {
      deleteRecursively(id);
    });
    tx();
  },

  countProductsInSubtree(categoryId: number, onlyInStock: boolean = true): number {
    const condition = onlyInStock ? "WHERE p.stock > 0" : "";
    const stmt = db.prepare(`
      WITH RECURSIVE subtree AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
      )
      SELECT COUNT(*) as count
      FROM products p
      JOIN subtree s ON p.category_id = s.id
      ${condition}
    `);
    const row = stmt.get(categoryId) as { count: number } | undefined;
    return row?.count || 0;
  },

  countAllProductsInSubtree(categoryId: number): number {
    return this.countProductsInSubtree(categoryId, false);
  },

  // Товары
  getProductsByCategory(categoryId: number): Product[] {
    return db.prepare("SELECT * FROM products WHERE category_id = ? ORDER BY name ASC").all(categoryId) as Product[];
  },

  getProductById(id: number): Product | undefined {
    return db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
  },

  addProduct(
    categoryId: number,
    name: string,
    description: string,
    price: number,
    stock: number
  ): { id: number; isUpdated: boolean; totalStock: number; name: string; price: number } {
    const trimmedName = name.trim();
    const existing = db.prepare(`
      SELECT id, name, stock, price FROM products
      WHERE category_id = ? AND LOWER(name) = LOWER(?)
    `).get(categoryId, trimmedName) as { id: number; name: string; stock: number; price: number } | undefined;

    if (existing) {
      const newStock = existing.stock + stock;
      db.prepare(`
        UPDATE products SET stock = ?, price = ? WHERE id = ?
      `).run(newStock, price, existing.id);
      return {
        id: existing.id,
        isUpdated: true,
        totalStock: newStock,
        name: existing.name,
        price
      };
    }

    const stmt = db.prepare(`
      INSERT INTO products (category_id, name, description, price, stock)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(categoryId, trimmedName, description.trim(), price, stock);
    return {
      id: Number(info.lastInsertRowid),
      isUpdated: false,
      totalStock: stock,
      name: trimmedName,
      price
    };
  },

  updateProductStock(id: number, stock: number): void {
    db.prepare("UPDATE products SET stock = ? WHERE id = ?").run(stock, id);
  },

  updateProductPrice(id: number, price: number): void {
    db.prepare("UPDATE products SET price = ? WHERE id = ?").run(price, id);
  },

  deleteProduct(id: number): void {
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
  },

  // Корзина
  getCart(userId: number): CartItem[] {
    const stmt = db.prepare(`
      SELECT c.product_id, p.name, p.price, p.stock, c.quantity
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ?
    `);
    return stmt.all(userId) as CartItem[];
  },

  addToCart(userId: number, productId: number, qty: number = 1): { success: boolean; error?: string } {
    const product = this.getProductById(productId);
    if (!product) return { success: false, error: "Товар не найден" };
    if (product.stock <= 0) return { success: false, error: "Товара нет в наличии" };

    const current = db.prepare("SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?").get(userId, productId) as { quantity: number } | undefined;
    const currentQty = current ? current.quantity : 0;
    const newQty = currentQty + qty;

    if (newQty > product.stock) {
      return { success: false, error: `В наличии только ${product.stock} шт.` };
    }

    db.prepare(`
      INSERT INTO cart (user_id, product_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity
    `).run(userId, productId, newQty);

    return { success: true };
  },

  removeFromCart(userId: number, productId: number): void {
    db.prepare("DELETE FROM cart WHERE user_id = ? AND product_id = ?").run(userId, productId);
  },

  clearCart(userId: number): void {
    db.prepare("DELETE FROM cart WHERE user_id = ?").run(userId);
  },

  // Карта количества товаров в корзине: productId -> quantity
  getCartItemsMap(userId: number): Map<number, number> {
    const rows = db.prepare("SELECT product_id, quantity FROM cart WHERE user_id = ?").all(userId) as { product_id: number; quantity: number }[];
    const map = new Map<number, number>();
    for (const r of rows) {
      map.set(r.product_id, r.quantity);
    }
    return map;
  },

  // Общее количество позиций в корзине пользователя
  getCartTotalCount(userId: number): number {
    const row = db.prepare("SELECT IFNULL(SUM(quantity), 0) as count FROM cart WHERE user_id = ?").get(userId) as { count: number } | undefined;
    return row?.count || 0;
  },

  // Количество новых необработанных заявок
  getNewOrdersCount(): number {
    const row = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'new'").get() as { count: number } | undefined;
    return row?.count || 0;
  },

  // Заказы и заявки
  getOrders(status?: string): OrderRecord[] {
    if (status) {
      return db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 50").all(status) as OrderRecord[];
    }
    return db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 50").all() as OrderRecord[];
  },

  getUserOrders(userId: number): OrderRecord[] {
    return db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20").all(userId) as OrderRecord[];
  },

  getOrderById(id: number): OrderRecord | undefined {
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRecord | undefined;
  },

  updateOrderStatus(orderId: number, status: "new" | "in_progress" | "completed" | "cancelled"): void {
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
  },

  // Отмена заказа с возвратом товаров на склад
  cancelOrderWithStockRefund(orderId: number): { success: boolean; error?: string } {
    const order = this.getOrderById(orderId);
    if (!order) return { success: false, error: "Заказ не найден" };
    if (order.status === "cancelled") return { success: false, error: "Заказ уже отменен" };

    const tx = db.transaction(() => {
      // Возвращаем товары на склад
      try {
        const items: OrderItem[] = JSON.parse(order.items_json);
        for (const item of items) {
          db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.quantity, item.product_id);
        }
      } catch {}

      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
    });

    try {
      tx();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Статистика
  getStats(): { ordersCount: number; totalSales: number; productsCount: number } {
    const orders = db.prepare("SELECT COUNT(*) as count, IFNULL(SUM(total_price), 0) as total FROM orders WHERE status != 'cancelled'").get() as { count: number; total: number };
    const prods = db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number };
    return {
      ordersCount: orders.count,
      totalSales: orders.total,
      productsCount: prods.count
    };
  },

  // Оформление заказа со списанием остатков
  checkoutOrder(
    userId: number,
    userName: string,
    phone: string,
    comment: string
  ): { success: boolean; error?: string; orderId?: number; total?: number; items?: OrderItem[] } {
    const cartItems = this.getCart(userId);
    if (cartItems.length === 0) {
      return { success: false, error: "Корзина пуста" };
    }

    const tx = db.transaction(() => {
      let total = 0;
      const orderItems: OrderItem[] = [];

      for (const item of cartItems) {
        const prod = db.prepare("SELECT stock, price, name FROM products WHERE id = ?").get(item.product_id) as { stock: number; price: number; name: string } | undefined;
        if (!prod) {
          throw new Error(`Товар "${item.name}" был удалён`);
        }
        if (prod.stock < item.quantity) {
          throw new Error(`Недостаточно товара "${prod.name}" на складе (осталось: ${prod.stock} шт.)`);
        }

        db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.product_id);

        const subtotal = item.quantity * prod.price;
        total += subtotal;
        orderItems.push({
          product_id: item.product_id,
          name: prod.name,
          price: prod.price,
          quantity: item.quantity,
          subtotal
        });
      }

      const orderStmt = db.prepare(`
        INSERT INTO orders (user_id, user_name, phone, comment, total_price, items_json, status)
        VALUES (?, ?, ?, ?, ?, ?, 'new')
      `);
      const info = orderStmt.run(userId, userName, phone, comment, total, JSON.stringify(orderItems));

      this.clearCart(userId);

      return { orderId: Number(info.lastInsertRowid), total, items: orderItems };
    });

    try {
      const res = tx();
      return { success: true, ...res };
    } catch (err: any) {
      return { success: false, error: err.message || "Ошибка при оформлении заказа" };
    }
  }
};
