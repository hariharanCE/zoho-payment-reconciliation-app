// Batch Performance — the same paid/pending split, per batch.
Shell.startBreakdown({
  nav: "batches",
  title: "Batch performance",
  exportName: "batch-performance",
  keyOf: (item) => item.batch,
  filterKey: "batch",
  singular: "Batch",
  plural: "batches",
  chart: "batchChart",
  table: "batchTable",

  meta: (totals) => ({ value: Viz.moneyCompact(totals.pending), label: "pending" }),

  kpis(totals, items) {
    const groups = Shell.aggregate(items, (item) => item.batch);
    const worst = Shell.weakest(groups);
    const heaviest = Shell.largestPending(groups);
    return [
      { label: "Batches in view", value: Viz.count(groups.length), sub: `${Viz.count(totals.deals)} deal(s)` },
      { label: "Expected", value: Viz.moneyCompact(totals.expected), sub: `${Viz.count(totals.payments)} payment(s)` },
      { label: "Collected", value: Viz.moneyCompact(totals.paid), sub: Viz.percent(totals.rate), accent: "paid" },
      { label: "Pending", value: Viz.moneyCompact(totals.pending), sub: `${Viz.count(totals.pendingCount)} payment(s)`, accent: "pending" },
      {
        label: "Heaviest batch",
        value: heaviest ? Viz.moneyCompact(heaviest.pending) : "—",
        sub: heaviest ? heaviest.label : "nothing pending",
        accent: "overdue",
      },
      {
        label: "Weakest collection",
        value: worst ? Viz.percent(worst.rate) : "—",
        sub: worst ? worst.label : "no batches in view",
      },
    ];
  },
});
