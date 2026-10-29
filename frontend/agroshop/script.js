// ======================== script.js ========================
// Fully integrated with AgroScan server and frontend
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // -------------------- DOM ELEMENTS --------------------
  const productGrid = document.getElementById('productGrid');
  const cartTopBtn = document.getElementById('cart-top-btn');
  const cartModal = document.getElementById('cartModal');
  const closeCartBtn = document.getElementById('close-cart');
  const applyCouponBtn = document.getElementById('applyCoupon');
  const couponInput = document.getElementById('couponCode');
  const cartItemsTbody = document.getElementById('cart-items');
  const cartTotalSpan = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkout-btn');
  const fetchOrderModal = document.getElementById('fetchOrderModal');
  const closeFetchOrderBtn = document.getElementById('closeFetchOrder');
  const finalTotalSpan = document.getElementById('final-total');
  const confirmOrderBtn = document.getElementById('confirmOrderBtn');
  const orderNameInput = document.getElementById('orderName');
  const orderPhoneInput = document.getElementById('orderPhone');
  const orderAddressInput = document.getElementById('orderAddress');
  const orderPaymentSelect = document.getElementById('orderPayment');

  const ordersModal = document.getElementById('ordersModal');
  const ordersTableBody = document.querySelector('#orders-table tbody');
  const orderTopBtn = document.getElementById('order-top-btn');
  const closeOrdersBtn = document.getElementById('close-orders');

  const orderDetailsModal = document.getElementById('orderDetailsModal');
  const closeOrderDetailsBtn = document.getElementById('closeOrderDetails');

// Get the correct USER_ID from sessionStorage user object
let USER_ID = '1'; // fallback

const storedUser = sessionStorage.getItem('user');
if (storedUser) {
  try {
    const user = JSON.parse(storedUser);
    USER_ID = user.userId || '1';
  } catch (err) {
    console.warn('Invalid user object in sessionStorage', err);
  }
}


  // -------------------- STATE --------------------
  let cart = [];
  let appliedCoupon = null;
  let coupons = {
    SAVE10: { discount: 10, uses: 2 },
    FIRSTBUY: { discount: 20, uses: 1 }
  };

  // -------------------- PRODUCTS --------------------
  const products = [
    { id: 1, name: "Soil Checking Kit", desc: "Check Soil Moisture, pH, Temperature and Light.", price: 799, img: "../img/soilkit.jpg" },
    { id: 2, name: "Mini Windmil", desc: "Mini Windmill for pots generating electricity.", price: 299, img: "../img/mill.jpg" },
    { id: 3, name: "Mini Smoke Obsober", desc: "Cleans air for home plants.", price: 499, img: "../img/obsorber.jpg" }
  ];

  // -------------------- HELPER FUNCTIONS --------------------
  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  function calculateCartTotalRaw() {
    return cart.reduce((sum, it) => sum + (it.price * (it.qty || 1)), 0);
  }

  function getDiscountedTotal(raw) {
    if (!appliedCoupon) return raw;
    return raw - (raw * appliedCoupon.discount / 100);
  }

  // -------------------- RENDER PRODUCTS --------------------
  function renderProducts() {
    if (!productGrid) return;
    productGrid.innerHTML = '';
    products.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}">
        <div class="product-info">
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.desc)}</p>
          <div class="product-price">₹${p.price}</div>
          <button class="add-to-cart-btn" data-index="${idx}">Add to Cart</button>
        </div>`;
      productGrid.appendChild(card);
    });

    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        addToCart(idx);
      });
    });
  }

  // -------------------- CART FUNCTIONS --------------------
  function addToCart(index) {
    const product = products[index];
    if (!product) return;
    const existing = cart.find(it => it.id === product.id);
    if (existing) existing.qty++;
    else cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
    renderCart();
  }

  function updateQty(idx, delta) {
    if (!cart[idx]) return;
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    renderCart();
  }

  function removeFromCart(idx) {
    if (!cart[idx]) return;
    cart.splice(idx, 1);
    renderCart();
  }

  function renderCart() {
    if (!cartItemsTbody || !cartTotalSpan) return;
    cartItemsTbody.innerHTML = '';
    if (!cart.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="text-align:center;padding:12px">Your cart is empty.</td>`;
      cartItemsTbody.appendChild(tr);
      cartTotalSpan.textContent = '0';
      finalTotalSpan && (finalTotalSpan.textContent = '0');
      return;
    }

    cart.forEach((item, idx) => {
      const subtotal = item.price * item.qty;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td>
          <button class="qty-btn" data-action="dec" data-idx="${idx}">-</button>
          <span style="margin:0 8px">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-idx="${idx}">+</button>
        </td>
        <td>₹${subtotal}</td>`;
      cartItemsTbody.appendChild(tr);
    });

    cartItemsTbody.querySelectorAll('.qty-btn').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        const delta = b.dataset.action === 'inc' ? 1 : -1;
        updateQty(idx, delta);
      });
    });
    cartItemsTbody.querySelectorAll('.remove-btn').forEach(b => {
      b.addEventListener('click', () => removeFromCart(parseInt(b.dataset.idx, 10)));
    });

    const raw = calculateCartTotalRaw();
    const total = getDiscountedTotal(raw).toFixed(2);
    cartTotalSpan.textContent = total;
    if (finalTotalSpan) finalTotalSpan.textContent = total;
  }

  // -------------------- COUPON --------------------
  if (applyCouponBtn && couponInput) {
    applyCouponBtn.addEventListener('click', () => {
      const code = (couponInput.value || '').trim().toUpperCase();
      const c = coupons[code];
      if (!c || c.uses <= 0) return alert('Invalid or expired coupon');
      appliedCoupon = { code, discount: c.discount };
      c.uses--;
      if (c.uses <= 0) delete coupons[code];
      alert(`Coupon applied: ${appliedCoupon.discount}% off`);
      renderCart();
    });
  }

  // -------------------- MODALS --------------------
  function setupModal(modal, closeBtn) {
    if (!modal) return;
    if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  }

  setupModal(cartModal, closeCartBtn);
  setupModal(fetchOrderModal, closeFetchOrderBtn);
  setupModal(ordersModal, closeOrdersBtn);
  setupModal(orderDetailsModal, closeOrderDetailsBtn);

  if (cartTopBtn) cartTopBtn.addEventListener('click', () => { renderCart(); cartModal.style.display = 'flex'; });
  if (orderTopBtn) orderTopBtn.addEventListener('click', () => { loadOrders(); ordersModal.style.display = 'flex'; });

  // -------------------- CHECKOUT --------------------
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
      if (!cart.length) return alert('Cart is empty');
      try {
        const res = await fetch(AGRO.api('user', { userId: USER_ID }));
        let user = {};
        if (res.ok) user = await res.json();
        orderNameInput.value = user.name || localStorage.getItem('fullName') || '';
        orderPhoneInput.value = user.phone || localStorage.getItem('phone') || '';
        orderAddressInput.value = user.address || localStorage.getItem('address') || '';
      } catch (err) {
        orderNameInput.value = localStorage.getItem('fullName') || '';
        orderPhoneInput.value = localStorage.getItem('phone') || '';
        orderAddressInput.value = localStorage.getItem('address') || '';
      }
      orderPaymentSelect.value = 'Cash on Delivery';
      const raw = calculateCartTotalRaw();
      finalTotalSpan && (finalTotalSpan.textContent = getDiscountedTotal(raw).toFixed(2));
      fetchOrderModal.style.display = 'flex';
    });
  }

  // -------------------- CONFIRM ORDER --------------------
  if (confirmOrderBtn) {
    confirmOrderBtn.addEventListener('click', async () => {
      const name = orderNameInput.value.trim();
      const phone = orderPhoneInput.value.trim();
      const address = orderAddressInput.value.trim();
      const payment = orderPaymentSelect.value || 'Cash on Delivery';
      if (!name || !phone || !address) return alert('Please fill Name, Phone, and Address');

      const orderItems = cart.map(it => ({ name: it.name, qty: it.qty, price: it.price }));

      try {
        const response = await fetch(AGRO.api('userOrders', { userId: USER_ID }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: orderItems,
            name,
            phone,
            address,
            payment_method: payment,
            coupon_code: appliedCoupon?.code || null
          })
        });
        const data = await response.json();
        if (response.ok) {
          alert('Order placed successfully!');
          cart = [];
          appliedCoupon = null;
          renderCart();
          fetchOrderModal.style.display = 'none';
          loadOrders();
        } else alert('Order failed: ' + (data.error || 'Unknown error'));
      } catch (err) {
        console.error(err);
        alert('Server error while placing order');
      }
    });
  }

  // -------------------- LOAD ORDERS --------------------
async function loadOrders() {
  if (!ordersTableBody) return;
  ordersTableBody.innerHTML = '';

  try {
    const res = await fetch(AGRO.api('userOrders', { userId: USER_ID }));
    if (!res.ok) throw new Error('Failed to fetch orders');
    const orders = await res.json();

    if (!orders.length) {
      ordersTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:12px">No orders yet.</td></tr>`;
      return;
    }

    // Group orders by order_id
    const grouped = {};
    orders.forEach(o => {
      const key = o.order_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    });

    Object.values(grouped).forEach(orderGroup => {
      const tr = document.createElement('tr');

      // Combine items
      const itemsSummary = orderGroup.map(it => `${it.product_name} x${it.quantity || 1}`).join(', ');

      // Calculate total safely
      const totalPrice = orderGroup.reduce((sum, it) => sum + Number(it.item_total || (it.price * (it.quantity || 1))), 0);

      const status = orderGroup[0].status || 'Pending';
      const date = orderGroup[0].created_at || '-';

      tr.innerHTML = `
        <td>${itemsSummary}</td>
        <td>${status}</td>
      `;

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => showOrderDetails(orderGroup));

      ordersTableBody.appendChild(tr);
    });

  } catch (err) {
    console.error('Fetch orders error', err);
    ordersTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:12px">Error loading orders</td></tr>`;
  }
}


  // -------------------- SHOW ORDER DETAILS --------------------
function showOrderDetails(orderGroup) {
  if (!orderGroup || !orderGroup.length) return;

  const first = orderGroup[0];

  // Fallbacks: use available fields
  document.getElementById('order-customer-name').textContent = first.name || first.customer_name || '-';
  document.getElementById('order-customer-phone').textContent = first.phone || first.customer_phone || '-';
  document.getElementById('order-address').textContent = first.address || '-';
  document.getElementById('order-payment').textContent = first.payment_method || '-';
  document.getElementById('order-coupon').textContent = first.coupon_code || '-';
  document.getElementById('order-status').textContent = first.status || '-';
  document.getElementById('order-date').textContent = first.created_at || '-';

  const itemsContainer = document.getElementById('order-items-list');
  itemsContainer.innerHTML = '';

  orderGroup.forEach(it => {
    const li = document.createElement('li');
    const qty = it.quantity || it.qty || 1;
    const price = it.unit_price || it.price || 0;
    const name = it.product_name || it.name || 'Unknown Product';
    li.textContent = `${name} x${qty} - ₹${(price * qty).toFixed(2)}`;
    itemsContainer.appendChild(li);
  });

  const total = orderGroup.reduce((sum, it) => {
    const qty = it.quantity || it.qty || 1;
    const price = it.unit_price || it.price || 0;
    return sum + price * qty;
  }, 0);

  document.getElementById('order-total').textContent = `₹${total.toFixed(2)}`;

  // Show modal
  orderDetailsModal.style.display = 'flex';
}



  // -------------------- SIDE PANEL --------------------
  window.toggleSidePanel = function() {
    const sidePanel = document.querySelector('.side-panel');
    const chatBtn = document.querySelector('.chat-btn');
    if (!sidePanel) return;
    sidePanel.classList.toggle('open');
    if (window.innerWidth <= 768 && chatBtn) chatBtn.style.display = sidePanel.classList.contains('open') ? 'none' : 'flex';
  };
  document.querySelectorAll('.side-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const submenu = btn.nextElementSibling;
      if (!submenu) return;
      submenu.classList.toggle('open');
    });
  });
  window.addEventListener('resize', () => {
    const chatBtn = document.querySelector('.chat-btn');
    if (window.innerWidth > 768 && chatBtn) chatBtn.style.display = 'flex';
  });

  // -------------------- INIT --------------------
  renderProducts();
  renderCart();
  populateHeaderSide();
  loadOrders();

}); // DOMContentLoaded
// ======= ACCORDION =======
document.querySelectorAll('.side-toggle').forEach(toggle=>{
  toggle.addEventListener('click',function(){
    const submenu = this.nextElementSibling;
    document.querySelectorAll('.side-submenu').forEach(sm=>{
      if(sm!==submenu) sm.style.maxHeight = null;
    });
    submenu.style.maxHeight ? submenu.style.maxHeight=null : submenu.style.maxHeight=submenu.scrollHeight+"px";
  });
});

// ======= PROFILE & LOGOUT =======
const defaultProfile = "../img/profile-logo.jpg";
function populateHeaderSide(){
  const user = JSON.parse(sessionStorage.getItem("user"));
  const fullName = user?.name || "Guest User";
  const username = user?.username ? `@${user.username}` : "@guest";
  const profileImg = user?.profileUrl || defaultProfile;

  document.getElementById("full-name").innerText = fullName;
  document.getElementById("username-display").innerText = username;

  const logoutLinks = [document.getElementById("logoutLink"), document.getElementById("logoutLinkMobile")];
  logoutLinks.forEach(link=> link.style.display = user ? "block" : "none");

  const panelInfo = document.querySelector(".panel-user-info");
  if(panelInfo){
    panelInfo.innerHTML=`
      <img src="${profileImg}" onerror="this.src='${defaultProfile}'" class="profile-logo-slide" alt="Profile">
      <p><strong>Name:</strong> ${fullName}</p>
      <p><strong>Username:</strong> ${username}</p>
    `;
  }

  const profileDropdownImg = document.querySelector(".profile-area img");
  if(profileDropdownImg){
    profileDropdownImg.src = profileImg;
    profileDropdownImg.onerror=function(){ this.src=defaultProfile; };
  }
}

// ============================
// Logout
// ============================
function deleteCookie(name) {
  document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}
document.querySelectorAll('#logoutLink, #logoutLinkMobile').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();

    // Clear sessionStorage and cookies
    sessionStorage.removeItem('user');
    document.cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    // Redirect to login page with auto-refresh
    window.location.href = "../login-form.html";
    window.location.reload(); // Forces reload of login page
  });
});
// ====== Call on page load ======
populateHeaderSide();


// ================== LOGOUT ==================
const user = JSON.parse(sessionStorage.getItem('user')) || null;
const userId = user?.userId;

if (!userId) {
  alert("No user found. Please login again.");
  window.location.href = "../login-form.html";
}



// ======= INITIALIZE =======
window.addEventListener("DOMContentLoaded",()=>{
  populateHeaderSide();
});
