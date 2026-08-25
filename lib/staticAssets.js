// ===============================
// Serves the pages so a browser can never run a stale bundle.
//
// This exists because of a real failure: after a deploy that fixed the
// client, the live site kept reporting "Failed to execute 'json' on
// 'Response': Unexpected end of JSON input" — a message the fixed code
// cannot produce. The browser was still running the previous app.js, which
// called resp.json() directly. Unversioned script URLs plus a revalidation
// the intermediate cache is free to skip means a redeploy is not guaranteed
// to reach anyone who has already loaded the site.
//
// Two mechanisms, belt and braces:
//   1. The HTML is never stored (no-store), so every page load re-reads it.
//   2. Every local script/stylesheet URL inside that HTML gets a ?v=<build>
//      stamp. The build id changes on each deploy, so the asset URLs change
//      too — a cached copy of the old file is keyed to a URL nobody asks for
//      any more, rather than silently shadowing the new one.
// ===============================

const fs = require("fs");
const path = require("path");

// Render exposes the deployed commit; it changes on every deploy, which is
// exactly the cadence the asset URLs need. Off-platform (local, or another
// host) fall back to process start time — a restart is the equivalent event.
const BUILD_ID = (
  process.env.RENDER_GIT_COMMIT ||
  process.env.BUILD_ID ||
  String(Date.now())
)
  .slice(0, 12)
  .replace(/[^A-Za-z0-9_-]/g, "");

const NO_STORE = "no-store, no-cache, must-revalidate, proxy-revalidate";

// Local refs only: anything absolute (http:, //cdn, /abs) is left alone, and
// a URL that already carries a query is skipped rather than corrupted.
const LOCAL_ASSET = /\b(src|href)="(?!https?:|\/\/|data:)([^"?#]+\.(?:js|css))"/g;

function stampAssets(html) {
  return html.replace(LOCAL_ASSET, (_m, attr, url) => `${attr}="${url}?v=${BUILD_ID}"`);
}

// One read + rewrite per file per process. The files are static on disk, so
// re-reading them on every request buys nothing.
const cache = new Map();

function renderHtml(fullPath) {
  let html = cache.get(fullPath);
  if (html === undefined) {
    html = stampAssets(fs.readFileSync(fullPath, "utf8"));
    cache.set(fullPath, html);
  }
  return html;
}

function htmlMiddleware(publicDir) {
  const root = path.resolve(publicDir);

  return function serveHtml(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    // req.path is already query-free and URL-decoded by Express.
    let rel = req.path === "/" ? "/index.html" : req.path;
    if (!rel.toLowerCase().endsWith(".html")) return next();

    const fullPath = path.resolve(root, "." + rel);
    // path.resolve collapses any ../ before this check, so a crafted URL
    // cannot walk out of public/.
    if (fullPath !== root && !fullPath.startsWith(root + path.sep)) return next();

    let body;
    try {
      body = renderHtml(fullPath);
    } catch (err) {
      // Missing file: let express.static and the 404 handler have their say.
      return next();
    }

    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": NO_STORE,
      Pragma: "no-cache",
      Expires: "0",
    });
    if (req.method === "HEAD") return res.end();
    return res.send(body);
  };
}

// The stamped URLs make a cached hit harmless, but a plain revalidate keeps
// the door shut for any page that somehow asks for an unstamped one.
function setAssetHeaders(res, filePath) {
  if (/\.(js|css|html)$/i.test(filePath)) {
    res.setHeader("Cache-Control", /\.html$/i.test(filePath) ? NO_STORE : "no-cache");
  }
}

module.exports = { htmlMiddleware, setAssetHeaders, BUILD_ID };
