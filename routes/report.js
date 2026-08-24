const express = require("express");
const { fetchAllClosedWonDeals } = require("../lib/zohoClient");
const { reconcileDeal, toDateOnly } = require("../lib/reconcile");
const { startHeartbeat } = require("../lib/heartbeat");

const router = express.Router();

// Run a handful of deals concurrently (not all 10,000 at once, and not
// strictly one-by-one either) to keep this reasonably fast without
// tripping Zoho's API rate limits.
const CONCURRENCY = 5;

async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let index = 0;

  async function next() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, next);
  await Promise.all(workers);
  return results;
}

router.post("/run-report", async (req, res) => {
  const { fromDate, toDate } = req.body;
  // Validated before the heartbeat starts, so a bad request still gets a 400.
  if (!fromDate || !toDate) {
    return res.status(400).json({ error: "fromDate and toDate are required (yyyy-MM-dd)." });
  }

  // This is the slow one — a Books lookup per deal — so the reply is kept
  // alive while it runs. See lib/heartbeat.js.
  const beat = startHeartbeat(req, res, "run-report");

  try {
    const orgId = process.env.ZOHO_BOOKS_ORG_ID;
    if (!orgId) throw new Error("ZOHO_BOOKS_ORG_ID is not set on the server.");

    const from = new Date(fromDate);
    const to = new Date(toDate);

    const allDeals = await fetchAllClosedWonDeals();

    const dealsInRange = allDeals.filter((deal) => {
      const closingDateOnly = toDateOnly(deal.Closing_Date);
      if (!closingDateOnly) return false;
      const d = new Date(closingDateOnly);
      return d >= from && d <= to;
    });

    console.log(
      `[run-report] ${fromDate}..${toDate}: ${dealsInRange.length} of ${allDeals.length} Closed Won deals to reconcile`
    );

    const rows = await runWithConcurrency(
      dealsInRange,
      (deal) => reconcileDeal(deal, orgId),
      CONCURRENCY
    );

    beat.send({
      totalClosedWonDeals: allDeals.length,
      dealsInRange: dealsInRange.length,
      rows,
    });
  } catch (err) {
    beat.fail(err);
  }
});

module.exports = router;
