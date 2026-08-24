// ===============================
// Collections dashboard: month-wise paid vs pending.
//
// The chart is hand-rolled SVG — the app has no build step and no chart
// dependency, so this keeps it to the same "plain HTML/CSS/JS" contract as
// the reconciliation page.
// ===============================

// Formatting, the series colours and the SVG helpers all come from the shared
// toolkit, so this page and the insights dashboard print a rupee figure the
// same way and read the same CSS variables for the series colours — the chart,
// the legend and the table swatches can never drift apart.
const {
  money, moneyCompact, percent, niceCeil, svgEl, isoToday, daysOverdue, COLOR,
} = Viz;

// Mark specs from the chart style guide.
const BAR_MAX_WIDTH = 24;
const SEGMENT_GAP = 2; // surface-colored gap between stacked segments
const CORNER_RADIUS = 4; // rounded data-end, square at the baseline
const MIN_BAND = 62;
const PLOT_HEIGHT = 260;
const AXIS_BAND = 44; // room for the two-line x labels, inside the SVG
const MARGIN = { top: 24, right: 16, bottom: AXIS_BAND, left: 64 };

const MONTH_COLUMNS = [
  { key: "label", label: "Month" },
  { key: "total", label: "Expected", money: true },
  { key: "paid", label: "Collected", money: true },
  { key: "pending", label: "Pending", money: true },
  { key: "overdue", label: "Pending & past due", money: true },
  { key: "rate", label: "Collected %" },
  { key: "paidCount", label: "Payments collected" },
  { key: "pendingCount", label: "Payments pending" },
];

const els = {
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  runBtn: document.getElementById("runBtn"),
  csvBtn: document.getElementById("csvBtn"),
  status: document.getElementById("status"),
  dashboard: document.getElementById("dashboard"),
  chart: document.getElementById("chart"),
  tooltip: document.getElementById("tooltip"),
  monthTable: document.getElementById("monthTable"),
  pendingTile: document.getElementById("pendingTile"),
  drill: document.getElementById("drill"),
  drillTitle: document.getElementById("drillTitle"),
  drillSub: document.getElementById("drillSub"),
  drillStats: document.getElementById("drillStats"),
  drillTable: document.getElementById("drillTable"),
  drillXlsx: document.getElementById("drillXlsx"),
  drillSearch: document.getElementById("drillSearch"),
};

let current = null;
let drillScope = null; // { month: "yyyy-MM" | null, label }
let lastFocused = null;
let drillQuery = "";
let drillTable = null;

function isoShift(months) {
  const d = new Date();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-01`;
}

// ===============================
// Date presets
// ===============================
function applyPreset(preset) {
  const now = new Date();
  if (preset === "ytd") {
    els.fromDate.value = `${now.getFullYear()}-01-01`;
    els.toDate.value = `${now.getFullYear()}-12-31`;
  } else if (preset === "last6") {
    els.fromDate.value = isoShift(-5);
    els.toDate.value = isoToday();
  } else if (preset === "next6") {
    els.fromDate.value = isoShift(0);
    els.toDate.value = isoShift(6);
  }
  document.querySelectorAll(".presets button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });
}

applyPreset("last6");

// Rounded on the data end, square where it meets the baseline below.
function roundedTopPath(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, height, width / 2));
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    "Z",
  ].join(" ");
}

// ===============================
// Chart
// ===============================
function renderChart(months) {
  els.chart.textContent = "";

  // Fill the card, but never squeeze a band below MIN_BAND — past that the
  // chart scrolls horizontally instead of the labels colliding.
  const available =
    (els.chart.parentElement.clientWidth || 900) - MARGIN.left - MARGIN.right;
  const band = Math.max(
    MIN_BAND,
    Math.floor(available / Math.max(months.length, 1))
  );
  const plotWidth = band * months.length;
  const width = MARGIN.left + plotWidth + MARGIN.right;
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;

  const svg = svgEl("svg", {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    class: "chart-svg",
  });

  const maxTotal = Math.max(...months.map((m) => m.total), 0);
  const yMax = niceCeil(maxTotal);
  const yFor = (value) => MARGIN.top + PLOT_HEIGHT - (value / yMax) * PLOT_HEIGHT;

  // --- gridlines + y ticks (solid hairlines, one step off the surface) ---
  const TICKS = 4;
  for (let i = 0; i <= TICKS; i++) {
    const value = (yMax / TICKS) * i;
    const y = yFor(value);
    svg.appendChild(
      svgEl("line", {
        x1: MARGIN.left,
        x2: MARGIN.left + plotWidth,
        y1: y,
        y2: y,
        stroke: i === 0 ? COLOR.axis : COLOR.grid,
        "stroke-width": 1,
      })
    );
    const tick = svgEl("text", {
      x: MARGIN.left - 10,
      y: y + 4,
      "text-anchor": "end",
      class: "axis-text",
    });
    tick.textContent = moneyCompact(value);
    svg.appendChild(tick);
  }

  // The one direct label worth showing: the heaviest month. Everything else
  // is carried by the axis, the hover readout, and the table below.
  const peakIndex = months.reduce(
    (best, m, i) => (m.total > months[best].total ? i : best),
    0
  );

  let previousYear = null;

  months.forEach((month, index) => {
    const bandX = MARGIN.left + index * band;
    const barWidth = Math.min(BAR_MAX_WIDTH, band - 16);
    const x = bandX + (band - barWidth) / 2;

    const group = svgEl("g", { class: "col", tabindex: "0", role: "listitem" });
    group.setAttribute("aria-label", ariaFor(month));

    // A month with pending money drills through to the deals behind it.
    if (month.pending > 0) {
      group.classList.add("is-drillable");
      group.setAttribute("role", "button");
      const open = () => openDrill(month.month, month.label);
      group.addEventListener("click", open);
      group.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    }

    // Hit target spans the whole band, not just the painted bar.
    const hit = svgEl("rect", {
      x: bandX,
      y: MARGIN.top,
      width: band,
      height: PLOT_HEIGHT,
      fill: "transparent",
      class: "col-hit",
    });
    group.appendChild(hit);

    if (month.total > 0) {
      const baseline = yFor(0);
      const paidHeight = (month.paid / yMax) * PLOT_HEIGHT;
      const pendingHeight = (month.pending / yMax) * PLOT_HEIGHT;
      const hasBoth = month.paid > 0 && month.pending > 0;

      // Paid sits on the baseline; pending stacks above it. The 2px separator
      // is a gap in the surface color, never a stroke around the marks.
      if (month.paid > 0) {
        const h = Math.max(paidHeight - (hasBoth ? SEGMENT_GAP : 0), 1);
        const y = baseline - h;
        const topSegment = month.pending === 0;
        group.appendChild(
          svgEl("path", {
            d: topSegment
              ? roundedTopPath(x, y, barWidth, h, CORNER_RADIUS)
              : roundedTopPath(x, y, barWidth, h, 0),
            fill: COLOR.paid,
          })
        );
      }
      if (month.pending > 0) {
        const h = Math.max(pendingHeight, 1);
        const y = baseline - paidHeight - h;
        group.appendChild(
          svgEl("path", {
            d: roundedTopPath(x, y, barWidth, h, CORNER_RADIUS),
            fill: COLOR.pending,
          })
        );
      }

      if (index === peakIndex) {
        const label = svgEl("text", {
          x: x + barWidth / 2,
          y: yFor(month.total) - 8,
          "text-anchor": "middle",
          class: "peak-label",
        });
        label.textContent = moneyCompact(month.total);
        svg.appendChild(label);
      }
    }

    // --- x label: month on top, year only when it changes ---
    const [year, monthNum] = month.month.split("-");
    const short = month.label.split(" ")[0];
    const labelText = svgEl("text", {
      x: bandX + band / 2,
      y: MARGIN.top + PLOT_HEIGHT + 18,
      "text-anchor": "middle",
      class: "axis-text",
    });
    labelText.textContent = short;
    svg.appendChild(labelText);

    if (year !== previousYear || monthNum === "01") {
      const yearText = svgEl("text", {
        x: bandX + band / 2,
        y: MARGIN.top + PLOT_HEIGHT + 33,
        "text-anchor": "middle",
        class: "axis-text year",
      });
      yearText.textContent = year;
      svg.appendChild(yearText);
      previousYear = year;
    }

    // Anchor for the hover readout: the top of the painted column, in SVG
    // units. Using the group's own box would anchor to the full-height hit
    // rect and float the tooltip far above short columns.
    group.__anchor = { svg, top: month.total > 0 ? yFor(month.total) : yFor(0) };

    bindHover(group, month);
    svg.appendChild(group);
  });

  els.chart.appendChild(svg);
}

function ariaFor(month) {
  return `${month.label}: expected ${money(month.total)}, collected ${money(
    month.paid
  )}, pending ${money(month.pending)}`;
}

// ===============================
// Hover / focus readout. Values lead, series names follow.
// Built with textContent — never innerHTML on data-derived strings.
// ===============================
function bindHover(group, month) {
  const show = () => {
    group.classList.add("active");
    renderTooltip(month);
    // Unhide first: a hidden element has no offsetParent and no measurable
    // width, and positioning against the wrong origin puts the readout
    // adrift — which keyboard focus would never correct, having no
    // pointermove to follow up with.
    els.tooltip.hidden = false;
    positionTooltip(group);
  };
  const hide = () => {
    group.classList.remove("active");
    els.tooltip.hidden = true;
  };
  group.addEventListener("pointerenter", show);
  group.addEventListener("pointermove", () => positionTooltip(group));
  group.addEventListener("pointerleave", hide);
  group.addEventListener("focus", show);
  group.addEventListener("blur", hide);
}

function renderTooltip(month) {
  els.tooltip.textContent = "";

  const title = document.createElement("div");
  title.className = "tt-title";
  title.textContent = month.label;
  els.tooltip.appendChild(title);

  const rows = [
    { name: "Collected", value: month.paid, series: "paid" },
    { name: "Pending", value: month.pending, series: "pending" },
  ];
  if (month.overdue > 0) {
    rows.push({ name: "of which past due", value: month.overdue, series: null });
  }

  for (const row of rows) {
    const line = document.createElement("div");
    line.className = "tt-row";
    if (row.series) {
      const key = document.createElement("i");
      key.className = `tt-key ${row.series}`;
      line.appendChild(key);
    } else {
      const spacer = document.createElement("i");
      spacer.className = "tt-key blank";
      line.appendChild(spacer);
    }
    const value = document.createElement("span");
    value.className = "tt-value";
    value.textContent = money(row.value);
    const name = document.createElement("span");
    name.className = "tt-name";
    name.textContent = row.name;
    line.appendChild(value);
    line.appendChild(name);
    els.tooltip.appendChild(line);
  }

  const foot = document.createElement("div");
  foot.className = "tt-foot";
  foot.textContent = `${money(month.total)} expected · ${
    month.total > 0 ? percent(month.paid / month.total) : "0%"
  } collected`;
  els.tooltip.appendChild(foot);
}

function positionTooltip(group) {
  const card = els.tooltip.offsetParent;
  if (!card) return;
  const cardBox = card.getBoundingClientRect();
  const box = group.getBoundingClientRect();

  // Vertical anchor comes from the column's own top edge, mapped out of SVG
  // units through whatever scale the SVG is currently drawn at.
  const anchor = group.__anchor;
  const svgBox = anchor.svg.getBoundingClientRect();
  const scale = svgBox.height / anchor.svg.viewBox.baseVal.height || 1;
  const top = svgBox.top + anchor.top * scale - cardBox.top;

  // Keep the readout inside the card — it is centered on the column, so the
  // first and last months would otherwise hang off the edge.
  const half = els.tooltip.offsetWidth / 2;
  const center = box.left - cardBox.left + box.width / 2;
  const left = Math.min(
    Math.max(center, half + 8),
    Math.max(card.clientWidth - half - 8, half + 8)
  );

  els.tooltip.style.left = `${left}px`;
  els.tooltip.style.top = `${top}px`;
}

// ===============================
// Table view — the WCAG-clean twin of the chart. Every value the chart
// encodes with color and height is readable here as text.
// ===============================
function renderTable(months, totals) {
  const thead = els.monthTable.querySelector("thead");
  thead.textContent = "";
  const headRow = document.createElement("tr");
  for (const col of MONTH_COLUMNS) {
    const th = document.createElement("th");
    th.textContent = col.label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = els.monthTable.querySelector("tbody");
  tbody.textContent = "";
  for (const month of months) {
    const tr = document.createElement("tr");
    if (month.total === 0) tr.className = "empty-month";
    for (const col of MONTH_COLUMNS) {
      const td = document.createElement("td");
      if (col.key === "rate") {
        td.textContent = month.total > 0 ? percent(month.paid / month.total) : "—";
      } else if (col.key === "pending" && month.pending > 0) {
        // The pending figure is the way into that month's deals.
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "link-amount";
        btn.textContent = money(month.pending);
        btn.title = `Show the ${month.label} pending deals`;
        btn.addEventListener("click", () => openDrill(month.month, month.label));
        td.appendChild(btn);
        td.className = "num";
      } else if (col.money) {
        td.textContent = money(month[col.key]);
        td.className = "num";
      } else if (col.key === "label") {
        td.textContent = month.label;
        td.className = "month-cell";
      } else {
        td.textContent = month[col.key];
        td.className = "num";
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  const tfoot = els.monthTable.querySelector("tfoot");
  tfoot.textContent = "";
  const footRow = document.createElement("tr");
  const cells = [
    "Total",
    money(totals.expected),
    money(totals.paid),
    money(totals.pending),
    money(totals.overdue),
    percent(totals.collectionRate),
    totals.paidCount,
    totals.pendingCount,
  ];
  cells.forEach((value, i) => {
    const td = document.createElement("td");
    td.textContent = value;
    if (i > 0) td.className = "num";
    footRow.appendChild(td);
  });
  tfoot.appendChild(footRow);
}

function renderSummary(totals) {
  document.getElementById("statExpected").textContent = moneyCompact(totals.expected);
  document.getElementById("statPaid").textContent = moneyCompact(totals.paid);
  document.getElementById("statPending").textContent = moneyCompact(totals.pending);
  document.getElementById("statOverdue").textContent = moneyCompact(totals.overdue);
  document.getElementById("statRate").textContent = percent(totals.collectionRate);
  document.getElementById("meterFill").style.width = `${Math.round(
    totals.collectionRate * 100
  )}%`;
}

// ===============================
// Pending drill-down.
//
// Opened from the Pending stat tile (whole range), a pending column in the
// chart, or a pending amount in the month table. Each row is one unpaid
// scheduled payment, with the deal's contact details and that deal's overall
// standing across the loaded range.
// ===============================
const DRILL_COLUMNS = [
  { key: "dealName", label: "Deal Name", type: "text", width: 26 },
  { key: "component", label: "Payment", type: "text", width: 14 },
  // A full payment has no due date and so can never be "days overdue"; both
  // cells read as an em dash rather than as a blank or a misleading zero.
  {
    key: "expectedDate",
    label: "Due Date",
    type: "date",
    width: 12,
    render: (row) => row.expectedDate || "—",
    sortValue: (row) => row.expectedDate || "9999-12-31",
  },
  {
    key: "overdueDays",
    label: "Days Overdue",
    type: "number",
    width: 13,
    num: true,
    render: (row) => (row.expectedDate ? Viz.count(row.overdueDays) : "—"),
  },
  { key: "amount", label: "Pending", type: "money", width: 14, money: true },
  { key: "email", label: "Email", type: "text", width: 28 },
  { key: "phone", label: "Phone", type: "text", width: 15 },
  { key: "dealOwner", label: "Deal Owner", type: "text", width: 18 },
  { key: "batch", label: "Batch", type: "text", width: 14 },
  { key: "paymentType", label: "Payment Type", type: "text", width: 22 },
  { key: "dealCollected", label: "Deal Collected", type: "money", width: 16, money: true },
  { key: "dealPending", label: "Deal Pending", type: "money", width: 15, money: true },
];

const DEAL_COLUMNS = [
  { key: "dealName", label: "Deal Name", type: "text", width: 26 },
  { key: "email", label: "Email", type: "text", width: 28 },
  { key: "phone", label: "Phone", type: "text", width: 15 },
  { key: "dealOwner", label: "Deal Owner", type: "text", width: 18 },
  { key: "batch", label: "Batch", type: "text", width: 14 },
  { key: "paymentType", label: "Payment Type", type: "text", width: 22 },
  { key: "scheduled", label: "Total Scheduled", type: "money", width: 16 },
  { key: "collected", label: "Collected", type: "money", width: 14 },
  { key: "pending", label: "Pending", type: "money", width: 14 },
  { key: "pendingInScope", label: "Pending In View", type: "money", width: 16 },
  { key: "overdue", label: "Pending & Past Due", type: "money", width: 18 },
  { key: "nextDue", label: "Earliest Due", type: "date", width: 13 },
];

function dealKey(item) {
  return item.dealId || `${item.dealName}|${item.email}|${item.phone}`;
}

// Every deal's standing across the whole loaded range, keyed for lookup.
function dealTotals() {
  const map = new Map();
  const today = isoToday();
  for (const item of current.items) {
    const key = dealKey(item);
    if (!map.has(key)) {
      map.set(key, {
        dealName: item.dealName,
        email: item.email,
        phone: item.phone,
        dealOwner: item.dealOwner,
        batch: item.batch,
        paymentType: item.paymentType,
        scheduled: 0,
        collected: 0,
        pending: 0,
        overdue: 0,
        pendingInScope: 0,
        nextDue: "",
      });
    }
    const deal = map.get(key);
    deal.scheduled += item.amount;
    if (item.paid) {
      deal.collected += item.amount;
    } else {
      deal.pending += item.amount;
      // No due date means it can never be past due, and it can never be the
      // earliest thing due — an empty string would otherwise sort ahead of
      // every real date here.
      if (item.expectedDate && item.expectedDate < today) {
        deal.overdue += item.amount;
      }
      if (item.expectedDate && (!deal.nextDue || item.expectedDate < deal.nextDue)) {
        deal.nextDue = item.expectedDate;
      }
    }
  }
  return map;
}

// The unpaid payments in the current scope, most overdue first. The search box
// in the drill header narrows this too, so what you export is what you see.
function drillRows() {
  const totals = dealTotals();
  const today = isoToday();
  const query = drillQuery.trim().toLowerCase();
  return current.items
    .filter((item) => !item.paid)
    .filter((item) => !drillScope.month || item.expectedDate.startsWith(drillScope.month))
    .filter((item) => {
      if (!query) return true;
      const hay = `${item.dealName} ${item.email} ${item.phone} ${item.batch} ${item.dealOwner}`;
      return hay.toLowerCase().includes(query);
    })
    .map((item) => {
      const deal = totals.get(dealKey(item));
      return {
        ...item,
        overdueDays: daysOverdue(item.expectedDate, today),
        dealCollected: deal.collected,
        dealPending: deal.pending,
      };
    })
    .sort(
      // Undated rows (full payments) sort to the end, not to the top: the
      // list is a chase list, and the oldest due date has to lead it.
      (a, b) =>
        (a.expectedDate || "9999-12-31").localeCompare(
          b.expectedDate || "9999-12-31"
        ) || b.amount - a.amount
    );
}

function openDrill(month, label) {
  if (!current) return;
  lastFocused = document.activeElement;
  drillScope = { month, label };
  // A search left over from the last drill would silently hide rows here.
  drillQuery = "";
  els.drillSearch.value = "";
  renderDrill();
  els.drill.hidden = false;
  document.body.classList.add("drill-open");
  els.drillXlsx.focus();
}

function closeDrill() {
  els.drill.hidden = true;
  document.body.classList.remove("drill-open");
  if (lastFocused && lastFocused.isConnected) lastFocused.focus();
}

function renderDrill() {
  const rows = drillRows();
  const today = isoToday();
  const pending = rows.reduce((acc, r) => acc + r.amount, 0);
  const overdue = rows
    .filter((r) => r.expectedDate && r.expectedDate < today)
    .reduce((acc, r) => acc + r.amount, 0);
  const deals = new Set(rows.map(dealKey)).size;

  els.drillTitle.textContent = drillScope.month
    ? `Pending collections — ${drillScope.label}`
    : "Pending collections — all months in range";
  // Full payments have no due date, so a month-scoped drill can't contain them
  // and the range-wide one has to say why they are there.
  const undatedRows = rows.filter((r) => !r.expectedDate).length;
  els.drillSub.textContent = drillScope.month
    ? `Payments due in ${drillScope.label} that are still unticked in CRM.`
    : `Payments due between ${els.fromDate.value} and ${els.toDate.value} that are still unticked in CRM.` +
      (undatedRows > 0
        ? ` Includes ${undatedRows} full payment(s), which have no due date — they are scoped by the deal's closing date and are not in the month figures.`
        : "");

  // --- summary tiles ---
  els.drillStats.textContent = "";
  const tiles = [
    { label: "Pending", value: money(pending), cls: "pending-amt" },
    { label: "Pending & past due", value: money(overdue), cls: "overdue" },
    { label: "Deals", value: String(deals), cls: "" },
    { label: "Payments", value: String(rows.length), cls: "" },
  ];
  for (const tile of tiles) {
    const box = document.createElement("div");
    box.className = "stat";
    const value = document.createElement("span");
    value.className = "stat-value";
    value.textContent = tile.value;
    const label = document.createElement("span");
    label.className = `stat-label ${tile.cls}`.trim();
    label.textContent = tile.label;
    box.appendChild(value);
    box.appendChild(label);
    els.drillStats.appendChild(box);
  }

  // --- detail table: every column sorts, so the list can be worked by
  // whichever handle the caller has — oldest first, biggest first, by owner ---
  if (!drillTable) {
    drillTable = new Viz.DataTable(
      els.drillTable,
      DRILL_COLUMNS.map((col) => ({
        key: col.key,
        label: col.label,
        type: col.money ? "money" : col.num ? "num" : "text",
        render: col.render,
        sortValue: col.sortValue,
      })),
      {
        sortKey: "expectedDate",
        sortDir: "asc",
        rowClass: (row) => (row.overdueDays > 0 ? "is-overdue" : ""),
        emptyText: drillQuery
          ? "No pending payments match that search."
          : "Nothing pending here — every scheduled payment is ticked as paid.",
        footer: (list) =>
          DRILL_COLUMNS.map((col, i) => {
            if (i === 0) return `${list.length} pending payment(s)`;
            if (col.key === "amount") {
              return money(list.reduce((acc, r) => acc + r.amount, 0));
            }
            return "";
          }),
      }
    );
  }
  drillTable.opts.emptyText = drillQuery
    ? "No pending payments match that search."
    : "Nothing pending here — every scheduled payment is ticked as paid.";
  drillTable.render(rows);
}

// ===============================
// Excel export of the drill-down: the payment-level chase list plus a
// deal-level summary. Amounts are real numbers and dates real dates, so both
// sheets can be sorted, filtered and summed in Excel.
// ===============================
function buildDrillWorkbook() {
  const rows = drillRows();
  if (rows.length === 0) return null;

  const totals = dealTotals();
  const scopedDealKeys = new Set(rows.map(dealKey));
  const pendingInScope = new Map();
  for (const row of rows) {
    pendingInScope.set(dealKey(row), (pendingInScope.get(dealKey(row)) || 0) + row.amount);
  }

  const dealRows = Array.from(totals.entries())
    .filter(([key]) => scopedDealKeys.has(key))
    .map(([key, deal]) => ({ ...deal, pendingInScope: pendingInScope.get(key) || 0 }))
    .sort((a, b) => b.pendingInScope - a.pendingInScope);

  const scopeLabel = drillScope.month
    ? drillScope.label
    : `${els.fromDate.value} to ${els.toDate.value}`;

  const bytes = XlsxWriter.buildXlsx([
    {
      name: "Pending detail",
      columns: DRILL_COLUMNS.map((c) => ({
        header: c.label,
        key: c.key,
        type: c.type,
        width: c.width,
      })),
      rows,
    },
    {
      name: "By deal",
      columns: DEAL_COLUMNS.map((c) => ({
        header: c.label,
        key: c.key,
        type: c.type,
        width: c.width,
      })),
      rows: dealRows,
    },
  ]);

  return {
    bytes,
    filename: `pending-collections-${scopeLabel.replace(/[^0-9a-zA-Z]+/g, "-")}.xlsx`,
  };
}

function downloadDrillXlsx() {
  const workbook = buildDrillWorkbook();
  if (!workbook) {
    Viz.toast("Nothing pending to export.");
    return;
  }
  Viz.download(
    workbook.bytes,
    workbook.filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  Viz.toast("Pending collections exported to Excel.");
}

// ===============================
// CSV — the per-payment detail behind the dashboard, so pending rows can be
// worked as a chase list.
// ===============================
const CSV_COLUMNS = [
  { key: "month", label: "Month" },
  { key: "expectedDate", label: "Expected Date" },
  { key: "component", label: "Payment Component" },
  { key: "status", label: "Status" },
  { key: "amount", label: "Amount" },
  { key: "dealName", label: "Deal Name" },
  { key: "dealOwner", label: "Deal Owner" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "batch", label: "Batch" },
  { key: "paymentType", label: "Payment Type" },
  { key: "closingDate", label: "Closing Date" },
];

function downloadCsv() {
  if (!current) return;
  const today = isoToday();
  const rows = current.items.map((item) => ({
    ...item,
    month: item.expectedDate.slice(0, 7),
    status: item.paid
      ? "Collected"
      : item.expectedDate && item.expectedDate < today
      ? "Pending (past due)"
      : "Pending",
  }));

  const escape = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
  const lines = [
    CSV_COLUMNS.map((c) => escape(c.label)).join(","),
    ...rows.map((row) => CSV_COLUMNS.map((c) => escape(row[c.key])).join(",")),
  ];

  Viz.download(
    lines.join("\n"),
    `collections-${els.fromDate.value}-to-${els.toDate.value}.csv`,
    "text/csv;charset=utf-8;"
  );
  Viz.toast(`${rows.length} scheduled payment(s) exported.`);
}

// ===============================
// Load
// ===============================
async function load(options) {
  const fromDate = els.fromDate.value;
  const toDate = els.toDate.value;
  if (!fromDate || !toDate) {
    setStatus("Pick both a from and to date.", true);
    return;
  }
  if (fromDate > toDate) {
    setStatus("The from date must not be after the to date.", true);
    return;
  }

  // A collections fetch walks every Closed Won deal, so a range already
  // loaded this session is served from the cache rather than paid for twice.
  const cached = (options || {}).force ? null : Viz.cache.read(fromDate, toDate);
  if (cached) {
    applyPayload(cached, true);
    return;
  }

  els.runBtn.disabled = true;
  els.runBtn.classList.add("is-busy");
  els.csvBtn.disabled = true;
  setStatus("Loading Closed Won deals from CRM…", false);
  // Hold the previous render at reduced opacity rather than flashing a skeleton.
  els.dashboard.classList.add("loading");

  try {
    const data = await Viz.postJson("/api/collections", { fromDate, toDate });

    Viz.cache.write(fromDate, toDate, data);
    applyPayload(data, false);
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  } finally {
    els.runBtn.disabled = false;
    els.runBtn.classList.remove("is-busy");
    els.dashboard.classList.remove("loading");
  }
}

function applyPayload(data, fromCache) {
  current = data;
  drillTable = null; // the table is rebuilt against the new payload

  // Unhide BEFORE drawing: the chart sizes its bands from the container's
  // width, and a `display: none` container measures zero — the first render
  // would otherwise fall back to its default width and sit narrow in the card
  // until the next resize.
  els.dashboard.hidden = false;

  renderSummary(data.totals);
  renderChart(data.months);
  renderTable(data.months, data.totals);
  els.csvBtn.disabled = data.items.length === 0;

  let note = `${data.items.length} scheduled payment(s) across ${data.months.length} month(s), from ${data.totalClosedWonDeals} Closed Won deal(s).`;
  if (fromCache) note += " Loaded from this session's cache.";
  if (data.undated.count > 0) {
    note += ` Note: ${data.undated.count} payment(s) worth ${money(
      data.undated.amount
    )} have no due date in CRM and are excluded from the months above.`;
  }
  if (data.invalidDates.count > 0) {
    note += ` Warning: ${data.invalidDates.count} payment(s) worth ${money(
      data.invalidDates.amount
    )} have a due date CRM didn't return as a real date (e.g. ${data.invalidDates.samples.join(
      ", "
    )}) — they can't be placed in a month and are excluded.`;
  }
  if (data.unrecognisedDeals > 0) {
    note += ` ${data.unrecognisedDeals} deal(s) have an unrecognised Payment Type and contribute no scheduled payments.`;
  }
  setStatus(note, data.invalidDates.count > 0);
}

function setStatus(message, isError) {
  els.status.textContent = message;
  els.status.classList.toggle("error", Boolean(isError));
}

// The button always goes back to CRM; the presets are happy with the cache.
els.runBtn.addEventListener("click", () => load({ force: true }));
els.csvBtn.addEventListener("click", downloadCsv);

// --- drill-down wiring ---
els.pendingTile.addEventListener("click", () => openDrill(null, null));
els.drillXlsx.addEventListener("click", downloadDrillXlsx);

let drillSearchTimer = null;
els.drillSearch.addEventListener("input", () => {
  clearTimeout(drillSearchTimer);
  drillSearchTimer = setTimeout(() => {
    drillQuery = els.drillSearch.value;
    renderDrill();
  }, 180);
});
els.drill.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", closeDrill);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.drill.hidden) closeDrill();
});

// Re-lay the bands when the window changes width — the chart sizes itself to
// its container, so a resize would otherwise leave it stretched or clipped.
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (!current) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderChart(current.months), 120);
});
document.querySelectorAll(".presets button").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyPreset(btn.dataset.preset);
    load();
  });
});

// Typing a date by hand means none of the presets describes the range any more.
[els.fromDate, els.toDate].forEach((input) => {
  input.addEventListener("input", () => {
    document.querySelectorAll(".presets button").forEach((btn) => {
      btn.classList.remove("active");
    });
  });
});
