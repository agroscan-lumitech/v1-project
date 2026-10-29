// ============================================================
// AgroScan — config.js  (DEVEND)
// ============================================================
// ✅ ONE FILE to change backend domain for ALL devend pages.
//    Include FIRST in every devend HTML file.
//
//  devend/login-form.html      → <script src="./config.js">
//  devend/private-desk/*.html  → <script src="../config.js">
// ============================================================

const DEV_CONFIG = {

  // ── 🔗 CHANGE ONLY THIS LINE ──────────────────────────────
  // Replace with your actual Render service URL after deploying
  // the backend, e.g. "https://agroscan-backend.onrender.com"
  BACKEND_URL: "https://agroscan-backend.onrender.com",
  // ──────────────────────────────────────────────────────────

  APP_NAME:       "AgroScan Dev Panel",
  VERSION:        "1.0.0",
  SESSION_KEY:    "devUser",
  TOKEN_KEY:      "devToken",
  STATS_REFRESH:  10000,   // ms
  LOG_PAGE_SIZE:  50,

  // ── Path helpers ─────────────────────────────────────────
  api(path) { return `${this.BACKEND_URL}${path}`; },

  // ── Session helpers ───────────────────────────────────────
  getDevUser() {
    try { return JSON.parse(sessionStorage.getItem(this.SESSION_KEY)); }
    catch { return null; }
  },
  getToken()  { return sessionStorage.getItem(this.TOKEN_KEY); },
  setSession(user, token) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    if (token) sessionStorage.setItem(this.TOKEN_KEY, token);
  },
  clearSession() {
    sessionStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
  },

  // ── Auth guard — call on every private-desk page ──────────
  requireAuth(loginPath = "../login-form.html") {
    const user = this.getDevUser();
    const token = this.getToken();
    if (!user || !token) { window.location.href = loginPath; return null; }
    return user;
  },

  // ── Authenticated fetch (auto-attaches Bearer token) ──────
  async authFetch(path, options = {}) {
    const token = this.getToken();
    return fetch(this.api(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  },

  // ── Logout helper ─────────────────────────────────────────
  async logout() {
    try {
      await this.authFetch("/api/dev-logout", { method: "POST" });
    } catch {}
    this.clearSession();
    window.location.href = "../login-form.html";
  }
};

window.DEV_CONFIG = DEV_CONFIG;
