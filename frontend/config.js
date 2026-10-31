// AgroScan frontend connection bootstrap.
// Keep backend domain and route definitions in ./config/backend-connection.json.
(function () {
  const configUrl = new URL("./config/backend-connection.json", document.currentScript.src);
  const request = new XMLHttpRequest();
  request.open("GET", configUrl.href, false);
  request.send();
  if (request.status < 200 || request.status >= 300) {
    throw new Error("Unable to load AgroScan backend connection config: HTTP " + request.status);
  }
  const connection = JSON.parse(request.responseText);
  const endpoints = connection.endpoints || {};
  const AGRO = {
    APP_NAME: connection.appName || "AgroScan",
    VERSION: connection.version || "1.0.0",
    COMPANY: connection.company || "AgroScan AI Solutions",
    BACKEND_URL: String(connection.backendDomain || "").replace(/\/$/, ""),
    ENDPOINTS: endpoints,
    SESSION_USER_KEY: "user",
    endpoint(name, params = {}) {
      const template = endpoints[name];
      if (!template) throw new Error("Unknown AgroScan API endpoint: " + name);
      return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => {
        if (params[key] === undefined || params[key] === null) {
          throw new Error("Missing parameter '" + key + "' for endpoint '" + name + "'");
        }
        return encodeURIComponent(String(params[key]));
      });
    },
    api(name, params = {}) {
      return this.BACKEND_URL + this.endpoint(name, params);
    },
    getUser() {
      try { return JSON.parse(sessionStorage.getItem(this.SESSION_USER_KEY)); }
      catch { return null; }
    },
    setUser(user) { sessionStorage.setItem(this.SESSION_USER_KEY, JSON.stringify(user)); },
    async clearUser() {
      sessionStorage.removeItem(this.SESSION_USER_KEY);
      document.cookie = "user=; Max-Age=0; Path=/; SameSite=Lax";
      try {
        await fetch(this.BACKEND_URL + "/api/logout", {
          method: "POST",
          credentials: "include"
        });
      } catch (error) {
        console.warn("AgroScan server logout could not be confirmed:", error);
      }
    },
    getUserId() { const user = this.getUser(); return user?.userId || user?.user_id || null; },
    isLoggedIn() { return !!this.getUser(); },
    requireLogin(loginPath = "/login-form.html") {
      if (!this.isLoggedIn()) { window.location.href = loginPath; return null; }
      return this.getUser();
    },
    async fetch(name, params = {}, options = {}) {
      return fetch(this.api(name, params), {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
      });
    }
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    let target;
    try {
      const requestUrl = typeof input === "string" ? input : input && input.url;
      target = new URL(requestUrl, window.location.href);
    } catch {
      return nativeFetch(input, init);
    }
    let isBackendRequest = false;
    try { isBackendRequest = target.origin === new URL(AGRO.BACKEND_URL).origin; }
    catch { /* Invalid backend configuration is surfaced by API calls. */ }

    const response = await nativeFetch(input, {
      ...init,
      ...(isBackendRequest ? { credentials: "include" } : {})
    });
    const isLoginRequest = target.pathname === "/api/login" || target.pathname === "/api/signup" || target.pathname === "/api/logout";
    if (isBackendRequest && response.status === 401 && !isLoginRequest && AGRO.getUser()) {
      AGRO.clearUser();
      window.location.href = "/login-form.html";
    }
    return response;
  };

  window.AGRO = AGRO;
})();
