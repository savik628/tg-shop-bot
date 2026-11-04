import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "shop.db");
export const db = new Database(dbPath);

// Включаем WAL режим для быстрой и надежной работы
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
    name TEXT NOT NULL UNIQUE,
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

export interface Category {
  id: number;
  name: string;
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

  // Категории
  getCategories(): Category[] {
    return db.prepare("SELECT * FROM categories ORDER BY name ASC").all() as Category[];
  },

  getCategoryById(id: number): Category | undefined {
    return db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category | undefined;
  },

  addCategory(name: string): number {
    const stmt = db.prepare("INSERT INTO categories (name) VALUES (?)");
    const info = stmt.run(name.trim());
    return Number(info.lastInsertRowid);
  },

  deleteCategory(id: number): void {
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  },

  // Товары
  getProductsByCategory(categoryId: number): Product[] {
    return db.prepare("SELECT * FROM products WHERE category_id = ? ORDER BY name ASC").all(categoryId) as Product[];
  },

  getProductById(id: number): Product | undefined {
    return db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
  },

  addProduct(categoryId: number, name: string, description: string, price: number, stock: number): number {
    const stmt = db.prepare(`
      INSERT INTO products (category_id, name, description, price, stock)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(categoryId, name.trim(), description.trim(), price, stock);
    return Number(info.lastInsertRowid);
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

        // Списываем остаток
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

      // Сохраняем в таблицу orders
      const orderStmt = db.prepare(`
        INSERT INTO orders (user_id, user_name, phone, comment, total_price, items_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const info = orderStmt.run(userId, userName, phone, comment, total, JSON.stringify(orderItems));

      // Очищаем корзину
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
