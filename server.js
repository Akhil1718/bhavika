const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tokenSign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
};
const tokenVerify = (token) => {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
};
const id = () => crypto.randomBytes(8).toString('hex');

function seedProducts() {
  const catalog = [
    ['Gucci','Marmont Velvet Shoulder Bag','Bags',2800,26,8,false],['Gucci','Runway Crystal Heels','Heels',1450,18,1,true],['Chanel','Classic Flap Caviar Medium','Bags',6900,22,5,false],['Louis Vuitton','Capucines Mini Limited','Bags',7200,30,1,true],['Hermès','Oran Oasis Sandals','Heels',980,15,9,false],['Saint Laurent','Le 5 à 7 Hobo','Accessories',2500,20,6,false],['Zara','Studio Monochrome Trench','Clothing',260,40,10,false],['Chanel','Haute Brooch Collection','Accessories',2100,25,1,true],['Louis Vuitton','Monogram Eclipse Wallet','Accessories',850,12,7,false],['Saint Laurent','Tailored Silk Blazer','Clothing',1700,28,4,false],['Hermès','Kelly Mini Retourne Drop','Bags',8900,14,1,true],['Gucci','Limited Logo Silk Scarf','Accessories',520,21,1,true]
  ];
  return catalog.map((x,i)=>({id:`p_${i+1}`,brand:x[0],name:x[1],category:x[2],retailPrice:x[3],discount:x[4],salePrice:+(x[3]*(1-x[4]/100)).toFixed(2),stock:x[5],limitedEdition:x[6],description:`${x[0]} ${x[1]} crafted for monochrome luxury collectors.`,images:[1,2,3,4].map(n=>`https://picsum.photos/seed/${i+1}${n}/800/900`),reviews:[{user:'A. Reed',rating:5,comment:'Packaging and quality were stunning.'},{user:'M. Stone',rating:4,comment:'Gorgeous finish and fast dispatch.'}] }));
}

function ensureDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], otps: [], products: seedProducts(), orders: [] }, null, 2));
}
const readDb = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const writeDb = (db) => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

function send(res, code, data, headers={}) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => b += c);
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
  });
}
function getUser(req, db) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const parsed = tokenVerify(token);
  if (!parsed) return null;
  return db.users.find((u) => u.id === parsed.id) || null;
}

ensureDb();

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {}, { 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();

  if (req.method === 'POST' && url.pathname === '/api/auth/request-otp') {
    const { email, phone, role='customer', password, name } = await readBody(req);
    const identity = email || phone;
    if (!identity || !password) return send(res, 400, { message: 'Missing credentials' });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    db.otps = db.otps.filter((o) => o.identity !== identity);
    db.otps.push({ identity, otp, role, passwordHash: hash(password), name, expiresAt: Date.now() + 300000 });
    writeDb(db);
    return send(res, 200, { message: 'OTP sent', otpDemoOnly: otp });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
    const { email, phone, otp } = await readBody(req);
    const identity = email || phone;
    const otpEntry = db.otps.find((o) => o.identity === identity && o.otp === otp && o.expiresAt > Date.now());
    if (!otpEntry) return send(res, 400, { message: 'Invalid or expired OTP' });
    let user = db.users.find((u) => u.email === email || u.phone === phone);
    if (!user) { user = { id: id(), name: otpEntry.name || 'C&C Member', email: email || null, phone: phone || null, role: otpEntry.role, passwordHash: otpEntry.passwordHash, wishlist: [], cart: [] }; db.users.push(user); }
    db.otps = db.otps.filter((o) => o !== otpEntry);
    writeDb(db);
    return send(res, 200, { token: tokenSign({ id: user.id, role: user.role }), user: { id: user.id, name: user.name, role: user.role } });
  }

  if (req.method === 'GET' && url.pathname === '/api/products') {
    let products = db.products;
    if (url.searchParams.get('brand')) products = products.filter((p) => p.brand.toLowerCase() === url.searchParams.get('brand').toLowerCase());
    if (url.searchParams.get('limited') === 'true') products = products.filter((p) => p.limitedEdition);
    return send(res, 200, products);
  }
  if (req.method === 'GET' && /^\/api\/products\/.+/.test(url.pathname)) {
    const pid = url.pathname.split('/').pop();
    const p = db.products.find((x) => x.id === pid);
    return p ? send(res, 200, p) : send(res, 404, { message: 'Not found' });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = getUser(req, db); if (!user) return send(res, 401, { message: 'Unauthorized' });
    return send(res, 200, { wishlist: user.wishlist, cart: user.cart, role: user.role });
  }

  if (req.method === 'POST' && /^\/api\/wishlist\/.+/.test(url.pathname)) {
    const user = getUser(req, db); if (!user) return send(res, 401, { message: 'Unauthorized' });
    const pid = url.pathname.split('/').pop();
    const i = user.wishlist.indexOf(pid); if (i > -1) user.wishlist.splice(i,1); else user.wishlist.push(pid);
    writeDb(db); return send(res, 200, { wishlist: user.wishlist });
  }

  if (req.method === 'POST' && url.pathname === '/api/cart') {
    const user = getUser(req, db); if (!user) return send(res, 401, { message: 'Unauthorized' });
    const { productId, quantity = 1, mode = 'add' } = await readBody(req);
    const p = db.products.find((x) => x.id === productId);
    if (!p || p.stock < quantity) return send(res, 400, { message: 'Insufficient stock' });
    if (mode === 'buyNow') user.cart = [{ productId, quantity }];
    else {
      const ex = user.cart.find((c) => c.productId === productId);
      ex ? ex.quantity += quantity : user.cart.push({ productId, quantity });
    }
    writeDb(db); return send(res, 200, { cart: user.cart });
  }

  if (req.method === 'POST' && url.pathname === '/api/checkout') {
    const user = getUser(req, db); if (!user) return send(res, 401, { message: 'Unauthorized' });
    if (!user.cart.length) return send(res, 400, { message: 'Cart is empty' });
    let total = 0;
    for (const line of user.cart) {
      const p = db.products.find((x) => x.id === line.productId);
      if (!p || p.stock < line.quantity) return send(res, 400, { message: 'Stock unavailable' });
      p.stock -= line.quantity; total += p.salePrice * line.quantity;
    }
    db.orders.push({ id: id(), userId: user.id, items: user.cart, total: +total.toFixed(2), status: process.env.STRIPE_SECRET_KEY ? 'Payment Pending (Stripe integration required on UI)' : 'Confirmed (demo)' });
    user.cart = [];
    writeDb(db);
    return send(res, 200, { total: +total.toFixed(2), paymentProvider: process.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo' });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
    const user = getUser(req, db); if (!user || user.role !== 'admin') return send(res, 403, { message: 'Admins only' });
    return send(res, 200, db.orders);
  }

  const filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }
  const index = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return fs.createReadStream(index).pipe(res);
  }
  send(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => console.log(`C&C running on http://localhost:${PORT}`));
