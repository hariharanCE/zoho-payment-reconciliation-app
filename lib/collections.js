// Month-wise collections: takes each Closed Won deal's scheduled payments
// (instalments 1-3, loan, full payment) and buckets them by the month the
// money was expected, split paid vs pending. Full payments have no due date,
// so they have no month to land in — they are reported as a separate total
// rather than bucketed.
//
// A component counts as PENDING only when its paid checkbox is false;
// anything already ticked is collected and never appears in the pending
// figures. Both the schedule and the flags come from lib/payments.js — the
// same module that produces the report's "... Paid (CRM)" columns — so the
// two pages read identical flags by construction.
//
// Books is not consulted: it carries one paid total per customer, which can't
// be attributed to a specific instalment, so it can't drive a month-wise
// split. That also means this report needs no Books calls at all and runs far
// faster than the reconciliation report.

const { scheduledPayments, PAYMENT_TYPE } = require("./payments");

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ISO dates (yyyy-MM-dd) compare and slice correctly as plain strings, so do
// the date maths textually rather than through Date objects — no timezone
// shifting a due date into the neighbouring month.
function monthKey(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : "";
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

// Every month between two keys inclusive, so a month with no scheduled
// payments still shows as a gap in the series instead of being skipped.
function monthRange(startKey, endKey) {
  const keys = [];
  let [year, month] = startKey.split("-").map(Number);
  const [endYear, endMonth] = endKey.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return keys;
}

// ===============================
// One deal -> its payment components.
//
// Which components exist depends on Payment_Type, mirroring the crmPaidTotal
// logic in reconcile.js so the two dashboards never disagree. Two quirks are
// carried over deliberately: a paid Full Amount and a paid Loan Amount each
// imply the registration was collected too, so registration is treated as
// paid in those cases even if its own checkbox was never ticked.
// ===============================
// Deals -> month-wise paid/pending buckets within [fromDate, toDate].
// ===============================
function buildCollections(deals, fromDate, toDate, today) {
  const allComponents = deals.flatMap(scheduledPayments);

  // Registration isn't tracked here, so a deal whose Payment_Type isn't one of
  // the three known values now contributes nothing at all. Count those, so the
  // dashboard can say so rather than quietly under-reporting.
  const KNOWN_TYPES = [
    PAYMENT_TYPE.FULL,
    PAYMENT_TYPE.LOAN,
    ...PAYMENT_TYPE.INSTALMENTS,
  ];
  const unrecognisedDeals = deals.filter(
    (deal) => !KNOWN_TYPES.includes(deal.Payment_Type || "")
  ).length;

  // A component can only be placed on the month axis if it has a due date that
  // parsed to a real calendar date. The three reasons it might not are reported
  // separately, because they mean different things: a Full Payment has no due
  // date by design (nothing to fix), a missing date on a component that should
  // have one means the CRM record is incomplete, and an unparseable one means
  // the field holds something that isn't a date. None is dropped silently.
  const dated = allComponents.filter((c) => c.expectedDate);
  const noDueDate = allComponents.filter(
    (c) => !c.expectedDate && !c.expectedDateInvalid && !c.dueSource
  );
  const undated = allComponents.filter(
    (c) => !c.expectedDate && !c.expectedDateInvalid && c.dueSource
  );
  const invalidDated = allComponents.filter((c) => c.expectedDateInvalid);

  const inRange = dated.filter(
    (c) => c.expectedDate >= fromDate && c.expectedDate <= toDate
  );

  // A full payment has no due date, so the date filter has nothing to test it
  // against. It is scoped by the deal's Closing Date instead — a real CRM
  // field, carried on the row under its own name, never presented as a due
  // date. One that has no closing date either can't be scoped at all; those
  // are counted and reported rather than quietly included or dropped.
  const noDueInRange = noDueDate.filter(
    (c) => c.closingDate && c.closingDate >= fromDate && c.closingDate <= toDate
  );
  const noDueUnscoped = noDueDate.filter((c) => !c.closingDate);

  const sumOf = (list) => list.reduce((acc, c) => acc + c.amount, 0);

  const buckets = new Map();
  for (const key of monthRange(monthKey(fromDate), monthKey(toDate))) {
    buckets.set(key, {
      month: key,
      label: monthLabel(key),
      paid: 0,
      pending: 0,
      overdue: 0,
      total: 0,
      paidCount: 0,
      pendingCount: 0,
    });
  }

  for (const item of inRange) {
    const bucket = buckets.get(monthKey(item.expectedDate));
    if (!bucket) continue;
    bucket.total += item.amount;
    if (item.paid) {
      bucket.paid += item.amount;
      bucket.paidCount++;
    } else {
      bucket.pending += item.amount;
      bucket.pendingCount++;
      // Unpaid and the expected date has already passed.
      if (item.expectedDate < today) bucket.overdue += item.amount;
    }
  }

  const months = Array.from(buckets.values());
  const sum = (key) => months.reduce((acc, m) => acc + m[key], 0);
  const totalPaid = sum("paid");
  const totalPending = sum("pending");
  const totalExpected = totalPaid + totalPending;

  return {
    months,
    // The payment-level rows every table on every page works from: the dated
    // components that made it into a month, plus the full payments, which have
    // no due date and therefore no month. The month figures above stay
    // date-driven — `totals` is the sum of `months`, so the month table's
    // footer always adds up — which is why a row here can be outside them.
    items: [...inRange, ...noDueInRange],
    totals: {
      paid: totalPaid,
      pending: totalPending,
      overdue: sum("overdue"),
      expected: totalExpected,
      collectionRate: totalExpected > 0 ? totalPaid / totalExpected : 0,
      paidCount: sum("paidCount"),
      pendingCount: sum("pendingCount"),
    },
    // All surfaced so the UI can warn instead of quietly under-reporting.
    // Full payments carry no due date by design: they are listed in the tables
    // but never in a month, so their weight is stated separately here.
    noDueDate: {
      count: noDueInRange.length,
      amount: sumOf(noDueInRange),
      paidAmount: sumOf(noDueInRange.filter((c) => c.paid)),
      pendingAmount: sumOf(noDueInRange.filter((c) => !c.paid)),
      // No due date AND no closing date — not scopeable to the range at all,
      // so they appear nowhere above.
      unscopedCount: noDueUnscoped.length,
      unscopedAmount: sumOf(noDueUnscoped),
    },
    undated: {
      count: undated.length,
      amount: undated.reduce((acc, c) => acc + c.amount, 0),
    },
    invalidDates: {
      count: invalidDated.length,
      amount: invalidDated.reduce((acc, c) => acc + c.amount, 0),
      // A couple of offending values, so the CRM record can be found and fixed.
      samples: Array.from(
        new Set(invalidDated.map((c) => c.expectedDateRaw))
      ).slice(0, 3),
    },
    unrecognisedDeals,
  };
}

module.exports = { buildCollections, monthKey, monthLabel, monthRange };
