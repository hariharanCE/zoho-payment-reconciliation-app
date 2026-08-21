// ===============================
// Collections by Deal Owner.
//
// Two questions on one page: how much has each owner collected against what
// they were owed, and — once you have picked an owner — which of their
// customers is carrying the shortfall. Clicking any customer, in the chart or
// the table, opens the shared detail panel.
//
// The batch start date is carried through and shown as a plain CRM field — it
// is never used to filter, bucket or date anything.
// ===============================
(function () {
  const { money, moneyCompact, percent, count } = Viz;

  const OWNER_CHART_CAP = 20;
  const CUSTOMER_CHART_CAP = 15;

  let ownerTable = null;
  let customerTable = null;

  // Customers ranked by what they still owe, then by size — the chase order.
  function customers(items) {
    return Shell.riskRows(items).sort(
      (a, b) => b.pending - a.pending || b.scheduled - a.scheduled
    );
  }

  Shell.start({
    nav: "owner-collections",
    title: "Collections by deal owner",
    exportName: "collections-by-owner",

    meta: (totals) => ({ value: moneyCompact(totals.pending), label: "pending" }),

    kpis(totals, items) {
      const owners = Shell.aggregate(items, (item) => item.dealOwner);
      const heaviest = Shell.largestPending(owners);
      const owing = customers(items).filter((deal) => deal.pending > 0);
      return [
        {
          label: "Owners in view",
          value: count(owners.length),
          sub: `${count(totals.deals)} customer(s)`,
        },
        {
          label: "Collected",
          value: moneyCompact(totals.paid),
          sub: `${count(totals.paidCount)} payment(s)`,
          accent: "paid",
        },
        {
          label: "Pending",
          value: moneyCompact(totals.pending),
          sub: `${count(totals.pendingCount)} payment(s)`,
          accent: "pending",
        },
        {
          label: "Pending & past due",
          value: moneyCompact(totals.overdue),
          sub: `as at ${Shell.TODAY}`,
          accent: "overdue",
        },
        {
          label: "Collection rate",
          value: percent(totals.rate),
          sub: `of ${moneyCompact(totals.expected)} due`,
        },
        {
          label: "Largest book pending",
          value: heaviest ? moneyCompact(heaviest.pending) : "—",
          sub: heaviest ? heaviest.label : "nothing pending",
        },
        {
          label: "Customers still owing",
          value: count(owing.length),
          sub: `of ${count(totals.deals)} in view`,
        },
      ];
    },

    render({ items, filters, setFilter }) {
      // ---- by owner ----
      const owners = Shell.aggregate(items, (item) => item.dealOwner).sort(
        (a, b) => b.total - a.total
      );
      const ownerChart = document.getElementById("ownerChart");
      const shownOwners = owners.slice(0, OWNER_CHART_CAP);

      Viz.bars(ownerChart, {
        rows: shownOwners.map(Shell.splitRow),
        trailing: Shell.splitTrailing,
        tooltip: Shell.splitTooltip,
        onSelect: (row) => setFilter("owner", row.key),
        emptyText: "No payments match the current filters.",
      });
      Shell.capNote(ownerChart, shownOwners.length, owners.length, "owners");

      if (!ownerTable) {
        ownerTable = Shell.breakdownTable(
          document.getElementById("ownerTable"),
          "Deal owner"
        );
      }
      ownerTable.render(owners);

      // ---- by customer ----
      const list = customers(items);
      document.getElementById("customerHeading").textContent = filters.owner
        ? `Customers of ${filters.owner}`
        : "Customers";

      const customerChart = document.getElementById("customerChart");
      // The chart is ordered by deal size, so bar length falls monotonically
      // down the axis and "the N largest" in the cap note is literally true.
      // The table below keeps its own order — most pending first — because
      // that is the order the desk works, not the order the eye reads.
      const shownCustomers = list
        .slice()
        .sort((a, b) => b.scheduled - a.scheduled)
        .slice(0, CUSTOMER_CHART_CAP);

      Viz.bars(customerChart, {
        rows: shownCustomers.map((deal) => ({
          key: deal.__id,
          label: deal.label,
          total: deal.scheduled,
          segments: [
            { name: "Collected", value: deal.collected, color: Viz.COLOR.paid },
            { name: "Pending", value: deal.pending, color: Viz.COLOR.pending },
          ],
          deal,
        })),
        trailing: (row) =>
          `${moneyCompact(row.total)} · ${percent(
            row.total > 0 ? row.deal.collected / row.total : 0
          )}`,
        tooltip: (row) => {
          const deal = row.deal;
          const rows = [
            { name: "Collected", value: money(deal.collected), color: Viz.COLOR.paid },
            { name: "Pending", value: money(deal.pending), color: Viz.COLOR.pending },
          ];
          if (deal.overdue > 0) {
            rows.push({ name: "of which past due", value: money(deal.overdue), color: null });
          }
          return {
            title: deal.label,
            rows,
            foot: `${deal.dealOwner || "no owner"} · ${deal.batch || "no batch"}${
              deal.batchStartDate ? ` · starts ${deal.batchStartDate}` : ""
            } — click to open`,
          };
        },
        // The chart is a way into the record, not just a picture of it.
        onSelect: (row) => Shell.openDetail(row.deal),
        emptyText: "No customers match the current filters.",
      });
      Shell.capNote(customerChart, shownCustomers.length, list.length, "customers");

      if (!customerTable) {
        customerTable = new Viz.DataTable(
          document.getElementById("customerTable"),
          [
            { key: "label", label: "Customer", type: "text" },
            { key: "dealOwner", label: "Deal owner", type: "text" },
            { key: "batch", label: "Batch", type: "text" },
            {
              key: "batchStartDate",
              label: "Batch start",
              type: "text",
              render: (row) => row.batchStartDate || "— not set —",
              // Deals with no start date sort to the end rather than leading
              // the list as if they started at the dawn of time.
              sortValue: (row) => row.batchStartDate || "9999-12-31",
            },
            { key: "scheduled", label: "Scheduled", type: "money" },
            { key: "collected", label: "Collected", type: "money" },
            { key: "pending", label: "Pending", type: "money" },
            { key: "overdue", label: "Past due", type: "money" },
            {
              key: "rate",
              label: "Collected %",
              type: "percent",
              sortValue: (row) => (row.scheduled > 0 ? row.collected / row.scheduled : 0),
              render: (row) =>
                percent(row.scheduled > 0 ? row.collected / row.scheduled : 0),
            },
            { key: "phone", label: "Phone", type: "text" },
          ],
          {
            sortKey: "pending",
            sortDir: "desc",
            emptyText: "No customers match the current filters.",
            rowClass: (row) => (row.overdue > 0 ? "is-overdue" : ""),
            onRowClick: (row) => Shell.openDetail(row),
            footer: (rows) => {
              const sum = (key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);
              const scheduled = sum("scheduled");
              return [
                `${rows.length} customer(s)`,
                "",
                "",
                "",
                money(scheduled),
                money(sum("collected")),
                money(sum("pending")),
                money(sum("overdue")),
                percent(scheduled > 0 ? sum("collected") / scheduled : 0),
                "",
              ];
            },
          }
        );
      }
      customerTable.render(list);
    },

    sheets: ({ items }) => [
      Shell.breakdownSheet(
        "Deal owner",
        Shell.aggregate(items, (item) => item.dealOwner),
        "By owner"
      ),
      {
        name: "Customers",
        columns: [
          { header: "Customer", key: "label", type: "text", width: 26 },
          { header: "Deal Owner", key: "dealOwner", type: "text", width: 18 },
          { header: "Batch", key: "batch", type: "text", width: 14 },
          { header: "Batch Start Date", key: "batchStartDate", type: "date", width: 15 },
          { header: "Payment Type", key: "paymentType", type: "text", width: 22 },
          { header: "Scheduled", key: "scheduled", type: "money", width: 15 },
          { header: "Collected", key: "collected", type: "money", width: 15 },
          { header: "Pending", key: "pending", type: "money", width: 15 },
          { header: "Past Due", key: "overdue", type: "money", width: 15 },
          // A whole percent, not a fraction — a bare 0.63 under a "Collected %"
          // heading reads as two-thirds of one percent in Excel.
          { header: "Collected %", key: "rate", type: "number", width: 13 },
          { header: "Email", key: "email", type: "text", width: 28 },
          { header: "Phone", key: "phone", type: "text", width: 15 },
        ],
        rows: customers(items).map((deal) => ({
          ...deal,
          rate: deal.scheduled > 0 ? (deal.collected / deal.scheduled) * 100 : 0,
        })),
      },
    ],
  });
})();
