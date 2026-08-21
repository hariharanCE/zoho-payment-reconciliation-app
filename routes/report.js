const express = require("express");
const { fetchAllClosedWonDeals } = require("../lib/zohoClient");
const { reconcileDeal, toDateOnly } = require("../lib/reconcile");

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
  try {
    const { fromDate, toDate } = req.body;
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: "fromDate and toDate are required (yyyy-MM-dd)." });
    }

    const orgId = process.env.ZOHO_BOOKS_ORG_ID;
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const allDeals = await fetchAllClosedWonDeals();

    const dealsInRange = allDeals.filter((deal) => {
      const closingDateOnly = toDateOnly(deal.Closing_Date);
      if (!closingDateOnly) return false;
      const d = new Date(closingDateOnly);
      return d >= from && d <= to;
    });

    const rows = await runWithConcurrency(
      dealsInRange,
      (deal) => reconcileDeal(deal, orgId),
      CONCURRENCY
    );

    res.json({
      totalClosedWonDeals: allDeals.length,
      dealsInRange: dealsInRange.length,
      rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
