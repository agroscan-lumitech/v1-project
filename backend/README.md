# AgroScan backend

## Runtime and storage

- Node.js and Express API
- AI handlers for soil recommendations and chat
- Private GitHub JSON collections through github-json-store.js
- Compatibility query adapter in json-db.js

The active persistence target is GitHub JSON in the private agroscan-lumitech/secure-json-database repository. PostgreSQL and MySQL are not part of the active application data path.

## Required Render settings

- GITHUB_DATA_OWNER=agroscan-lumitech
- GITHUB_DATA_REPO=secure-json-database
- GITHUB_DATA_BRANCH=main
- GITHUB_DATA_TOKEN — fine-grained token with Contents read/write permission for that private repository only
- USER_SESSION_SECRET — a separate, random session-signing secret
- ALLOWED_ORIGINS — exact comma-separated frontend origins
- JSON_CACHE_TTL_MS=60000 (optional)

Never place any of these secrets in frontend/ or devend/. See .env.example for the template.

## Persistence and recovery

Accepted mutations are appended to journal/events.json before being reflected in the local cache. Journal writes have bounded SHA-conflict retries and use a stable event ID for deduplication. Forced collection reads replay pending journal events before replacing the cache. A periodic batch consolidates journal entries into collection JSON documents; startup recovery also replays pending events after a process restart.

GitHub is not a transactional database. Keep the Render service single-instance for this storage model and make regular backups of the private data repository. Do not use this architecture for high-volume concurrent transactions or paid checkout until a proper transactional/payment system is implemented.

## Authentication and request protections

- User API paths enforce a signed session and user-ID ownership.
- Developer API paths require a bearer token; developer profile and password paths enforce token-to-account ownership.
- UIC developer authentication requires both the UIC and account password.
- Uploads verify image signatures, not only the request MIME header.
- Soil recommendations validate measurements and only persist results to the authenticated account and its owned land.
- Feedback is validated and rate-limited.
- Account/profile and API responses are marked non-cacheable.
- The read-only developer data preview removes credentials and direct personal fields.
- Existing plaintext passwords are accepted only as a migration bridge and are automatically re-hashed to bcrypt after successful login. Complete account migration before removing that fallback.

## Tests

    npm test
    npm run check

security-utils.js contains the reusable input and upload validators; tests run with Node's built-in test runner.
