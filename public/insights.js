// ===============================
// Insights — every angle on the same money, on one page.
//
// The six single-question dashboards (ageing, mix, batches, owners, trend,
// risk) each answer their own thing well, but answering "how are collections
// doing?" meant opening all six and holding them in your head. This page puts
// them in one scroll, all reading the same filtered rows, so a batch filter
// set once applies to the trend, the ageing profile and the chase list at the
// same time.
//
// Nothing here recomputes what Shell already derives: the trend, the ageing
// buckets, the per-dimension aggregates and the per-deal rollup all come from
// Shell, so this page can never disagree with the dashboard it summarises.
// What it adds is the "What stands out" panel, which reads those figures and
// says what they show.
// ===============================
(function () {
  const { money, moneyCompact, percent, count, COLOR, daysOverdue } = Viz;
  const TODAY = Shell.TODAY;

  // Charts stay readable; the tables and the export carry the full list.
  const BREAKDOWN_CAP = 12;
  const CONCENTRATION_CAP = 15;
  const TOP_N = 5; // deals counted in the concentration finding

  // A rate computed over a trivial amount is noise, not a finding: one unpaid
  // 500-rupee row would otherwise crown a "weakest batch". A group has to
  // carry at least this share of everything expected before it can be named.
  const MATERIAL_SHARE = 0.02;

  let ageingTable = null;
  let riskTable = null;

  const owing = (items) =>
    Shell.riskRows(items)
      .filter((deal) => deal.pending > 0)
      .sort((a, b) => b.pending - a.pending);

  const share = (part, whole) => (whole > 0 ? part / whole : 0);

  // The month the range is being read in. A month after this one holds money
  // that simply has not come due.
  const CURRENT_MONTH = TODAY.slice(0, 7);

  // ===============================
  // A collection RATE is only meaningful over money that has actually fallen
  // due. Rate it over everything and a batch whose instalments are all months
  // away reads as a 0% catastrophe, when nothing has gone wrong at all — the
  // bill just hasn't landed. So every "collects worst / collects best"
  // comparison on this page runs over come-due money only.
  //
  // Undated money (full payments) is excluded for the same reason: it has no
  // deadline to have missed. It is still chased everywhere else on the page —
  // the KPIs, the tables and the export all carry it — and the panel names its
  // weight in its own finding.
  // ===============================
  const hasComeDue = (item) => Boolean(item.expectedDate) && item.expectedDate <= TODAY;

  // ===============================
  // The findings.
  //
  // Each returns a sentence or nothing. A finding that cannot be supported by
  // the rows in view is omitted rather than softened into "no data" — an
  // empty line teaches the reader to skim past the panel.
  // ===============================
  function observations({ items, totals, months, payload }) {
    const out = [];
    const add = (tone, text) => text && out.push({ tone, text });
    const caveats = payload || {};

    if (items.length === 0) return out;

    // --- headline ---
    const shortfall = totals.expected - totals.paid;
    add(
      totals.rate >= 0.9 ? "good" : totals.rate >= 0.7 ? "warn" : "bad",
      shortfall <= 0
        ? `Everything expected in view has been collected — ${money(
            totals.expected
          )} across ${count(totals.deals)} deal(s), with nothing outstanding.`
        : `${percent(totals.rate)} of the ${money(
            totals.expected
          )} expected in view has been collected, leaving ${money(
            shortfall
          )} outstanding across ${count(totals.pendingDeals)} deal(s).`
    );

    // --- how much of the pending money is already late ---
    if (totals.pending > 0) {
      const lateShare = share(totals.overdue, totals.pending);
      add(
        lateShare >= 0.5 ? "bad" : lateShare > 0 ? "warn" : "good",
        totals.overdue > 0
          ? `${money(totals.overdue)} of the ${money(totals.pending)} pending — ${percent(
              lateShare
            )} of it — is already past due, spread over ${count(totals.overdueDeals)} deal(s).`
          : `Nothing pending is past due yet: all ${money(totals.pending)} outstanding falls due later.`
      );
    }

    // --- the oldest money ---
    const ageing = Shell.ageingRows(items).filter((row) => row.amount > 0);
    const oldest = ageing
      .filter((row) => row.key !== "future" && row.key !== "no-due-date")
      .sort((a, b) => b.maxDays - a.maxDays)[0];
    if (oldest) {
      add(
        oldest.maxDays > 90 ? "bad" : "warn",
        `The oldest unpaid money is ${count(oldest.maxDays)} days past due. The "${
          oldest.label
        }" bucket alone holds ${money(oldest.amount)} across ${count(oldest.payments)} payment(s).`
      );
    }

    // --- concentration ---
    const deals = owing(items);
    if (deals.length > TOP_N) {
      const top = deals.slice(0, TOP_N);
      const topSum = top.reduce((acc, d) => acc + d.pending, 0);
      const topShare = share(topSum, totals.pending);
      add(
        topShare >= 0.5 ? "warn" : "neutral",
        `The ${TOP_N} largest debtors carry ${money(topSum)} — ${percent(
          topShare
        )} of everything pending — out of ${count(deals.length)} deal(s) still owing. The largest alone is ${
          top[0].label
        } at ${money(top[0].pending)}.`
      );
    } else if (deals.length > 0) {
      add(
        "neutral",
        `${count(deals.length)} deal(s) still owe money. The largest is ${deals[0].label} at ${money(
          deals[0].pending
        )}.`
      );
    }

    // --- weakest and strongest dimension, on money already due ---
    const due = items.filter(hasComeDue);
    const dueExpected = due.reduce((acc, item) => acc + item.amount, 0);
    for (const dim of [
      { label: "batch", keyOf: (i) => i.batch },
      { label: "deal owner", keyOf: (i) => i.dealOwner },
      { label: "payment type", keyOf: (i) => i.paymentType },
    ]) {
      const groups = Shell.aggregate(due, dim.keyOf).filter(
        (g) => g.total > 0 && share(g.total, dueExpected) >= MATERIAL_SHARE
      );
      if (groups.length < 2) continue;
      const ranked = groups.slice().sort((a, b) => a.rate - b.rate);
      const worst = ranked[0];
      const best = ranked[ranked.length - 1];
      // Near-identical rates across the board is not a comparison worth
      // printing — it would read as a gap where there isn't one.
      if (best.rate - worst.rate < 0.05) continue;
      add(
        worst.rate < 0.5 ? "bad" : "warn",
        `On money already due, "${worst.label}" is the weakest ${dim.label} at ${percent(
          worst.rate
        )} collected (${money(worst.pending)} unpaid of ${money(
          worst.total
        )} due), against "${best.label}" at ${percent(best.rate)}.`
      );
    }

    // --- the month axis ---
    // Months after the current one hold money that has not come due; ranking
    // them by collection rate would put a future month at the bottom of the
    // table every time.
    const trend = Shell.trendRows(items, months).filter(
      (row) => row.expected > 0 && row.key <= CURRENT_MONTH
    );
    if (trend.length >= 2) {
      const ranked = trend.slice().sort((a, b) => a.rate - b.rate);
      const worstMonth = ranked[0];
      const bestMonth = ranked[ranked.length - 1];
      // "worst at 100% and best at 100%" is a comparison of nothing. Same
      // guard as the dimension rankings above.
      if (bestMonth.rate - worstMonth.rate >= 0.05) {
        add(
          "neutral",
          `Across ${count(trend.length)} month(s) that have come due, ${
            worstMonth.label
          } collected worst at ${percent(worstMonth.rate)} and ${
            bestMonth.label
          } best at ${percent(bestMonth.rate)}.`
        );
      }

      // Momentum: the last two months that actually had money due, which are
      // not necessarily the last two months on the axis.
      const prev = trend[trend.length - 2];
      const last = trend[trend.length - 1];
      const delta = last.rate - prev.rate;
      if (Math.abs(delta) >= 0.05) {
        add(
          delta > 0 ? "good" : "warn",
          `Momentum is ${delta > 0 ? "up" : "down"}: ${last.label} collected ${percent(
            last.rate
          )} against ${prev.label} at ${percent(prev.rate)}, a swing of ${percent(Math.abs(delta))}.`
        );
      }
    }

    // --- the single biggest unpaid payment ---
    const biggest = items
      .filter((item) => !item.paid)
      .sort((a, b) => b.amount - a.amount)[0];
    if (biggest) {
      const when = Shell.isOverdue(biggest)
        ? `, ${count(daysOverdue(biggest.expectedDate, TODAY))} days past due`
        : biggest.expectedDate
        ? `, due ${biggest.expectedDate}`
        : ", with no due date in CRM";
      add(
        "neutral",
        `The single largest unpaid payment is ${money(biggest.amount)} — ${
          biggest.component
        } for ${biggest.dealName}${when}.`
      );
    }

    // --- money the month axis cannot hold ---
    // Read from the payload, not from `items`: these are range-level facts and
    // they must not appear to shrink as filters narrow the view. The export
    // passes no payload, so each one is guarded.
    if (caveats.noDueDate && caveats.noDueDate.pendingAmount > 0) {
      add(
        "warn",
        `${money(
          caveats.noDueDate.pendingAmount
        )} of pending money is on full payments, which carry no due date in CRM. It is chaseable but can never be called late or placed in a month.`
      );
    }

    // --- data quality, straight from the payload ---
    if (caveats.invalidDates && caveats.invalidDates.count > 0) {
      add(
        "bad",
        `${count(caveats.invalidDates.count)} payment(s) worth ${money(
          caveats.invalidDates.amount
        )} have a due date CRM did not return as a real date (e.g. ${caveats.invalidDates.samples.join(
          ", "
        )}) and are excluded from every figure here.`
      );
    }
    if (caveats.undated && caveats.undated.count > 0) {
      add(
        "warn",
        `${count(caveats.undated.count)} payment(s) worth ${money(
          caveats.undated.amount
        )} should have a due date in CRM but have none, and are excluded.`
      );
    }
    if (caveats.unrecognisedDeals > 0) {
      add(
        "warn",
        `${count(
          caveats.unrecognisedDeals
        )} Closed Won deal(s) have an unrecognised Payment Type, so they contribute no scheduled payments at all.`
      );
    }

    return out;
  }

  function renderObservations(findings) {
    const list = document.getElementById("observations");
    const counter = document.getElementById("findingCount");
    list.textContent = "";
    counter.textContent = findings.length ? `${findings.length} observation(s)` : "";

    if (findings.length === 0) {
      const li = document.createElement("li");
      li.className = "finding tone-neutral";
      li.textContent = "No payments match the current filters, so there is nothing to read.";
      list.appendChild(li);
      return;
    }

    for (const finding of findings) {
      const li = document.createElement("li");
      li.className = `finding tone-${finding.tone}`;
      // textContent throughout: every one of these sentences has a CRM deal
      // name, batch or owner spliced into it.
      li.textContent = finding.text;
      list.appendChild(li);
    }
  }

  // A stacked collected/pending breakdown — the same shape three times over.
  function breakdown(elId, items, keyOf, filterKey, plural, setFilter) {
    const groups = Shell.aggregate(items, keyOf).sort((a, b) => b.total - a.total);
    const el = document.getElementById(elId);
    const shown = groups.slice(0, BREAKDOWN_CAP);
    Viz.bars(el, {
      rows: shown.map(Shell.splitRow),
      trailing: Shell.splitTrailing,
      tooltip: Shell.splitTooltip,
      onSelect: (row) => setFilter(filterKey, row.key),
      emptyText: "No payments match the current filters.",
    });
    Shell.capNote(el, shown.length, groups.length, plural);
    return groups;
  }

  Shell.start({
    nav: "insights",
    title: "Insights",
    exportName: "insights",

    meta: (totals) => ({ value: percent(totals.rate), label: "collected" }),

    kpis(totals, items, months) {
      const deals = owing(items);
      // Come-due months only: a future month sitting at 0% collected is not a
      // performance figure, it is a bill that has not landed.
      const trend = Shell.trendRows(items, months).filter(
        (r) => r.expected > 0 && r.key <= CURRENT_MONTH
      );
      const last = trend[trend.length - 1];
      const topSum = deals.slice(0, TOP_N).reduce((acc, d) => acc + d.pending, 0);
      const worstAge = Shell.ageingRows(items)
        .filter((row) => row.amount > 0 && row.key !== "future" && row.key !== "no-due-date")
        .sort((a, b) => b.maxDays - a.maxDays)[0];

      return [
        {
          label: "Expected in view",
          value: moneyCompact(totals.expected),
          sub: `${count(totals.payments)} payment(s)`,
        },
        { label: "Collected", value: moneyCompact(totals.paid), sub: percent(totals.rate), accent: "paid" },
        {
          label: "Pending",
          value: moneyCompact(totals.pending),
          sub: `${count(totals.pendingCount)} payment(s)`,
          accent: "pending",
        },
        {
          label: "Pending & past due",
          value: moneyCompact(totals.overdue),
          sub: `${count(totals.overdueDeals)} deal(s)`,
          accent: "overdue",
        },
        {
          label: "Oldest debt",
          value: worstAge ? `${count(worstAge.maxDays)} days` : "—",
          sub: worstAge ? "past due" : "nothing past due",
        },
        {
          label: `Top ${TOP_N} concentration`,
          value: totals.pending > 0 ? percent(share(topSum, totals.pending)) : "—",
          sub: `of pending · ${count(deals.length)} deal(s) owe`,
        },
        {
          label: "Latest due month",
          value: last ? percent(last.rate) : "—",
          sub: last ? `${last.label} · collected` : "nothing due yet",
        },
        { label: "Deals in view", value: count(totals.deals), sub: `${count(totals.pendingDeals)} still owe` },
      ];
    },

    render({ items, totals, months, payload, setFilter }) {
      renderObservations(observations({ items, totals, months, payload }));

      // --- trend ---
      const trend = Shell.trendRows(items, months);
      Viz.lines(document.getElementById("trendChart"), {
        labels: trend.map((r) => r.label),
        series: [
          {
            name: "Expected to date",
            color: COLOR.muted,
            values: trend.map((r) => r.cumExpected),
            dashed: true,
          },
          { name: "Collected to date", color: COLOR.paid, values: trend.map((r) => r.cumCollected) },
        ],
        foot: (i) => `Shortfall ${moneyCompact(trend[i].shortfall)}`,
        emptyText: "No months in the loaded range.",
      });

      Viz.bars(document.getElementById("monthChart"), {
        rows: trend.map((row) => ({
          key: row.key,
          label: row.label,
          total: row.expected,
          segments: [
            { name: "Collected", value: row.collected, color: COLOR.paid },
            { name: "Pending", value: row.pending, color: COLOR.pending },
          ],
          row,
        })),
        trailing: (r) => `${moneyCompact(r.total)} · ${percent(r.row.rate)}`,
        tooltip: (r) => ({
          title: r.label,
          rows: [
            { name: "Collected", value: money(r.row.collected), color: COLOR.paid },
            { name: "Pending", value: money(r.row.pending), color: COLOR.pending },
          ],
          foot: `${count(r.row.payments)} payment(s) · ${percent(r.row.rate)} collected`,
        }),
        emptyText: "No months in the loaded range.",
      });

      // --- ageing ---
      const ageing = Shell.ageingRows(items);
      Viz.bars(document.getElementById("ageingChart"), {
        rows: ageing.map((row) => ({
          key: row.key,
          label: row.label,
          total: row.amount,
          segments: [{ name: row.label, value: row.amount, color: row.color }],
          row,
        })),
        trailing: (r) => `${moneyCompact(r.total)} · ${count(r.row.payments)} pmt`,
        tooltip: (r) => ({
          title: r.label,
          rows: [{ name: "Pending", value: money(r.row.amount), color: r.row.color }],
          foot: `${count(r.row.payments)} payment(s) · ${count(r.row.deals)} deal(s)${
            r.row.oldest ? ` · oldest due ${r.row.oldest}` : ""
          }`,
        }),
        emptyText: "Nothing is pending in the current view.",
      });

      if (!ageingTable) {
        ageingTable = new Viz.DataTable(
          document.getElementById("ageingTable"),
          [
            {
              key: "label",
              label: "Age",
              type: "text",
              // Sorted by age, never alphabetically — "1–30 days late" must
              // not sort above "Not yet due".
              sortValue: (row) => row.order,
            },
            { key: "amount", label: "Pending", type: "money" },
            { key: "payments", label: "Payments", type: "num" },
            { key: "deals", label: "Deals", type: "num" },
            {
              key: "oldest",
              label: "Oldest due",
              type: "text",
              render: (row) => row.oldest || "—",
              sortValue: (row) => row.oldest || "9999-12-31",
            },
            { key: "maxDays", label: "Days late", type: "num" },
          ],
          {
            sortKey: "label",
            sortDir: "asc",
            emptyText: "Nothing is pending in the current view.",
            footer: (rows) => {
              const sum = (key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);
              return [
                `${rows.length} bucket(s)`,
                money(sum("amount")),
                count(sum("payments")),
                "",
                "",
                "",
              ];
            },
          }
        );
      }
      ageingTable.render(ageing);

      // --- breakdowns ---
      breakdown("batchChart", items, (i) => i.batch, "batch", "batches", setFilter);
      breakdown("ownerChart", items, (i) => i.dealOwner, "owner", "owners", setFilter);
      breakdown("typeChart", items, (i) => i.paymentType, "type", "payment types", setFilter);

      // --- concentration ---
      const deals = owing(items);
      const concEl = document.getElementById("concChart");
      const shown = deals.slice(0, CONCENTRATION_CAP);
      Viz.bars(concEl, {
        rows: shown.map((deal) => ({
          key: deal.__id,
          label: deal.label,
          total: deal.pending,
          segments: [{ name: "Pending", value: deal.pending, color: COLOR.pending }],
          deal,
        })),
        trailing: (row) =>
          row.deal.maxDaysLate > 0
            ? `${moneyCompact(row.total)} · ${count(row.deal.maxDaysLate)}d late`
            : moneyCompact(row.total),
        tooltip: (row) => ({
          title: row.label,
          rows: [
            { name: "Pending", value: money(row.deal.pending), color: COLOR.pending },
            { name: "Collected", value: money(row.deal.collected), color: COLOR.paid },
          ],
          foot: `${row.deal.dealOwner || "no owner"} · ${row.deal.batch || "no batch"}${
            row.deal.earliestDue ? ` · earliest due ${row.deal.earliestDue}` : ""
          }`,
        }),
        onSelect: (row) => Shell.openDetail(row.deal),
        emptyText: "Nothing is pending in the current view.",
      });
      Shell.capNote(concEl, shown.length, deals.length, "deals still owing");

      // --- the chase list ---
      if (!riskTable) {
        riskTable = new Viz.DataTable(
          document.getElementById("riskTable"),
          [
            { key: "label", label: "Deal", type: "text" },
            { key: "batch", label: "Batch", type: "text" },
            { key: "dealOwner", label: "Owner", type: "text" },
            { key: "paymentType", label: "Payment type", type: "text" },
            { key: "scheduled", label: "Expected", type: "money" },
            { key: "collected", label: "Collected", type: "money" },
            { key: "pending", label: "Pending", type: "money" },
            { key: "overdue", label: "Past due", type: "money" },
            { key: "maxDaysLate", label: "Days late", type: "num" },
            {
              key: "earliestDue",
              label: "Earliest due",
              type: "text",
              // Blank for a deal whose only pending money is a full payment —
              // it has no due date, so there is no earliest one.
              render: (row) => row.earliestDue || "—",
              sortValue: (row) => row.earliestDue || "9999-12-31",
            },
          ],
          {
            sortKey: "pending",
            sortDir: "desc",
            emptyText: "No deals match the current filters.",
            onRowClick: (row) => Shell.openDetail(row),
            footer: (list) => {
              const sum = (key) => list.reduce((acc, r) => acc + (r[key] || 0), 0);
              return [
                `${list.length} deal(s)`,
                "",
                "",
                "",
                money(sum("scheduled")),
                money(sum("collected")),
                money(sum("pending")),
                money(sum("overdue")),
                "",
                "",
              ];
            },
          }
        );
      }
      // Every deal in view, not just those still owing — a deal that has paid
      // up should still be findable by name in the table.
      riskTable.render(Shell.riskRows(items));
    },

    sheets: ({ items, months, totals }) => {
      const trend = Shell.trendRows(items, months);
      // The workbook carries the same sentences the page shows. The range-level
      // caveats are deliberately left out here — they describe the whole
      // fetched range, not the filtered rows being exported, and the status
      // line above the dashboard already states them.
      const findings = observations({ items, totals, months, payload: null });

      return [
        {
          name: "Summary",
          columns: [
            { header: "Measure", key: "measure", type: "text", width: 30 },
            { header: "Value", key: "value", type: "text", width: 22 },
          ],
          rows: [
            { measure: "Expected in view", value: money(totals.expected) },
            { measure: "Collected", value: money(totals.paid) },
            { measure: "Pending", value: money(totals.pending) },
            { measure: "Pending & past due", value: money(totals.overdue) },
            { measure: "Collection rate", value: percent(totals.rate) },
            { measure: "Payments in view", value: count(totals.payments) },
            { measure: "Deals in view", value: count(totals.deals) },
            { measure: "Deals still owing", value: count(totals.pendingDeals) },
            { measure: "Longest overdue (days)", value: count(totals.maxDaysLate) },
            { measure: "Report run", value: TODAY },
          ],
        },
        {
          name: "What stands out",
          columns: [{ header: "Observation", key: "text", type: "text", width: 110 }],
          rows: findings,
        },
        {
          name: "Monthly",
          columns: [
            { header: "Month", key: "label", type: "text", width: 16 },
            { header: "Expected", key: "expected", type: "money", width: 16 },
            { header: "Collected", key: "collected", type: "money", width: 16 },
            { header: "Pending", key: "pending", type: "money", width: 16 },
            { header: "Past Due", key: "overdue", type: "money", width: 16 },
            { header: "Payments", key: "payments", type: "number", width: 12 },
            { header: "Collected %", key: "ratePct", type: "number", width: 13 },
            { header: "Cumulative Expected", key: "cumExpected", type: "money", width: 20 },
            { header: "Cumulative Collected", key: "cumCollected", type: "money", width: 20 },
            { header: "Shortfall", key: "shortfall", type: "money", width: 16 },
          ],
          rows: trend.map((row) => ({ ...row, ratePct: row.rate * 100 })),
        },
        {
          name: "Ageing",
          columns: [
            { header: "Age", key: "label", type: "text", width: 20 },
            { header: "Pending", key: "amount", type: "money", width: 16 },
            { header: "Payments", key: "payments", type: "number", width: 12 },
            { header: "Deals", key: "deals", type: "number", width: 10 },
            { header: "Oldest Due", key: "oldest", type: "date", width: 13 },
            { header: "Days Late", key: "maxDays", type: "number", width: 12 },
          ],
          rows: Shell.ageingRows(items),
        },
        Shell.breakdownSheet("Batch", Shell.aggregate(items, (i) => i.batch), "By batch"),
        Shell.breakdownSheet("Deal Owner", Shell.aggregate(items, (i) => i.dealOwner), "By owner"),
        Shell.breakdownSheet(
          "Payment Type",
          Shell.aggregate(items, (i) => i.paymentType),
          "By payment type"
        ),
        {
          name: "Deals still owing",
          columns: [
            { header: "Deal Name", key: "label", type: "text", width: 26 },
            { header: "Batch", key: "batch", type: "text", width: 14 },
            { header: "Deal Owner", key: "dealOwner", type: "text", width: 18 },
            { header: "Payment Type", key: "paymentType", type: "text", width: 22 },
            { header: "Expected", key: "scheduled", type: "money", width: 15 },
            { header: "Collected", key: "collected", type: "money", width: 15 },
            { header: "Pending", key: "pending", type: "money", width: 15 },
            { header: "Past Due", key: "overdue", type: "money", width: 15 },
            { header: "Days Late", key: "maxDaysLate", type: "number", width: 12 },
            { header: "Earliest Due", key: "earliestDue", type: "date", width: 13 },
            { header: "Email", key: "email", type: "text", width: 28 },
            { header: "Phone", key: "phone", type: "text", width: 15 },
          ],
          rows: owing(items),
        },
        {
          name: "All payments",
          columns: [
            { header: "Deal Name", key: "dealName", type: "text", width: 26 },
            { header: "Payment", key: "component", type: "text", width: 14 },
            { header: "Due Date", key: "expectedDate", type: "date", width: 12 },
            { header: "Status", key: "statusText", type: "text", width: 12 },
            { header: "Days Overdue", key: "overdueDays", type: "number", width: 13 },
            { header: "Amount", key: "amount", type: "money", width: 14 },
            { header: "Batch", key: "batch", type: "text", width: 14 },
            { header: "Deal Owner", key: "dealOwner", type: "text", width: 18 },
            { header: "Payment Type", key: "paymentType", type: "text", width: 22 },
            { header: "Email", key: "email", type: "text", width: 28 },
            { header: "Phone", key: "phone", type: "text", width: 15 },
          ],
          rows: items.map((item) => ({
            ...item,
            statusText: item.paid ? "Collected" : "Pending",
            overdueDays: daysOverdue(item.expectedDate, TODAY),
          })),
        },
      ];
    },
  });
})();
