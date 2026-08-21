// Collection Trend — the shortfall as it accumulates across the range.
(function () {
  const { money, moneyCompact, percent, count, COLOR } = Viz;

  let table = null;

  Shell.start({
    nav: "trend",
    title: "Collection trend",
    exportName: "collection-trend",

    meta(totals) {
      return { value: moneyCompact(totals.expected - totals.paid), label: "shortfall" };
    },

    kpis(totals, items, months) {
      const rows = Shell.trendRows(items, months);
      const withMoney = rows.filter((r) => r.expected > 0);
      const best = withMoney.slice().sort((a, b) => b.rate - a.rate)[0];
      const worst = withMoney.slice().sort((a, b) => a.rate - b.rate)[0];
      const last = rows[rows.length - 1];
      return [
        { label: "Expected to date", value: moneyCompact(last ? last.cumExpected : 0), sub: `${count(rows.length)} month(s)` },
        { label: "Collected to date", value: moneyCompact(last ? last.cumCollected : 0), sub: percent(totals.rate), accent: "paid" },
        { label: "Shortfall to date", value: moneyCompact(last ? last.shortfall : 0), sub: "expected minus collected", accent: "pending" },
        { label: "Pending & past due", value: moneyCompact(totals.overdue), sub: `as at ${Shell.TODAY}`, accent: "overdue" },
        {
          label: "Best month",
          value: best ? percent(best.rate) : "—",
          sub: best ? best.label : "no money in range",
        },
        {
          label: "Weakest month",
          value: worst ? percent(worst.rate) : "—",
          sub: worst ? worst.label : "no money in range",
        },
      ];
    },

    render({ items, months }) {
      const rows = Shell.trendRows(items, months);

      Viz.lines(document.getElementById("trendChart"), {
        labels: rows.map((r) => r.label),
        series: [
          {
            name: "Expected to date",
            color: COLOR.muted,
            values: rows.map((r) => r.cumExpected),
            dashed: true,
          },
          {
            name: "Collected to date",
            color: COLOR.paid,
            values: rows.map((r) => r.cumCollected),
          },
        ],
        foot: (index) => `Shortfall ${moneyCompact(rows[index].shortfall)}`,
        emptyText: "No months in the loaded range.",
      });

      // The per-month view beside the running one: a month that collected
      // badly is invisible in a cumulative line that only ever goes up.
      Viz.bars(document.getElementById("monthChart"), {
        rows: rows.map((row) => ({
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

      if (!table) {
        table = new Viz.DataTable(
          document.getElementById("trendTable"),
          [
            // Sorted on the yyyy-MM key, never the printed label — "Apr" must
            // not sort above "Jan" in a column of running totals.
            { key: "key", label: "Month", type: "text", render: (row) => row.label },
            { key: "expected", label: "Expected", type: "money" },
            { key: "collected", label: "Collected", type: "money" },
            { key: "pending", label: "Pending", type: "money" },
            { key: "overdue", label: "Past due", type: "money" },
            { key: "rate", label: "Collected %", type: "percent" },
            { key: "cumExpected", label: "Expected to date", type: "money" },
            { key: "cumCollected", label: "Collected to date", type: "money" },
            { key: "shortfall", label: "Shortfall to date", type: "money" },
          ],
          {
            sortKey: "key",
            sortDir: "asc",
            emptyText: "No months in the loaded range.",
            footer: (list) => {
              const sum = (key) => list.reduce((acc, r) => acc + (r[key] || 0), 0);
              const last = list[list.length - 1] || {};
              const expected = sum("expected");
              return [
                "Range total",
                money(expected),
                money(sum("collected")),
                money(sum("pending")),
                money(sum("overdue")),
                percent(expected > 0 ? sum("collected") / expected : 0),
                money(last.cumExpected || 0),
                money(last.cumCollected || 0),
                money(last.shortfall || 0),
              ];
            },
          }
        );
      }
      table.render(rows);
    },

    sheets: ({ items, months }) => [
      {
        name: "Trend",
        columns: [
          { header: "Month", key: "label", type: "text", width: 12 },
          { header: "Expected", key: "expected", type: "money", width: 15 },
          { header: "Collected", key: "collected", type: "money", width: 15 },
          { header: "Pending", key: "pending", type: "money", width: 15 },
          { header: "Past due", key: "overdue", type: "money", width: 15 },
          { header: "Collected %", key: "rate", type: "number", width: 13 },
          { header: "Expected to date", key: "cumExpected", type: "money", width: 18 },
          { header: "Collected to date", key: "cumCollected", type: "money", width: 18 },
          { header: "Shortfall to date", key: "shortfall", type: "money", width: 18 },
        ],
        rows: Shell.trendRows(items, months).map((row) => ({ ...row, rate: row.rate * 100 })),
      },
    ],
  });
})();
