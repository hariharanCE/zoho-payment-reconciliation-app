const express = require("express");
const { fetchAllClosedWonDeals } = require("../lib/zohoClient");
const { buildCollections } = require("../lib/collections");
const { startHeartbeat } = require("../lib/heartbeat");

const router = express.Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

router.post("/collections", async (req, res) => {
  const { fromDate, toDate } = req.body;

  // Validated before the heartbeat starts, so bad input still gets a 400.
  if (!ISO_DATE.test(fromDate || "") || !ISO_DATE.test(toDate || "")) {
    return res
      .status(400)
      .json({ error: "fromDate and toDate are required, in yyyy-MM-dd format." });
  }
  if (fromDate > toDate) {
    return res.status(400).json({ error: "fromDate must not be after toDate." });
  }

  // Lighter than /run-report, but the CRM fetch still pages through every
  // Closed Won deal, which can outlast a proxy's idle timeout on its own.
  const beat = startHeartbeat(req, res, "collections");

  try {
    // No Books lookups here — the month-wise split comes entirely from CRM's
    // per-component paid checkboxes, so this is a single CRM fetch.
    const allDeals = await fetchAllClosedWonDeals();
    const result = buildCollections(allDeals, fromDate, toDate, todayIso());

    beat.send({ totalClosedWonDeals: allDeals.length, ...result });
  } catch (err) {
    beat.fail(err);
  }
});

module.exports = router;
