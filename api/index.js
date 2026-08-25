const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialized = false;

async function init() {
  if (initialized) return;
  await db.batch([
    { sql: `CREATE TABLE IF NOT EXISTS purchases(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT,
      proof TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      username TEXT UNIQUE,
      password_hash TEXT,
      created_at INTEGER NOT NULL,
      approved_at INTEGER,
      expires_at INTEGER,
      payment_method TEXT,
      payment_account TEXT
    )` },
    { sql: `CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY,
      purchase_id INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )` },
  ], 'write');
  for (const sql of [
    `ALTER TABLE purchases ADD COLUMN username TEXT`,
    `ALTER TABLE purchases ADD COLUMN password_hash TEXT`,
    `ALTER TABLE purchases ADD COLUMN payment_method TEXT`,
    `ALTER TABLE purchases ADD COLUMN payment_account TEXT`,
  ]) { try { await db.execute(sql); } catch {} }
  initialized = true;
}

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
};

async function body(req) {
  let s = '';
  for await (const c of req) s += c;
  if (s.length > 4_000_000) throw Error('Request is too large.');
  try { return s ? JSON.parse(s) : {}; } catch { throw Error('Invalid JSON request.'); }
}

async function auth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const r = await db.execute({
    sql: `SELECT s.*,p.expires_at,p.status,p.username FROM sessions s JOIN purchases p ON p.id=s.purchase_id WHERE s.token=? AND p.status='approved'`,
    args: [h.slice(7)],
  });
  const row = r.rows[0];
  if (!row || (row.expires_at && Date.now() > row.expires_at)) return null;
  return row;
}

const REAL = ['AUD/CAD','AUD/CHF','AUD/JPY','AUD/NZD','AUD/USD','CAD/CHF','CAD/JPY','CHF/JPY','EUR/AUD','EUR/CAD','EUR/CHF','EUR/GBP','EUR/JPY','EUR/NZD','EUR/SGD','EUR/USD','GBP/AUD','GBP/CAD','GBP/CHF','GBP/JPY','GBP/USD','NZD/JPY','NZD/USD','USDCAD','USD/CHF','USD/JPY','XAG/USD','XAU/USD','AXJAUD','DOW JONES','DAX','FTSE 100','NASDAQ 100','S&P 500','CAC 40','EURO STOXX 50','IBEX 35','NIKKEI 225','HONG KONG 50','CHINA A50'];
const OTC = ['AUD/CAD OTC','AUD/CHF OTC','AUD/JPY OTC','AUD/NZD OTC','AUD/USD OTC','CAD/CHF OTC','CAD/JPY OTC','CHF/JPY OTC','EUR/AUD OTC','EUR/CAD OTC','EUR/CHF OTC','EUR/GBP OTC','EUR/JPY OTC','EUR/NZD OTC','EUR/SGD OTC','EUR/USD OTC','GBP/AUD OTC','GBP/CAD OTC','GBP/CHF OTC','GBP/JPY OTC','GBP/USD OTC','NZD/JPY OTC','NZD/USD OTC','USD/CAD OTC','USD/CHF OTC','USD/JPY OTC','USD/BRL OTC','USD/INR OTC','USD/PKR OTC','USD/BDT OTC','USD/MXN OTC','USD/COP OTC','USD/PHP OTC','USD/IDR OTC','USD/TRY OTC','USD/EGP OTC','USD/CLP OTC','USD/ARS OTC','USD/RUB OTC','USD/SGD OTC','USD/THB OTC','USD/VND OTC','USD/DZD OTC','USD/NGN OTC','USD/UAH OTC','EUR/TRY OTC','EUR/RUB OTC','EUR/HUF OTC','BRL/USD OTC','NGN/USD OTC','KES/USD OTC','YER/USD OTC','TND/USD OTC','MAD/USD OTC','LBP/USD OTC','ZAR/USD OTC','AED/CNY OTC','BHD/CNY OTC','JOD/CNY OTC','QAR/CNY OTC','OMR/CNY OTC','SAR/CNY OTC','GOLD OTC','SILVER OTC','US CRUDE OTC','UK BRENT OTC','BTC/USD OTC','ETH/USD OTC','XRP/USD OTC','LTC/USD OTC','BNB/USD OTC','BCH/USD OTC','DOGE/USD OTC','ADA/USD OTC','APT/USD OTC','ARB/USD OTC','AXS/USD OTC'];
const ASSETS = [...REAL.map(name => ({ name, otc: false })), ...OTC.map(name => ({ name, otc: true }))];

async function handler(req, res) {
  try {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return json(res, 500, { error: 'Database is not configured.' });
    await init();
    const path = new URL(req.url, 'http://localhost').pathname;

    if (req.method === 'POST' && path === '/api/purchase') {
      const b = await body(req);
      if (!b.proof) return json(res, 400, { error: 'Payment screenshot is required.' });
      if (!String(b.reference || '').trim()) return json(res, 400, { error: 'Payment reference is required.' });
      if (String(b.proof).length > 2_400_000) return json(res, 400, { error: 'Payment screenshot is too large.' });
      await db.execute({ sql: `INSERT INTO purchases(reference,proof,payment_method,payment_account,created_at) VALUES(?,?,?,?,?)`, args: [String(b.reference).trim().slice(0,80), String(b.proof), String(b.payment_method || 'BINANCE').slice(0,30), String(b.payment_account || '853973504').slice(0,80), Date.now()] });
      return json(res, 201, { ok: true });
    }

    if (req.method === 'POST' && path === '/api/create-account') {
      const b = await body(req);
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      const confirm = String(b.confirmPassword || '');
      const purchaseId = Number(b.purchase_id);
      if (!purchaseId || !username || !password || !confirm) return json(res, 400, { error: 'Username, password and confirmation are required.' });
      if (password !== confirm) return json(res, 400, { error: 'Passwords do not match.' });
      if (!/^[A-Za-z0-9_.-]{4,32}$/.test(username)) return json(res, 400, { error: 'Username must be 4-32 characters and use letters, numbers, dot, dash or underscore.' });
      if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' });
      const existing = await db.execute({ sql: `SELECT id FROM purchases WHERE username=? LIMIT 1`, args: [username] });
      if (existing.rows.length) return json(res, 409, { error: 'That username is already in use.' });
      const p = await db.execute({ sql: `SELECT id,status,expires_at FROM purchases WHERE id=? LIMIT 1`, args: [purchaseId] });
      const row = p.rows[0];
      if (!row || row.status !== 'approved') return json(res, 403, { error: 'Payment has not been approved.' });
      const hash = await bcrypt.hash(password, 12);
      await db.execute({ sql: `UPDATE purchases SET username=?,password_hash=? WHERE id=? AND status='approved'`, args: [username, hash, purchaseId] });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && path === '/api/payment-status') {
      const id = Number(new URL(req.url, 'http://localhost').searchParams.get('id'));
      if (!id) return json(res, 400, { error: 'Invalid payment id.' });
      const r = await db.execute({ sql: `SELECT id,status,username,expires_at FROM purchases WHERE id=?`, args: [id] });
      if (!r.rows.length) return json(res, 404, { error: 'Payment not found.' });
      const p = r.rows[0];
      return json(res, 200, { status: p.status, hasAccount: !!p.username, expiresAt: p.expires_at || null });
    }

    if (req.method === 'POST' && path === '/api/login') {
      const b = await body(req);
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      const r = await db.execute({ sql: `SELECT * FROM purchases WHERE username=? AND status='approved' LIMIT 1`, args: [username] });
      const p = r.rows[0];
      if (!p || !p.password_hash) return json(res, 401, { error: 'Invalid username or password.' });
      if (p.expires_at && Date.now() > p.expires_at) return json(res, 403, { error: 'Access has expired.' });
      if (!(await bcrypt.compare(password, p.password_hash))) return json(res, 401, { error: 'Invalid username or password.' });
      const deviceId = String(b.device_id || '');
      const old = await db.execute({ sql: `SELECT * FROM sessions WHERE purchase_id=? LIMIT 1`, args: [p.id] });
      if (old.rows.length && old.rows[0].device_id !== deviceId) return json(res, 409, { error: 'This account is already being used on another device.' });
      const token = crypto.randomBytes(32).toString('hex');
      if (old.rows.length) await db.execute({ sql: `UPDATE sessions SET token=?,device_id=?,created_at=? WHERE purchase_id=?`, args: [token, deviceId, Date.now(), p.id] });
      else await db.execute({ sql: `INSERT INTO sessions(token,purchase_id,device_id,created_at) VALUES(?,?,?,?)`, args: [token, p.id, deviceId, Date.now()] });
      return json(res, 200, { session: token });
    }

    if (req.method === 'GET' && path === '/api/markets') {
      if (!await auth(req)) return json(res, 401, { error: 'Login required.' });
      return json(res, 200, { markets: ASSETS });
    }

    if (req.method === 'POST' && path === '/api/signal') {
      if (!await auth(req)) return json(res, 401, { error: 'Login required.' });
      const b = await body(req);
      const market = ASSETS.find(x => x.name === String(b.market || ''));
      if (!market) return json(res, 400, { error: 'Invalid asset.' });
      const allowed = market.otc ? ['5 SEC','10 SEC','15 SEC','30 SEC','1 MINUTE','5 MINUTE'] : ['1 MINUTE','5 MINUTE'];
      if (!allowed.includes(b.timeframe)) return json(res, 400, { error: 'Invalid timeframe for this market.' });
      return json(res, 200, { direction: Math.random() < 0.5 ? 'UP' : 'DOWN', generated_at: Date.now(), mode: 'generated/demo' });
    }

    if (req.method === 'GET' && path === '/api/admin/purchases') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return json(res, 401, { error: 'Unauthorized' });
      const r = await db.execute(`SELECT id,reference,proof,payment_method,payment_account,status,username,created_at,approved_at,expires_at FROM purchases ORDER BY id DESC`);
      return json(res, 200, { items: r.rows });
    }

    if (req.method === 'POST' && path === '/api/admin/approve') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return json(res, 401, { error: 'Unauthorized' });
      const b = await body(req);
      const id = Number(b.purchase_id);
      if (!id) return json(res, 400, { error: 'purchase_id required' });
      const now = Date.now();
      const result = await db.execute({ sql: `UPDATE purchases SET status='approved',approved_at=?,expires_at=? WHERE id=? AND status='pending'`, args: [now, now + 30 * 24 * 60 * 60 * 1000, id] });
      return json(res, 200, { ok: result.rowsAffected > 0, message: 'Payment accepted. User must create their own account.' });
    }

    if (req.method === 'POST' && path === '/api/admin/reject') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return json(res, 401, { error: 'Unauthorized' });
      const b = await body(req);
      const id = Number(b.purchase_id);
      if (!id) return json(res, 400, { error: 'purchase_id required' });
      await db.execute({ sql: `UPDATE purchases SET status='rejected' WHERE id=? AND status='pending'`, args: [id] });
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('API ERROR:', err);
    return json(res, 500, { error: err?.message || 'Server error.' });
  }
}

module.exports = handler;
