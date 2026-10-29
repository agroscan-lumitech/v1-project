# Luminary Agroscan

The full AgroScan ecosystem, reorganized into five clearly separated "ends."
Same files, same logic as your original project — reorganized and patched
for real deployment, not restructured or rewritten.

## The five ends

| End | What it is | Deploys to |
|---|---|---|
| `frontend/` | Farmer-facing Org Portal — soil test, chat, AgroPedia, AgroShop | Netlify (`agroscan-org`) |
| `backend/` | Node.js/Express + MySQL API, AgroAI, rule engine | Render |
| `devend/` | Internal developer/admin panel — dashboards, logs, DB tools | Netlify (`agroscan-dev`) |
| `repoend/` | Public updates/release site — app download, contributors, stats | Netlify (`agroscan-lumitech`) |
| `dataend/` | **New.** The database schema, separated from the backend code | Aiven (MySQL) |

`dataend` is the one genuinely new piece — previously the schema lived mixed
in with a local MySQL data directory and TLS private keys. It's now its own
folder holding just the portable schema file, with nothing secret in it.

## What was actually changed vs. your original project

Everything below is a fix or a deployment-readiness change — no renaming, no
restructuring, no rewritten logic beyond what's listed:

1. **`backend/server.js`** — added `port` and `ssl` options to the MySQL
   pool (Aiven needs a non-default port and `ssl-mode=REQUIRED`; the
   original pool config had neither, so it would only ever have worked
   against a local unencrypted MySQL on port 3306). Added your real
   deployment domains to `ALLOWED_ORIGINS`.
2. **`backend/.env`** removed from the package entirely — replaced with
   `backend/.env.example` (placeholders only). Your real `.env` had live
   database and Perplexity credentials in it; it should never travel inside
   a shared zip. Recreate it locally or paste the values into Render's
   Environment tab directly.
3. **`devend/private-desk/restricted-entry-only/`** — this was the most
   serious issue found. `script.js` hardcoded a real owner login, a real
   personal login, and **three live OpenAI API keys**, all gated only by a
   client-side `prompt()` — visible to anyone who opened the file. Fixed to:
   - Reuse the same Bearer-token session (`config.js` → `DEV_CONFIG`) that
     the rest of DevEnd already implements properly, instead of its own
     separate, weaker prompt-based check.
   - Show provider **configuration status** only (which env var is set),
     never the actual key value. Real keys now live only in the backend's
     `.env` / Render environment — which the browser can never read.
4. **`frontend/config.js`, `devend/config.js`**, and every page that
   hardcoded `http://localhost:3000` directly — updated to point at
   `https://agroscan-backend.onrender.com` as a placeholder. **Swap this for
   your actual Render URL** once the backend is deployed (search-and-replace
   that one string across the project, or better, edit only the two
   `config.js` files and route every page through `AGRO.api(...)` /
   `DEV_CONFIG.api(...)` over time instead of hardcoding it per-page).

5. **Case-sensitive path bugs (the "images not loading in production" issue)**
   — found and fixed 3 real bugs: `frontend/index.html` referenced
   `img/Sudhanshu.jpg` (capital S) while the actual file is `sudhanshu.jpg`;
   `management.repostat/repo.html` had the same for `Abhiraj.jpg` and
   `Sudhanshu.jpg`. **This is why it worked locally and broke on Netlify** —
   Windows and macOS filesystems ignore case, but Netlify serves from a
   case-sensitive Linux filesystem, so `Sudhanshu.jpg` simply doesn't match
   a file named `sudhanshu.jpg` once deployed.
6. **Broken relative paths** in `management.repostat/contributors.html` —
   it referenced `img/...` and `./css.files/...` as if those folders were
   inside `management.repostat/`, but they actually live one level up in
   `frontend/img/` and `frontend/css.files/`. Fixed to `../img/...` and
   `../css.files/...` (with `agro-home.jpg`, which genuinely does have a
   local copy in that folder, fixed to reference it directly).
7. **Renamed `img/dj sir.jpg` → `img/dj-sir.jpg`** (and updated every
   reference). A literal space in a filename usually still works over HTTP
   because browsers auto-encode it, but it's a common breakage point across
   git/CI pipelines and worth removing rather than relying on that.
8. **Added `netlify.toml`** to `frontend/`, `devend/` and `repoend/`, and a
   root `.gitignore` — see the GitHub → Netlify section below.

## Deploying via GitHub (recommended over drag-and-drop for ongoing changes)

This repo is a **monorepo** — three separate static sites
(`frontend`, `devend`, `repoend`) plus a Node backend, all in one repo.
Netlify needs to be told which subfolder is which site's root, or it will
try to publish the whole repo and every relative path will break.

1. Push this whole `Luminary Agroscan/` folder to a GitHub repo (the
   `.gitignore` already excludes `node_modules/`, real `.env` files, and
   the local DB/TLS files that should never leave your machine).
2. On Netlify, create **three separate sites** from the **same** GitHub repo:
   - Site 1 → Base directory `frontend` (this becomes `agroscan-org`)
   - Site 2 → Base directory `devend` (this becomes `agroscan-dev`)
   - Site 3 → Base directory `repoend` (this becomes `agroscan-lumitech`)
   Each folder already has its own `netlify.toml` setting `base` and
   `publish` — when Netlify asks for a build command, leave it blank (these
   are static, no build step needed).
3. Every future `git push` to the connected branch auto-redeploys all three
   sites independently — no more manual drag-and-drop.



1. **`dataend/`** → Aiven. Import `agroscan_setup.sql`. See `dataend/README.md`.
2. **`backend/`** → Render. Set env vars from `backend/.env.example` (with
   your real Aiven host/port/password/CA cert and Perplexity key) in Render's
   dashboard — don't upload a real `.env` file.
3. Copy the live Render URL, e.g. `https://agroscan-backend-xyz.onrender.com`,
   into `frontend/config.js` and `devend/config.js` (`BACKEND_URL`), and into
   any page still using a hardcoded URL directly.
4. **`frontend/`**, **`devend/`**, **`repoend/`** → three separate Netlify
   sites (drag-and-drop each folder in Netlify's manual deploy, same as
   before).

## Still worth doing yourself

- Rotate the Aiven database password and the three OpenAI keys that were
  exposed — do this regardless of anything above, since they've already
  been seen outside this project.
- The other `devend/private-desk/*.html` pages don't yet call
  `DEV_CONFIG.requireAuth()` on load either — `restricted-entry-only` was
  fixed because it had exposed secrets, but the same one-line auth guard is
  worth adding to `dashboard.html`, `database.html`, `logs.html`,
  `control-panel.html`, `order.html`, and `settings.html` too, so the whole
  panel is consistently gated, not just the page that had the leak.
