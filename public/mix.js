// Payment Mix — the same money cut by payment type and by component.
(function () {
  const { money, moneyCompact, percent, count } = Viz;

  let componentTable = null;
  let typeTable = null;

  const byType = (items) =>
    Shell.aggregate(items, (item) => item.paymentType, "— no payment type —").sort(
      (a, b) => b.total - a.total
    );
  const byComponent = (items) =>
    Shell.aggregate(items, (item) => item.component).sort((a, b) => b.total - a.total);

  Shell.start({
    nav: "mix",
    title: "Payment mix",
    exportName: "payment-mix",

    meta: (totals) => ({ value: moneyCompact(totals.expected), label: "expected" }),

    kpis(totals, items) {
      const types = byType(items);
      const best = types.filter((t) => t.total > 0).sort((a, b) => b.rate - a.rate)[0];
      const biggest = types[0];
      const average = totals.payments > 0 ? totals.expected / totals.payments : 0;
      return [
        { label: "Expected", value: moneyCompact(totals.expected), sub: `${count(totals.payments)} payment(s)` },
        { label: "Collected", value: moneyCompact(totals.paid), sub: percent(totals.rate), accent: "paid" },
        { label: "Pending", value: moneyCompact(totals.pending), sub: `${count(totals.pendingCount)} payment(s)`, accent: "pending" },
        {
          label: "Largest type",
          value: biggest ? moneyCompact(biggest.total) : "—",
          sub: biggest ? biggest.label : "nothing in view",
        },
        {
          label: "Best-collecting type",
          value: best ? percent(best.rate) : "—",
          sub: best ? best.label : "nothing in view",
        },
        { label: "Average payment", value: moneyCompact(average), sub: "per scheduled payment" },
      ];
    },

    render({ items, setFilter }) {
      const types = byType(items);
      const components = byComponent(items);

      Viz.bars(document.getElementById("typeChart"), {
        rows: types.map(Shell.splitRow),
        trailing: Shell.splitTrailing,
        tooltip: Shell.splitTooltip,
        onSelect: (row) => setFilter("type", row.key),
        emptyText: "No payments match the current filters.",
      });

      Viz.bars(document.getElementById("componentChart"), {
        rows: components.map(Shell.splitRow),
        trailing: Shell.splitTrailing,
        tooltip: Shell.splitTooltip,
        emptyText: "No payments match the current filters.",
      });

      const withAverage = (groups) =>
        groups.map((group) => ({
          ...group,
          avgAmount: group.payments > 0 ? group.total / group.payments : 0,
        }));

      const columns = (label) => [
        { key: "label", label, type: "text" },
        { key: "deals", label: "Deals", type: "num" },
        { key: "payments", label: "Payments", type: "num" },
        { key: "total", label: "Expected", type: "money" },
        { key: "paid", label: "Collected", type: "money" },
        { key: "pending", label: "Pending", type: "money" },
        { key: "avgAmount", label: "Average size", type: "money" },
        { key: "rate", label: "Collected %", type: "percent" },
      ];

      const footer = (list) => {
        const sum = (key) => list.reduce((acc, r) => acc + (r[key] || 0), 0);
        const total = sum("total");
        return [
          `${list.length} row(s)`,
          "",
          count(sum("payments")),
          money(total),
          money(sum("paid")),
          money(sum("pending")),
          "",
          percent(total > 0 ? sum("paid") / total : 0),
        ];
      };

      if (!componentTable) {
        componentTable = new Viz.DataTable(
          document.getElementById("componentTable"),
          columns("Component"),
          { sortKey: "total", sortDir: "desc", footer, emptyText: "No payments match the current filters." }
        );
      }
      componentTable.render(withAverage(components));

      if (!typeTable) {
        typeTable = new Viz.DataTable(
          document.getElementById("typeTable"),
          columns("Payment type"),
          { sortKey: "total", sortDir: "desc", footer, emptyText: "No payments match the current filters." }
        );
      }
      typeTable.render(withAverage(types));
    },

    sheets: ({ items }) => [
      Shell.breakdownSheet("Payment type", byType(items), "By type"),
      Shell.breakdownSheet("Component", byComponent(items), "By component"),
    ],
  });
})();
