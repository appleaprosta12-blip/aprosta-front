// Backend base URL
// - When running locally (localhost/127.0.0.1), use your local Node server
// - When deployed (Netlify, etc.), use the Render backend
const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://aprosta-backend.onrender.com";
const API_URL = API_BASE_URL + "/api/products";
const SEED_URL = API_BASE_URL + "/api/seed";
const AUTH_URL = API_BASE_URL + "/api/auth";
const UPLOAD_URL = API_BASE_URL + "/api/upload";
const ORDERS_URL = API_BASE_URL + "/api/orders";
const CART_KEY_PREFIX = "aprosta-sphere-cart";
const TOKEN_KEY = "aprosta-token";
const USER_KEY = "aprosta-user";
const FALLBACK_PRODUCT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='480' viewBox='0 0 640 480'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23e5e7eb'/%3E%3Cstop offset='1' stop-color='%23c7d2fe'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='480' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%234b5563' font-family='Outfit,Arial,sans-serif' font-size='28' dy='.3em'%3EProduct Image%3C/text%3E%3C/svg%3E";

let cart = [];

function getCartKey() {
  const user = getUser();
  const id = user?.id ? String(user.id) : "guest";
  return CART_KEY_PREFIX + "-" + id;
}

function loadCartForCurrentUser() {
  cart = [];
  try {
    const raw = localStorage.getItem(getCartKey());
    if (raw) cart = JSON.parse(raw);
  } catch (_) {}
  updateCartUI();
  const drawer = document.getElementById("cartDrawer");
  if (drawer?.classList.contains("is-open")) renderCartItems();
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}
function setAuth(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
  updateNavAuth();
  loadCartForCurrentUser();
  if (user?.role === "admin") {
    document.getElementById("navAdminLink")?.removeAttribute("hidden");
    document.getElementById("shopAdminBar")?.removeAttribute("hidden");
  } else {
    document.getElementById("navAdminLink")?.setAttribute("hidden", "hidden");
    document.getElementById("shopAdminBar")?.setAttribute("hidden", "hidden");
  }
  loadProducts();
}
function updateNavAuth() {
  const user = getUser();
  const authEl = document.getElementById("navAuth");
  const userEl = document.getElementById("navUser");
  const nameEl = document.getElementById("navUserName");
  const adminLink = document.getElementById("navAdminLink");
  if (user) {
    if (authEl) authEl.classList.add("nav-auth--hidden");
    if (userEl) userEl.classList.remove("nav-user--hidden");
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (adminLink) adminLink.hidden = user.role !== "admin";
  } else {
    if (authEl) authEl.classList.remove("nav-auth--hidden");
    if (userEl) userEl.classList.add("nav-user--hidden");
  }
}
function authHeaders() {
  const t = getToken();
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
function formatPrice(price) {
  const n = Number(price);
  if (isNaN(n)) return "₱0";
  return "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function saveCart() {
  localStorage.setItem(getCartKey(), JSON.stringify(cart));
  updateCartUI();
}

function updateCartUI() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const el = document.getElementById("cartCount");
  if (el) el.textContent = count;
}

function escapeHtml(str) {
  if (str == null) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function resolveImageUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return FALLBACK_PRODUCT_IMAGE;
  // Keep full data URLs as-is.
  if (value.startsWith("data:")) return value;
  // Handle root-relative upload paths from API.
  if (value.startsWith("/")) return API_BASE_URL + value;
  // Upgrade insecure backend links when frontend runs on HTTPS.
  if (window.location.protocol === "https:" && value.startsWith("http://")) {
    return value.replace(/^http:\/\//i, "https://");
  }
  // Handle old records that only store filename.
  if (!/^https?:\/\//i.test(value)) return `${API_BASE_URL}/uploads/${value}`;
  return value;
}

function showEmptyProducts(message) {
  const grid = document.getElementById("productGrid");
  const actions = document.getElementById("productActions");
  const hint = document.getElementById("productsHint");
  if (grid) grid.innerHTML = "";
  if (hint) hint.textContent = message;
  if (actions) {
    actions.hidden = false;
  }
}

function hideEmptyProducts() {
  const actions = document.getElementById("productActions");
  if (actions) actions.hidden = true;
}

async function seedProductsThenLoad() {
  const btn = document.getElementById("seedProductsBtn");
  const hint = document.getElementById("productsHint");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Loading…";
  }
  if (hint) hint.textContent = "Seeding 20 products…";
  try {
    const seedRes = await fetch(SEED_URL, { method: "POST" });
    if (seedRes.ok) {
      await loadProducts();
      return;
    }
    if (hint) hint.textContent = "Seed failed. Is the backend running (npm start in backend/)?";
  } catch (e) {
    if (hint) hint.textContent = "Cannot reach server. Start the backend (npm start in backend/) and try again.";
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Load 20 products";
  }
}

async function loadProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  grid.classList.add("is-loading");
  grid.classList.remove("is-refreshed");

  try {
    let res = await fetch(API_URL);
    let products = [];
    try {
      products = await res.json();
    } catch (_) {
      grid.classList.remove("is-loading");
      showEmptyProducts("Server returned invalid data. Start the backend and try again.");
      return;
    }

    if (!products.length) {
      const seedRes = await fetch(SEED_URL, { method: "POST" });
      if (seedRes.ok) {
        res = await fetch(API_URL);
        products = await res.json().catch(() => []);
      }
    }

    if (!products.length) {
      grid.classList.remove("is-loading");
      showEmptyProducts("No products yet. Start the backend (npm start in backend/), then click below to load 20 products.");
      return;
    }

    grid.classList.remove("is-loading");
    hideEmptyProducts();
    const user = getUser();
    const isAdmin = user?.role === "admin";
    const isCustomer = user?.role === "customer";
    const shopAdminBar = document.getElementById("shopAdminBar");
    if (shopAdminBar) shopAdminBar.hidden = !isAdmin;

    grid.innerHTML = products
      .map(
        (p) => {
          const adminBtns = isAdmin
            ? `<span class="product-admin-actions">
                <button type="button" class="btn-edit" data-id="${escapeAttr(p._id)}">Edit</button>
                <button type="button" class="btn-delete" data-id="${escapeAttr(p._id)}">Delete</button>
              </span>`
            : "";
          const productImage = resolveImageUrl(p.image);
          const addToCartBtn =
            !isAdmin
              ? `<button type="button" class="btn-add" data-id="${escapeAttr(p._id)}" data-name="${escapeAttr(p.name)}" data-price="${escapeAttr(p.price)}" data-image="${escapeAttr(productImage)}">Add to cart</button>`
              : "";
          return `
        <article class="product-card" data-id="${escapeHtml(p._id)}">
          <img class="product-image" src="${escapeAttr(productImage)}" alt="${escapeAttr(p.name)}" loading="lazy">
          <div class="product-body">
            <p class="product-category">${escapeHtml(p.category || "Tech")}</p>
            <h3 class="product-name">${escapeHtml(p.name)}</h3>
            <p class="product-desc">${escapeHtml(p.description || "")}</p>
            <div class="product-footer">
              <span class="product-price">${formatPrice(p.price)}</span>
              <div class="product-footer-btns">
                ${addToCartBtn}
                ${adminBtns}
              </div>
            </div>
          </div>
        </article>
      `;
        }
      )
      .join("");

    grid.querySelectorAll(".btn-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!getUser()) {
          alert("Please sign up first so that you can add to cart.");
          openAuthModal("register");
          return;
        }
        if (getUser()?.role !== "customer") return;
        addToCart({
          id: btn.dataset.id,
          name: btn.dataset.name,
          price: parseFloat(btn.dataset.price) || 0,
          image: btn.dataset.image || "",
        });
      });
    });
    grid.querySelectorAll(".product-image").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          if (img.dataset.fallbackApplied) return;
          img.dataset.fallbackApplied = "1";
          img.src = FALLBACK_PRODUCT_IMAGE;
        },
        { once: true }
      );
    });
    if (isAdmin) {
      grid.querySelectorAll(".btn-edit").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          try {
            const res = await fetch(`${API_URL}/${id}`);
            const p = await res.json();
            if (!res.ok) { alert("Could not load product."); return; }
            document.getElementById("adminProductId").value = p._id || "";
            document.getElementById("adminName").value = p.name || "";
            document.getElementById("adminDescription").value = p.description || "";
            document.getElementById("adminPrice").value = p.price ?? "";
            document.getElementById("adminImageUrl").value = resolveImageUrl(p.image);
            const fileInput = document.getElementById("adminImageFile");
            if (fileInput) fileInput.value = "";
            document.getElementById("adminCategory").value = p.category || "";
            document.getElementById("adminFormTitle").textContent = "Edit product";
            document.getElementById("adminSubmitBtn").textContent = "Update product";
            document.getElementById("adminCancelBtn").hidden = false;
            openAdminProductModal();
          } catch {
            alert("Could not load product.");
          }
        });
      });
      grid.querySelectorAll(".btn-delete").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this product?")) return;
          const id = btn.dataset.id;
          const res = await fetch(`${API_URL}/${id}`, { method: "DELETE", headers: authHeaders() });
          if (res.ok) loadProducts();
          else alert("Delete failed.");
        });
      });
    }

    grid.classList.add("is-refreshed");
    setTimeout(() => grid.classList.remove("is-refreshed"), 800);
  } catch (err) {
    console.error(err);
    grid.classList.remove("is-loading");
    showEmptyProducts("Could not load products. Start the backend (npm start in backend/), then click below to load 20 products.");
  }
}

function escapeAttr(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function addToCart(product) {
  const existing = cart.find((i) => i.id === product.id);
  if (existing) existing.qty += 1;
  else cart.push({ ...product, qty: 1 });
  saveCart();
  // Add-to-cart animation: pulse cart badge + toast
  const badge = document.getElementById("cartCount");
  if (badge) {
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
    setTimeout(() => badge.classList.remove("bump"), 400);
  }
  showToast("Added to cart");
  openCart();
}

function openCart() {
  document.getElementById("cartDrawer").classList.add("is-open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden", "false");
  document.getElementById("cartOverlay").classList.add("is-open");
  document.getElementById("cartOverlay").setAttribute("aria-hidden", "false");
  renderCartItems();
}

function closeCart() {
  document.getElementById("cartDrawer").classList.remove("is-open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden", "true");
  document.getElementById("cartOverlay").classList.remove("is-open");
  document.getElementById("cartOverlay").setAttribute("aria-hidden", "true");
}

function renderCartItems() {
  const container = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  if (!container || !totalEl) return;

  if (!cart.length) {
    container.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    totalEl.textContent = formatPrice(0);
    return;
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  totalEl.textContent = formatPrice(total);

  container.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item" data-id="${escapeAttr(item.id)}">
        <img class="cart-item-image" src="${escapeAttr(item.image)}" alt="">
        <div class="cart-item-details">
          <p class="cart-item-name">${escapeHtml(item.name)} × ${item.qty}</p>
          <p class="cart-item-price">${formatPrice(item.price * item.qty)}</p>
          <button type="button" class="cart-item-remove" data-id="${escapeAttr(item.id)}">Remove</button>
        </div>
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".cart-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      cart = cart.filter((i) => i.id !== btn.dataset.id);
      saveCart();
      renderCartItems();
    });
  });
}

function openCheckout() {
  if (!cart.length) return;
  closeCart();
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const summaryEl = document.getElementById("checkoutOrderSummary");
  const totalEl = document.getElementById("checkoutTotal");
  if (summaryEl) {
    summaryEl.innerHTML = cart
      .map(
        (i) =>
          `<div class="checkout-order-item"><span>${escapeHtml(i.name)} × ${i.qty}</span><strong>${formatPrice(i.price * i.qty)}</strong></div>`
      )
      .join("");
  }
  if (totalEl) totalEl.textContent = formatPrice(total);
  document.getElementById("checkoutFormView").hidden = false;
  document.getElementById("checkoutSuccessView").hidden = true;
  const checkoutForm = document.getElementById("checkoutForm");
  checkoutForm.reset();
  const user = getUser();
  if (user?.name) checkoutForm.querySelector('[name="customerName"]').value = user.name;
  if (user?.email) checkoutForm.querySelector('[name="email"]').value = user.email;
  document.getElementById("checkoutDrawer").classList.add("is-open");
  document.getElementById("checkoutDrawer").setAttribute("aria-hidden", "false");
  document.getElementById("checkoutOverlay").classList.add("is-open");
  document.getElementById("checkoutOverlay").setAttribute("aria-hidden", "false");
}
function closeCheckout() {
  document.getElementById("checkoutDrawer").classList.remove("is-open");
  document.getElementById("checkoutDrawer").setAttribute("aria-hidden", "true");
  document.getElementById("checkoutOverlay").classList.remove("is-open");
  document.getElementById("checkoutOverlay").setAttribute("aria-hidden", "true");
}

document.getElementById("cartBtn")?.addEventListener("click", openCart);
document.getElementById("cartClose")?.addEventListener("click", closeCart);
document.getElementById("cartOverlay")?.addEventListener("click", closeCart);
document.getElementById("checkoutBtn")?.addEventListener("click", openCheckout);
document.getElementById("checkoutClose")?.addEventListener("click", closeCheckout);
document.getElementById("checkoutOverlay")?.addEventListener("click", closeCheckout);
document.getElementById("checkoutSuccessClose")?.addEventListener("click", () => {
  closeCheckout();
  showToast("Order placed! Thank you.");
});
document.getElementById("checkoutForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("placeOrderBtn");
  const fd = new FormData(form);
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const items = cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty }));
  const payload = {
    customerName: fd.get("customerName"),
    email: fd.get("email"),
    phone: fd.get("phone"),
    address: fd.get("address"),
    city: fd.get("city"),
    notes: fd.get("notes") || "",
    items,
    total,
  };
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Placing order…";
    btn.classList.add("is-loading");
  }
  try {
    const res = await fetch(ORDERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 404
        ? "Orders API not found. Restart the backend (npm start in backend folder)."
        : (data.error || "Order failed. Try again.");
      showToast(msg);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Place order";
        btn.classList.remove("is-loading");
      }
      return;
    }
    cart = [];
    saveCart();
    document.getElementById("checkoutFormView").hidden = true;
    document.getElementById("checkoutSuccessView").hidden = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Place order";
      btn.classList.remove("is-loading");
    }
  } catch (err) {
    showToast("Cannot reach server. Check backend.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Place order";
      btn.classList.remove("is-loading");
    }
  }
});

document.getElementById("contactForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  alert("Thanks for your message! We'll get back to you soon.");
  e.target.reset();
});

// Auth UI — message and toast helpers (used by openAuthModal and login/logout)
function showAuthMessage(text, type) {
  const el = document.getElementById("authMessage");
  if (!el) return;
  el.textContent = text;
  el.className = "auth-message" + (type ? " is-" + type : "");
}
function clearAuthMessage() {
  showAuthMessage("", "");
}
function showToast(text) {
  const el = document.getElementById("authToast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("is-visible");
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => el.classList.remove("is-visible"), 2000);
}
function openAuthModal(panel) {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  clearAuthMessage();
  const isLogin = panel === "login";
  const loginPanel = document.getElementById("loginPanel");
  const registerPanel = document.getElementById("registerPanel");
  if (loginPanel) loginPanel.classList.toggle("is-active", isLogin);
  if (registerPanel) registerPanel.classList.toggle("is-active", !isLogin);
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === panel));
}
function closeAuthModal() {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  clearAuthMessage();
}
document.getElementById("loginBtn")?.addEventListener("click", () => openAuthModal("login"));
document.getElementById("registerBtn")?.addEventListener("click", () => openAuthModal("register"));
document.getElementById("authClose")?.addEventListener("click", closeAuthModal);
document.getElementById("authCloseBtn")?.addEventListener("click", closeAuthModal);
document.getElementById("authOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "authOverlay") closeAuthModal();
});
document.getElementById("authModal")?.addEventListener("click", (e) => e.stopPropagation());
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    clearAuthMessage();
    const isLogin = tab.dataset.tab === "login";
    const loginPanel = document.getElementById("loginPanel");
    const registerPanel = document.getElementById("registerPanel");
    if (loginPanel) loginPanel.classList.toggle("is-active", isLogin);
    if (registerPanel) registerPanel.classList.toggle("is-active", !isLogin);
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab.dataset.tab));
  });
});
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  if (!email || !password) {
    showAuthMessage("Enter email and password.", "error");
    form.classList.add("shake");
    setTimeout(() => form.classList.remove("shake"), 500);
    return;
  }
  const submitBtn = document.getElementById("loginSubmitBtn");
  form.classList.add("is-loading");
  clearAuthMessage();
  if (submitBtn) submitBtn.textContent = "Signing in…";
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const res = await fetch(AUTH_URL + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    form.classList.remove("is-loading");
    if (submitBtn) submitBtn.textContent = "Sign in";
    if (!res.ok) {
      showAuthMessage(data.error || "Wrong email or password. Try again.", "error");
      form.classList.add("shake");
      setTimeout(() => form.classList.remove("shake"), 500);
      return;
    }
    showAuthMessage("Welcome back!", "success");
    await new Promise((r) => setTimeout(r, 800));
    setAuth(data.token, data.user);
    closeAuthModal();
    form.reset();
    clearAuthMessage();
  } catch (err) {
    form.classList.remove("is-loading");
    if (submitBtn) submitBtn.textContent = "Sign in";
    showAuthMessage("Cannot reach server. Is the backend running?", "error");
    form.classList.add("shake");
    setTimeout(() => form.classList.remove("shake"), 500);
  }
});
document.getElementById("registerForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  clearAuthMessage();
  try {
    const res = await fetch(AUTH_URL + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAuthMessage(data.error || "Registration failed. Try again.", "error");
      form.classList.add("shake");
      setTimeout(() => form.classList.remove("shake"), 500);
      return;
    }
    showAuthMessage("Account created! Welcome.", "success");
    await new Promise((r) => setTimeout(r, 700));
    setAuth(data.token, data.user);
    closeAuthModal();
    form.reset();
    clearAuthMessage();
  } catch (err) {
    showAuthMessage("Cannot reach server.", "error");
    form.classList.add("shake");
    setTimeout(() => form.classList.remove("shake"), 500);
  }
});
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  setAuth(null, null);
  showToast("Signed out");
});

// Admin CRUD (in Shop)
function openAdminProductModal() {
  document.getElementById("adminProductOverlay")?.classList.add("is-open");
  document.getElementById("adminProductOverlay")?.setAttribute("aria-hidden", "false");
}
function closeAdminProductModal() {
  document.getElementById("adminProductOverlay")?.classList.remove("is-open");
  document.getElementById("adminProductOverlay")?.setAttribute("aria-hidden", "true");
}
document.getElementById("shopAddProductBtn")?.addEventListener("click", () => {
  document.getElementById("adminProductForm").reset();
  document.getElementById("adminProductId").value = "";
  document.getElementById("adminImageUrl").value = "";
  document.getElementById("adminFormTitle").textContent = "Add product";
  document.getElementById("adminSubmitBtn").textContent = "Add product";
  document.getElementById("adminCancelBtn").hidden = true;
  openAdminProductModal();
});
document.getElementById("adminProductClose")?.addEventListener("click", closeAdminProductModal);
document.getElementById("adminProductOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "adminProductOverlay") closeAdminProductModal();
});
document.getElementById("adminProductModal")?.addEventListener("click", (e) => e.stopPropagation());

document.getElementById("adminProductForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("adminProductId").value.trim();
  const name = document.getElementById("adminName").value.trim();
  const description = document.getElementById("adminDescription").value.trim();
  const price = Number(document.getElementById("adminPrice").value) || 0;
  const category = document.getElementById("adminCategory").value.trim();
  const fileInput = document.getElementById("adminImageFile");
  const imageUrlInput = document.getElementById("adminImageUrl");

  let imageUrl = imageUrlInput?.value?.trim() || undefined;
  if (fileInput?.files?.length > 0) {
    try {
      const formData = new FormData();
      formData.append("image", fileInput.files[0]);
      const upRes = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok) { alert(upData.error || "Image upload failed"); return; }
      imageUrl = upData.url;
    } catch (err) {
      alert("Image upload failed.");
      return;
    }
  }

  const payload = { name, description, price, category };
  if (imageUrl !== undefined) payload.image = imageUrl;

  try {
    const url = id ? `${API_URL}/${id}` : API_URL;
    const method = id ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || "Request failed"); return; }
    closeAdminProductModal();
    document.getElementById("adminProductForm").reset();
    document.getElementById("adminProductId").value = "";
    document.getElementById("adminImageUrl").value = "";
    document.getElementById("adminFormTitle").textContent = "Add product";
    document.getElementById("adminSubmitBtn").textContent = "Add product";
    document.getElementById("adminCancelBtn").hidden = true;
    loadProducts();
  } catch (err) {
    alert("Request failed.");
  }
});
document.getElementById("adminCancelBtn")?.addEventListener("click", () => {
  document.getElementById("adminProductForm").reset();
  document.getElementById("adminProductId").value = "";
  document.getElementById("adminImageUrl").value = "";
  document.getElementById("adminFormTitle").textContent = "Add product";
  document.getElementById("adminSubmitBtn").textContent = "Add product";
  document.getElementById("adminCancelBtn").hidden = true;
  closeAdminProductModal();
});

document.getElementById("seedProductsBtn")?.addEventListener("click", seedProductsThenLoad);

updateNavAuth();
loadCartForCurrentUser();
if (getUser()?.role === "admin") {
  document.getElementById("navAdminLink")?.removeAttribute("hidden");
  document.getElementById("shopAdminBar")?.removeAttribute("hidden");
}
loadProducts();
