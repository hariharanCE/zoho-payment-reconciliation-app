require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const reportRoutes = require("./routes/report");
const collectionsRoutes = require("./routes/collections");
const { htmlMiddleware, setAssetHeaders, BUILD_ID } = require("./lib/staticAssets");

const app = express();

// Render terminates TLS at its edge and forwards over http. Without this,
// req.secure/req.ip describe the proxy rather than the caller.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// A malformed body makes express.json throw, and the default handler answers
// with an HTML stack trace. Every client here parses JSON, so keep the
// contract: an /api reply is always JSON, whatever went wrong.
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body was not valid JSON." });
  }
  return next(err);
});

const publicDir = path.join(__dirname, "public");
// Pages first (stamped + never stored), then the assets they point at.
app.use(htmlMiddleware(publicDir));
app.use(
  express.static(publicDir, {
    etag: false,
    lastModified: false,
    setHeaders: setAssetHeaders,
  })
);

// Cheap, dependency-free, and touches no Zoho endpoint: the clients ping it
// to wake a spun-down instance before starting a report that must not be
// spent on a cold start. Also serves as the Render health check.
app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, build: BUILD_ID, uptimeSeconds: Math.round(process.uptime()) });
});

app.use("/api", reportRoutes);
app.use("/api", collectionsRoutes);

// An unmatched /api path would otherwise fall through to Express's HTML 404.
app.use("/api", (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

// Last line of defence. If a route threw after its headers went out (a
// heartbeat is mid-flight), the status is already committed — close the body
// with an { error } object, which is what the clients look for anyway.
app.use((err, req, res, next) => {
  console.error("[unhandled]", err);
  const message = (err && err.message) || "Unexpected server error.";
  if (res.headersSent) {
    if (!res.writableEnded) res.end(JSON.stringify({ error: message }));
    return;
  }
  if (req.path.startsWith("/api")) return res.status(500).json({ error: message });
  return res.status(500).type("text/plain").send(message);
});

// A stray rejection used to take the whole process down mid-report, which
// severs the socket and hands the browser an empty body — the exact symptom
// the client-side error message blames on bad JSON. Log it and keep serving;
// the affected request still fails, but every other one survives.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Payment reconciliation app running at http://localhost:${PORT} (build ${BUILD_ID})`);
});

// A reconciliation over a wide date range legitimately runs for minutes.
// Node has capped a single request at 300s since v18, which would sever the
// socket mid-report and hand the browser an empty body; the routes police
// their own duration instead. headersTimeout must stay above the platform's
// keep-alive so an idle pooled connection is closed by us, not mid-request.
server.requestTimeout = 0;
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
