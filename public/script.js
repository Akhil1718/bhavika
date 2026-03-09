const state = {
  products: [],
  brand: null,
  selectedProduct: null,
  activeImage: 0,
  token: localStorage.getItem('token'),
  me: { cart: [], wishlist: [] }
};

const brands = ['Gucci', 'Zara', 'Chanel', 'Louis Vuitton', 'Saint Laurent', 'Hermès'];
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(opts.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const homeView = document.getElementById('homeView');
const productView = document.getElementById('productView');
const overlay = document.getElementById('overlayModal');
const brandGrid = document.getElementById('brandGrid');
const productGrid = document.getElementById('productGrid');
const limitedGrid = document.getElementById('limitedGrid');
const cartCount = document.getElementById('cartCount');
const authBtn = document.getElementById('authBtn');
const logoutBtn = document.getElementById('logoutBtn');

function setAuthUi() {
  logoutBtn.classList.toggle('hidden', !state.token);
  authBtn.textContent = state.token ? 'CHECKOUT' : 'LOGIN';
}

function renderBrands() {
  brandGrid.innerHTML = [`<div class='brand-card' onclick='selectBrand(null)'>ALL</div>`]
    .concat(brands.map((b) => `<div class='brand-card' onclick='selectBrand(${JSON.stringify(b)})'>${b}</div>`))
    .join('');
}
window.selectBrand = async (brand) => {
  state.brand = brand;
  await loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderCard(p, forceStock = null) {
  const displayStock = forceStock ?? p.stock;
  return `<article class='card' onclick='openProductPage("${p.id}")'>
    <img src='${p.images[0]}' alt='${p.name}' />
    <div class='meta'>
      <span class='brand'>${p.brand}</span>
      <h4>${p.name}</h4>
      <p>$${p.salePrice} <span class='retail'>$${p.retailPrice}</span></p>
      <p class='brand'>${displayStock} left</p>
    </div>
  </article>`;
}

async function loadProducts() {
  const q = state.brand ? `?brand=${encodeURIComponent(state.brand)}` : '';
  state.products = await api(`/api/products${q}`);
  productGrid.innerHTML = state.products.filter((p) => p.stock < 10).map((p) => renderCard(p)).join('');
  limitedGrid.innerHTML = state.products.filter((p) => p.limitedEdition).map((p) => renderCard(p, 1)).join('');
}

window.openProductPage = async (id) => {
  const p = await api(`/api/products/${id}`);
  state.selectedProduct = p;
  state.activeImage = 0;
  history.pushState({ product: p.id }, '', `?product=${p.id}`);
  showProduct();
};

function showHome() {
  productView.classList.add('hidden');
  homeView.classList.remove('hidden');
}

function showProduct() {
  if (!state.selectedProduct) return;
  const p = state.selectedProduct;
  homeView.classList.add('hidden');
  productView.classList.remove('hidden');

  productView.innerHTML = `<button class='back' onclick='backToHome()'>← BACK TO SHOP</button>
  <section class='product-layout'>
    <div class='gallery'>
      <div class='gallery-main' id='galleryMain'>
        <img src='${p.images[state.activeImage]}' alt='${p.name}' />
        <div class='gallery-controls'>
          <button onclick='changeImage(-1)'>PREV</button>
          <button onclick='changeImage(1)'>NEXT</button>
        </div>
      </div>
      <div class='thumbs'>
        ${p.images.slice(0, 4).map((img, idx) => `<img src='${img}' class='${idx === state.activeImage ? 'active' : ''}' onclick='pickImage(${idx})' />`).join('')}
      </div>
    </div>
    <div class='details'>
      <span class='brand-label'>${p.brand}</span>
      <h2>${p.name}</h2>
      <div class='price-row'>$${p.salePrice}<span class='retail'>$${p.retailPrice}</span><span class='discount'>${p.discount}% OFF</span></div>
      <p>${p.description}</p>
      <p><strong>Stock:</strong> ${p.limitedEdition ? '1 (limited drop)' : p.stock}</p>
      <div class='cta-stack'>
        <button class='cta primary' onclick='buyNow("${p.id}")'>Buy Now</button>
        <button class='cta secondary' onclick='addToCart("${p.id}")'>Add to Cart</button>
        <button class='cta secondary' onclick='toggleWishlist("${p.id}")'>Wishlist</button>
      </div>
      <h3>Reviews</h3>
      ${p.reviews.map((r) => `<div class='review'>⭐${r.rating} ${r.user}<br>${r.comment}</div>`).join('')}
    </div>
  </section>`;

  enableSwipe();
}

function enableSwipe() {
  const box = document.getElementById('galleryMain');
  if (!box) return;
  let startX = 0;
  box.ontouchstart = (e) => { startX = e.touches[0].clientX; };
  box.ontouchend = (e) => {
    const delta = e.changedTouches[0].clientX - startX;
    if (Math.abs(delta) < 35) return;
    changeImage(delta < 0 ? 1 : -1);
  };
}

window.changeImage = (direction) => {
  const max = Math.min(4, state.selectedProduct.images.length);
  state.activeImage = (state.activeImage + direction + max) % max;
  showProduct();
};
window.pickImage = (idx) => { state.activeImage = idx; showProduct(); };
window.backToHome = () => {
  history.pushState({}, '', '/');
  showHome();
};

async function refreshMe() {
  if (!state.token) {
    state.me = { cart: [], wishlist: [] };
    cartCount.textContent = '0';
    return;
  }
  try {
    state.me = await api('/api/me');
    cartCount.textContent = state.me.cart.reduce((a, c) => a + c.quantity, 0);
  } catch {
    state.token = null;
    localStorage.removeItem('token');
  }
}

window.addToCart = async (productId) => {
  if (!state.token) return showAuth();
  await api('/api/cart', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  await refreshMe();
  alert('Added to cart');
};
window.buyNow = async (productId) => {
  if (!state.token) return showAuth();
  await api('/api/cart', { method: 'POST', body: JSON.stringify({ productId, quantity: 1, mode: 'buyNow' }) });
  const out = await api('/api/checkout', { method: 'POST' });
  alert(out.paymentProvider === 'stripe' ? 'Stripe payment intent created.' : `Order complete: $${out.total}`);
  await refreshMe();
};
window.toggleWishlist = async (productId) => {
  if (!state.token) return showAuth();
  await api(`/api/wishlist/${productId}`, { method: 'POST' });
  await refreshMe();
  alert('Wishlist updated');
};

function closeOverlay() { overlay.classList.add('hidden'); overlay.innerHTML = ''; }

function showAuth() {
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class='modal'><h3>LOGIN / REGISTER</h3>
    <input id='name' placeholder='Name' />
    <input id='identity' placeholder='Email or Phone' />
    <input id='password' type='password' placeholder='Password' />
    <select id='role'><option value='customer'>Customer</option><option value='admin'>Admin</option></select>
    <button onclick='requestOtp()'>Request OTP</button>
    <input id='otp' placeholder='Enter OTP' />
    <button onclick='verifyOtp()'>Verify & Login</button>
    <button class='ghost' onclick='closeOverlay()'>Close</button>
  </div>`;
}
window.closeOverlay = closeOverlay;

window.requestOtp = async () => {
  const identity = document.getElementById('identity').value.trim();
  const payload = {
    name: document.getElementById('name').value.trim(),
    password: document.getElementById('password').value,
    role: document.getElementById('role').value
  };
  identity.includes('@') ? payload.email = identity : payload.phone = identity;
  const out = await api('/api/auth/request-otp', { method: 'POST', body: JSON.stringify(payload) });
  alert(`Demo OTP: ${out.otpDemoOnly}`);
};

window.verifyOtp = async () => {
  const identity = document.getElementById('identity').value.trim();
  const payload = { otp: document.getElementById('otp').value.trim() };
  identity.includes('@') ? payload.email = identity : payload.phone = identity;
  const out = await api('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify(payload) });
  state.token = out.token;
  localStorage.setItem('token', out.token);
  closeOverlay();
  await refreshMe();
  setAuthUi();
};

async function checkoutAll() {
  if (!state.token) return showAuth();
  const out = await api('/api/checkout', { method: 'POST' });
  alert(out.paymentProvider === 'stripe' ? 'Stripe payment intent created.' : `Checkout complete: $${out.total}`);
  await refreshMe();
}

authBtn.onclick = () => state.token ? checkoutAll() : showAuth();
logoutBtn.onclick = async () => {
  state.token = null;
  localStorage.removeItem('token');
  await refreshMe();
  setAuthUi();
  alert('Logged out. Your wishlist/cart remain saved to your account.');
};

document.querySelectorAll('nav [data-view]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const v = btn.dataset.view;
    showHome();
    if (v === 'wishlist') {
      const ids = new Set(state.me.wishlist);
      productGrid.innerHTML = state.products.filter((p) => ids.has(p.id)).map((p) => renderCard(p)).join('') || '<p>No wishlist items.</p>';
      window.scrollTo({ top: productGrid.offsetTop - 100, behavior: 'smooth' });
    }
    if (v === 'cart') {
      const lines = state.me.cart.map((c) => {
        const p = state.products.find((x) => x.id === c.productId);
        return p ? `<p>${p.name} × ${c.quantity} — $${(p.salePrice * c.quantity).toFixed(2)}</p>` : '';
      }).join('') || '<p>Cart is empty.</p>';
      overlay.classList.remove('hidden');
      overlay.innerHTML = `<div class='modal'><h3>YOUR CART</h3>${lines}<button onclick='checkoutAll()'>Checkout All</button><button class='ghost' onclick='closeOverlay()'>Close</button></div>`;
    }
    if (v === 'limited') document.getElementById('limitedSection').scrollIntoView({ behavior: 'smooth' });
    if (v === 'home') await loadProducts();
  });
});
window.checkoutAll = checkoutAll;

window.addEventListener('popstate', async () => {
  const pid = new URLSearchParams(location.search).get('product');
  if (!pid) return showHome();
  state.selectedProduct = await api(`/api/products/${pid}`);
  showProduct();
});

(async function init() {
  renderBrands();
  await loadProducts();
  await refreshMe();
  setAuthUi();

  const pid = new URLSearchParams(location.search).get('product');
  if (pid) {
    state.selectedProduct = await api(`/api/products/${pid}`);
    showProduct();
  }
})();
