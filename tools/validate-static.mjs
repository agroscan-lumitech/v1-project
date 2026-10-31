import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const errors = [];
function check(condition, message) {
  if (!condition) errors.push(message);
}

const requiredFiles = [
  "frontend/manifest.webmanifest", "frontend/service-worker.js", "frontend/pwa-register.js",
  "frontend/offline.html", "frontend/agroscan-pwa.svg", "frontend/robots.txt", "frontend/sitemap.xml",
  "devend/manifest.webmanifest", "devend/service-worker.js", "devend/pwa-register.js",
  "devend/offline.html", "devend/agrodev-pwa.svg", "devend/robots.txt",
  "repoend/robots.txt", "repoend/sitemap.xml",
  "backend/security-utils.js", "backend/test/security.test.js"
];
for (const file of requiredFiles) check(exists(file), "Missing required file: " + file);

const frontendConnection = JSON.parse(read("frontend/config/backend-connection.json"));
check(frontendConnection.backendDomain === "https://backend.v1.agroscan.dpdns.org", "Frontend backend domain is incorrect.");
check(read("devend/config.js").includes('BACKEND_URL: "https://backend.v1.agroscan.dpdns.org"'), "Developer dashboard backend URL is incorrect.");
check(!read("devend/login-form.html").includes("agroscan-backend.onrender.com"), "Developer login still uses the retired Render hostname.");
check(read("devend/login-form.html").includes("DEV_CONFIG.setSession(data.user, data.token)"), "Developer login must persist its bearer token.");
check(read("backend/server.js").includes("requireDevAccount"), "Developer account ownership middleware is missing.");
check(read("backend/server.js").includes("validateUploadedImage"), "Image signature validation is not wired into uploads.");
check(read("backend/github-json-store.js").includes("Replay the durable journal"), "Forced GitHub JSON reads must replay journal events.");
check(read("backend/github-json-store.js").includes("eventId prevents"), "GitHub JSON journal conflict retry is missing.");
check(read("frontend/service-worker.js").includes('url.pathname.startsWith("/api/")'), "Main PWA must exclude API responses.");
check(read("frontend/service-worker.js").includes("const publicAsset = CORE_ASSETS.includes(url.pathname)"), "Main PWA must cache only explicitly allowed public asset paths.");
check(read("devend/service-worker.js").includes('url.pathname.includes("private-desk/")'), "Developer PWA must exclude private dashboard pages.");
check(read("devend/service-worker.js").includes('url.pathname.startsWith("/api/")'), "Developer PWA must exclude API responses.");
for (const file of ["frontend/home.html", "frontend/profile.html", "frontend/chat.html", "frontend/analytics.html", "frontend/soil-test.html"]) {
  const content = read(file);
  check(!content.includes("panelInfo.innerHTML"), "Account names must not be injected as HTML: " + file);
  check(!content.includes("card.innerHTML"), "Land names must not be injected as HTML: " + file);
}
check(read("devend/private-desk/sqlconsole.html").includes("SQL disabled for GitHub JSON"), "Developer SQL console must be disabled for the JSON document store.");

const frontendManifest = JSON.parse(read("frontend/manifest.webmanifest"));
const devManifest = JSON.parse(read("devend/manifest.webmanifest"));
check(frontendManifest.scope === "/" && frontendManifest.start_url === "/index.html", "Main PWA scope/start URL is invalid.");
check(devManifest.scope === "/" && devManifest.start_url === "/login-form.html", "Developer PWA scope/start URL is invalid.");

const publicFrontend = [
  "frontend/index.html", "frontend/features.index.html",
  "frontend/contributors.html", "frontend/donate.html", "frontend/agroawareness/index.agroawareness.html",
  "frontend/agropedia/agroprac.html", "frontend/agropedia/croprotation.html",
  "frontend/agropedia/factors-crop-production.html", "frontend/agropedia/fertilisers.html",
  "frontend/agropedia/index.agropedia.html", "frontend/agropedia/soilhealth.html",
  "frontend/agropedia/soiltypes.html", "frontend/agroscheme/index.agroscheme.html",
  "frontend/agroshop/index.agroshop.html"
];
for (const file of publicFrontend) {
  if (!exists(file)) { errors.push("Missing public page: " + file); continue; }
  const content = read(file);
  check(/<link rel="canonical" href="https:\/\/v1\.agroscan\.dpdns\.org\//i.test(content), "Missing v1 canonical URL: " + file);
  check(content.includes('name="description"'), "Missing search description: " + file);
  check(content.includes('rel="manifest"'), "Missing PWA manifest link: " + file);
}
const privateFrontend = [
  "frontend/login-form.html", "frontend/signup-form.html", "frontend/profile.html",
  "frontend/home.html", "frontend/chat.html", "frontend/analytics.html", "frontend/soil-test.html", "frontend/other.html"
];
for (const file of privateFrontend) {
  check(read(file).includes('name="robots" content="noindex,nofollow"'), "Private/app page should be noindex: " + file);
}
for (const file of ["repoend/index.html", "repoend/app.html", "repoend/contributors.html", "repoend/stat.html"]) {
  check(/<link rel="canonical" href="https:\/\/media\.v1\.agroscan\.dpdns\.org\//i.test(read(file)), "Missing media.v1 canonical URL: " + file);
}

const devFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(html|js)$/i.test(entry.name) && file !== "devend/config.js") devFiles.push(file);
  }
}
walk("devend");
for (const file of devFiles) {
  check(!read(file).includes("agroscan-backend.onrender.com"), "Retired backend host remains in " + file);
}

// Compile inline scripts to catch syntax errors in HTML-only dashboards and pages.
const htmlFiles = [];
function walkHtml(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walkHtml(file);
    else if (entry.name.toLowerCase().endsWith(".html")) htmlFiles.push(file);
  }
}
for (const directory of ["frontend", "devend", "repoend"]) {
  if (exists(directory)) walkHtml(directory);
}
for (const file of htmlFiles) {
  const html = read(file);
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  let index = 0;
  for (const match of scripts) {
    const attributes = match[1] || "";
    const type = (attributes.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || "text/javascript";
    if (/\bsrc\s*=|application\/ld\+json|application\/json|importmap|text\/template/i.test(attributes + " " + type)) continue;
    try {
      new vm.Script(match[2], { filename: file + ":inline-script-" + (++index) });
    } catch (error) {
      errors.push("Inline JavaScript syntax error in " + file + " (" + error.message + ")");
    }
  }
}

if (errors.length) {
  console.error("AgroScan static validation failed:");
  for (const error of errors) console.error(" - " + error);
  process.exitCode = 1;
} else {
  console.log("AgroScan static validation passed.");
}
