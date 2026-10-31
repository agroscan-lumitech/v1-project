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
  // The single configured API origin used by all developer pages.
  BACKEND_URL: "https://backend.v1.agroscan.dpdns.org",
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
    if (!user || !token) throw new Error("Developer login response did not include a user and bearer token.");
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    sessionStorage.setItem(this.TOKEN_KEY, token);
  },
  clearSession() {
    sessionStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
  },

  // ── Auth guard — call on every private-desk page ──────────
  requireAuth(loginPath = "../login-form.html") {
    const user = this.getDevUser();
    const token = this.getToken();
    if (!user || !token) { this.clearSession(); window.location.href = loginPath; return null; }
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
    try { await this.authFetch("/api/dev-logout", { method: "POST" }); }
    catch (error) { console.warn("Developer logout request failed:", error); }
    finally {
      this.clearSession();
      window.location.href = "../login-form.html";
    }
  }
};

window.DEV_CONFIG = DEV_CONFIG;

// Attach the developer bearer token to every request sent to the configured API.
(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, options = {}) {
    let target;
    try {
      const inputUrl = typeof input === "string" ? input : input?.url;
      target = new URL(inputUrl, window.location.href);
    } catch { return nativeFetch(input, options); }
    let backendOrigin;
    try { backendOrigin = new URL(DEV_CONFIG.BACKEND_URL).origin; }
    catch { return nativeFetch(input, options); }
    if (target.origin !== backendOrigin) return nativeFetch(input, options);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers || {}).forEach((value, key) => headers.set(key, value));
    const token = DEV_CONFIG.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return nativeFetch(input, { ...options, headers }).then(response => {
      const isLogin = target.pathname === "/api/dev-login" || target.pathname === "/api/dev-login-udc";
      if (response.status === 401 && token && !isLogin) {
        DEV_CONFIG.clearSession();
        window.location.href = "/login-form.html";
      }
      return response;
    });
  };
})();
