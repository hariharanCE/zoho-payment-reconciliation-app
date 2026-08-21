// Owner Performance — the same paid/pending split, per deal owner.
Shell.startBreakdown({
  nav: "owners",
  title: "Owner performance",
  exportName: "owner-performance",
  keyOf: (item) => item.dealOwner,
  filterKey: "owner",
  singular: "Deal owner",
  plural: "owners",
  chart: "ownerChart",
  table: "ownerTable",

  meta: (totals) => ({ value: Viz.moneyCompact(totals.pending), label: "pending" }),

  kpis(totals, items) {
    const groups = Shell.aggregate(items, (item) => item.dealOwner);
    const worst = Shell.weakest(groups);
    const heaviest = Shell.largestPending(groups);
    return [
      { label: "Owners in view", value: Viz.count(groups.length), sub: `${Viz.count(totals.deals)} deal(s)` },
      { label: "Collected", value: Viz.moneyCompact(totals.paid), sub: Viz.percent(totals.rate), accent: "paid" },
      { label: "Pending", value: Viz.moneyCompact(totals.pending), sub: `${Viz.count(totals.pendingDeals)} deal(s) still owe`, accent: "pending" },
      { label: "Pending & past due", value: Viz.moneyCompact(totals.overdue), sub: `as at ${Shell.TODAY}`, accent: "overdue" },
      {
        label: "Largest book",
        value: heaviest ? Viz.moneyCompact(heaviest.pending) : "—",
        sub: heaviest ? heaviest.label : "nothing pending",
      },
      {
        label: "Weakest collection",
        value: worst ? Viz.percent(worst.rate) : "—",
        sub: worst ? worst.label : "no owners in view",
      },
    ];
  },
});
