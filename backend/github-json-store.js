import axios from "axios";
import crypto from "node:crypto";

export const COLLECTIONS = [
  "users", "lands", "orders", "chat_sessions", "ai_chats", "controls",
  "devusers", "dev_login_logs", "dev_tokens", "soil_tests", "feedback"
];

const owner = process.env.GITHUB_DATA_OWNER || "agroscan-lumitech";
const repo = process.env.GITHUB_DATA_REPO || "secure-json-database";
const branch = process.env.GITHUB_DATA_BRANCH || "main";
const api = axios.create({
  baseURL: "https://api.github.com",
  timeout: 20000,
  headers: {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  }
});
const journalPath = "journal/events.json";
const CACHE_TTL_MS = Number(process.env.JSON_CACHE_TTL_MS || 60000);
const cache = new Map();
const cacheLoadedAt = new Map();
let writeQueue = Promise.resolve();
let syncTimer;

function auth() {
  if (!process.env.GITHUB_DATA_TOKEN) throw new Error("GITHUB_DATA_TOKEN is missing");
  api.defaults.headers.common.Authorization = "Bearer " + process.env.GITHUB_DATA_TOKEN;
}
function pathFor(path) { return "/repos/" + owner + "/" + repo + "/contents/" + path; }
function serializeWrite(fn) {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => {});
  return next;
}
async function readFile(path) {
  auth();
  try {
    const { data } = await api.get(pathFor(path), { params: { ref: branch } });
    return {
      sha: data.sha,
      text: Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
    };
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}
async function writeFile(path, text, message, sha) {
  auth();
  const body = { message, content: Buffer.from(text, "utf8").toString("base64"), branch };
  if (sha) body.sha = sha;
  return (await api.put(pathFor(path), body)).data;
}
function emptyCollection(name) {
  return { schemaVersion: 1, collection: name, updatedAt: null, records: [] };
}
function idFor(row) {
  return String(row.id ?? row.user_id ?? row.session_id ?? row.chat_id ?? row.function_name ?? "");
}
function applyOperation(doc, op) {
  const rows = doc.records;
  const index = rows.findIndex(row => idFor(row) === String(op.recordId));
  if (op.action === "delete") {
    if (index >= 0) rows.splice(index, 1);
  } else if (index >= 0) rows[index] = op.record;
  else rows.push(op.record);
}

export async function readCollection(name, { force = false } = {}) {
  if (!COLLECTIONS.includes(name)) throw new Error("Unknown collection");
  const loadedAt = cacheLoadedAt.get(name) || 0;
  if (!force && cache.has(name) && Date.now() - loadedAt < CACHE_TTL_MS) {
    return cache.get(name);
  }
  const file = await readFile("data/" + name + ".json");
  const doc = file ? JSON.parse(file.text) : emptyCollection(name);
  if (!Array.isArray(doc.records)) throw new Error("Invalid collection document: " + name);
  cache.set(name, doc);
  cacheLoadedAt.set(name, Date.now());
  return doc;
}

export async function initializeStore() {
  auth();
  for (const name of COLLECTIONS) await readCollection(name, { force: true });
  const journal = await readFile(journalPath);
  const events = journal?.text.trim() ? JSON.parse(journal.text).events || [] : [];
  for (const event of events) {
    for (const op of event.operations || []) {
      if (!COLLECTIONS.includes(op.collection)) continue;
      const doc = await readCollection(op.collection);
      applyOperation(doc, op);
    }
  }
  return { collections: COLLECTIONS.length, journalPending: events.some(event => event.operations?.length) };
}

// Journal first, then mutate cache. An acknowledged write therefore survives
// a Render restart even when the four-hour collection batch has not run yet.
export async function appendMutations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { accepted: true, durable: true, count: 0 };
  }
  for (const op of operations) {
    if (!COLLECTIONS.includes(op.collection)) throw new Error("Unknown collection");
    if (!["upsert", "delete"].includes(op.action)) throw new Error("Invalid action");
    if (op.recordId === undefined || op.recordId === null) throw new Error("recordId is required");
    if (op.action === "upsert" && (!op.record || typeof op.record !== "object")) throw new Error("Record is required for upsert");
  }
  return serializeWrite(async () => {
    const journal = await readFile(journalPath);
    const document = journal?.text.trim() ? JSON.parse(journal.text) : { schemaVersion: 1, events: [] };
    if (!Array.isArray(document.events)) throw new Error("Invalid mutation journal document");
    const event = {
      eventId: crypto.randomUUID(),
      operations: operations.map(op => ({
        collection: op.collection, action: op.action, recordId: String(op.recordId),
        ...(op.action === "upsert" ? { record: op.record } : {})
      })),
      createdAt: new Date().toISOString()
    };
    document.events.push(event);
    await writeFile(journalPath, JSON.stringify(document, null, 2) + "\n", "Journal AgroScan data mutation", journal?.sha);
    for (const op of event.operations) {
      const doc = await readCollection(op.collection);
      applyOperation(doc, op);
      cacheLoadedAt.set(op.collection, Date.now());
    }
    return { accepted: true, durable: true, eventId: event.eventId, count: operations.length };
  });
}

export async function appendMutation(operation) {
  return appendMutations([operation]);
}

async function atomicBatch(changes) {
  auth();
  const ref = (await api.get("/repos/" + owner + "/" + repo + "/git/ref/heads/" + branch)).data;
  const parent = (await api.get(ref.object.url)).data;
  const tree = [];
  for (const [path, content] of Object.entries(changes)) {
    const blob = (await api.post("/repos/" + owner + "/" + repo + "/git/blobs", {
      content, encoding: "utf-8"
    })).data;
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = (await api.post("/repos/" + owner + "/" + repo + "/git/trees", {
    base_tree: parent.tree.sha, tree
  })).data;
  const commit = (await api.post("/repos/" + owner + "/" + repo + "/git/commits", {
    message: "Sync AgroScan JSON data batch",
    tree: newTree.sha, parents: [parent.sha]
  })).data;
  await api.patch("/repos/" + owner + "/" + repo + "/git/refs/heads/" + branch, {
    sha: commit.sha, force: false
  });
}

export async function syncPendingMutations() {
  return serializeWrite(async () => {
    const journal = await readFile(journalPath);
    if (!journal?.text.trim()) return { synced: 0 };
    const document = JSON.parse(journal.text);
    const events = Array.isArray(document.events) ? document.events : [];
    const operations = events.flatMap(event => event.operations || []);
    if (!operations.length) return { synced: 0 };
    const names = [...new Set(operations.map(op => op.collection))];
    const docs = {};
    for (const name of names) docs[name] = await readCollection(name, { force: true });
    for (const op of operations) applyOperation(docs[op.collection], op);
    const now = new Date().toISOString();
    const changes = {};
    for (const name of names) {
      docs[name].updatedAt = now;
      changes["data/" + name + ".json"] = JSON.stringify(docs[name], null, 2) + "\n";
    }
    await atomicBatch(changes);
    const latest = await readFile(journalPath);
    if (latest?.sha !== journal.sha) throw new Error("Journal changed during sync; retaining it for safe replay");
    await writeFile(journalPath, JSON.stringify({ schemaVersion: 1, events: [] }, null, 2) + "\n", "Checkpoint synchronized journal", latest.sha);
    for (const name of names) {
      cache.set(name, docs[name]);
      cacheLoadedAt.set(name, Date.now());
    }
    return { synced: operations.length, collections: names.length };
  });
}

export function startSyncScheduler() {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    syncPendingMutations().catch(error => {
      console.error("AgroScan sync failed; durable journal retained:", error.response?.status || error.message);
    });
  }, 4 * 60 * 60 * 1000);
  syncTimer.unref?.();
}
