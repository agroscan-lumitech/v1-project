// ============================================================
// AgroScan — config.js  (FRONTEND)
// ============================================================
// ✅ ONLY EDIT THIS FILE to change the backend domain.
//    Every frontend page reads BACKEND_URL from here.
//    Include FIRST before any other scripts.
//
//  <script src="/config.js"></script>
//  Then: AGRO.api('/api/login')
// ============================================================

const AGRO = {

  // ── 🔗 CHANGE ONLY THIS LINE TO SWITCH BACKEND ───────────
  // Replace with your actual Render service URL after deploying
  // the backend, e.g. "https://agroscan-backend.onrender.com"
  BACKEND_URL: "https://agroscan-backend.onrender.com",
  // ─────────────────────────────────────────────────────────

  APP_NAME:    "AgroScan",
  VERSION:     "1.0.0",
  COMPANY:     "AgroScan AI Solutions",

  // Session keys
  SESSION_USER_KEY: "user",

  // ── Helpers ──────────────────────────────────────────────
  api(path)      { return `${this.BACKEND_URL}${path}`; },

  getUser()      {
    try { return JSON.parse(sessionStorage.getItem(this.SESSION_USER_KEY)); }
    catch { return null; }
  },
  setUser(u)     { sessionStorage.setItem(this.SESSION_USER_KEY, JSON.stringify(u)); },
  clearUser()    { sessionStorage.removeItem(this.SESSION_USER_KEY); },

  getUserId()    { const u = this.getUser(); return u?.userId || u?.user_id || null; },

  isLoggedIn()   { return !!this.getUser(); },

  // Redirect to login if not authenticated
  requireLogin(loginPath = "/frontend/login-form.html") {
    if (!this.isLoggedIn()) { window.location.href = loginPath; return null; }
    return this.getUser();
  },

  // Authenticated fetch wrapper
  async fetch(path, options = {}) {
    return fetch(this.api(path), {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
  }
};

window.AGRO = AGRO;
