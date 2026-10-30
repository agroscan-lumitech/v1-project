// ============================================================
// AgroScan AI — server.js  (PRODUCTION-SECURED)
// Author: Abhinav Ranjan & Team | AgroScan AI Solutions
// ============================================================
// SECURITY FIXES APPLIED:
//  ✅ bcrypt for ALL user + dev passwords
//  ✅ Rate limiting on all auth endpoints
//  ✅ Dev auth token middleware (Bearer token)
//  ✅ Dev login logging with IP + network timestamp
//  ✅ CORS restricted to known origins
//  ✅ Multer 5MB file limit
//  ✅ /api/sql-run requires dev token
//  ✅ /api/dev/tables requires dev token + hides passwords
//  ✅ No duplicate routes
//  ✅ Profile picture: store type, serve with correct MIME
//  ✅ Soil test history saved per land
//  ✅ Improved AI context building
// ============================================================

import express     from "express";
import dotenv      from "dotenv";
import bodyParser  from "body-parser";
import cors        from "cors";
import multer      from "multer";
import { createJsonDb } from "./json-db.js";
import bcrypt      from "bcrypt";
import os          from "os";
import crypto      from "crypto";
import path        from "path";
import { initializeStore, startSyncScheduler, syncPendingMutations, readCollection } from "./github-json-store.js";

import { ruleEngine }             from "./ruleEngine.js";
import { askPerplexityRecommend } from "./perplexity-recommend-handler.js";
import { askPerplexityChat }      from "./perplexity-chat-handler.js";

dotenv.config();

const app           = express();
const PORT          = process.env.PORT || 3000;
const BCRYPT_ROUNDS = 10;

// ── ALLOWED ORIGINS — add your frontend domain ─────────────
const ALLOWED_ORIGINS = [
  "https://agroscan-production.up.railway.app",
  "https://agroscan-org.netlify.app",
  "https://agroscan-dev.netlify.app",
  "https://agroscan-lumitech.netlify.app",
  "https://2026.agroscan.dpdns.org",
  "https://v1.agroscan.dpdns.org",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:3000"
];

// ── MIDDLEWARE ──────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));
app.use(bodyParser.json({ limit: "2mb" }));

// Multer — 5 MB limit, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg","image/jpg","image/png","image/webp","image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed (jpg/png/webp/gif)"));
  }
});

// ── RATE LIMITER (no extra package) ────────────────────────
const rlStore = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const ip  = req.ip || "unknown";
    const now = Date.now();
    const rec = rlStore.get(ip);
    if (!rec || now > rec.resetAt) { rlStore.set(ip, { count: 1, resetAt: now + windowMs }); return next(); }
    rec.count++;
    if (rec.count > max) {
      return res.status(429).json({ error: `Too many requests. Retry in ${Math.ceil((rec.resetAt-now)/1000)}s` });
    }
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k,v] of rlStore) if (now>v.resetAt) rlStore.delete(k); }, 300000);

// ── DATABASE ────────────────────────────────────────────────
// ✅ DB_PORT added — hosted providers (Aiven, etc.) rarely use the 3306 default.
// ✅ SSL added — Aiven requires ssl-mode=REQUIRED; DB_CA_CERT holds the full PEM
//    certificate contents as a single env var (works fine as a multi-line
//    Render/Netlify env var — paste the whole ca.pem including BEGIN/END lines).
//    Leave DB_CA_CERT unset for a local MySQL dev database with no SSL.
const db = createJsonDb();

function hashBearerToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
function createUserSessionToken(userId) {
  const secret = process.env.USER_SESSION_SECRET || process.env.GITHUB_DATA_TOKEN;
  if (!secret) throw new Error("User session signing secret is not configured");
  const payload = Buffer.from(JSON.stringify({
    sub: String(userId),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + "." + signature;
}

function decodeUserSessionToken(token) {
  const secret = process.env.USER_SESSION_SECRET || process.env.GITHUB_DATA_TOKEN;
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ── DEV TOKEN MIDDLEWARE ────────────────────────────────────
async function requireUserToken(req, res, next) {
  const auth = req.headers["authorization"];
  const cookieToken = (req.headers.cookie || "").split(";").map(part => part.trim())
    .find(part => part.startsWith("agroscan_session="))?.slice("agroscan_session=".length);
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : cookieToken;
  if (!token) return res.status(401).json({ error: "User authentication required." });
  try {
    const payload = decodeUserSessionToken(decodeURIComponent(token));
    if (!payload) return res.status(401).json({ error: "Session expired. Please sign in again." });
    const document = await readCollection("users");
    const userExists = document.records.some(row => String(row.user_id) === String(payload.sub));
    if (!userExists) return res.status(401).json({ error: "User session is no longer valid." });
    req.userId = payload.sub;
    next();
  } catch (error) {
    console.error("❌ User token verification failed:", error.response?.status || error.message);
    res.status(503).json({ error: "Authentication service unavailable." });
  }
}

function requireUserOwnership(req, res, next) {
  if (req.params.userId !== undefined && String(req.params.userId) !== String(req.userId)) {
    return res.status(403).json({ error: "You cannot access another user's data." });
  }
  next();
}

async function requireDevToken(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ error: "Dev auth required. Missing Bearer token." });
  const token = hashBearerToken(auth.slice(7));
  try {
    const [rows] = await db.query(
      "SELECT dev_id FROM dev_tokens WHERE token=? AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
      [token]
    );
    if (!rows.length) return res.status(401).json({ error: "Invalid or expired dev token." });
    req.devId = rows[0].dev_id;
    next();
  } catch (err) {
    console.error("❌ Token verify error:", err);
    res.status(500).json({ error: "Auth check failed" });
  }
}

// ── DEV LOGIN LOGGER ────────────────────────────────────────
async function logDevLogin({ devId, devEmail, devName, method, req, success, failReason=null }) {
  try {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const ua = req.headers["user-agent"] || "unknown";
    await db.query(
      `INSERT INTO dev_login_logs (dev_id,dev_email,dev_name,method,ip_address,user_agent,success,fail_reason,login_time)
       VALUES (?,?,?,?,?,?,?,?,NOW())`,
      [devId||null, devEmail||null, devName||null, method, ip, ua, success?1:0, failReason]
    );
  } catch (e) { console.error("⚠️ Failed to log dev login:", e.message); }
}

// ── PASSWORD HELPERS ─────────────────────────────────────────
async function verifyPassword(plain, stored) {
  if (stored.startsWith("$2b$") || stored.startsWith("$2a$"))
    return bcrypt.compare(plain, stored);
  return plain === stored; // legacy plain-text fallback
}

// ══════════════════════════════════════════════════════════════
// HEALTH
// ══════════════════════════════════════════════════════════════
app.get("/",    (_, res) => res.send("🌱 AgroScan AI Server Running"));
app.get("/test",(_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Database readiness check: status only; never returns credentials or connection details.
app.get("/health/db", async (_, res) => {
  try {
    const doc = await readCollection("users", { force: true });
    res.json({
      status: "ok",
      database: "github-json",
      repository: process.env.GITHUB_DATA_REPO || "secure-json-database",
      cachedCollections: 11,
      users: doc.records.length
    });
  } catch (e) {
    console.error("❌ JSON store health check failed:", e.response?.status || e.message);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

// ── Server time (synced, dev-only) ──────────────────────────
app.get("/api/server/time", requireDevToken, (_, res) => {
  const now = new Date();
  res.json({ success:true, iso:now.toISOString(), utc:now.toUTCString(), timestamp:now.getTime() });
});

// ── Server stats (dev-only) ─────────────────────────────────
app.get("/api/server/stats", requireDevToken, (_, res) => {
  const mem = process.memoryUsage();
  res.json({ success:true, stats:{
    memory:{ rss:mem.rss, heapUsed:mem.heapUsed, heapTotal:mem.heapTotal, totalMem:os.totalmem(), freeMem:os.freemem() },
    cpu:{ cores:os.cpus().length, model:os.cpus()[0].model, loadAvg:os.loadavg() },
    uptime: process.uptime(), platform:os.platform(), arch:os.arch(),
    nodeVersion:process.version, serverTime:new Date().toISOString()
  }});
});

// ══════════════════════════════════════════════════════════════
// USER ENDPOINTS
// ══════════════════════════════════════════════════════════════

app.use("/api/users/:userId", requireUserToken, requireUserOwnership);

// GET user profile
app.get("/api/users/:userId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT user_id,username,name,email,phone,street,city,state,zip,country,created_at FROM users WHERE user_id=?",
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error:"User not found" });
    const u = rows[0];
    res.json({ ...u, profileUrl:`/api/users/${u.user_id}/profile` });
  } catch(e) { res.status(500).json({ error:"Database error" }); }
});

// PUT update primary info
app.put("/api/users/:userId", async (req,res) => {
  const { name, username, email, phone } = req.body;
  try {
    const [r] = await db.query("UPDATE users SET name=?,username=?,email=?,phone=? WHERE user_id=?",[name,username,email,phone,req.params.userId]);
    if (!r.affectedRows) return res.status(404).json({ error:"User not found" });
    res.json({ success:true, message:"Profile updated" });
  } catch(e) {
    if (e.code==="ER_DUP_ENTRY") return res.status(409).json({ error:"Username/email already taken" });
    res.status(500).json({ error:"Server error" });
  }
});

// PUT update address
app.put("/api/users/:userId/address", async (req,res) => {
  const { street,city,state,zip,country } = req.body;
  try {
    const [r] = await db.query("UPDATE users SET street=?,city=?,state=?,zip=?,country=? WHERE user_id=?",[street,city,state,zip,country,req.params.userId]);
    if (!r.affectedRows) return res.status(404).json({ error:"User not found" });
    res.json({ success:true, message:"Address updated" });
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

// PUT change password — ✅ bcrypt + migration
app.put("/api/users/:userId/change-password", async (req,res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword||!newPassword) return res.status(400).json({ error:"Both passwords required" });
  if (newPassword.length<8)       return res.status(400).json({ error:"Min 8 characters" });
  try {
    const [rows] = await db.query("SELECT password FROM users WHERE user_id=?", [req.params.userId]);
    if (!rows.length) return res.status(404).json({ error:"User not found" });
    const match = await verifyPassword(oldPassword, rows[0].password);
    if (!match) return res.status(401).json({ error:"Old password incorrect" });
    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.query("UPDATE users SET password=? WHERE user_id=?", [hashed, req.params.userId]);
    res.json({ message:"Password changed successfully" });
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

// DELETE user + all related data
app.delete("/api/users/:userId", async (req,res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query("SELECT user_id FROM users WHERE user_id=?", [req.params.userId]);
    if (!u.length) { await conn.rollback(); return res.status(404).json({ error:"User not found" }); }
    await conn.query("DELETE FROM ai_chats     WHERE user_id=?", [req.params.userId]);
    await conn.query("DELETE FROM chat_sessions WHERE user_id=?", [req.params.userId]);
    await conn.query("DELETE FROM orders        WHERE user_id=?", [req.params.userId]);
    await conn.query("DELETE FROM lands         WHERE user_id=?", [req.params.userId]);
    await conn.query("DELETE FROM soil_tests    WHERE user_id=?", [req.params.userId]);
    await conn.query("DELETE FROM users         WHERE user_id=?", [req.params.userId]);
    await conn.commit();
    res.json({ message:"User and all data deleted" });
  } catch(e) {
    await conn.rollback();
    console.error("❌ Delete user failed:", e);
    res.status(500).json({ error:"Delete failed", details: e.message });
  } finally { conn.release(); }
});

// ── LOGIN — ✅ rate limited + bcrypt + auto-migrate ─────────
app.post("/api/login", rateLimit(10,60000), async (req,res) => {
  const { identifier, password } = req.body;
  if (!identifier||!password) return res.status(400).json({ error:"All fields required" });
  try {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username=? OR email=? OR phone=? LIMIT 1",
      [identifier,identifier,identifier]
    );
    if (!rows.length) return res.status(401).json({ error:"User not found" });
    const u = rows[0];
    const match = await verifyPassword(password, u.password);
    if (!match) return res.status(401).json({ error:"Incorrect password" });
    // Auto-migrate plain-text password to bcrypt on successful login
    if (!u.password.startsWith("$2b$") && !u.password.startsWith("$2a$")) {
      const h = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.query("UPDATE users SET password=? WHERE user_id=?", [h, u.user_id]);
    }
    res.cookie("agroscan_session", createUserSessionToken(u.user_id), { httpOnly:true, secure:true, sameSite:"none", maxAge:604800000, path:"/" });
    res.json({ userId:u.user_id, username:u.username, name:u.name, email:u.email, phone:u.phone, profileUrl:`/api/users/${u.user_id}/profile` });
  } catch(e) { res.status(500).json({ error:"Database error" }); }
});

app.post("/api/logout", (req,res) => {
  res.clearCookie("agroscan_session", { httpOnly:true, secure:true, sameSite:"none", path:"/" });
  res.json({ success:true });
});

// ── SIGNUP — ✅ bcrypt ───────────────────────────────────────
app.post("/api/signup", rateLimit(5,60000), async (req,res) => {
  const { name, username, email, phone, password } = req.body;
  if (!name||!username||!email||!phone||!password)
    return res.status(400).json({ error:"All fields required" });
  if (password.length<8) return res.status(400).json({ error:"Password must be at least 8 characters" });
  try {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [result] = await db.query(
      "INSERT INTO users (name,username,email,phone,password) VALUES (?,?,?,?,?)",
      [name,username,email,phone,hashed]
    );
    res.status(201).json({ message:"Account created", userId:result.insertId });
  } catch(e) {
    if (e.code==="ER_DUP_ENTRY") return res.status(409).json({ error:"Username, email, or phone already in use" });
    res.status(500).json({ error:"Database error" });
  }
});

// ══════════════════════════════════════════════════════════════
// PROFILE PICTURE — ✅ Improved with MIME type storage
// ══════════════════════════════════════════════════════════════

// GET profile picture
app.get("/api/users/:userId/profile", async (req,res) => {
  try {
    const [rows] = await db.query("SELECT profile, profile_type FROM users WHERE user_id=?", [req.params.userId]);
    if (!rows.length || !rows[0].profile) return res.status(404).json({ error:"No profile picture" });
    const mimeType = rows[0].profile_type || "image/jpeg";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(Buffer.from(rows[0].profile, "base64"));
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

// POST upload profile picture
app.post("/api/users/:userId/profile", upload.single("profile"), async (req,res) => {
  if (!req.file) return res.status(400).json({ error:"No image file uploaded" });
  try {
    const [result] = await db.query(
      "UPDATE users SET profile=?, profile_type=? WHERE user_id=?",
      [req.file.buffer, req.file.mimetype, req.params.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error:"User not found" });
    res.json({ success:true, message:"Profile picture updated", profileUrl:`/api/users/${req.params.userId}/profile?t=${Date.now()}` });
  } catch(e) { res.status(500).json({ error:"Upload failed" }); }
});

// DELETE profile picture
app.delete("/api/users/:userId/profile", async (req,res) => {
  try {
    await db.query("UPDATE users SET profile=NULL, profile_type=NULL WHERE user_id=?", [req.params.userId]);
    res.json({ success:true, message:"Profile picture removed" });
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

// Developer profile picture (devend)
app.get("/api/devusers/:id/profile", async (req,res) => {
  try {
    const [rows] = await db.query("SELECT profile FROM devusers WHERE id=?", [req.params.id]);
    if (!rows.length || !rows[0].profile) return res.status(404).json({ error:"No profile picture" });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(Buffer.from(rows[0].profile, "base64"));
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

app.post("/api/devusers/:id/profile", upload.single("profile"), async (req,res) => {
  if (!req.file) return res.status(400).json({ error:"No image uploaded" });
  try {
    await db.query("UPDATE devusers SET profile=? WHERE id=?", [req.file.buffer, req.params.id]);
    res.json({ success:true, profileUrl:`/api/devusers/${req.params.id}/profile` });
  } catch(e) { res.status(500).json({ error:"Upload failed" }); }
});

// ══════════════════════════════════════════════════════════════
// LANDS
// ══════════════════════════════════════════════════════════════

app.get("/api/users/:userId/lands", async (req,res) => {
  try {
    const [rows] = await db.query("SELECT * FROM lands WHERE user_id=? ORDER BY created_at DESC", [req.params.userId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error:"Failed to fetch lands" }); }
});

app.get("/api/users/:userId/lands/:landId", async (req,res) => {
  try {
    const [rows] = await db.query("SELECT * FROM lands WHERE user_id=? AND id=?", [req.params.userId,req.params.landId]);
    if (!rows.length) return res.status(404).json({ error:"Land not found" });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error:"Failed to fetch land" }); }
});

app.post("/api/users/:userId/lands", async (req,res) => {
  const { land_name,size,crop,soil_type,ph,moisture,temperature,light,other_info,street,city,state,zip,country } = req.body;
  
  const parseNum = (val) => {
    if (val === undefined || val === null || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };
  
  const pSize = parseNum(size);
  if (!land_name || pSize === null) return res.status(400).json({ error:"land_name and a valid numeric size are required" });

  try {
    const [r] = await db.query(
      `INSERT INTO lands (user_id,land_name,size,crop,soil_type,ph,moisture,temperature,light,other_info,street,city,state,zip,country)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.params.userId,land_name,pSize,crop||null,soil_type||null,parseNum(ph),parseNum(moisture),parseNum(temperature),light||null,other_info||null,street||null,city||null,state||null,zip||null,country||null]
    );
    res.status(201).json({ id:r.insertId, message:"Land added" });
  } catch(e) {
    console.error("❌ Failed to add land:", e);
    res.status(500).json({ error:"Failed to add land", details: e.message });
  }
});

app.put("/api/users/:userId/lands/:landId", async (req,res) => {
  const { land_name,size,crop,soil_type,ph,moisture,temperature,light,other_info,street,city,state,zip,country } = req.body;
  
  const parseNum = (val) => {
    if (val === undefined || val === null || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };
  
  const pSize = parseNum(size);
  if (!land_name || pSize === null) return res.status(400).json({ error:"land_name and a valid numeric size are required" });

  try {
    const [r] = await db.query(
      `UPDATE lands SET land_name=?,size=?,crop=?,soil_type=?,ph=?,moisture=?,temperature=?,light=?,
       other_info=?,street=?,city=?,state=?,zip=?,country=? WHERE user_id=? AND id=?`,
      [land_name,pSize,crop||null,soil_type||null,parseNum(ph),parseNum(moisture),parseNum(temperature),light||null,
       other_info||null,street||null,city||null,state||null,zip||null,country||null,req.params.userId,req.params.landId]
    );
    if (!r.affectedRows) return res.status(404).json({ error:"Land not found" });
    res.json({ message:"Land updated" });
  } catch(e) {
    console.error("❌ Failed to update land:", e);
    res.status(500).json({ error:"Failed to update land", details: e.message });
  }
});

app.delete("/api/users/:userId/lands/:landId", async (req,res) => {
  try {
    const [r] = await db.query("DELETE FROM lands WHERE user_id=? AND id=?", [req.params.userId,req.params.landId]);
    if (!r.affectedRows) return res.status(404).json({ error:"Land not found" });
    res.json({ message:"Land deleted" });
  } catch(e) { res.status(500).json({ error:"Failed to delete land" }); }
});

// ══════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════

app.get("/api/users/:userId/orders", async (req,res) => {
  try {
    const [rows] = await db.query("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC", [req.params.userId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error:"Failed to fetch orders" }); }
});

app.post("/api/users/:userId/orders", async (req,res) => {
  const { items, address, payment_method, coupon_code, name, phone } = req.body;
  if (!items?.length) return res.status(400).json({ error:"Order items required" });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      await conn.query(
        `INSERT INTO orders (user_id,customer_name,customer_phone,product_name,quantity,unit_price,item_total,address,payment_method,coupon_code)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [req.params.userId,name,phone,item.name,item.qty,item.price,item.qty*item.price,address||null,payment_method||null,coupon_code||null]
      );
    }
    await conn.commit();
    res.status(201).json({ message:"Order placed successfully!" });
  } catch(e) { await conn.rollback(); res.status(500).json({ error:"Failed to place order" }); }
  finally { conn.release(); }
});

app.put("/api/orders/:orderId/status", requireDevToken, async (req,res) => {
  const { status } = req.body;
  const valid = ["pending","processing","shipped","delivered","cancelled"];
  if (!valid.includes(status)) return res.status(400).json({ error:"Invalid status" });
  try {
    const [r] = await db.query("UPDATE orders SET status=? WHERE id=?", [status, req.params.orderId]);
    if (!r.affectedRows) return res.status(404).json({ error:"Order not found" });
    res.json({ message:`Order marked as ${status}` });
  } catch(e) { res.status(500).json({ error:"Failed to update order" }); }
});

app.get("/api/orders", requireDevToken, async (req,res) => {
  const limit  = parseInt(req.query.limit)  || 50;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const [rows]  = await db.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?", [limit,offset]);
    const [total] = await db.query("SELECT COUNT(*) AS total FROM orders");
    res.json({ orders:rows, total:total[0].total });
  } catch(e) { res.status(500).json({ error:"Failed to fetch orders" }); }
});

// ══════════════════════════════════════════════════════════════
// SOIL TEST + HISTORY
// ══════════════════════════════════════════════════════════════

// POST soil test — runs rule engine + AI, saves to history
app.post("/recommend", async (req,res) => {
  const { ph, moisture, temperature, location, desiredCrop, userId, landId } = req.body;
  if (ph==null||moisture==null) return res.status(400).json({ error:"pH and moisture required" });
  try {
    const ruleResult = ruleEngine(ph, moisture, temperature);
    const aiResult   = await askPerplexityRecommend({ ph, moisture, temperature, location, desiredCrop });

    // Save to soil_tests history if user is logged in
    if (userId) {
      try {
        await db.query(
          `INSERT INTO soil_tests (user_id,land_id,ph,moisture,temperature,desired_crop,rule_result,ai_result)
           VALUES (?,?,?,?,?,?,?,?)`,
          [userId, landId||null, ph, moisture, temperature||null, desiredCrop||null, JSON.stringify(ruleResult), aiResult]
        );
      } catch {}
    }
    res.json({ ruleEngine:ruleResult, aiResponse:aiResult });
  } catch(e) { res.status(500).json({ error:"Recommendation failed" }); }
});

// GET soil test history for a user
app.get("/api/users/:userId/soil-tests", async (req,res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const [rows] = await db.query(
      "SELECT id,land_id,ph,moisture,temperature,desired_crop,rule_result,ai_result,tested_at FROM soil_tests WHERE user_id=? ORDER BY tested_at DESC LIMIT ?",
      [req.params.userId, limit]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error:"Failed to fetch soil test history" }); }
});

// ══════════════════════════════════════════════════════════════
// AI CHAT — Improved context management
// ══════════════════════════════════════════════════════════════

app.post("/chat", requireUserToken, async (req,res) => {
  const { message, userId } = req.body;
  if (String(userId) !== String(req.userId)) return res.status(403).json({ error:"Access denied" });
  if (!message||!userId) return res.status(400).json({ error:"Message and userId required" });
  try {
    // Get or create chat session
    const [sess] = await db.query(
      "SELECT session_id FROM chat_sessions WHERE user_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
      [userId]
    );
    let sessionId;
    if (!sess.length) {
      const [r] = await db.query("INSERT INTO chat_sessions (user_id) VALUES (?)", [userId]);
      sessionId = r.insertId;
    } else sessionId = sess[0].session_id;

    // Get last 10 messages for context (not 5 — better continuity)
    const [history] = await db.query(
      "SELECT sender, message FROM ai_chats WHERE user_id=? ORDER BY timestamp ASC LIMIT 10",
      [userId]
    );

    // Save user message
    await db.query(
      "INSERT INTO ai_chats (session_id,user_id,message,sender) VALUES (?,?,?,'user')",
      [sessionId, userId, message]
    );

    // Build message array for AI
    const messages = [
      ...history.map(m => ({ role: m.sender==="user"?"user":"assistant", content: m.message })),
      { role:"user", content: message }
    ];

    const aiReply = await askPerplexityChat(messages);

    // Save AI reply
    await db.query(
      "INSERT INTO ai_chats (session_id,user_id,message,sender) VALUES (?,?,?,'ai')",
      [sessionId, userId, aiReply]
    );

    res.json({ aiResponse: aiReply });
  } catch(e) {
    console.error("❌ /chat error:", e);
    res.status(500).json({ aiResponse:"AI failed to respond. Please try again." });
  }
});

app.get("/api/chat/history/:userId", requireUserToken, requireUserOwnership, async (req,res) => {
  const limit  = parseInt(req.query.limit)  || 20;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const [rows]  = await db.query(
      "SELECT chat_id AS id,sender,message,timestamp FROM ai_chats WHERE user_id=? ORDER BY chat_id ASC LIMIT ? OFFSET ?",
      [req.params.userId, limit, offset]
    );
    const [total] = await db.query("SELECT COUNT(*) AS total FROM ai_chats WHERE user_id=?", [req.params.userId]);
    res.json({ history:rows, hasMore: offset+rows.length < total[0].total, total:total[0].total });
  } catch(e) { res.status(500).json({ error:"Failed to fetch chat history" }); }
});

app.delete("/api/chat/clear/:userId", requireUserToken, requireUserOwnership, async (req,res) => {
  try {
    await db.query("DELETE FROM ai_chats     WHERE user_id=?", [req.params.userId]);
    await db.query("DELETE FROM chat_sessions WHERE user_id=?", [req.params.userId]);
    res.json({ success:true, message:"Chat cleared" });
  } catch(e) { res.status(500).json({ error:"Failed to clear chat" }); }
});

// New chat session (manual reset)
app.post("/api/chat/new-session/:userId", requireUserToken, requireUserOwnership, async (req,res) => {
  try {
    await db.query("UPDATE chat_sessions SET ended_at=NOW() WHERE user_id=? AND ended_at IS NULL", [req.params.userId]);
    const [r] = await db.query("INSERT INTO chat_sessions (user_id) VALUES (?)", [req.params.userId]);
    res.json({ success:true, sessionId:r.insertId });
  } catch(e) { res.status(500).json({ error:"Failed to start new session" }); }
});

// ══════════════════════════════════════════════════════════════
// CONTROLS (feature flags)
// ══════════════════════════════════════════════════════════════

app.get("/api/controls", async (_,res) => {
  try {
    const [rows] = await db.query("SELECT function_name,value,description FROM controls");
    res.json(rows);
  } catch(e) {
    console.error("❌ Failed to fetch controls:", e.code || e.message);
    res.status(500).json({ error:"Failed to fetch controls" });
  }
});

app.get("/api/controls/:function_name", async (req,res) => {
  try {
    const [rows] = await db.query("SELECT * FROM controls WHERE function_name=?", [req.params.function_name]);
    if (!rows.length) return res.status(404).json({ error:"Control not found" });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error:"Failed" }); }
});

app.post("/api/controls", requireDevToken, async (req,res) => {
  const { function_name, value, description } = req.body;
  if (!function_name||value===undefined) return res.status(400).json({ error:"function_name and value required" });
  try {
    const [r] = await db.query("INSERT INTO controls (function_name,value,description) VALUES (?,?,?)", [function_name,value,description||null]);
    res.status(201).json({ message:"Control added", id:r.insertId });
  } catch(e) {
    if (e.code==="ER_DUP_ENTRY") return res.status(409).json({ error:"Control already exists" });
    res.status(500).json({ error:"Failed" });
  }
});

app.put("/api/controls/:function_name", requireDevToken, async (req,res) => {
  const { value } = req.body;
  if (value===undefined) return res.status(400).json({ error:"Value required" });
  try {
    const [r] = await db.query("UPDATE controls SET value=? WHERE function_name=?", [value, req.params.function_name]);
    if (!r.affectedRows) return res.status(404).json({ error:"Control not found" });
    res.json({ message:"Control updated" });
  } catch(e) { res.status(500).json({ error:"Failed" }); }
});

app.delete("/api/controls/:function_name", requireDevToken, async (req,res) => {
  try {
    const [r] = await db.query("DELETE FROM controls WHERE function_name=?", [req.params.function_name]);
    if (!r.affectedRows) return res.status(404).json({ error:"Control not found" });
    res.json({ message:"Control deleted" });
  } catch(e) { res.status(500).json({ error:"Failed" }); }
});

// ══════════════════════════════════════════════════════════════
// DEVELOPER LOGIN
// ══════════════════════════════════════════════════════════════

// POST dev login (email + password) — ✅ rate limited + bcrypt + logs + token
app.post("/api/dev-login", rateLimit(5,60000), async (req,res) => {
  const { email, password } = req.body;
  if (!email||!password) return res.status(400).json({ success:false, message:"Email and password required" });
  try {
    const [rows] = await db.query("SELECT * FROM devusers WHERE email=? AND is_active=1 LIMIT 1", [email]);
    if (!rows.length) {
      await logDevLogin({ devEmail:email, method:"email", req, success:false, failReason:"Dev not found" });
      return res.status(401).json({ success:false, message:"Developer not found or inactive" });
    }
    const dev = rows[0];
    const match = await verifyPassword(password, dev.password);
    if (!match) {
      await logDevLogin({ devId:dev.id, devEmail:email, devName:dev.name, method:"email", req, success:false, failReason:"Wrong password" });
      return res.status(401).json({ success:false, message:"Incorrect password" });
    }
    // Auto-migrate plain-text to bcrypt
    if (!dev.password.startsWith("$2b$") && !dev.password.startsWith("$2a$")) {
      const h = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.query("UPDATE devusers SET password=? WHERE id=?", [h, dev.id]);
    }
    // Generate 24hr token
    const token     = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date(Date.now() + 24*3600*1000);
    await db.query("INSERT INTO dev_tokens (dev_id,token,expires_at) VALUES (?,?,?)", [dev.id, hashBearerToken(token), expiresAt]);
    await logDevLogin({ devId:dev.id, devEmail:dev.email, devName:dev.name, method:"email", req, success:true });
    const { password:_, uic:__, profile:___, ...safe } = dev;
    res.json({ success:true, user:safe, token });
  } catch(e) { console.error("❌ dev-login:", e); res.status(500).json({ success:false, message:"Server error" }); }
});

// POST dev login (UIC/QR)
app.post("/api/dev-login-udc", rateLimit(5,60000), async (req,res) => {
  const { uic } = req.body;
  if (!uic) return res.status(400).json({ success:false, message:"UIC required" });
  try {
    const [rows] = await db.query("SELECT * FROM devusers WHERE uic=? AND is_active=1 LIMIT 1", [uic]);
    if (!rows.length) {
      await logDevLogin({ devEmail:"unknown", method:"uic", req, success:false, failReason:"Invalid UIC" });
      return res.status(401).json({ success:false, message:"Invalid or inactive UIC" });
    }
    const dev   = rows[0];
    const token = crypto.randomBytes(64).toString("hex");
    await db.query("INSERT INTO dev_tokens (dev_id,token,expires_at) VALUES (?,?,?)", [dev.id, hashBearerToken(token), new Date(Date.now()+24*3600*1000)]);
    await logDevLogin({ devId:dev.id, devEmail:dev.email, devName:dev.name, method:"uic", req, success:true });
    const { password:_, uic:__, profile:___, ...safe } = dev;
    res.json({ success:true, user:safe, token });
  } catch(e) { res.status(500).json({ success:false, message:"Server error" }); }
});

// POST dev logout — invalidate token
app.post("/api/dev-logout", requireDevToken, async (req,res) => {
  const token = hashBearerToken(req.headers["authorization"].slice(7));
  try {
    await db.query("DELETE FROM dev_tokens WHERE token=?", [token]);
    res.json({ success:true, message:"Logged out" });
  } catch(e) { res.status(500).json({ success:false }); }
});

// ══════════════════════════════════════════════════════════════
// DEVUSERS MANAGEMENT (no duplicate routes)
// ══════════════════════════════════════════════════════════════

app.get("/api/devusers/:id", async (req,res) => {
  try {
    const [rows] = await db.query("SELECT id,name,email,phone,role,created_at FROM devusers WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error:"Dev user not found" });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

app.put("/api/devusers/:id", async (req,res) => {
  const { name, email, phone } = req.body;
  try {
    const [r] = await db.query("UPDATE devusers SET name=?,email=?,phone=? WHERE id=?", [name,email,phone,req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error:"Dev user not found" });
    res.json({ message:"Profile updated" });
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

app.put("/api/devusers/:id/change-password", async (req,res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword||!newPassword) return res.status(400).json({ error:"Both passwords required" });
  if (newPassword.length<8) return res.status(400).json({ error:"Min 8 characters" });
  try {
    const [rows] = await db.query("SELECT password FROM devusers WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error:"Dev user not found" });
    const match = await verifyPassword(oldPassword, rows[0].password);
    if (!match) return res.status(401).json({ error:"Old password incorrect" });
    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.query("UPDATE devusers SET password=? WHERE id=?", [hashed, req.params.id]);
    res.json({ message:"Password changed" });
  } catch(e) { res.status(500).json({ error:"Server error" }); }
});

// ══════════════════════════════════════════════════════════════
// DEV LOGIN LOGS
// ══════════════════════════════════════════════════════════════

app.get("/api/dev/login-logs", requireDevToken, async (req,res) => {
  const limit  = parseInt(req.query.limit)  || 50;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const [rows]  = await db.query(
      "SELECT * FROM dev_login_logs ORDER BY login_time DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    const [total] = await db.query("SELECT COUNT(*) AS total FROM dev_login_logs");
    res.json({ success:true, logs:rows, total:total[0].total });
  } catch(e) { res.status(500).json({ success:false, error:"Failed to fetch logs" }); }
});

// ══════════════════════════════════════════════════════════════
// DATABASE VIEWER + SQL CONSOLE (dev-only)
// ══════════════════════════════════════════════════════════════

// GET all tables + preview (strips sensitive columns)
app.get("/api/dev/tables", requireDevToken, async (_,res) => {
  const HIDDEN = ["password","uic","token"];
  try {
    const [tables] = await db.query("SHOW TABLES");
    const key    = Object.keys(tables[0])[0];
    const result = {};
    for (const row of tables) {
      const tbl  = row[key];
      const rows = (await readCollection(tbl)).records.slice(0, 20);
      result[tbl] = rows.map(r => {
        const c = {...r};
        HIDDEN.forEach(h => delete c[h]);
        return c;
      });
    }
    res.json({ success:true, tables:result });
  } catch(e) { res.status(500).json({ success:false, error:"Failed" }); }
});

// POST SQL console — dev-only, logs all non-SELECT queries
app.post("/api/sql-run", requireDevToken, async (_req,res) => {
  res.status(410).json({
    success: false,
    error: "SQL console is unavailable with the JSON document store. Use the read-only database viewer."
  });
});

// ══════════════════════════════════════════════════════════════
// FEEDBACK
// ══════════════════════════════════════════════════════════════

app.post("/api/feedback", async (req,res) => {
  const { user_id, name, email, message, rating, category } = req.body;
  if (!message) return res.status(400).json({ error:"Message required" });
  try {
    await db.query(
      "INSERT INTO feedback (user_id,name,email,message,rating,category) VALUES (?,?,?,?,?,?)",
      [user_id||null, name||null, email||null, message, rating||null, category||null]
    );
    res.status(201).json({ success:true, message:"Feedback submitted. Thank you!" });
  } catch(e) { res.status(500).json({ error:"Failed to submit feedback" }); }
});

app.get("/api/feedback", requireDevToken, async (req,res) => {
  try {
    const [rows] = await db.query("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100");
    res.json({ success:true, feedback:rows });
  } catch(e) { res.status(500).json({ error:"Failed" }); }
});

// ══════════════════════════════════════════════════════════════
// 404 CATCH-ALL
// ══════════════════════════════════════════════════════════════

app.use((req, res) => {
  res.status(404).json({ error:`Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err.message);
  res.status(500).json({ error:"Internal server error" });
});

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
async function startServer() {
  try {
    const status = await initializeStore();
    console.log("✅ GitHub JSON store initialized:", status);
    try {
      const sync = await syncPendingMutations();
      if (sync.synced) console.log("✅ Recovered pending journal events:", sync.synced);
    } catch (error) {
      console.error("⚠️ Startup recovery deferred; durable journal retained:", error.response?.status || error.message);
    }
    startSyncScheduler();
    app.listen(PORT, () => {
      console.log("✅ AgroScan API listening on port " + PORT);
      console.log("🔒 bcrypt | rate-limit | hashed-dev-token | GitHub JSON journal | 4-hour batch sync");
    });
  } catch (error) {
    console.error("❌ GitHub JSON store initialization failed:", error.response?.status || error.message);
    console.warn("⚠️ Starting degraded API. Configure GITHUB_DATA_TOKEN and private repository access.");
    app.listen(PORT, () => {
      console.log("⚠️ AgroScan API running in degraded mode on port " + PORT);
    });
  }
}

startServer();
