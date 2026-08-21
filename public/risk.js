// At-Risk Deals — the chase list, deal by deal.
(function () {
  const { money, moneyCompact, count, COLOR, daysOverdue } = Viz;
  const TODAY = Shell.TODAY;

  let table = null;
  const CHART_CAP = 15;

  const owing = (items) =>
    Shell.riskRows(items)
      .filter((deal) => deal.pending > 0)
      .sort((a, b) => b.pending - a.pending);

  Shell.start({
    nav: "risk",
    title: "At-risk deals",
    exportName: "at-risk-deals",

    meta: (totals) => ({ value: moneyCompact(totals.pending), label: "pending" }),

    kpis(totals, items) {
      const deals = owing(items);
      const biggest = deals[0];
      const latest = deals.slice().sort((a, b) => b.maxDaysLate - a.maxDaysLate)[0];
      const average = deals.length > 0 ? totals.pending / deals.length : 0;
      return [
        { label: "Deals still owing", value: count(deals.length), sub: `of ${count(totals.deals)} in view` },
        { label: "Pending", value: moneyCompact(totals.pending), sub: `${count(totals.pendingCount)} payment(s)`, accent: "pending" },
        { label: "Pending & past due", value: moneyCompact(totals.overdue), sub: `${count(totals.overdueDeals)} deal(s)`, accent: "overdue" },
        {
          label: "Largest exposure",
          value: biggest ? moneyCompact(biggest.pending) : "—",
          sub: biggest ? biggest.label : "nothing pending",
        },
        {
          label: "Longest overdue",
          value: latest && latest.maxDaysLate > 0 ? `${count(latest.maxDaysLate)} days` : "—",
          sub: latest && latest.maxDaysLate > 0 ? latest.label : "nothing past due",
        },
        { label: "Average per deal", value: moneyCompact(average), sub: "of the deals still owing" },
      ];
    },

    render({ items, setFilter }) {
      const deals = owing(items);
      const chartEl = document.getElementById("riskChart");
      const shown = deals.slice(0, CHART_CAP);

      Viz.bars(chartEl, {
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
        onSelect: (row) => setFilter("q", row.label),
        emptyText: "Nothing is pending in the current view.",
      });

      Shell.capNote(chartEl, shown.length, deals.length, "deals still owing");

      if (!table) {
        table = new Viz.DataTable(
          document.getElementById("riskTable"),
          [
            { key: "label", label: "Deal", type: "text" },
            { key: "batch", label: "Batch", type: "text" },
            { key: "dealOwner", label: "Owner", type: "text" },
            { key: "paymentType", label: "Payment type", type: "text" },
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
            { key: "collected", label: "Collected", type: "money" },
            { key: "email", label: "Email", type: "text" },
            { key: "phone", label: "Phone", type: "text" },
          ],
          {
            sortKey: "pending",
            sortDir: "desc",
            emptyText: "No deals match the current filters.",
            subRows: (deal) =>
              deal.payments
                .slice()
                .sort((a, b) =>
                  // Undated last: a full payment has no due date, so it can't
                  // lead a list ordered by when the money was due.
                  (a.expectedDate || "9999-12-31").localeCompare(
                    b.expectedDate || "9999-12-31"
                  )
                )
                .map((item) => ({
                  cells: [
                    item.component,
                    item.expectedDate || "— no due date",
                    item.paid
                      ? "Collected"
                      : Shell.isOverdue(item)
                      ? `Pending · ${daysOverdue(item.expectedDate, TODAY)} days late`
                      : "Pending",
                    "",
                    item.paid ? "" : money(item.amount),
                    "", "", "",
                    item.paid ? money(item.amount) : "",
                    "", "",
                  ],
                })),
            footer: (list) => {
              const sum = (key) => list.reduce((acc, r) => acc + (r[key] || 0), 0);
              return [
                `${list.length} deal(s)`,
                "", "", "",
                money(sum("pending")),
                money(sum("overdue")),
                "", "",
                money(sum("collected")),
                "", "",
              ];
            },
          }
        );
      }
      // Every deal in view, not just the ones still owing — a deal that has
      // paid up should still be findable by name in the table.
      table.render(Shell.riskRows(items));
    },

    sheets: ({ items }) => [
      {
        name: "At risk deals",
        columns: [
          { header: "Deal Name", key: "label", type: "text", width: 26 },
          { header: "Batch", key: "batch", type: "text", width: 14 },
          { header: "Deal Owner", key: "dealOwner", type: "text", width: 18 },
          { header: "Payment Type", key: "paymentType", type: "text", width: 22 },
          { header: "Pending", key: "pending", type: "money", width: 15 },
          { header: "Past Due", key: "overdue", type: "money", width: 15 },
          { header: "Days Late", key: "maxDaysLate", type: "number", width: 12 },
          { header: "Earliest Due", key: "earliestDue", type: "date", width: 13 },
          { header: "Collected", key: "collected", type: "money", width: 15 },
          { header: "Email", key: "email", type: "text", width: 28 },
          { header: "Phone", key: "phone", type: "text", width: 15 },
        ],
        rows: owing(items),
      },
      {
        name: "Pending payments",
        columns: [
          { header: "Deal Name", key: "dealName", type: "text", width: 26 },
          { header: "Payment", key: "component", type: "text", width: 14 },
          { header: "Due Date", key: "expectedDate", type: "date", width: 12 },
          { header: "Days Overdue", key: "overdueDays", type: "number", width: 13 },
          { header: "Amount", key: "amount", type: "money", width: 14 },
          { header: "Batch", key: "batch", type: "text", width: 14 },
          { header: "Deal Owner", key: "dealOwner", type: "text", width: 18 },
          { header: "Email", key: "email", type: "text", width: 28 },
          { header: "Phone", key: "phone", type: "text", width: 15 },
        ],
        rows: items
          .filter((item) => !item.paid)
          .map((item) => ({ ...item, overdueDays: daysOverdue(item.expectedDate, TODAY) }))
          .sort((a, b) =>
            (a.expectedDate || "9999-12-31").localeCompare(
              b.expectedDate || "9999-12-31"
            )
          ),
      },
    ],
  });
})();
