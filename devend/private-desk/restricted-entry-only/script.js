// ============================================================
// AgroScan — restricted-entry-only/script.js
// ============================================================
// ✅ SECURITY FIX (previously): this file hardcoded a real owner
//    login, a real personal login, and THREE live OpenAI API keys
//    in plaintext, gated only by a client-side prompt() — visible
//    to anyone who opened the file or browser dev tools.
//
//    Fix applied:
//    1. Auth now reuses the same Bearer-token session the rest of
//       DevEnd already uses (see ../../config.js) instead of a
//       local prompt() with hardcoded credentials.
//    2. Raw provider API keys are NEVER placed in this file, or in
//       ANY frontend/devend/repoend file. They live only in the
//       backend's .env (server-side), which the browser can never
//       read. This page now shows configuration STATUS only.
// ============================================================

// Requires config.js to be loaded first (see api.html):
//   <script src="../../config.js"></script>
const devUser = window.DEV_CONFIG?.requireAuth("../../login-form.html");

if (devUser) {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';

  // ── Provider status only — never the actual key values ──────
  // If you need to confirm a key is configured, add a small backend
  // endpoint (e.g. GET /api/dev/provider-status, behind requireDevToken)
  // that returns { openai: true/false, perplexity: true/false } by
  // checking process.env server-side — never echo the key itself.
  const providers = [
    { name: "OpenAI", envVar: "OPENAI_API_KEY", color: "rgb(0,255,255)" },
    { name: "Perplexity", envVar: "PERPLEXITY_API_KEY", color: "rgba(64,199,30,1)" }
  ];

  const dashboard = document.querySelector(".dashboard");
  providers.forEach((p) => {
    const card = document.createElement("div");
    card.classList.add("card");

    const title = document.createElement("h3");
    title.textContent = p.name;
    title.style.color = p.color;

    const note = document.createElement("p");
    note.style.color = "#aaa";
    note.style.fontSize = ".85rem";
    note.textContent = `Configured via backend env var ${p.envVar}. Key values are never sent to the browser — check Render's Environment tab to view or rotate it.`;

    card.appendChild(title);
    card.appendChild(note);
    dashboard.appendChild(card);
  });
}
