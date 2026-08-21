// Ageing & Overdue — how old the unpaid money is.
(function () {
  const { money, moneyCompact, percent, count, daysOverdue } = Viz;
  const TODAY = Shell.TODAY;

  let bucketTable = null;
  let oldestTable = null;

  // The chase list: unpaid payments, longest overdue first.
  const OLDEST_CAP = 50;

  function unpaidRows(items) {
    return items
      .filter((item) => !item.paid)
      .map((item) => ({
        ...item,
        daysLate: daysOverdue(item.expectedDate, TODAY),
        bucket: (Shell.bucketOf(item) || {}).label || "",
      }))
      .sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount);
  }

  Shell.start({
    nav: "ageing",
    title: "Ageing & overdue",
    exportName: "ageing",

    meta: (totals) => ({ value: moneyCompact(totals.overdue), label: "past due" }),

    kpis(totals, items) {
      const buckets = Shell.ageingRows(items);
      const worst = buckets[buckets.length - 1]; // over 90 days
      return [
        { label: "Pending", value: moneyCompact(totals.pending), sub: `${count(totals.pendingCount)} payment(s)`, accent: "pending" },
        { label: "Pending & past due", value: moneyCompact(totals.overdue), sub: `as at ${TODAY}`, accent: "overdue" },
        {
          label: "Share past due",
          value: percent(totals.pending > 0 ? totals.overdue / totals.pending : 0),
          sub: "of pending money",
        },
        { label: "Over 90 days late", value: moneyCompact(worst.amount), sub: `${count(worst.payments)} payment(s)`, accent: "overdue" },
        { label: "Worst days late", value: totals.maxDaysLate > 0 ? count(totals.maxDaysLate) : "—", sub: "single payment" },
        { label: "Deals past due", value: count(totals.overdueDeals), sub: `of ${count(totals.deals)} in view` },
      ];
    },

    render({ items }) {
      const buckets = Shell.ageingRows(items);
      const pendingTotal = buckets.reduce((acc, b) => acc + b.amount, 0);
      const chartEl = document.getElementById("ageingChart");

      Viz.bars(chartEl, {
        rows:
          pendingTotal === 0
            ? []
            : buckets.map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                total: bucket.amount,
                segments: [{ name: bucket.label, value: bucket.amount, color: bucket.color }],
                bucket,
              })),
        trailing: (row) =>
          `${moneyCompact(row.total)} · ${percent(pendingTotal > 0 ? row.total / pendingTotal : 0)}`,
        tooltip: (row) => ({
          title: row.label,
          rows: [{ name: "Pending", value: money(row.total), color: row.bucket.color }],
          foot: row.bucket.payments
            ? `${count(row.bucket.payments)} payment(s) · ${count(row.bucket.deals)} deal(s)${
                row.bucket.oldest ? ` · oldest due ${row.bucket.oldest}` : ""
              }`
            : "Nothing in this bucket",
        }),
        emptyText:
          "Nothing is pending in the current view — every scheduled payment is ticked as paid.",
      });

      const withShare = buckets.map((bucket) => ({
        ...bucket,
        share: pendingTotal > 0 ? bucket.amount / pendingTotal : 0,
      }));

      if (!bucketTable) {
        bucketTable = new Viz.DataTable(
          document.getElementById("ageingTable"),
          [
            { key: "order", label: "Bucket", type: "text", render: (row) => row.label },
            { key: "amount", label: "Pending", type: "money" },
            { key: "share", label: "Share of pending", type: "percent" },
            { key: "payments", label: "Payments", type: "num" },
            { key: "deals", label: "Deals", type: "num" },
            { key: "maxDays", label: "Worst days late", type: "num" },
            {
              key: "oldest",
              label: "Oldest due date",
              type: "text",
              render: (row) => row.oldest || "—",
            },
          ],
          {
            sortKey: "order",
            sortDir: "asc",
            emptyText: "Nothing pending in the current view.",
            footer: (list) => [
              "Total pending",
              money(list.reduce((acc, r) => acc + r.amount, 0)),
              percent(1),
              count(list.reduce((acc, r) => acc + r.payments, 0)),
              "",
              "",
              "",
            ],
          }
        );
      }
      bucketTable.render(withShare);

      const overdue = unpaidRows(items).filter((row) => row.daysLate > 0);
      const shown = overdue.slice(0, OLDEST_CAP);

      if (!oldestTable) {
        oldestTable = new Viz.DataTable(
          document.getElementById("oldestTable"),
          [
            { key: "dealName", label: "Deal", type: "text" },
            { key: "component", label: "Payment", type: "text" },
            {
              key: "expectedDate",
              label: "Due date",
              type: "text",
              render: (row) => row.expectedDate || "—",
              sortValue: (row) => row.expectedDate || "9999-12-31",
            },
            {
              key: "daysLate",
              label: "Days late",
              type: "num",
              render: (row) => (row.expectedDate ? count(row.daysLate) : "—"),
            },
            { key: "amount", label: "Pending", type: "money" },
            { key: "bucket", label: "Bucket", type: "text" },
            { key: "batch", label: "Batch", type: "text" },
            { key: "dealOwner", label: "Owner", type: "text" },
            { key: "email", label: "Email", type: "text" },
            { key: "phone", label: "Phone", type: "text" },
          ],
          {
            sortKey: "daysLate",
            sortDir: "desc",
            emptyText: "Nothing is past due in the current view.",
            footer: (list) => [
              `${list.length} payment(s)`,
              "", "", "",
              money(list.reduce((acc, r) => acc + r.amount, 0)),
              "", "", "", "", "",
            ],
          }
        );
      }
      oldestTable.render(shown);

      // Never cap silently.
      const note = document.getElementById("oldestNote");
      if (note) note.remove();
      if (overdue.length > shown.length) {
        const p = document.createElement("p");
        p.id = "oldestNote";
        p.className = "card-note";
        p.textContent = `Showing the ${shown.length} longest overdue of ${overdue.length} past-due payment(s) — the Excel export carries them all.`;
        document.getElementById("oldestTable").closest(".card").appendChild(p);
      }
    },

    sheets({ items }) {
      const buckets = Shell.ageingRows(items);
      const total = buckets.reduce((acc, b) => acc + b.amount, 0);
      return [
        {
          name: "Ageing",
          columns: [
            { header: "Bucket", key: "label", type: "text", width: 22 },
            { header: "Pending", key: "amount", type: "money", width: 16 },
            { header: "Share of pending %", key: "share", type: "number", width: 18 },
            { header: "Payments", key: "payments", type: "number", width: 12 },
            { header: "Deals", key: "deals", type: "number", width: 10 },
            { header: "Worst days late", key: "maxDays", type: "number", width: 16 },
            { header: "Oldest due date", key: "oldest", type: "date", width: 16 },
          ],
          rows: buckets.map((b) => ({
            ...b,
            share: total > 0 ? (b.amount / total) * 100 : 0,
          })),
        },
        {
          name: "Unpaid detail",
          columns: [
            { header: "Deal Name", key: "dealName", type: "text", width: 26 },
            { header: "Payment", key: "component", type: "text", width: 14 },
            { header: "Due Date", key: "expectedDate", type: "date", width: 12 },
            { header: "Days Late", key: "daysLate", type: "number", width: 12 },
            { header: "Pending", key: "amount", type: "money", width: 15 },
            { header: "Bucket", key: "bucket", type: "text", width: 20 },
            { header: "Batch", key: "batch", type: "text", width: 14 },
            { header: "Deal Owner", key: "dealOwner", type: "text", width: 18 },
            { header: "Email", key: "email", type: "text", width: 28 },
            { header: "Phone", key: "phone", type: "text", width: 15 },
          ],
          rows: unpaidRows(items),
        },
      ];
    },
  });
})();
