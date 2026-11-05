import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "shop.db");
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.exec("ALTER TABLE categories ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE CASCADE");
} catch {}

// Гарантированное создание структуры категорий по умолчанию (Чаши, Табак -> Спектрум, Блэкберн, Мастхэв, Трофимов, Кальяны)
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

export const dbService = {
  // Настройки (Admin ID)
  getAdminId(): number | null {
    const envAdmin = process.env.ADMIN_ID;
    if (envAdmin && parseInt(envAdmin, 10) > 0) {
      return parseInt(envAdmin, 10);
    }
    const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_id'").get() as { value: string } | undefined;
    if (row && parseInt(row.value, 10) > 0) {
      return parseInt(row.value, 10);
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

  // Папки (Категории) со счётчиками в стиле «Мой Склад»
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

  // Хлебные крошки (путь к текущей папке)
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
    if (categoryId === null) return "📁 Мой Склад";
    const crumbs = this.getCategoryBreadcrumbs(categoryId);
    return "📁 Мой Склад / " + crumbs.map(c => c.name).join(" / ");
  },

  // Создание одной папки
  addCategory(name: string, parentId: number | null = null): number {
    const stmt = db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)");
    const info = stmt.run(name.trim(), parentId);
    return Number(info.lastInsertRowid);
  },

  // Массовое создание папок в текущей директории
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

  renameCategory(id: number, newName: string): void {
    db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(newName.trim(), id);
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
    // Проверка на существующий товар в этой категории (без учета регистра)
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

  // Пакетное добавление товаров списком с автоматическим слиянием дублей
  addBatchProducts(
    categoryId: number,
    items: Array<{ name: string; price: number; stock: number; description?: string }>
  ): number {
    const tx = db.transaction(() => {
      let count = 0;
      for (const item of items) {
        this.addProduct(categoryId, item.name, item.description || "", item.price, item.stock);
        count++;
      }
      return count;
    });

    return tx();
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

  // Статистика магазина
  getStats(): { ordersCount: number; totalSales: number; productsCount: number } {
    const orders = db.prepare("SELECT COUNT(*) as count, IFNULL(SUM(total_price), 0) as total FROM orders").get() as { count: number; total: number };
    const prods = db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number };
    return {
      ordersCount: orders.count,
      totalSales: orders.total,
      productsCount: prods.count
    };
  },

  // Оформление заявки (транзакция со списанием остатков)
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
        INSERT INTO orders (user_id, user_name, phone, comment, total_price, items_json)
        VALUES (?, ?, ?, ?, ?, ?)
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
