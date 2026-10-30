# AgroScan backend

## Runtime
- Node.js / Express
- AI helpers: `ruleEngine.js`, `perplexity-recommend-handler.js`, `perplexity-chat-handler.js`
- Private JSON storage: `github-json-store.js`
- MySQL-compatible route adapter: `json-db.js`

## GitHub JSON database
The backend is the only component that accesses the private `agroscan-lumitech/secure-json-database` repository. The frontend must call this API and must never contain a GitHub token.

Set these variables on Render (backend service only):
- `GITHUB_DATA_OWNER=agroscan-lumitech`
- `GITHUB_DATA_REPO=secure-json-database`
- `GITHUB_DATA_BRANCH=main`
- `GITHUB_DATA_TOKEN` — fine-grained GitHub token with Contents read/write permission on the private data repository only
- `JSON_CACHE_TTL_MS=60000` (optional)

## Persistence model
Accepted mutations are first appended to `journal/events.json` through GitHub's Contents API. The backend then updates in-memory cache. Every four hours it applies all pending events to the affected JSON collection files in one Git tree/commit update and checkpoints the journal. If the process restarts before consolidation, the journal is replayed during startup recovery.

Each journal append is durable but creates a GitHub commit. The four-hour collection sync is a separate batched commit. This is the chosen low-infrastructure tradeoff; GitHub is not a transactional database and is not suitable for high-volume concurrent writes.

## Existing API behavior
The route layer retains the existing user, land, order, chat, soil test, controls, developer and feedback endpoints. Passwords are hashed using bcrypt. Developer bearer tokens are stored as hashes. The legacy raw SQL console returns HTTP 410 because SQL is not supported by the JSON document store; the database viewer reads collection previews.

## Important rollout checks
1. Add `GITHUB_DATA_TOKEN` to Render before deploying this branch.
2. Confirm the data repository token is scoped only to `secure-json-database`.
3. Verify signup/login, user records, lands, orders, chat, soil tests, developer login and feedback against a test account.
4. Verify a journal event survives a restart and is consolidated by the next sync.
5. Do not remove legacy MySQL credentials until the new branch has passed those tests and production data migration is confirmed.
