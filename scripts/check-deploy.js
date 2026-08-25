#!/usr/bin/env node
// ===============================
// Point this at a deployed URL and it says whether the Node app is actually
// running there.
//
//   node scripts/check-deploy.js https://your-app.onrender.com
//
// Written after a deploy that looked completely healthy — every page loaded,
// every chart drew — but was serving public/ as static files, with no
// Express behind it. The only symptom was a report that failed minutes in
// with "the server closed the connection". Two requests tell them apart.
// ===============================

const url = (process.argv[2] || "").replace(/\/+$/, "");
if (!url) {
  console.error("Usage: node scripts/check-deploy.js https://your-app.onrender.com");
  process.exit(2);
}

const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => console.log(`  \u2717 ${m}`);

async function get(path, init) {
  const started = Date.now();
  const resp = await fetch(url + path, init);
  const text = await resp.text();
  return { resp, text, ms: Date.now() - started };
}

(async () => {
  console.log(`Checking ${url}\n`);
  let healthy = true;

  // --- 1. Is the Node server there at all? ---
  console.log("API server");
  let health;
  try {
    health = await get("/api/health", { cache: "no-store" });
  } catch (err) {
    bad(`/api/health is unreachable: ${err.message}`);
    console.log("\n  The host is not responding. Check the service is deployed and awake.");
    process.exit(1);
  }

  let healthJson = null;
  try {
    healthJson = JSON.parse(health.text);
  } catch (err) {
    /* handled below */
  }

  if (healthJson && healthJson.ok) {
    ok(`/api/health answered in ${health.ms}ms (build ${healthJson.build}, up ${healthJson.uptimeSeconds}s)`);
  } else {
    healthy = false;
    bad(`/api/health returned HTTP ${health.resp.status} ${health.resp.headers.get("content-type") || ""}`);
    bad(`body: ${JSON.stringify(health.text.slice(0, 120))}`);
    console.log(
      "\n  This host is serving the pages as static files — there is no Node\n" +
        "  process running. Every /api call will fail, and a POST will come back\n" +
        "  200 with an empty body, which the pages report as a lost connection.\n" +
        "\n  On Render: the service must be a Web Service (Node), not a Static\n" +
        "  Site. Build command `npm ci`, start command `npm start`, and the Zoho\n" +
        "  env vars set in the dashboard. A Static Site cannot be converted, so\n" +
        "  create the Web Service and delete the static one."
    );
    process.exit(1);
  }

  // --- 2. Do the pages carry the cache-busting stamp? ---
  console.log("\nPages");
  const page = await get("/");
  const cc = page.resp.headers.get("cache-control") || "";
  if (/no-store/.test(cc)) ok(`/ is served no-store (${cc})`);
  else {
    healthy = false;
    bad(`/ is cacheable (${cc}) — a browser may keep running an old bundle`);
  }

  const refs = page.text.match(/(?:src|href)="[^"]+\.(?:js|css)[^"]*"/g) || [];
  const unstamped = refs.filter((r) => !r.includes("?v="));
  if (refs.length && !unstamped.length) ok(`all ${refs.length} asset refs carry a ?v= build stamp`);
  else {
    healthy = false;
    bad(`unstamped asset refs: ${unstamped.join(", ") || "(no assets found)"}`);
  }

  // --- 3. Does a bad request still come back as JSON? ---
  console.log("\nError contract");
  const badReq = await get("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromDate: "nope", toDate: "nope" }),
  });
  let parsed = null;
  try {
    parsed = JSON.parse(badReq.text);
  } catch (err) {
    /* handled below */
  }
  if (parsed && parsed.error) ok(`a rejected request answers JSON: ${JSON.stringify(parsed.error)}`);
  else {
    healthy = false;
    bad(`a rejected request answered HTTP ${badReq.resp.status}: ${JSON.stringify(badReq.text.slice(0, 120))}`);
  }

  console.log(healthy ? "\nDeployment looks correct." : "\nDeployment has problems (above).");
  process.exit(healthy ? 0 : 1);
})().catch((err) => {
  console.error("\nCheck failed:", err);
  process.exit(1);
});
