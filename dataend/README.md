# dataend — Database Layer

This is the new fifth "end" — it holds the AgroScan database schema separately
from the backend code, so the schema can be versioned, reviewed, and imported
on its own.

## What's here

- `agroscan_setup.sql` — the complete schema: `users`, `dev_users`, `lands`,
  `orders`, `ai_chats`, `controls`, `dev_tokens`, `dev_login_logs` and related
  tables. Running this once creates the whole database from scratch.

## Setting this up on Aiven (or any hosted MySQL)

1. Create your MySQL service (Aiven's free tier works fine for this project's
   scale) and wait until its status shows **Running**.
2. Download the service's CA certificate from the console.
3. Import the schema:
   ```
   mysql --host=<your-host> --port=<your-port> --user=avnadmin --password \
         --ssl-mode=REQUIRED --ssl-ca=ca.pem < agroscan_setup.sql
   ```
   This creates the `agroscan` database and every table inside your hosted
   instance — the script's own `CREATE DATABASE` / `USE` statements handle it.
4. Fill in `../backend/.env.example` → copy to `.env` (or paste the same keys
   into Render's Environment tab) with your real host, port, user, password,
   and the full CA certificate contents.

## Why this is its own folder now

Previously the schema lived under a general `database/` folder alongside a
raw local MySQL data directory and TLS private keys — fine for local dev, but
not something you want sitting in a shared project archive once you're moving
to a hosted database. `dataend/` keeps just the portable, shareable part (the
schema definition) and nothing environment-specific or secret.

**Nothing in this folder contains real credentials.** Passwords, hosts, and
certificates all live in `.env` (git-ignored, never shared) or directly in
your hosting provider's dashboard.
