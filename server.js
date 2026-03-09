const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'replace-in-production';
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const makeId = () => crypto.randomBytes(8).toString('hex');

const signToken = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
};

const verifyToken = (token = '') => {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
};

function seedProducts() {
  const base = [
    ['Gucci', 'Marmont Velvet Shoulder Bag', 'Bags', 2800, 26, 8, false],
    ['Gucci', 'Runway Crystal Heels', 'Heels', 1450, 18, 1, true],
    ['Chanel', 'Classic Flap Caviar Medium', 'Bags', 6900, 22, 5, false],
    ['Louis Vuitton', 'Capucines Mini Limited', 'Bags', 7200, 30, 1, true],
    ['Hermès', 'Oran Oasis Sandals', 'Heels', 980, 15, 9, false],
    ['Saint Laurent', 'Le 5 à 7 Hobo', 'Accessories', 2500, 20, 6, false],
    ['Zara', 'Studio Monochrome Trench', 'Clothing', 260, 40, 9, false],
    ['Chanel', 'Haute Brooch Collection', 'Accessories', 2100, 25, 1, true],
    ['Louis Vuitton', 'Monogram Eclipse Wallet', 'Accessories', 850, 12, 7, false],
    ['Saint Laurent', 'Tailored Silk Blazer', 'Clothing', 1700, 28, 4, false],
    ['Hermès', 'Kelly Mini Retourne Drop', 'Bags', 8900, 14, 1, true],
    ['Gucci', 'Limited Logo Silk Scarf', 'Accessories', 520, 21, 1, true]
  ];

  return base.map((item, idx) => {
    const [brand, name, category, retailPrice, discount, stock, limitedEdition] = item;
    return {
      id: `p_${idx + 1}`,
      brand,
      name,
      category,
      retailPrice,
      discount,
      salePrice: +(retailPrice * (1 - discount / 100)).toFixed(2),
      stock,
      limitedEdition,
      description: `${brand} ${name} designed for minimal luxury wardrobes and rare collector drops.`,
      images: [1, 2, 3, 4].map((n) => `https://picsum.photos/seed/cnc-${idx + 1}-${n}/900/1100`),
      reviews: [
        { user: 'A. Reed', rating: 5, comment: 'Perfect finish and premium detailing.' },
        { user: 'M. Stone', rating: 4, comment: 'Loved the packaging and material quality.' }
      ]
    };
  });
}

function ensureDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const db = { users: [], otps: [], products: seedProducts(), orders: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
}

const readDb = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDb = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const send = (res, status, payload, extraHeaders = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    if (!raw) return resolve({});
    try { resolve(JSON.parse(raw)); } catch { resolve({}); }
  });
});

const getUserFromReq = (req, db) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const parsed = verifyToken(token);
  if (!parsed) return null;
  return db.users.find((u) => u.id === parsed.id) || null;
};

ensureDb();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    return send(res, 200, {}, {
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    });
  }

  const db = readDb();

  if (req.method === 'POST' && url.pathname === '/api/auth/request-otp') {
    const { email, phone, password, role = 'customer', name } = await parseBody(req);
    const identity = email || phone;
    if (!identity || !password) return send(res, 400, { message: 'Missing credentials' });
    const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
    db.otps = db.otps.filter((o) => o.identity !== identity);
    db.otps.push({ identity, otp, role, passwordHash: hash(password), name, expiresAt: Date.now() + 5 * 60 * 1000 });
    writeDb(db);
    return send(res, 200, { message: 'OTP generated', otpDemoOnly: otp });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
    const { email, phone, otp } = await parseBody(req);
    const identity = email || phone;
    const otpRecord = db.otps.find((o) => o.identity === identity && o.otp === otp && o.expiresAt > Date.now());
    if (!otpRecord) return send(res, 400, { message: 'Invalid OTP' });

    let user = db.users.find((u) => u.email === email || u.phone === phone);
    if (!user) {
      user = {
        id: makeId(),
        name: otpRecord.name || 'C&C Member',
        email: email || null,
        phone: phone || null,
        role: otpRecord.role,
        passwordHash: otpRecord.passwordHash,
        wishlist: [],
        cart: []
      };
      db.users.push(user);
    }

    db.otps = db.otps.filter((o) => o !== otpRecord);
    writeDb(db);

    return send(res, 200, {
      token: signToken({ id: user.id, role: user.role }),
      user: { id: user.id, name: user.name, role: user.role, email: user.email, phone: user.phone }
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/products') {
    let products = db.products;
    const brand = url.searchParams.get('brand');
    const category = url.searchParams.get('category');
    const limited = url.searchParams.get('limited');

    if (brand) products = products.filter((p) => p.brand.toLowerCase() === brand.toLowerCase());
    if (category) products = products.filter((p) => p.category.toLowerCase() === category.toLowerCase());
    if (limited === 'true') products = products.filter((p) => p.limitedEdition);

    return send(res, 200, products);
  }

  if (req.method === 'GET' && /^\/api\/products\/.+/.test(url.pathname)) {
    const productId = url.pathname.split('/').pop();
    const product = db.products.find((p) => p.id === productId);
    return product ? send(res, 200, product) : send(res, 404, { message: 'Product not found' });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = getUserFromReq(req, db);
    if (!user) return send(res, 401, { message: 'Unauthorized' });
    return send(res, 200, { wishlist: user.wishlist, cart: user.cart, role: user.role });
  }

  if (req.method === 'POST' && /^\/api\/wishlist\/.+/.test(url.pathname)) {
    const user = getUserFromReq(req, db);
    if (!user) return send(res, 401, { message: 'Unauthorized' });

    const productId = url.pathname.split('/').pop();
    const idx = user.wishlist.indexOf(productId);
    if (idx > -1) user.wishlist.splice(idx, 1);
    else user.wishlist.push(productId);

    writeDb(db);
    return send(res, 200, { wishlist: user.wishlist });
  }

  if (req.method === 'POST' && url.pathname === '/api/cart') {
    const user = getUserFromReq(req, db);
    if (!user) return send(res, 401, { message: 'Unauthorized' });

    const { productId, quantity = 1, mode = 'add' } = await parseBody(req);
    const product = db.products.find((p) => p.id === productId);

    if (!product) return send(res, 404, { message: 'Product not found' });
    if (product.stock < quantity) return send(res, 400, { message: 'Insufficient stock' });

    if (mode === 'buyNow') {
      user.cart = [{ productId, quantity }];
    } else {
      const line = user.cart.find((c) => c.productId === productId);
      if (line) line.quantity += quantity;
      else user.cart.push({ productId, quantity });
    }

    writeDb(db);
    return send(res, 200, { cart: user.cart });
  }

  if (req.method === 'DELETE' && /^\/api\/cart\/.+/.test(url.pathname)) {
    const user = getUserFromReq(req, db);
    if (!user) return send(res, 401, { message: 'Unauthorized' });
    const productId = url.pathname.split('/').pop();
    user.cart = user.cart.filter((c) => c.productId !== productId);
    writeDb(db);
    return send(res, 200, { cart: user.cart });
  }

  if (req.method === 'POST' && url.pathname === '/api/checkout') {
    const user = getUserFromReq(req, db);
    if (!user) return send(res, 401, { message: 'Unauthorized' });
    if (!user.cart.length) return send(res, 400, { message: 'Cart is empty' });

    let total = 0;
    for (const line of user.cart) {
      const product = db.products.find((p) => p.id === line.productId);
      if (!product || product.stock < line.quantity) return send(res, 400, { message: 'Stock unavailable' });
      product.stock -= line.quantity;
      total += product.salePrice * line.quantity;
    }

    db.orders.push({
      id: makeId(),
      userId: user.id,
      items: user.cart,
      total: +total.toFixed(2),
      status: process.env.STRIPE_SECRET_KEY ? 'Payment Pending (configure Stripe UI)' : 'Confirmed (demo)',
      createdAt: new Date().toISOString()
    });

    user.cart = [];
    writeDb(db);
    return send(res, 200, { total: +total.toFixed(2), paymentProvider: process.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo' });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
    const user = getUserFromReq(req, db);
    if (!user || user.role !== 'admin') return send(res, 403, { message: 'Admins only' });
    return send(res, 200, db.orders);
  }

  const localPath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (localPath.startsWith(PUBLIC_DIR) && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    return fs.createReadStream(localPath).pipe(res);
  }

  const appIndex = path.join(PUBLIC_DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return fs.createReadStream(appIndex).pipe(res);
});

server.listen(PORT, () => {
  console.log(`C&C running on http://localhost:${PORT}`);
});
