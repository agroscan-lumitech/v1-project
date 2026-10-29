import pg from "pg";

const { Pool } = pg;

const PRIMARY_KEYS = Object.freeze({
  users: "user_id",
  lands: "id",
  orders: "id",
  chat_sessions: "session_id",
  ai_chats: "chat_id",
  controls: "id",
  devusers: "id",
  dev_login_logs: "id",
  dev_tokens: "id",
  soil_tests: "id",
  feedback: "id"
});

function replaceQuestionPlaceholders(sql) {
  let result = "";
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      result += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      result += ch;
      if (ch === "*" && next === "/") {
        result += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (inSingle) {
      result += ch;
      if (ch === "'" && next === "'") {
        result += next;
        i++;
      } else if (ch === "'" && sql[i - 1] !== "\\") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      result += ch;
      if (ch === '"' && next === '"') {
        result += next;
        i++;
      } else if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      result += ch;
      if (ch === "`") inBacktick = false;
      continue;
    }

    if (ch === "-" && next === "-") {
      result += ch + next;
      i++;
      inLineComment = true;
    } else if (ch === "/" && next === "*") {
      result += ch + next;
      i++;
      inBlockComment = true;
    } else if (ch === "'") {
      result += ch;
      inSingle = true;
    } else if (ch === '"') {
      result += ch;
      inDouble = true;
    } else if (ch === "`") {
      result += ch;
      inBacktick = true;
    } else if (ch === "?") {
      result += "$" + (++index);
    } else {
      result += ch;
    }
  }

  return result.replace(/`([^\`]+)`/g, '"$1"');
}

function normalizeError(error) {
  // Keep the existing route-level MySQL duplicate-entry handling compatible.
  if (error?.code === "23505") error.code = "ER_DUP_ENTRY";
  if (error?.code === "23503") error.code = "ER_NO_REFERENCED_ROW_2";
  return error;
}

function translateSql(sql) {
  const trimmed = String(sql || "").trim().replace(/;+\s*$/, "");
  if (/^SHOW\s+TABLES$/i.test(trimmed)) {
    return { showTables: true, sql: null, insertKey: null };
  }

  const translated = replaceQuestionPlaceholders(trimmed);
  const insert = translated.match(/^INSERT\s+INTO\s+"?([a-zA-Z_][\w]*)"?/i);
  if (insert && !/\bRETURNING\b/i.test(translated)) {
    const table = insert[1].toLowerCase();
    const insertKey = PRIMARY_KEYS[table];
    if (insertKey) {
      return { showTables: false, sql: translated + ` RETURNING "${insertKey}"`, insertKey };
    }
  }
  return { showTables: false, sql: translated, insertKey: null };
}

async function execute(executor, sql, params = []) {
  try {
    const translated = translateSql(sql);
    if (translated.showTables) {
      const result = await executor.query(
        'SELECT tablename AS "Tables_in_logged" FROM pg_catalog.pg_tables WHERE schemaname = \'public\' ORDER BY tablename'
      );
      return [result.rows, []];
    }

    const result = await executor.query(translated.sql, params || []);
    if (result.command === "INSERT" || result.command === "UPDATE" || result.command === "DELETE") {
      const metadata = { affectedRows: result.rowCount || 0 };
      if (translated.insertKey) {
        metadata.insertId = result.rows?.[0]?.[translated.insertKey] ?? null;
      }
      return [metadata, []];
    }

    return [result.rows || [], []];
  } catch (error) {
    throw normalizeError(error);
  }
}

export function createPostgresAdapter() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DB_DIALECT=postgres requires DATABASE_URL to be set");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined
  });

  return {
    pool,
    query: (sql, params) => execute(pool, sql, params),
    async getConnection() {
      const client = await pool.connect();
      let released = false;
      return {
        query: (sql, params) => execute(client, sql, params),
        async beginTransaction() {
          await client.query("BEGIN");
        },
        async commit() {
          await client.query("COMMIT");
        },
        async rollback() {
          await client.query("ROLLBACK");
        },
        release() {
          if (!released) {
            released = true;
            client.release();
          }
        }
      };
    }
  };
}
