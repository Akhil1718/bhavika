const state = { products: [], brand: null, token: localStorage.getItem('token'), me: { cart: [], wishlist: [] } };
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(opts.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const brands = ['Gucci', 'Zara', 'Chanel', 'Louis Vuitton', 'Saint Laurent', 'Hermès'];
const brandGrid = document.getElementById('brandGrid');
const productGrid = document.getElementById('productGrid');
const limitedGrid = document.getElementById('limitedGrid');
const modal = document.getElementById('productModal');
const authModal = document.getElementById('authModal');
const cartCount = document.getElementById('cartCount');
const authBtn = document.getElementById('authBtn');

function renderBrands() {
  brandGrid.innerHTML = `<div class='brand-card' onclick='selectBrand(null)'>All Brands</div>` + brands.map(b =>
    `<div class='brand-card' onclick='selectBrand(${JSON.stringify(b)})'>${b}</div>`).join('');
}
window.selectBrand = async (brand) => {
  state.brand = brand;
  await loadProducts();
};

function card(p) {
  return `<div class='card'>
    <img src='${p.images[0]}' alt='${p.name}' />
    <div class='badge'>${p.brand}</div>
    <h4>${p.name}</h4>
    <small>${p.category} • Stock: ${p.stock}</small>
    <div class='price'><span class='retail'>$${p.retailPrice}</span><span class='sale'>$${p.salePrice}</span><span>${p.discount}% off</span></div>
    <button onclick='openProduct(${JSON.stringify(p.id)})'>View Details</button>
  </div>`;
}

async function loadProducts() {
  const q = state.brand ? `?brand=${encodeURIComponent(state.brand)}` : '';
  state.products = await api(`/api/products${q}`);
  productGrid.innerHTML = state.products.filter(p => p.stock < 10).map(card).join('');
  limitedGrid.innerHTML = state.products.filter(p => p.limitedEdition).map(p => card({ ...p, stock: 1 })).join('');
}

window.openProduct = async (id) => {
  const p = await api(`/api/products/${id}`);
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class='modal-content'>
    <h2>${p.brand} — ${p.name}</h2>
    <div class='gallery'>${p.images.slice(0,4).map(i=>`<img src='${i}'/>`).join('')}</div>
    <p>${p.description}</p>
    <div class='price'><span class='retail'>$${p.retailPrice}</span><span class='sale'>$${p.salePrice}</span></div>
    <div class='row'>
      <button onclick='addToCart("${p.id}")'>Add to Cart</button>
      <button onclick='buyNow("${p.id}")'>Buy Now</button>
      <button class='outline' onclick='toggleWishlist("${p.id}")'>Wishlist</button>
      <button class='outline' onclick='closeModal()'>Close</button>
    </div>
    <h3>Reviews</h3>
    ${p.reviews.map(r=>`<p>⭐${r.rating} ${r.user}: ${r.comment}</p>`).join('')}
  </div>`;
};
window.closeModal = () => modal.classList.add('hidden');

async function refreshMe() {
  if (!state.token) return;
  try {
    state.me = await api('/api/me');
    cartCount.textContent = state.me.cart.reduce((a,c)=>a+c.quantity,0);
  } catch { localStorage.removeItem('token'); state.token = null; }
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
  alert(out.paymentProvider === 'stripe' ? 'Stripe payment intent created. Complete with Stripe Elements.' : `Order successful: $${out.total}`);
  await refreshMe();
};
window.toggleWishlist = async (productId) => {
  if (!state.token) return showAuth();
  await api(`/api/wishlist/${productId}`, { method: 'POST' });
  await refreshMe();
  alert('Wishlist updated');
};

function renderAuth() {
  authModal.innerHTML = `<div class='modal-content'><h3>Login / Register</h3>
    <input id='name' placeholder='Name' />
    <input id='identity' placeholder='Email or Phone' />
    <input id='password' type='password' placeholder='Password' />
    <select id='role'><option value='customer'>Customer</option><option value='admin'>Admin</option></select>
    <button onclick='requestOtp()'>Request OTP</button>
    <input id='otp' placeholder='Enter OTP' />
    <button onclick='verifyOtp()'>Verify & Login</button>
    <button class='outline' onclick='hideAuth()'>Close</button>
  </div>`;
}
window.showAuth = () => { authModal.classList.remove('hidden'); renderAuth(); };
window.hideAuth = () => authModal.classList.add('hidden');
authBtn.onclick = () => state.token ? checkoutAll() : showAuth();

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
  hideAuth();
  await refreshMe();
};

async function checkoutAll() {
  if (!state.token) return showAuth();
  const out = await api('/api/checkout', { method: 'POST' });
  alert(out.paymentProvider === 'stripe' ? 'Stripe payment intent created.' : `Checkout complete: $${out.total}`);
  await refreshMe();
}

document.querySelectorAll('nav [data-view]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const v = btn.dataset.view;
    if (v === 'wishlist') {
      const ids = new Set(state.me.wishlist);
      productGrid.innerHTML = state.products.filter(p => ids.has(p.id)).map(card).join('') || '<p>No wishlist items</p>';
    }
    if (v === 'cart') {
      const lines = state.me.cart.map(c => {
        const p = state.products.find(x => x.id === c.productId);
        return p ? `<p>${p.name} x ${c.quantity} — $${(p.salePrice * c.quantity).toFixed(2)}</p>` : '';
      }).join('');
      modal.classList.remove('hidden');
      modal.innerHTML = `<div class='modal-content'><h2>Your Cart</h2>${lines || '<p>Empty cart</p>'}
      <button onclick='checkoutAll()'>Checkout All</button><button class='outline' onclick='closeModal()'>Close</button></div>`;
    }
    if (v === 'limited') {
      document.getElementById('limitedSection').scrollIntoView({ behavior: 'smooth' });
    }
    if (v === 'home') {
      await loadProducts();
    }
  });
});

(async function init() { renderBrands(); await loadProducts(); await refreshMe(); })();
