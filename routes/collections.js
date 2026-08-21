const express = require("express");
const { fetchAllClosedWonDeals } = require("../lib/zohoClient");
const { buildCollections } = require("../lib/collections");

const router = express.Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

router.post("/collections", async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;

    if (!ISO_DATE.test(fromDate || "") || !ISO_DATE.test(toDate || "")) {
      return res
        .status(400)
        .json({ error: "fromDate and toDate are required, in yyyy-MM-dd format." });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ error: "fromDate must not be after toDate." });
    }

    // No Books lookups here — the month-wise split comes entirely from CRM's
    // per-component paid checkboxes, so this is a single CRM fetch.
    const allDeals = await fetchAllClosedWonDeals();
    const result = buildCollections(allDeals, fromDate, toDate, todayIso());

    res.json({ totalClosedWonDeals: allDeals.length, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
