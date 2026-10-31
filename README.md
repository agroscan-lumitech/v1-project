# AgroScan AI

AgroScan AI is a multi-part web application for agricultural knowledge, farmer tools, soil recommendations and developer operations.

## Current deployment architecture

| Component | Repository folder | Hosting | Canonical origin |
|---|---|---|---|
| Farmer-facing web app | frontend/ | Netlify | https://v1.agroscan.dpdns.org |
| Developer dashboard | devend/ | Netlify | Configured AgroScan developer Netlify site |
| Public project and updates site | repoend/ | Netlify | https://media.v1.agroscan.dpdns.org |
| API | backend/ | Render Web Service | https://backend.v1.agroscan.dpdns.org |
| Persistent application data | Private GitHub repository | GitHub Contents and Git Trees API | Backend only |

**The active application database is GitHub JSON storage.** Do not configure this deployment against PostgreSQL, MySQL, Aiven or a local database. The compatibility adapter in backend/json-db.js exposes the existing API query shape while persisting collections through backend/github-json-store.js.

## Repository map

- frontend/ contains the main AgroScan website, educational sections, shop, account pages, central backend connection file and main PWA.
- devend/ contains developer login and the private developer dashboard. Its PWA intentionally does not cache dashboard pages or API responses.
- backend/ contains the Express API, authentication, GitHub JSON store adapter, validation helpers and backend tests.
- repoend/ contains the public project information and updates site.
- tools/validate-static.mjs verifies key metadata, PWA, host and security configuration.

## Backend environment variables

Set these only in the Render backend service. Never put a GitHub token, session signing secret or AI provider API key in a frontend file.

| Variable | Purpose |
|---|---|
| GITHUB_DATA_OWNER | Private data repository owner (normally agroscan-lumitech) |
| GITHUB_DATA_REPO | Private data repository name (normally secure-json-database) |
| GITHUB_DATA_BRANCH | Data branch (normally main) |
| GITHUB_DATA_TOKEN | Fine-grained token with Contents read/write access to the private data repository only |
| USER_SESSION_SECRET | Independent random signing secret for user sessions |
| ALLOWED_ORIGINS | Comma-separated exact frontend origins allowed by CORS |
| JSON_CACHE_TTL_MS | Optional JSON cache duration in milliseconds (default 60000) |
| AI_PROVIDER and provider keys | Configure only the AI provider used by the backend |

Generate a session secret with: openssl rand -hex 32. Keep it separate from the GitHub token. Use backend/.env.example as the variable template; do not commit a real .env file.

## Frontend backend configuration

The farmer-facing app reads its API origin from frontend/config/backend-connection.json. The current backend origin is https://backend.v1.agroscan.dpdns.org. Frontend pages should use the shared AGRO helper or this JSON-backed connection bootstrap rather than duplicating hostnames.

The developer dashboard reads its backend origin from devend/config.js and uses a shared bearer-token session helper. Developer sign-in by email/password and UIC/password both store the returned bearer token; private dashboard API calls attach it automatically.

## GitHub JSON persistence model and limits

Mutations are written to a durable journal in the private data repository. The backend periodically consolidates journal events into collection JSON documents. A startup recovery pass and forced refresh replay pending journal events before cache replacement. Journal updates retry GitHub Contents API SHA conflicts with a stable event identifier to avoid duplicate replay after an uncertain response.

GitHub JSON is a lightweight, low-volume persistence option, **not a transactional database**. Writes still depend on GitHub API availability and repository limits; retries reduce but do not eliminate multi-instance contention. Keep the Render service at one instance unless the storage strategy is deliberately upgraded and concurrency-tested. Back up the private data repository. Do not use this store for high-volume payment processing.

## Local quality checks

Run from the repository root:

    node --check backend/server.js
    node --check backend/json-db.js
    node --check backend/github-json-store.js
    node --check backend/security-utils.js
    npm --prefix backend test
    node tools/validate-static.mjs

The GitHub Actions quality gate runs backend syntax checks, built-in Node tests and static deployment/PWA validation on the implementation branch, main and pull requests to main.

## Deployment

### Render API
1. Connect this repository and deploy the backend/ service using Node.
2. Set the variables above in the Render service environment.
3. Ensure GITHUB_DATA_TOKEN can access only the private data repository with Contents read/write permissions.
4. Set ALLOWED_ORIGINS to the exact deployed frontend origins.
5. Verify the root health text and then test signup, login, session restoration, lands, soil recommendations, feedback and developer authentication.

### Netlify sites
Create separate Netlify sites from this repository with these base directories and publish directories:

| Site | Base directory | Publish directory |
|---|---|---|
| Farmer-facing app | frontend | . |
| Developer dashboard | devend | . |
| Project updates | repoend | . |

Use the included netlify.toml file in each folder. Confirm the custom domains above are attached to the appropriate site. The media.v1 canonical host is for repoend/; it must not canonicalize to the farmer-facing v1 site.

### PWA and caching
The farmer app and developer dashboard have independent manifests, icons, service workers and offline pages. Service workers cache only selected public assets. API responses, account/profile data and developer dashboard pages are deliberately not cached. Service workers and manifests should be served over HTTPS; the service worker script is configured for revalidation.

### Security notes
- Developer routes require a bearer token. Developer account read/update/password routes are restricted to the account represented by that token.
- UIC developer authentication also requires the developer account password.
- Image uploads are checked against file signatures, not only the request MIME header.
- User-specific API routes enforce token ownership; recommendations can only save to the authenticated user and an owned land record.
- Feedback input is bounded and rate-limited.
- Passwords are stored with bcrypt. Legacy plain-text accounts can still authenticate once so the server can migrate them to bcrypt at successful login; migrate remaining accounts and remove the fallback when that migration is complete.
- Client-side page guards and noindex are not a substitute for server-side access control. Do not publish secrets in any static dashboard file.
- Checkout order input is validated, but production payments require server-side product pricing and a payment-provider verification/webhook flow. Do not treat client-supplied order prices as a trusted paid transaction.

## Release policy

Keep related fixes together. The intended release is one consolidated commit and one pull request to main, after checks have completed. Do not deploy an incomplete branch.
