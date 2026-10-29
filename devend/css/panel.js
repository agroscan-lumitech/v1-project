// ============================================================
// AgroScan Dev Panel — Shared Sidebar + Toast Logic
// /devend/css/panel.js
// Include AFTER config.js in every private-desk page
// ============================================================

// ── Toast notifications ───────────────────────────────────
function toast(msg, type = "success", duration = 3500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const icons = { success: "✅", error: "❌", warn: "⚠️", info: "ℹ️" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || "•"}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(40px)"; t.style.transition = "0.3s"; setTimeout(() => t.remove(), 300); }, duration);
}

// ── Sidebar toggle ────────────────────────────────────────
function initSidebar(currentPage) {
  const sidebar  = document.querySelector(".dev-sidebar");
  const overlay  = document.querySelector(".sidebar-overlay");
  const hamburger = document.querySelector(".hamburger");

  if (hamburger) {
    hamburger.addEventListener("click", () => {
      sidebar?.classList.toggle("open");
      overlay?.classList.toggle("show");
    });
  }
  if (overlay) {
    overlay.addEventListener("click", () => {
      sidebar?.classList.remove("open");
      overlay.classList.remove("show");
    });
  }

  // Mark active nav link
  if (currentPage) {
    document.querySelectorAll(".sidebar-nav a").forEach(a => {
      if (a.getAttribute("href")?.includes(currentPage)) a.classList.add("active");
    });
  }
}

// ── Populate sidebar user info ────────────────────────────
function initDevUser() {
  const user = window.DEV_CONFIG?.getDevUser();
  if (!user) return;

  const nameEl = document.getElementById("sidebar-dev-name");
  const roleEl = document.getElementById("sidebar-dev-role");
  if (nameEl) nameEl.textContent = user.name || user.email;
  if (roleEl) roleEl.textContent = user.role || "developer";
}

// ── Logout button ─────────────────────────────────────────
function initLogout() {
  const btn = document.getElementById("logout-btn");
  if (btn) {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      if (!confirm("Log out of Dev Panel?")) return;
      await window.DEV_CONFIG?.logout();
    });
  }
}

// ── Format dates nicely ───────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

// ── Short number format ───────────────────────────────────
function fmtNum(n) {
  if (n === undefined || n === null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

// ── Init everything on DOM ready ──────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDevUser();
  initLogout();
});
