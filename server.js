const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 3000;
const db = new Database('shop.db');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer');
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL, stock INTEGER, description TEXT, emoji TEXT);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, user_id INTEGER, total REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(order_id INTEGER, product_id INTEGER, qty INTEGER, price REAL);
`);

// Seed demo data on first run
if (!db.prepare('SELECT COUNT(*) c FROM products').get().c) {
  const ins = db.prepare('INSERT INTO products(name,category,price,stock,description,emoji) VALUES(?,?,?,?,?,?)');
  [
    ['Wireless Earbuds', 'Electronics', 39.99, 25, 'Bluetooth 5.3, 20-hour battery.', '🎧'],
    ['Mechanical Keyboard', 'Electronics', 69.0, 15, 'Hot-swappable switches, compact layout.', '⌨️'],
    ['Smart Watch', 'Electronics', 89.5, 10, 'Heart-rate and sleep tracking.', '⌚'],
    ['Canvas Backpack', 'Fashion', 44.0, 30, 'Fits a 15-inch laptop.', '🎒'],
    ['Running Shoes', 'Fashion', 59.9, 20, 'Lightweight and breathable.', '👟'],
    ['Sunglasses', 'Fashion', 19.5, 40, 'UV400 protection.', '🕶️'],
    ['Ceramic Mug Set', 'Home', 24.0, 35, 'Set of four, dishwasher safe.', '☕'],
    ['Desk Lamp', 'Home', 29.0, 18, 'Dimmable LED with a USB port.', '💡'],
    ['Notebook Pack', 'Stationery', 9.5, 100, 'Three dotted notebooks.', '📓']
  ].forEach(p => ins.run(...p));
}
if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
  db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
    .run('Admin', 'admin@shop.com', bcrypt.hashSync('admin123', 10), 'admin');
}

const app = express();
app.use(express.json());
app.use(express.static('public'));

const sign = u => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in first.' });
  }
}
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });

// ---- Auth ----
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required.' });
  try {
    const r = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)')
      .run(name, email.toLowerCase(), bcrypt.hashSync(password, 10));
    const u = { id: r.lastInsertRowid, role: 'customer', name };
    res.json({ token: sign(u), user: { name, role: u.role } });
  } catch {
    res.status(409).json({ error: 'That email is already registered.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password))
    return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(u), user: { name: u.name, role: u.role } });
});

// ---- Products ----
app.get('/api/products', (req, res) => {
  const { q = '', category = '' } = req.query;
  res.json(
    db.prepare("SELECT * FROM products WHERE name LIKE ? AND (?='' OR category=?) ORDER BY id")
      .all(`%${q}%`, category, category)
  );
});

app.post('/api/products', auth, adminOnly, (req, res) => {
  const { name, category, price, stock, description, emoji } = req.body || {};
  if (!name || !(price > 0)) return res.status(400).json({ error: 'Name and a positive price are required.' });
  const r = db.prepare('INSERT INTO products(name,category,price,stock,description,emoji) VALUES(?,?,?,?,?,?)')
    .run(name, category || 'General', price, stock || 0, description || '', emoji || '📦');
  res.json({ id: r.lastInsertRowid });
});

// ---- Orders (price and stock are checked on the server, never trusted from the client) ----
app.post('/api/orders', auth, (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Your cart is empty.' });
  const place = db.transaction(() => {
    let total = 0;
    const orderId = db.prepare('INSERT INTO orders(user_id,total) VALUES(?,0)').run(req.user.id).lastInsertRowid;
    for (const it of items) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.id);
      const qty = Math.floor(it.qty);
      if (!p || !(qty > 0)) throw new Error('Invalid item in cart.');
      if (p.stock < qty) throw new Error(`Only ${p.stock} left of ${p.name}.`);
      db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty, p.id);
      db.prepare('INSERT INTO order_items VALUES(?,?,?,?)').run(orderId, p.id, qty, p.price);
      total += p.price * qty;
    }
    total = Math.round(total * 100) / 100;
    db.prepare('UPDATE orders SET total=? WHERE id=?').run(total, orderId);
    return { id: orderId, total };
  });
  try { res.json(place()); } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/orders', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  const items = db.prepare('SELECT p.name, i.qty, i.price FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=?');
  res.json(orders.map(o => ({ ...o, items: items.all(o.id) })));
});

app.listen(PORT, () => console.log(`Corner Shop running at http://localhost:${PORT}`));
