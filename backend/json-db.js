import { COLLECTIONS, readCollection, appendMutation, appendMutations } from "./github-json-store.js";

const tableNames = COLLECTIONS;
const dateNow = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const table = name => {
  if (!tableNames.includes(name)) throw new Error("Unknown JSON collection: " + name);
  return name;
};
const nextId = rows => rows.reduce((max, row) => Math.max(max, Number(row.id ?? row.user_id ?? row.session_id ?? row.chat_id ?? 0)), 0) + 1;
const result = rows => [rows, []];
const writeResult = (affectedRows, insertId) => [{ affectedRows, ...(insertId === undefined ? {} : { insertId }) }, []];

function paramsFor(sql, params) {
  let index = 0;
  return sql.replace(/\?/g, () => String(params[index++] ?? ""));
}
function stripQuotes(value) {
  return String(value ?? "").replace(/^['"]|['"]$/g, "");
}
function project(row, fields) {
  if (fields === "*" || fields.trim() === "*") return clone(row);
  const out = {};
  for (const item of fields.split(",")) {
    const part = item.trim();
    const match = part.match(/^([\w]+)(?:\s+AS\s+([\w]+))?$/i);
    if (!match) continue;
    out[match[2] || match[1]] = clone(row[match[1]]);
  }
  return out;
}
function sortRows(rows, field, direction) {
  return rows.sort((a, b) => {
    const av = a[field], bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av > bv ? 1 : av < bv ? -1 : 0) * (direction === "DESC" ? -1 : 1);
  });
}

export function createJsonDb() {
  const newTx = () => ({ docs: new Map(), operations: [], closed: false });
  async function getDoc(name, tx) {
    name = table(name);
    if (tx) {
      if (!tx.docs.has(name)) {
        const doc = await readCollection(name, { force: true });
        tx.docs.set(name, clone(doc));
      }
      return tx.docs.get(name);
    }
    return readCollection(name);
  }
  async function stage(name, action, recordId, record, tx) {
    name = table(name);
    const op = { collection: name, action, recordId: String(recordId), ...(record ? { record: clone(record) } : {}) };
    if (tx) {
      if (tx.closed) throw new Error("Transaction is closed");
      const doc = await getDoc(name, tx);
      const rows = doc.records;
      const index = rows.findIndex(row => String(row.id ?? row.user_id ?? row.session_id ?? row.chat_id) === String(recordId));
      if (action === "delete") { if (index >= 0) rows.splice(index, 1); }
      else if (index >= 0) rows[index] = clone(record);
      else rows.push(clone(record));
      tx.operations.push(op);
    } else {
      await appendMutation(op);
    }
  }
  async function rowsFor(name, tx) {
    return (await getDoc(name, tx)).records;
  }
  function matchesWhere(row, where, values) {
    const groups = where.split(/\\s+OR\\s+/i);
    let valueIndex = 0;
    const compiled = groups.map(group => group.split(/\\s+AND\\s+/i).map(condition => {
      const eq = condition.match(/^([A-Z_]+)\\s*=\\s*\\?$/i);
      const isNull = condition.match(/^([A-Z_]+)\\s+IS\\s+NULL$/i);
      const notNull = condition.match(/^([A-Z_]+)\\s+IS\\s+NOT\\s+NULL$/i);
      if (eq) return { field: eq[1].toLowerCase(), value: values[valueIndex++], type: "eq" };
      if (isNull) return { field: isNull[1].toLowerCase(), type: "null" };
      if (notNull) return { field: notNull[1].toLowerCase(), type: "notNull" };
      return { type: "unsupported" };
    }));
    return compiled.some(group => group.every(test => {
      if (test.type === "eq") return String(row[test.field]) === String(test.value);
      if (test.type === "null") return row[test.field] == null;
      if (test.type === "notNull") return row[test.field] != null;
      return false;
    }));
  }
  function buildSetValues(setClause, values) {
    let p = 0;
    const out = {};
    for (const assignment of setClause.split(",")) {
      const match = assignment.trim().match(/^([A-Z_]+)\\s*=\\s*(\\?|NOW\\(\\)|NULL|'[^']*')$/i);
      if (!match) throw new Error("Unsupported UPDATE assignment: " + assignment);
      const field = match[1].toLowerCase(), raw = match[2];
      if (raw === "?") out[field] = values[p++];
      else if (/^NOW\\(\\)$/i.test(raw)) out[field] = dateNow();
      else if (/^NULL$/i.test(raw)) out[field] = null;
      else out[field] = stripQuotes(raw);
    }
    return { values: out, used: p };
  }
  async function stageMany(operations, tx) {
    if (!operations.length) return;
    if (!tx) return appendMutations(operations);
    for (const op of operations) {
      const doc = await getDoc(op.collection, tx);
      const rows = doc.records;
      const keyOf = row => String(row.id ?? row.user_id ?? row.session_id ?? row.chat_id ?? row.function_name ?? "");
      const index = rows.findIndex(row => keyOf(row) === String(op.recordId));
      if (op.action === "delete") { if (index >= 0) rows.splice(index, 1); }
      else if (index >= 0) rows[index] = clone(op.record);
      else rows.push(clone(op.record));
      tx.operations.push(op);
    }
  }
  async function query(sql, params = [], tx = null) {
    const q = String(sql).replace(/\s+/g, " ").trim().replace(/;$/, "");
    const upper = q.toUpperCase();
    const values = Array.isArray(params) ? params : [];
    let m;

    if (/^SELECT 1$/i.test(q)) return result([{ "1": 1 }]);
    if (/^SELECT COUNT\(\*\) AS TABLECOUNT FROM INFORMATION_SCHEMA\.TABLES/i.test(upper)) return result([{ tableCount: COLLECTIONS.length }]);
    if (/^SHOW TABLES$/i.test(upper)) return result(COLLECTIONS.map(name => ({ "Tables_in_agroscan": name })));

    if ((m = q.match(/^SELECT DEV_ID FROM DEV_TOKENS WHERE TOKEN=\? AND \(EXPIRES_AT IS NULL OR EXPIRES_AT > NOW\(\)\) LIMIT 1$/i))) {
      const rows = await rowsFor("dev_tokens", tx);
      const token = values[0];
      return result(rows.filter(row => row.token === token && (!row.expires_at || new Date(row.expires_at) > new Date())).slice(0, 1).map(row => ({ dev_id: row.dev_id })));
    }
    if ((m = q.match(/^SELECT PASSWORD FROM (USERS|DEVUSERS) WHERE (USER_ID|ID)=\?$/i))) {
      const name = m[1].toLowerCase(), key = m[2].toLowerCase();
      const rows = await rowsFor(name, tx);
      return result(rows.filter(row => String(row[key]) === String(values[0])).slice(0, 1).map(row => ({ password: row.password })));
    }
    if (/^SELECT \* FROM USERS WHERE USERNAME=\? OR EMAIL=\? OR PHONE=\? LIMIT 1$/i.test(q)) {
      const rows = await rowsFor("users", tx);
      const hit = rows.find(row => row.username === values[0] || row.email === values[1] || row.phone === values[2]);
      return result(hit ? [clone(hit)] : []);
    }
    if (/^SELECT \* FROM DEVUSERS WHERE EMAIL=\? AND IS_ACTIVE=1 LIMIT 1$/i.test(q)) {
      const rows = await rowsFor("devusers", tx);
      return result(rows.filter(row => row.email === values[0] && Number(row.is_active ?? 1) === 1).slice(0, 1));
    }
    if (/^SELECT \* FROM DEVUSERS WHERE UIC=\? AND IS_ACTIVE=1 LIMIT 1$/i.test(q)) {
      const rows = await rowsFor("devusers", tx);
      return result(rows.filter(row => row.uic === values[0] && Number(row.is_active ?? 1) === 1).slice(0, 1));
    }
    if (/^SELECT \* FROM CHAT_SESSIONS WHERE USER_ID=\? AND ENDED_AT IS NULL ORDER BY STARTED_AT DESC LIMIT 1$/i.test(q)) {
      const rows = sortRows((await rowsFor("chat_sessions", tx)).filter(row => String(row.user_id) === String(values[0]) && !row.ended_at), "started_at", "DESC");
      return result(rows.slice(0, 1).map(row => ({ session_id: row.session_id })));
    }
    if (/^SELECT SENDER, MESSAGE FROM AI_CHATS WHERE USER_ID=\? ORDER BY TIMESTAMP ASC LIMIT 10$/i.test(q)) {
      const rows = sortRows((await rowsFor("ai_chats", tx)).filter(row => String(row.user_id) === String(values[0])), "timestamp", "ASC");
      return result(rows.slice(0, 10).map(row => ({ sender: row.sender, message: row.message })));
    }
    if (/^SELECT FUNCTION_NAME,VALUE,DESCRIPTION FROM CONTROLS$/i.test(q)) {
      return result((await rowsFor("controls", tx)).map(row => ({ function_name: row.function_name, value: row.value, description: row.description })));
    }
    if (/^SELECT \* FROM CONTROLS WHERE FUNCTION_NAME=\?$/i.test(q)) {
      return result((await rowsFor("controls", tx)).filter(row => row.function_name === values[0]).slice(0, 1));
    }
    if (/^SELECT \* FROM ORDERS ORDER BY CREATED_AT DESC LIMIT \? OFFSET \?$/i.test(q)) {
      const rows = sortRows(await rowsFor("orders", tx), "created_at", "DESC");
      return result(rows.slice(Number(values[1]) || 0, (Number(values[1]) || 0) + (Number(values[0]) || 50)));
    }
    if (/^SELECT COUNT\(\*\) AS TOTAL FROM (ORDERS|AI_CHATS|DEV_LOGIN_LOGS)$/i.test(q)) {
      const name = q.match(/FROM (ORDERS|AI_CHATS|DEV_LOGIN_LOGS)/i)[1].toLowerCase();
      return result([{ total: (await rowsFor(name, tx)).length }]);
    }
    if (/^SELECT \* FROM DEV_LOGIN_LOGS ORDER BY LOGIN_TIME DESC LIMIT \? OFFSET \?$/i.test(q)) {
      const rows = sortRows(await rowsFor("dev_login_logs", tx), "login_time", "DESC");
      return result(rows.slice(Number(values[1]) || 0, (Number(values[1]) || 0) + (Number(values[0]) || 50)));
    }
    if (/^SELECT \* FROM FEEDBACK ORDER BY CREATED_AT DESC LIMIT 100$/i.test(q)) {
      return result(sortRows(await rowsFor("feedback", tx), "created_at", "DESC").slice(0, 100));
    }
    if (/^SELECT CHAT_ID AS ID,SENDER,MESSAGE,TIMESTAMP FROM AI_CHATS WHERE USER_ID=\? ORDER BY CHAT_ID ASC LIMIT \? OFFSET \?$/i.test(q)) {
      const rows = sortRows((await rowsFor("ai_chats", tx)).filter(row => String(row.user_id) === String(values[0])), "chat_id", "ASC");
      const offset = Number(values[2]) || 0, limit = Number(values[1]) || 20;
      return result(rows.slice(offset, offset + limit).map(row => ({ id: row.chat_id, sender: row.sender, message: row.message, timestamp: row.timestamp })));
    }
    if (/^SELECT ID,LAND_ID,PH,MOISTURE,TEMPERATURE,DESIRED_CROP,RULE_RESULT,AI_RESULT,TESTED_AT FROM SOIL_TESTS WHERE USER_ID=\? ORDER BY TESTED_AT DESC LIMIT \?$/i.test(q)) {
      const rows = sortRows((await rowsFor("soil_tests", tx)).filter(row => String(row.user_id) === String(values[0])), "tested_at", "DESC");
      return result(rows.slice(0, Number(values[1]) || 10).map(row => project(row, "id,land_id,ph,moisture,temperature,desired_crop,rule_result,ai_result,tested_at")));
    }

    if ((m = q.match(/^SELECT (.+) FROM ([A-Z_]+)(?: WHERE (.+?))?(?: ORDER BY ([A-Z_]+) (ASC|DESC))?(?: LIMIT (\?|\d+)(?: OFFSET (\?|\d+))?)?$/i))) {
      const [, fields, rawName, where = "", orderField, direction, limitVal, offsetVal] = m;
      const name = table(rawName.toLowerCase());
      let rows = await rowsFor(name, tx);
      if (where) {
        const conds = where.split(/\s+AND\s+/i);
        let p = 0;
        for (const cond of conds) {
          const c = cond.match(/^([A-Z_]+)\s*=\s*\?$/i);
          const isNull = cond.match(/^([A-Z_]+)\s+IS\s+NULL$/i);
          if (c) { const field = c[1].toLowerCase(), val = values[p++]; rows = rows.filter(row => String(row[field]) === String(val)); }
          else if (isNull) { const field = isNull[1].toLowerCase(); rows = rows.filter(row => row[field] == null); }
        }
      }
      if (orderField) rows = sortRows(rows, orderField.toLowerCase(), direction.toUpperCase());
      let offset = 0, limit = rows.length;
      if (limitVal) {
        limit = limitVal === "?" ? Number(values[values.length - (offsetVal ? 2 : 1)]) : Number(limitVal);
        if (offsetVal) offset = offsetVal === "?" ? Number(values[values.length - 1]) : Number(offsetVal);
      }
      rows = rows.slice(offset, offset + limit);
      return result(rows.map(row => project(row, fields)));
    }

    if ((m = q.match(/^UPDATE ([A-Z_]+) SET (.+) WHERE (.+)$/i))) {
      const name = table(m[1].toLowerCase());
      const parsed = buildSetValues(m[2], values);
      const whereValues = values.slice(parsed.used);
      const rows = await rowsFor(name, tx);
      const operations = [];
      for (const row of rows) {
        if (!matchesWhere(row, m[3], whereValues)) continue;
        const updated = { ...clone(row), ...clone(parsed.values) };
        const key = updated.id ?? updated.user_id ?? updated.session_id ?? updated.chat_id ?? updated.function_name;
        operations.push({ collection: name, action: "upsert", recordId: String(key), record: updated });
      }
      await stageMany(operations, tx);
      return writeResult(operations.length);
    }

    if ((m = q.match(/^DELETE FROM ([A-Z_]+) WHERE (.+)$/i))) {
      const name = table(m[1].toLowerCase());
      const rows = await rowsFor(name, tx);
      const operations = rows.filter(row => matchesWhere(row, m[2], values)).map(row => ({
        collection: name, action: "delete",
        recordId: String(row.id ?? row.user_id ?? row.session_id ?? row.chat_id ?? row.function_name)
      }));
      await stageMany(operations, tx);
      return writeResult(operations.length);
    }

    if ((m = q.match(/^INSERT INTO (USERS|LANDS|ORDERS|CHAT_SESSIONS|AI_CHATS|CONTROLS|DEVUSERS|DEV_LOGIN_LOGS|DEV_TOKENS|SOIL_TESTS|FEEDBACK) \((.+)\) VALUES \((.+)\)$/i))) {
      const name = m[1].toLowerCase();
      const fields = m[2].split(",").map(field => field.trim().toLowerCase());
      const literalValues = m[3].split(",").map(v => v.trim());
      const record = {};
      let p = 0;
      for (let i = 0; i < fields.length; i++) {
        const literal = literalValues[i];
        if (/^NOW\(\)$/i.test(literal)) record[fields[i]] = dateNow();
        else if (/^'[^']*'$/.test(literal)) record[fields[i]] = stripQuotes(literal);
        else record[fields[i]] = values[p++];
      }
      const rows = await rowsFor(name, tx);
      const key = name === "users" ? "user_id" : name === "chat_sessions" ? "session_id" : name === "ai_chats" ? "chat_id" : "id";
      if (name === "chat_sessions" || name === "dev_tokens" || name === "users" || name === "lands" || name === "orders" || name === "ai_chats" || name === "soil_tests" || name === "feedback" || name === "dev_login_logs") record[key] = nextId(rows);
      if (name === "users" || name === "lands" || name === "orders" || name === "chat_sessions" || name === "ai_chats" || name === "controls" || name === "devusers" || name === "dev_login_logs" || name === "dev_tokens" || name === "soil_tests" || name === "feedback") {
        record.created_at ??= dateNow();
        if (name === "ai_chats") record.timestamp ??= dateNow();
        if (name === "chat_sessions") record.started_at ??= dateNow();
        if (name === "dev_login_logs") record.login_time ??= dateNow();
        if (name === "soil_tests") record.tested_at ??= dateNow();
        if (name === "feedback") record.created_at ??= dateNow();
        if (name === "controls") record.updated_at ??= dateNow();
      }
      if (name === "users" || name === "devusers") {
        const unique = name === "users" ? ["username", "email", "phone"] : ["email", "uic"];
        if (unique.some(field => record[field] && rows.some(row => row[field] === record[field]))) {
          const error = new Error("Duplicate entry"); error.code = "ER_DUP_ENTRY"; throw error;
        }
      }
      await stage(name, "upsert", record[key] ?? record.function_name ?? record.email, record, tx);
      return writeResult(1, record[key]);
    }
    throw new Error("Unsupported JSON database query: " + q);
  }

  return {
    query: (sql, params = []) => query(sql, params),
    async getConnection() {
      const tx = newTx();
      return {
        beginTransaction: async () => {},
        query: (sql, params = []) => query(sql, params, tx),
        commit: async () => {
          if (tx.closed) throw new Error("Transaction is closed");
          await appendMutations(tx.operations);
          tx.closed = true;
        },
        rollback: async () => { tx.closed = true; tx.operations = []; tx.docs.clear(); },
        release: () => { tx.closed = true; }
      };
    }
  };
}

export default createJsonDb;
