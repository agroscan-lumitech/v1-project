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
  "frontend/llms.txt", "frontend/about.html", "frontend/faq.html",
  "frontend/privacy.html", "frontend/terms.html", "frontend/cookies.html",
  "backend/dev-auth.js", "backend/test/dev-auth.test.js",
  "devend/manifest.webmanifest", "devend/service-worker.js", "devend/pwa-register.js",
  "devend/offline.html", "devend/agrodev-pwa.svg", "devend/robots.txt",
  "repoend/robots.txt", "repoend/sitemap.xml", "repoend/llms.txt",
  "backend/security-utils.js", "backend/test/security.test.js"
];
for (const file of requiredFiles) check(exists(file), "Missing required file: " + file);

const frontendConnection = JSON.parse(read("frontend/config/backend-connection.json"));
check(frontendConnection.backendDomain === "https://backend.v1.agroscan.dpdns.org", "Frontend backend domain is incorrect.");
check(read("devend/config.js").includes('BACKEND_URL: "https://backend.v1.agroscan.dpdns.org"'), "Developer dashboard backend URL is incorrect.");
check(!read("devend/login-form.html").includes("agroscan-backend.onrender.com"), "Developer login still uses the retired Render hostname.");
check(read("devend/login-form.html").includes("DEV_CONFIG.setSession(data.user, data.token)"), "Developer login must persist its bearer token.");
check(read("backend/server.js").includes("requireDevAccount"), "Developer account ownership middleware is missing.");
check(read("backend/server.js").includes("requireDevRole"), "Developer role authorization middleware is missing.");
check(read("backend/server.js").includes("INNER JOIN devusers") && read("backend/server.js").includes("d.is_active=1"), "Developer tokens must be rejected for inactive accounts.");
check(read("backend/dev-auth.js").includes("Insufficient developer permissions"), "Developer role guard must deny insufficient roles.");
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
  "frontend/index.html", "frontend/features.index.html", "frontend/about.html", "frontend/faq.html",
  "frontend/agroawareness/index.agroawareness.html",
  "frontend/agropedia/agroprac.html", "frontend/agropedia/croprotation.html",
  "frontend/agropedia/factors-crop-production.html", "frontend/agropedia/fertilisers.html",
  "frontend/agropedia/index.agropedia.html", "frontend/agropedia/soilhealth.html",
  "frontend/agropedia/soiltypes.html", "frontend/agroscheme/index.agroscheme.html",
  "frontend/agroshop/index.agroshop.html",
  "frontend/privacy.html", "frontend/terms.html", "frontend/cookies.html"
];
for (const file of publicFrontend) {
  if (!exists(file)) { errors.push("Missing public page: " + file); continue; }
  const content = read(file);
  check(content.includes('rel="canonical" href="https://v1.agroscan.dpdns.org/'), "Missing v1 canonical URL: " + file);
  check(content.includes('name="description"'), "Missing search description: " + file);
  check(content.includes('rel="manifest"'), "Missing PWA manifest link: " + file);
  check(!content.includes('name="robots" content="noindex,nofollow"'), "Public page must not be noindex: " + file);
}
const privateFrontend = [
  "frontend/login-form.html", "frontend/signup-form.html", "frontend/profile.html",
  "frontend/home.html", "frontend/chat.html", "frontend/analytics.html", "frontend/soil-test.html",
  "frontend/other.html", "frontend/donate.html", "frontend/contributors.html",
  "frontend/management.repostat/contributors.html"
];
for (const file of privateFrontend) {
  check(read(file).includes('name="robots" content="noindex,nofollow"'), "Private or unreviewed page should be noindex: " + file);
}
for (const file of ["repoend/index.html", "repoend/app.html"]) {
  check(read(file).includes('rel="canonical" href="https://media.v1.agroscan.dpdns.org/'), "Missing media.v1 canonical URL: " + file);
}
for (const file of ["repoend/stat.html", "repoend/contributors.html"]) {
  check(read(file).includes('name="robots" content="noindex,nofollow"'), "Historical or unreviewed project page should be noindex: " + file);
}

const devFiles = [];
function walkFiles(directory, output, extensions) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(file, output, extensions);
    else if (extensions.some(extension => entry.name.toLowerCase().endsWith(extension))) output.push(file);
  }
}
walkFiles("devend", devFiles, [".html", ".js"]);
for (const file of devFiles) {
  check(!read(file).includes("agroscan-backend.onrender.com"), "Retired backend host remains in " + file);
}

check(read("frontend/robots.txt").includes("User-agent: OAI-SearchBot"), "ChatGPT Search crawler must be allowed on the public frontend.");
check(read("frontend/robots.txt").includes("User-agent: GPTBot"), "GPTBot training crawl must be separately configured.");
check(read("repoend/robots.txt").includes("User-agent: OAI-SearchBot"), "ChatGPT Search crawler must be allowed on the public project site.");
check(read("devend/robots.txt").includes("Allow: /"), "Developer dashboard robots policy must allow crawlers to read noindex response headers.");
check(read("devend/netlify.toml").includes('X-Robots-Tag = "noindex, nofollow, noarchive"'), "Developer dashboard must send a noindex response header.");
check(read("frontend/netlify.toml").includes('X-Robots-Tag = "noindex, nofollow"'), "Private or incomplete frontend pages must send noindex response headers.");
check(read("repoend/netlify.toml").includes('X-Robots-Tag = "noindex, nofollow"'), "Unreviewed project contributor page must send noindex response headers.");
check(exists("frontend/llms.txt") && exists("repoend/llms.txt"), "Public LLM discovery files are missing.");

const sitemapChecks = [
  ["frontend/sitemap.xml", "https://v1.agroscan.dpdns.org/", publicFrontend],
  ["repoend/sitemap.xml", "https://media.v1.agroscan.dpdns.org/", ["repoend/index.html", "repoend/app.html"]]
];
for (const [sitemapFile, rootUrl, pageFiles] of sitemapChecks) {
  const xml = read(sitemapFile);
  const locs = xml.split("<loc>").slice(1).map(part => part.split("</loc>")[0]);
  check(new Set(locs).size === locs.length, "Duplicate URLs in " + sitemapFile);
  for (const url of locs) {
    const page = pageFiles.find(file => {
      const html = read(file);
      return html.includes('rel="canonical" href="' + url + '"') || (url === rootUrl && html.includes('rel="canonical" href="' + rootUrl + '"'));
    });
    check(Boolean(page), "Sitemap URL has no matching canonical public page: " + url);
  }
}
check(!read("frontend/sitemap.xml").includes("donate.html"), "Incomplete donation page must not be in the frontend sitemap.");
check(!read("frontend/sitemap.xml").includes("contributors.html"), "Unreviewed contributor page must not be in the frontend sitemap.");
check(!read("frontend/management.repostat/contributors.html").includes("@agroscan.dev"), "Contributor page must not expose personal email addresses.");
check(!read("frontend/management.repostat/contributors.html").includes("phone:"), "Contributor page must not embed personal phone numbers.");
check(!read("frontend/management.repostat/contributors.html").includes("panelInfo.innerHTML"), "Contributor cards must use safe DOM construction.");
check(!read("frontend/llms.txt").includes("contributors.html"), "LLM discovery must not list non-indexable contributor pages.");
check(!read("repoend/llms.txt").includes("contributors.html"), "Project LLM discovery must not list non-indexable contributor pages.");
check(!read("repoend/sitemap.xml").includes("stat.html"), "Legacy launch countdown must not be in the project sitemap.");
check(!read("repoend/sitemap.xml").includes("contributors.html"), "Unreviewed contributor page must not be in the project sitemap.");

for (const file of ["frontend/agroshop/script.js", "frontend/agroscheme/index.agroscheme.html", "frontend/agroawareness/index.agroawareness.html", "frontend/agropedia/index.agropedia.html"]) {
  check(!read(file).includes("panelInfo.innerHTML"), "User profile values must be rendered with safe DOM APIs: " + file);
}
for (const file of [...publicFrontend, "repoend/index.html", "repoend/app.html"]) {
  const html = read(file);
  const marker = '<script type="application/ld+json">';
  let position = 0;
  while ((position = html.indexOf(marker, position)) !== -1) {
    const start = position + marker.length;
    const end = html.indexOf("</script>", start);
    if (end === -1) { errors.push("Unclosed JSON-LD block in " + file); break; }
    try { JSON.parse(html.slice(start, end)); }
    catch { errors.push("Invalid JSON-LD structured data in " + file); }
    position = end + 9;
  }
}

// Compile inline scripts without depending on browser APIs.
const htmlFiles = [];
for (const directory of ["frontend", "devend", "repoend"]) walkFiles(directory, htmlFiles, [".html"]);
for (const file of htmlFiles) {
  const html = read(file);
  let position = 0;
  let index = 0;
  while ((position = html.indexOf("<script", position)) !== -1) {
    const openEnd = html.indexOf(">", position);
    const close = html.indexOf("</script>", openEnd);
    if (openEnd === -1 || close === -1) break;
    const attributes = html.slice(position, openEnd + 1);
    const source = html.slice(openEnd + 1, close);
    if (!attributes.includes("src=") && !attributes.includes("application/ld+json") && !attributes.includes("application/json") && !attributes.includes("importmap") && !attributes.includes("text/template")) {
      try { new vm.Script(source, { filename: file + ":inline-script-" + (++index) }); }
      catch (error) { errors.push("Inline JavaScript syntax error in " + file + " (" + error.message + ")"); }
    }
    position = close + 9;
  }
}

if (errors.length) {
  console.error("AgroScan static validation failed:");
  for (const error of errors) console.error(" - " + error);
  process.exitCode = 1;
} else {
  console.log("AgroScan static validation passed.");
}
