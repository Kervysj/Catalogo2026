/* =============================================
   CATÁLOGO INTELIGENTE — app.js
   Conecta con Google Sheets → renderiza → carrito → WhatsApp
   ============================================= */

// ──────────────────────────────────────────────
// 1. CONFIGURACIÓN  ← EDITA AQUÍ
// ──────────────────────────────────────────────
const CONFIG = {
  // Google Apps Script URL
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxti64t_ZJHjsBQJHvpb1LJqKLr-P2zHFIKDJtIzwG2SRto2qOOwCzfxsfGx7OJj_D_/exec',

  // WhatsApp Venezuela
  WHATSAPP_NUMBER: '584149956831',

  // Nombre de tu tienda (aparece en el mensaje de WhatsApp)
  STORE_NAME: 'Mi Tienda',

  // Moneda
  CURRENCY: '$',
};

// ──────────────────────────────────────────────
// 2. ESTADO GLOBAL
// ──────────────────────────────────────────────
let allProducts = [];
let cart = {};          // { id: { product, qty } }
let currentCat = 'Todos';
let searchTerm = '';

// ──────────────────────────────────────────────
// 3. REFERENCIAS DOM
// ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const productGrid  = $('productGrid');
const categoryNav  = $('categoryNav');
const stateMsg     = $('stateMsg');
const cartPanel    = $('cartPanel');
const cartOverlay  = $('cartOverlay');
const cartBody     = $('cartBody');
const cartCount    = $('cartCount');
const cartTotalEl  = $('cartTotal');
const toast        = $('toast');

// ──────────────────────────────────────────────
// 4. CARGAR PRODUCTOS
// ──────────────────────────────────────────────
async function loadProducts() {
  showState('Cargando catálogo…', true);

  // MODO DEMO — mientras configuras el Script
  if (CONFIG.SCRIPT_URL === 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI') {
    await delay(800);
    allProducts = DEMO_PRODUCTS;
    init();
    return;
  }

  try {
    const res = await fetch(`${CONFIG.SCRIPT_URL}?action=getProducts`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    allProducts = data.products;
    init();
  } catch (e) {
    showState('No se pudo cargar el catálogo. Revisa tu conexión.', false);
    console.error(e);
  }
}

function init() {
  buildCategories();
  render();
  hideState();
}

// ──────────────────────────────────────────────
// 5. CATEGORÍAS DINÁMICAS
// ──────────────────────────────────────────────
function buildCategories() {
  const cats = ['Todos', ...new Set(allProducts.map(p => p.categoria).filter(Boolean))];
  categoryNav.innerHTML = cats.map(c =>
    `<button class="cat-btn ${c === currentCat ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');

  categoryNav.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCat = btn.dataset.cat;
      categoryNav.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });
}

// ──────────────────────────────────────────────
// 6. RENDERIZAR PRODUCTOS
// ──────────────────────────────────────────────
function render() {
  const term = searchTerm.toLowerCase();
  const filtered = allProducts.filter(p => {
    const matchCat = currentCat === 'Todos' || p.categoria === currentCat;
    const matchSearch = !term || p.nombre.toLowerCase().includes(term) || (p.descripcion||'').toLowerCase().includes(term);
    return matchCat && matchSearch;
  });

  if (!filtered.length) {
    productGrid.innerHTML = '';
    showState('No se encontraron productos.', false);
    return;
  }

  hideState();
  productGrid.innerHTML = filtered.map(cardHTML).join('');

  productGrid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const product = allProducts.find(p => p.id === id);
      if (product && product.stock > 0) addToCart(product);
    });
  });
}

function cardHTML(p) {
  const agotado = p.stock <= 0;
  const imgContent = p.url_imagen
    ? `<img class="card-img" src="${p.url_imagen}" alt="${p.nombre}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'card-img placeholder\\'>📦</div>'" />`
    : `<div class="card-img placeholder">📦</div>`;

  return `
    <article class="product-card">
      <div class="card-img-wrap">
        ${imgContent}
        ${agotado ? '<span class="badge-agotado">Agotado</span>' : ''}
      </div>
      <div class="card-body">
        <p class="card-cat">${p.categoria || ''}</p>
        <h3 class="card-name">${p.nombre}</h3>
        ${p.descripcion ? `<p class="card-desc">${p.descripcion}</p>` : ''}
        <div class="card-footer">
          <span class="card-price">${CONFIG.CURRENCY}${formatNum(p.precio)}</span>
          ${!agotado
            ? `<button class="add-btn" data-id="${p.id}" aria-label="Agregar ${p.nombre}">+</button>`
            : `<span style="font-size:11px;color:#9a9a9a">No disponible</span>`
          }
        </div>
      </div>
    </article>`;
}

// ──────────────────────────────────────────────
// 7. CARRITO
// ──────────────────────────────────────────────
function addToCart(product) {
  if (cart[product.id]) {
    cart[product.id].qty++;
  } else {
    cart[product.id] = { product, qty: 1 };
  }
  updateCartUI();
  showToast(`"${product.nombre}" agregado`);
}

function updateCartUI() {
  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + i.product.precio * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  // Count badge
  cartCount.textContent = count;
  cartCount.classList.toggle('visible', count > 0);

  // Total
  cartTotalEl.textContent = `${CONFIG.CURRENCY}${formatNum(total)}`;

  // Body
  if (!items.length) {
    cartBody.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
    return;
  }

  cartBody.innerHTML = items.map(({ product: p, qty }) => {
    const imgEl = p.url_imagen
      ? `<img class="cart-item-img" src="${p.url_imagen}" alt="${p.nombre}" />`
      : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:22px">📦</div>`;
    return `
      <div class="cart-item">
        ${imgEl}
        <div class="cart-item-info">
          <div class="cart-item-name">${p.nombre}</div>
          <div class="cart-item-price">${CONFIG.CURRENCY}${formatNum(p.precio * qty)}</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" data-action="down" data-id="${p.id}">−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn" data-action="up" data-id="${p.id}">+</button>
        </div>
      </div>`;
  }).join('');

  cartBody.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'up') {
        cart[id].qty++;
      } else {
        cart[id].qty--;
        if (cart[id].qty <= 0) delete cart[id];
      }
      updateCartUI();
    });
  });
}

// ──────────────────────────────────────────────
// 8. ENVIAR PEDIDO POR WHATSAPP
// ──────────────────────────────────────────────
$('sendBtn').addEventListener('click', async () => {
  const items = Object.values(cart);
  if (!items.length) { showToast('Agrega productos primero'); return; }

  const name  = $('clientName').value.trim();
  const phone = $('clientPhone').value.trim();
  if (!name) { showToast('Por favor ingresa tu nombre'); $('clientName').focus(); return; }

  const total = items.reduce((s, i) => s + i.product.precio * i.qty, 0);

  // Construir mensaje
  const lines = items.map(({ product: p, qty }) =>
    `• ${p.nombre} x${qty} — ${CONFIG.CURRENCY}${formatNum(p.precio * qty)}`
  );

  const msg = [
    `🛍️ *Nuevo pedido — ${CONFIG.STORE_NAME}*`,
    ``,
    `👤 Cliente: ${name}${phone ? `\n📱 WhatsApp: ${phone}` : ''}`,
    ``,
    `*Productos:*`,
    ...lines,
    ``,
    `💰 *Total: ${CONFIG.CURRENCY}${formatNum(total)}*`,
    ``,
    `_Pedido enviado desde el catálogo web_`,
  ].join('\n');

  // Registrar en Google Sheets (si el script está configurado)
  if (CONFIG.SCRIPT_URL !== 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI') {
    try {
      await fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveOrder',
          cliente: name,
          telefono: phone,
          items: items.map(({ product: p, qty }) => ({ id: p.id, nombre: p.nombre, qty, precio: p.precio })),
          total,
        }),
      });
    } catch (_) { /* continuar igual */ }
  }

  // Abrir WhatsApp
  const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');

  // Limpiar
  cart = {};
  updateCartUI();
  closeCartPanel();
  showToast('¡Pedido enviado!');
});

// ──────────────────────────────────────────────
// 9. PANEL CARRITO
// ──────────────────────────────────────────────
$('cartBtn').addEventListener('click', openCartPanel);
$('closeCart').addEventListener('click', closeCartPanel);
cartOverlay.addEventListener('click', closeCartPanel);

function openCartPanel() {
  cartPanel.classList.add('open');
  cartOverlay.classList.add('visible');
  cartPanel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeCartPanel() {
  cartPanel.classList.remove('open');
  cartOverlay.classList.remove('visible');
  cartPanel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ──────────────────────────────────────────────
// 10. BÚSQUEDA
// ──────────────────────────────────────────────
$('searchInput').addEventListener('input', e => {
  searchTerm = e.target.value;
  render();
});

// ──────────────────────────────────────────────
// 11. UTILIDADES
// ──────────────────────────────────────────────
function showState(msg, spinner) {
  stateMsg.innerHTML = spinner
    ? `<div class="spinner"></div><p>${msg}</p>`
    : `<p>${msg}</p>`;
  stateMsg.classList.remove('hidden');
  productGrid.innerHTML = '';
}
function hideState() { stateMsg.classList.add('hidden'); }

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function formatNum(n) {
  return Number(n).toLocaleString('es-CO');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ──────────────────────────────────────────────
// 12. DATOS DE DEMO (reemplazados por Sheets real)
// ──────────────────────────────────────────────
const DEMO_PRODUCTS = [
  { id:'1', nombre:'Bolso Negro Premium', categoria:'Bolsos', precio:180000, stock:5, url_imagen:'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80', descripcion:'Cuero genuino, cierre dorado, compartimentos internos.' },
  { id:'2', nombre:'Gafas de Sol Acetato', categoria:'Accesorios', precio:95000, stock:8, url_imagen:'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&q=80', descripcion:'Marco de acetato italiano, lente polarizado UV400.' },
  { id:'3', nombre:'Perfume Oud Rose', categoria:'Perfumería', precio:220000, stock:3, url_imagen:'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=400&q=80', descripcion:'Fragancia oriental, 50 ml, larga duración.' },
  { id:'4', nombre:'Reloj Minimalista', categoria:'Accesorios', precio:310000, stock:0, url_imagen:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80', descripcion:'Correa de cuero, esfera blanca, movimiento japonés.' },
  { id:'5', nombre:'Cartera Slim Piel', categoria:'Bolsos', precio:75000, stock:12, url_imagen:'https://images.unsplash.com/photo-1627123424574-724758594e93?w=400&q=80', descripcion:'Ultra delgada, 6 ranuras para tarjetas, colores surtidos.' },
  { id:'6', nombre:'Crema Facial Noche', categoria:'Cuidado', precio:140000, stock:7, url_imagen:'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80', descripcion:'Con retinol y vitamina C, apta para todo tipo de piel.' },
];

// ──────────────────────────────────────────────
// INICIO
// ──────────────────────────────────────────────
loadProducts();
