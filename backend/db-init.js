import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED_TABLES = [
  "users", "lands", "orders", "chat_sessions", "ai_chats", "controls",
  "devusers", "dev_login_logs", "dev_tokens", "soil_tests", "feedback"
];

export async function initializeDatabase(db, expectedDatabase) {
  const [databaseRows] = await db.query("SELECT DATABASE() AS databaseName");
  const database = databaseRows[0]?.databaseName;
  if (!database) throw new Error("No MySQL database selected; check DB_NAME.");
  if (expectedDatabase && database !== expectedDatabase) {
    throw new Error("Connected database does not match DB_NAME.");
  }

  const schema = await readFile(path.join(moduleDir, "schema.sql"), "utf8");
  const statements = schema.split(";").map(value => value.trim()).filter(Boolean);
  if (!statements.length) throw new Error("Database schema file is empty.");

  for (let index = 0; index < statements.length; index += 1) {
    try {
      await db.query(statements[index]);
    } catch (error) {
      console.error(`❌ Database schema statement ${index + 1}/${statements.length} failed:`, error.code || error.message);
      throw error;
    }
  }

  const [tableRows] = await db.query("SHOW TABLES");
  const tableNames = new Set(tableRows.map(row => Object.values(row)[0]));
  const missing = REQUIRED_TABLES.filter(table => !tableNames.has(table));
  if (missing.length) throw new Error("Database schema incomplete; missing: " + missing.join(", "));

  const [controlRows] = await db.query("SELECT COUNT(*) AS controlCount FROM controls");
  return {
    database,
    tableCount: REQUIRED_TABLES.length,
    controlCount: Number(controlRows[0]?.controlCount || 0)
  };
}
