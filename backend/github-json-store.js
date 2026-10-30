import axios from "axios";
import crypto from "node:crypto";

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
const collections = new Set([
  "users", "lands", "orders", "chat_sessions", "ai_chats", "controls",
  "devusers", "dev_login_logs", "dev_tokens", "soil_tests", "feedback"
]);
const journalPath = "journal/pending.jsonl";
let queue = Promise.resolve();
let timer;

function auth() {
  if (!process.env.GITHUB_DATA_TOKEN) throw new Error("GITHUB_DATA_TOKEN is missing");
  api.defaults.headers.common.Authorization = "Bearer " + process.env.GITHUB_DATA_TOKEN;
}
function pathFor(path) { return "/repos/" + owner + "/" + repo + "/contents/" + path; }
function serial(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
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

export async function readCollection(name) {
  if (!collections.has(name)) throw new Error("Unknown collection");
  const file = await readFile("data/" + name + ".json");
  if (!file) return { schemaVersion: 1, collection: name, updatedAt: null, records: [] };
  const doc = JSON.parse(file.text);
  if (!Array.isArray(doc.records)) throw new Error("Invalid collection document: " + name);
  return doc;
}

export async function appendMutation({ collection, action, recordId, record }) {
  if (!collections.has(collection)) throw new Error("Unknown collection");
  if (!["upsert", "delete"].includes(action)) throw new Error("Invalid action");
  if (recordId === undefined || recordId === null) throw new Error("recordId is required");
  return serial(async () => {
    const file = await readFile(journalPath);
    const event = {
      eventId: crypto.randomUUID(),
      collection, action, recordId: String(recordId),
      record: action === "upsert" ? record : undefined,
      createdAt: new Date().toISOString()
    };
    await writeFile(
      journalPath,
      (file?.text || "") + JSON.stringify(event) + "\n",
      "Journal AgroScan data mutation",
      file?.sha
    );
    return { accepted: true, durable: true, eventId: event.eventId };
  });
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
  return serial(async () => {
    const journal = await readFile(journalPath);
    if (!journal?.text.trim()) return { synced: 0 };
    const events = journal.text.split("\n").filter(Boolean).map(JSON.parse);
    const names = [...new Set(events.map(event => event.collection))];
    const docs = {};
    for (const name of names) docs[name] = await readCollection(name);
    for (const event of events) {
      const rows = docs[event.collection].records;
      const id = row => String(row.id ?? row.user_id ?? row.session_id ?? row.chat_id);
      const index = rows.findIndex(row => id(row) === event.recordId);
      if (event.action === "delete") {
        if (index >= 0) rows.splice(index, 1);
      } else if (index >= 0) rows[index] = event.record;
      else rows.push(event.record);
    }
    const now = new Date().toISOString();
    const changes = {};
    for (const name of names) {
      docs[name].updatedAt = now;
      changes["data/" + name + ".json"] = JSON.stringify(docs[name], null, 2) + "\n";
    }
    await atomicBatch(changes);
    const latest = await readFile(journalPath);
    if (latest?.sha !== journal.sha) throw new Error("Journal changed during sync; retaining it");
    await writeFile(journalPath, "", "Clear synchronized AgroScan journal", latest.sha);
    return { synced: events.length, collections: names.length };
  });
}

export function startSyncScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    syncPendingMutations().catch(error => {
      console.error("AgroScan sync failed; journal retained:", error.response?.status || error.message);
    });
  }, 4 * 60 * 60 * 1000);
  timer.unref?.();
}
