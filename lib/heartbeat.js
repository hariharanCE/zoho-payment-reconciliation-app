// ===============================
// Keeps a long-running JSON response alive across a proxy.
//
// A full reconciliation walks every Closed Won deal and makes up to four
// Books calls per deal, so the reply can be minutes away. Render's edge (and
// most proxies) cut a connection that has sent nothing for ~100 seconds, and
// the client then sees an empty body — the "Unexpected end of JSON input"
// this exists to prevent. Locally there is no proxy in the path, which is
// why the same request finishes fine on a laptop and fails once deployed.
//
// The trick: send the headers immediately, then dribble a single space every
// few seconds while the work runs. Leading whitespace is legal JSON, so the
// body still parses as-is on the client — no streaming format, no change to
// what the pages already expect — but the connection is never idle.
//
// The cost is that the status code must be chosen before the work finishes,
// so everything here answers 200 and carries failures as `{ error }` in the
// body. Viz.postJson throws on that field whatever the status, so the pages
// still surface a failure as a failure. Validate input BEFORE starting a
// heartbeat — until then a real 4xx is still on the table.
// ===============================

const HEARTBEAT_MS = 15000;

function startHeartbeat(req, res, label) {
  const startedAt = Date.now();

  // Node's own request timeout (300s by default since v18) would sever the
  // socket mid-report too. These routes are deliberately unbounded.
  req.setTimeout(0);
  res.setTimeout(0);

  res.status(200);
  res.set({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    // Tells any buffering proxy to pass our keep-alive bytes straight through.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const timer = setInterval(() => {
    if (res.writableEnded) return;
    res.write(" ");
    console.log(`[${label}] still working… ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }, HEARTBEAT_MS);
  timer.unref();

  const stop = () => clearInterval(timer);
  // A client that closes the tab mid-report shouldn't leave the timer running.
  res.on("close", stop);

  return {
    send(payload) {
      stop();
      if (res.writableEnded) return;
      console.log(`[${label}] done in ${Math.round((Date.now() - startedAt) / 1000)}s`);
      res.end(JSON.stringify(payload));
    },
    fail(err) {
      stop();
      if (res.writableEnded) return;
      console.error(`[${label}] failed after ${Math.round((Date.now() - startedAt) / 1000)}s:`, err);
      res.end(JSON.stringify({ error: err.message || String(err) }));
    },
  };
}

module.exports = { startHeartbeat };
