// ===============================
// Shared dashboard toolkit: formatting, hand-rolled SVG charts, sortable
// tables, and the small bits of page furniture (toasts, downloads, a
// session cache).
//
// The app has no build step and no chart dependency, so the charts here are
// plain SVG built the same way the collections month chart is. Every chart
// ships with a table beside it — colour and length are never the only way to
// read a number.
//
// Everything lives on the single `Viz` global; the pages are classic scripts
// sharing one global scope, so nothing else may leak out of this file.
// ===============================
window.Viz = (function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Series colours live in CSS so the swatches, bars and table accents can
  // never drift apart. Read once — they don't change at runtime.
  const CSS = getComputedStyle(document.documentElement);
  const cssVar = (name, fallback) =>
    CSS.getPropertyValue(name).trim() || fallback;

  const COLOR = {
    paid: cssVar("--series-paid", "#157a4e"),
    pending: cssVar("--series-pending", "#c2892c"),
    track: cssVar("--series-paid-track", "#d6e7de"),
    grid: cssVar("--grid", "#e1e0d9"),
    axis: cssVar("--axis", "#c3c2b7"),
    muted: cssVar("--muted", "#78776f"),
    ink: cssVar("--ink", "#16211b"),
    rust: cssVar("--rust", "#a4442f"),
    surface: cssVar("--panel", "#ffffff"),
    // Ordered rust ramp for the ageing buckets — light to dark by severity.
    age: [
      cssVar("--age-1", "#eda58f"),
      cssVar("--age-2", "#d97355"),
      cssVar("--age-3", "#b3452a"),
      cssVar("--age-4", "#7a2a17"),
    ],
  };

  // ===============================
  // Formatting — Indian numbering, since the amounts are rupees.
  // ===============================
  const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

  function money(value) {
    return `₹${inr.format(Math.round(value || 0))}`;
  }

  // Compact form for axis ticks and stat tiles, where the full number is noise.
  function moneyCompact(value) {
    const v = Math.round(value || 0);
    if (v === 0) return "₹0";
    const abs = Math.abs(v);
    if (abs >= 1e7) return `₹${trim(v / 1e7)} Cr`;
    if (abs >= 1e5) return `₹${trim(v / 1e5)} L`;
    if (abs >= 1e3) return `₹${trim(v / 1e3)} K`;
    return `₹${inr.format(v)}`;
  }

  function trim(n) {
    return String(Number(n.toFixed(Math.abs(n) >= 100 ? 0 : 1)));
  }

  function percent(fraction) {
    if (!isFinite(fraction)) return "—";
    return `${Math.round(fraction * 100)}%`;
  }

  function count(n) {
    return inr.format(n || 0);
  }

  // ===============================
  // Dates — ISO strings compare and slice correctly as plain text, so the
  // date maths stays textual and no timezone can shift a due date into the
  // neighbouring month.
  // ===============================
  function isoToday() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function daysOverdue(isoDate, today) {
    if (!isoDate || isoDate >= today) return 0;
    const toUtc = (s) => {
      const [y, m, d] = s.split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((toUtc(today) - toUtc(isoDate)) / 86400000);
  }

  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function monthLabel(key) {
    const [year, month] = String(key || "").split("-");
    if (!year || !month) return key || "";
    return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
  }

  // ===============================
  // Scale — round the top up to a clean number so ticks read cleanly. Every
  // step divides by 4 exactly, so each gridline lands on a value the compact
  // format can print without rounding (₹2.3 L standing in for ₹2,25,000
  // reads as a wrong number).
  // ===============================
  function niceCeil(value) {
    if (value <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const steps = [1, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 4, 4.8, 6, 7.2, 8, 10];
    for (const step of steps) {
      if (value <= step * magnitude) return step * magnitude;
    }
    return 10 * magnitude;
  }

  function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs || {})) {
      node.setAttribute(key, value);
    }
    return node;
  }

  function textEl(cls, x, y, content, extra) {
    const node = svgEl("text", Object.assign({ x, y, class: cls }, extra || {}));
    node.textContent = content;
    return node;
  }

  // Rounded on the data end, square where it meets the baseline.
  function barPathH(x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, height / 2, width));
    return [
      `M${x},${y}`,
      `L${x + width - r},${y}`,
      `Q${x + width},${y} ${x + width},${y + r}`,
      `L${x + width},${y + height - r}`,
      `Q${x + width},${y + height} ${x + width - r},${y + height}`,
      `L${x},${y + height}`,
      "Z",
    ].join(" ");
  }

  function empty(container, message) {
    container.textContent = "";
    const p = document.createElement("p");
    p.className = "viz-empty";
    p.textContent = message;
    container.appendChild(p);
  }

  // ===============================
  // Floating readout, one per chart container. The container must be
  // positioned; `.viz` is.
  // ===============================
  class Tip {
    constructor(container) {
      this.container = container;
      this.node = document.createElement("div");
      this.node.className = "viz-tip";
      this.node.hidden = true;
      container.appendChild(this.node);
    }

    // content: { title, rows: [{name, value, color}], foot }
    show(content, x, y) {
      const node = this.node;
      node.textContent = "";

      if (content.title) {
        const title = document.createElement("div");
        title.className = "tt-title";
        title.textContent = content.title;
        node.appendChild(title);
      }

      for (const row of content.rows || []) {
        const line = document.createElement("div");
        line.className = "tt-row";
        const key = document.createElement("i");
        key.className = "tt-key";
        if (row.color) key.style.background = row.color;
        else key.classList.add("blank");
        const value = document.createElement("span");
        value.className = "tt-value";
        value.textContent = row.value;
        const name = document.createElement("span");
        name.className = "tt-name";
        name.textContent = row.name;
        line.append(key, value, name);
        node.appendChild(line);
      }

      if (content.foot) {
        const foot = document.createElement("div");
        foot.className = "tt-foot";
        foot.textContent = content.foot;
        node.appendChild(foot);
      }

      // Unhide before measuring: a hidden element has no width, and
      // positioning against zero puts the readout adrift.
      node.hidden = false;
      this.move(x, y);
    }

    move(x, y) {
      const half = this.node.offsetWidth / 2;
      const limit = this.container.clientWidth;
      const left = Math.min(Math.max(x, half + 4), Math.max(limit - half - 4, half + 4));
      this.node.style.left = `${left}px`;
      this.node.style.top = `${Math.max(y, this.node.offsetHeight + 8)}px`;
    }

    hide() {
      this.node.hidden = true;
    }
  }

  // ===============================
  // Horizontal bars, optionally stacked.
  //
  // One code path covers both the paid/pending breakdowns (two segments) and
  // the single-measure charts like the ageing buckets (one segment), so the
  // marks, spacing and hover behave identically everywhere.
  //
  // opts = {
  //   rows: [{ label, sub, total, segments: [{name, value, color}], meta }],
  //   trailing: (row) => string,   // printed past the bar end
  //   tooltip: (row) => {title, rows, foot},
  //   onSelect: (row) => void,     // makes rows clickable
  //   emptyText, max
  // }
  // ===============================
  function bars(container, opts) {
    const rows = opts.rows || [];
    container.textContent = "";
    if (rows.length === 0) {
      empty(container, opts.emptyText || "Nothing to show for the current filters.");
      return;
    }

    const tip = new Tip(container);

    const ROW_H = 34;
    const BAR_H = 16;
    const GAP = 2; // surface-coloured gap between stacked segments
    const RADIUS = 4;
    const PAD_TOP = 6;

    // Give the label gutter what the longest label needs, within reason —
    // Calibri averages a shade over 6px per character at 13px.
    const longest = rows.reduce((n, r) => Math.max(n, String(r.label).length), 0);
    const labelWidth = Math.min(Math.max(Math.round(longest * 6.4) + 14, 96), 230);
    const trailWidth = opts.trailing ? 116 : 8;

    const width = Math.max(container.clientWidth || 720, 420);
    const height = rows.length * ROW_H + PAD_TOP + 4;
    const plotWidth = Math.max(width - labelWidth - trailWidth - 12, 60);
    const max = opts.max || Math.max(...rows.map((r) => r.total), 0) || 1;

    const svg = svgEl("svg", {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: "list",
    });

    rows.forEach((row, index) => {
      const y = PAD_TOP + index * ROW_H;
      const barY = y + (ROW_H - BAR_H) / 2 - 2;

      const group = svgEl("g", { class: "viz-row", role: "listitem", tabindex: "0" });
      group.setAttribute("aria-label", ariaForRow(row, opts));

      // Hit target spans the whole row, not just the painted bar.
      group.appendChild(
        svgEl("rect", {
          x: 0,
          y,
          width,
          height: ROW_H,
          rx: 4,
          class: "viz-hit",
        })
      );

      // Track: shows how far short of the widest row this one falls.
      group.appendChild(
        svgEl("rect", {
          x: labelWidth,
          y: barY,
          width: plotWidth,
          height: BAR_H,
          rx: 3,
          class: "viz-track",
        })
      );

      const label = textEl("viz-label", labelWidth - 10, barY + BAR_H / 2 + 4.5, row.label, {
        "text-anchor": "end",
      });
      group.appendChild(label);

      const painted = (row.segments || []).filter((s) => s.value > 0);
      let cursor = labelWidth;
      painted.forEach((segment, i) => {
        const isLast = i === painted.length - 1;
        const raw = (segment.value / max) * plotWidth;
        const w = Math.max(raw - (isLast ? 0 : GAP), 1);
        group.appendChild(
          svgEl("path", {
            d: barPathH(cursor, barY, w, BAR_H, isLast ? RADIUS : 0),
            fill: segment.color,
          })
        );
        cursor += raw;
      });

      if (opts.trailing) {
        const text = textEl(
          "viz-value",
          labelWidth + plotWidth + 10,
          barY + BAR_H / 2 + 4.5,
          opts.trailing(row)
        );
        group.appendChild(text);
      }

      if (row.sub) {
        group.appendChild(
          textEl("viz-sub", labelWidth - 10, barY + BAR_H + 13, row.sub, {
            "text-anchor": "end",
          })
        );
      }

      bindRow(group, row, tip, container, opts);
      svg.appendChild(group);
    });

    container.appendChild(svg);
  }

  function ariaForRow(row, opts) {
    const parts = (row.segments || [])
      .filter((s) => s.value > 0)
      .map((s) => `${s.name} ${money(s.value)}`);
    return `${row.label}: ${parts.join(", ") || money(row.total)}`;
  }

  function bindRow(group, row, tip, container, opts) {
    const box = () => container.getBoundingClientRect();
    const show = (event) => {
      group.classList.add("active");
      if (!opts.tooltip) return;
      const rect = box();
      const x = event && event.clientX ? event.clientX - rect.left : container.clientWidth / 2;
      const y = event && event.clientY
        ? event.clientY - rect.top
        : group.getBoundingClientRect().top - rect.top;
      tip.show(opts.tooltip(row), x, y);
    };
    const hide = () => {
      group.classList.remove("active");
      tip.hide();
    };
    group.addEventListener("pointerenter", show);
    group.addEventListener("pointermove", show);
    group.addEventListener("pointerleave", hide);
    group.addEventListener("focus", () => show(null));
    group.addEventListener("blur", hide);

    if (opts.onSelect) {
      group.classList.add("is-clickable");
      group.setAttribute("role", "button");
      const fire = () => opts.onSelect(row);
      group.addEventListener("click", fire);
      group.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fire();
        }
      });
    }
  }

  // ===============================
  // Multi-series line chart with a crosshair readout.
  //
  // Both series are always the same measure in the same unit — there is no
  // second y axis here, and there never should be.
  //
  // opts = {
  //   labels: ["Jan 2026", ...],
  //   series: [{ name, color, values: [n], dashed }],
  //   emptyText
  // }
  // ===============================
  function lines(container, opts) {
    const labels = opts.labels || [];
    const series = (opts.series || []).filter((s) => s.values && s.values.length);
    container.textContent = "";
    if (labels.length === 0 || series.length === 0) {
      empty(container, opts.emptyText || "Nothing to plot for the current filters.");
      return;
    }

    const tip = new Tip(container);

    const MARGIN = { top: 18, right: 18, bottom: 40, left: 66 };
    const PLOT_H = 240;
    const width = Math.max(container.clientWidth || 720, 420);
    const height = MARGIN.top + PLOT_H + MARGIN.bottom;
    const plotW = Math.max(width - MARGIN.left - MARGIN.right, 60);

    const maxValue = Math.max(
      ...series.flatMap((s) => s.values.map((v) => v || 0)),
      0
    );
    const yMax = niceCeil(maxValue);
    const yFor = (v) => MARGIN.top + PLOT_H - ((v || 0) / yMax) * PLOT_H;
    const step = labels.length > 1 ? plotW / (labels.length - 1) : 0;
    const xFor = (i) => MARGIN.left + (labels.length > 1 ? i * step : plotW / 2);

    const svg = svgEl("svg", {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `${series.map((s) => s.name).join(" and ")} by month`,
    });

    // --- gridlines + y ticks ---
    const TICKS = 4;
    for (let i = 0; i <= TICKS; i++) {
      const value = (yMax / TICKS) * i;
      const y = yFor(value);
      svg.appendChild(
        svgEl("line", {
          x1: MARGIN.left,
          x2: MARGIN.left + plotW,
          y1: y,
          y2: y,
          stroke: i === 0 ? COLOR.axis : COLOR.grid,
          "stroke-width": 1,
        })
      );
      svg.appendChild(
        textEl("axis-text", MARGIN.left - 10, y + 4, moneyCompact(value), {
          "text-anchor": "end",
        })
      );
    }

    // --- x labels, thinned until they stop colliding ---
    const every = Math.max(1, Math.ceil((labels.length * 56) / plotW));
    labels.forEach((label, i) => {
      if (i % every !== 0 && i !== labels.length - 1) return;
      svg.appendChild(
        textEl("axis-text", xFor(i), MARGIN.top + PLOT_H + 18, label.split(" ")[0], {
          "text-anchor": "middle",
        })
      );
      svg.appendChild(
        textEl("axis-text year", xFor(i), MARGIN.top + PLOT_H + 31, label.split(" ")[1] || "", {
          "text-anchor": "middle",
        })
      );
    });

    // --- the lines themselves ---
    for (const s of series) {
      const d = s.values
        .map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`)
        .join(" ");
      const path = svgEl("path", {
        d,
        fill: "none",
        stroke: s.color,
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      });
      if (s.dashed) path.setAttribute("stroke-dasharray", "5 4");
      svg.appendChild(path);
    }

    // --- crosshair layer ---
    const crosshair = svgEl("line", {
      y1: MARGIN.top,
      y2: MARGIN.top + PLOT_H,
      stroke: COLOR.axis,
      "stroke-width": 1,
      visibility: "hidden",
    });
    svg.appendChild(crosshair);

    const markers = series.map((s) => {
      const dot = svgEl("circle", {
        r: 4.5,
        fill: s.color,
        stroke: COLOR.surface,
        "stroke-width": 2,
        visibility: "hidden",
      });
      svg.appendChild(dot);
      return dot;
    });

    let activeIndex = -1;
    const focusIndex = (index, clientX, clientY) => {
      if (index < 0 || index >= labels.length) return;
      activeIndex = index;
      const x = xFor(index);
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.setAttribute("visibility", "visible");
      series.forEach((s, i) => {
        markers[i].setAttribute("cx", x);
        markers[i].setAttribute("cy", yFor(s.values[index]));
        markers[i].setAttribute("visibility", "visible");
      });

      const rect = container.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / width || 1;
      tip.show(
        {
          title: labels[index],
          rows: series.map((s) => ({
            name: s.name,
            value: moneyCompact(s.values[index]),
            color: s.color,
          })),
          foot: opts.foot ? opts.foot(index) : "",
        },
        clientX !== undefined ? clientX - rect.left : svgRect.left - rect.left + x * scale,
        clientY !== undefined
          ? clientY - rect.top
          : svgRect.top - rect.top + yFor(series[0].values[index]) * scale
      );
    };

    const clear = () => {
      activeIndex = -1;
      crosshair.setAttribute("visibility", "hidden");
      markers.forEach((m) => m.setAttribute("visibility", "hidden"));
      tip.hide();
    };

    const overlay = svgEl("rect", {
      x: MARGIN.left,
      y: MARGIN.top,
      width: plotW,
      height: PLOT_H,
      fill: "transparent",
      tabindex: "0",
      role: "application",
      "aria-label": "Month by month readout — use the arrow keys",
    });
    overlay.addEventListener("pointermove", (e) => {
      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / width || 1;
      const local = (e.clientX - svgRect.left) / scale - MARGIN.left;
      const index = step > 0 ? Math.round(local / step) : 0;
      focusIndex(Math.min(Math.max(index, 0), labels.length - 1), e.clientX, e.clientY);
    });
    overlay.addEventListener("pointerleave", clear);
    overlay.addEventListener("focus", () => focusIndex(0));
    overlay.addEventListener("blur", clear);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        focusIndex(Math.min(activeIndex + 1, labels.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusIndex(Math.max(activeIndex - 1, 0));
      }
    });
    svg.appendChild(overlay);

    container.appendChild(svg);
  }

  // ===============================
  // Sortable table.
  //
  // columns: [{ key, label, type: "text"|"num"|"money"|"percent"|"date",
  //             width, render(row), sortValue(row) }]
  // opts: { sortKey, sortDir, footer(rows), onRowClick(row, tr),
  //         subRows(row), emptyText }
  // ===============================
  class DataTable {
    constructor(tableEl, columns, opts) {
      this.table = tableEl;
      this.columns = columns;
      this.opts = opts || {};
      this.rows = [];
      this.sortKey = this.opts.sortKey || columns[0].key;
      this.sortDir = this.opts.sortDir || "desc";
      this.expanded = new Set();
      this.renderHead();
    }

    renderHead() {
      const thead = this.table.querySelector("thead");
      thead.textContent = "";
      const tr = document.createElement("tr");
      for (const col of this.columns) {
        const th = document.createElement("th");
        th.textContent = col.label;
        th.className = "sortable";
        th.tabIndex = 0;
        th.setAttribute("scope", "col");
        if (isNumeric(col)) th.style.textAlign = "right";
        const activate = () => this.toggleSort(col.key);
        th.addEventListener("click", activate);
        th.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        });
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      this.headCells = Array.from(tr.children);
      this.markSort();
    }

    markSort() {
      this.columns.forEach((col, i) => {
        const th = this.headCells[i];
        if (col.key === this.sortKey) {
          th.setAttribute("aria-sort", this.sortDir === "asc" ? "ascending" : "descending");
        } else {
          th.removeAttribute("aria-sort");
        }
      });
    }

    toggleSort(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
      } else {
        this.sortKey = key;
        // Numbers are most useful biggest-first; names A-Z.
        const col = this.columns.find((c) => c.key === key);
        this.sortDir = isNumeric(col) ? "desc" : "asc";
      }
      this.markSort();
      this.render(this.rows);
    }

    sorted(rows) {
      const col = this.columns.find((c) => c.key === this.sortKey);
      if (!col) return rows;
      const dir = this.sortDir === "asc" ? 1 : -1;
      // `sortValue` lets a column sort on something other than what it prints —
      // a due-date column uses it to park the rows that have no due date at the
      // end of the list instead of ahead of every real date.
      const valueOf = (row) => (col.sortValue ? col.sortValue(row) : row[col.key]);
      return rows.slice().sort((a, b) => {
        const av = valueOf(a);
        const bv = valueOf(b);
        if (isNumeric(col)) return ((av || 0) - (bv || 0)) * dir;
        return String(av || "").localeCompare(String(bv || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * dir;
      });
    }

    render(rows) {
      this.rows = rows || [];
      const tbody = this.table.querySelector("tbody");
      tbody.textContent = "";

      if (this.rows.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = this.columns.length;
        td.className = "table-empty";
        td.textContent = this.opts.emptyText || "No rows match the current filters.";
        tr.appendChild(td);
        tbody.appendChild(tr);
        this.renderFoot([]);
        return;
      }

      for (const row of this.sorted(this.rows)) {
        const tr = this.buildRow(row);
        tbody.appendChild(tr);

        if (this.opts.subRows && this.expanded.has(rowId(row))) {
          for (const sub of this.opts.subRows(row)) {
            tbody.appendChild(this.buildSubRow(sub));
          }
        }
      }

      this.renderFoot(this.rows);
    }

    buildRow(row) {
      const tr = document.createElement("tr");
      for (const col of this.columns) {
        const td = document.createElement("td");
        if (col.render) {
          const out = col.render(row);
          if (out instanceof Node) td.appendChild(out);
          else td.textContent = out;
        } else {
          td.textContent = formatCell(row[col.key], col);
        }
        if (isNumeric(col)) td.className = "num";
        if (col.cellClass) addClasses(td, col.cellClass(row));
        tr.appendChild(td);
      }

      if (this.opts.rowClass) addClasses(tr, this.opts.rowClass(row));

      if (this.opts.subRows) {
        tr.classList.add("expandable");
        const id = rowId(row);
        if (this.expanded.has(id)) tr.classList.add("is-open");
        tr.tabIndex = 0;
        tr.setAttribute("aria-expanded", String(this.expanded.has(id)));
        const toggle = () => {
          if (this.expanded.has(id)) this.expanded.delete(id);
          else this.expanded.add(id);
          this.render(this.rows);
        };
        tr.addEventListener("click", toggle);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      } else if (this.opts.onRowClick) {
        // A row that opens a record is a control, so it takes focus and
        // answers the keyboard — the same contract the expandable rows above
        // already honour.
        tr.tabIndex = 0;
        tr.setAttribute("role", "button");
        const open = () => this.opts.onRowClick(row, tr);
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });
      }
      return tr;
    }

    buildSubRow(sub) {
      const tr = document.createElement("tr");
      tr.className = "subrow";
      const cells = sub.cells || [];
      this.columns.forEach((col, i) => {
        const td = document.createElement("td");
        td.textContent = cells[i] === undefined ? "" : cells[i];
        if (isNumeric(col)) td.className = "num";
        tr.appendChild(td);
      });
      return tr;
    }

    renderFoot(rows) {
      const tfoot = this.table.querySelector("tfoot");
      if (!tfoot) return;
      tfoot.textContent = "";
      if (!this.opts.footer || rows.length === 0) return;
      const cells = this.opts.footer(rows);
      const tr = document.createElement("tr");
      this.columns.forEach((col, i) => {
        const td = document.createElement("td");
        td.textContent = cells[i] === undefined ? "" : cells[i];
        if (isNumeric(col)) td.className = "num";
        tr.appendChild(td);
      });
      tfoot.appendChild(tr);
    }
  }

  // `classList.add("")` throws, and a space-separated string throws too, so
  // callers get to return either form and this sorts it out.
  function addClasses(node, value) {
    if (!value) return;
    for (const name of String(value).trim().split(/\s+/)) {
      if (name) node.classList.add(name);
    }
  }

  function rowId(row) {
    return row.__id !== undefined ? row.__id : row.key || row.label;
  }

  function isNumeric(col) {
    return col && (col.type === "num" || col.type === "money" || col.type === "percent");
  }

  function formatCell(value, col) {
    if (value === null || value === undefined || value === "") {
      return col.type === "text" || !col.type ? "" : "—";
    }
    if (col.type === "money") return money(value);
    if (col.type === "percent") return percent(value);
    if (col.type === "num") return count(value);
    return String(value);
  }

  // ===============================
  // Page furniture
  // ===============================
  let toastTimer = null;
  function toast(message) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const node = document.createElement("div");
    node.className = "toast";
    node.setAttribute("role", "status");
    node.textContent = message;
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 2600);
  }

  function download(data, filename, mime) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // A collections fetch walks every Closed Won deal, so moving between the
  // dashboards should not pay for it twice. Session-scoped and best-effort:
  // a full quota or a disabled store just means a refetch.
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const cache = {
    // The version is part of the key: a payload cached before the shape
    // changed would otherwise be replayed into a page that no longer reads it
    // the same way. Bump it whenever the /api/collections response changes.
    key(fromDate, toDate) {
      return `collections:v4:${fromDate}:${toDate}`;
    },
    read(fromDate, toDate) {
      try {
        const raw = sessionStorage.getItem(cache.key(fromDate, toDate));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
        return parsed.data;
      } catch (err) {
        return null;
      }
    },
    write(fromDate, toDate, data) {
      try {
        sessionStorage.setItem(
          cache.key(fromDate, toDate),
          JSON.stringify({ at: Date.now(), data })
        );
      } catch (err) {
        /* quota or private mode — the next load just refetches */
      }
    },
  };

  // ===============================
  // POST a JSON body and read the reply defensively.
  //
  // The reports run long, so a reply can come from something other than
  // Express: Render's edge returns an empty 502/504 body when it gives up on
  // a slow request, and a crashed process yields nothing at all. Calling
  // `resp.json()` straight away turns every one of those into the useless
  // "Unexpected end of JSON input" — the status code, the one fact that says
  // what actually happened, is lost. So read the body as text first and
  // report what came back.
  //
  // The long routes always answer 200 and carry failures as `{ error }` in
  // the body (they must commit to a status before the work finishes, see
  // lib/heartbeat.js), so an `error` field is thrown regardless of status.
  // ===============================
  async function postJson(url, body) {
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Could not reach the server (${err.message}). It may still be starting up — wait a moment and try again.`
      );
    }

    const text = await resp.text();

    if (!text.trim()) {
      throw new Error(
        resp.status === 502 || resp.status === 504
          ? `The server took too long and the connection was cut (HTTP ${resp.status}). Narrow the date range and try again.`
          : `The server closed the connection without sending a reply (HTTP ${resp.status}).`
      );
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      // An HTML error page from the proxy, most often.
      throw new Error(`HTTP ${resp.status}: ${trim(text.replace(/<[^>]*>/g, " ").trim(), 200)}`);
    }

    if (data && data.error) throw new Error(data.error);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return data;
  }

  return {
    COLOR,
    money,
    moneyCompact,
    percent,
    count,
    trim,
    isoToday,
    daysOverdue,
    monthLabel,
    niceCeil,
    svgEl,
    bars,
    lines,
    DataTable,
    toast,
    download,
    cache,
    postJson,
  };
})();
