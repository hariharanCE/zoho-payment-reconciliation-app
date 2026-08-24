// ===============================
// Dashboard shell.
//
// Each insight dashboard is its own page answering one question. Everything
// they have in common lives here: the sidebar, the date range, the filter bar,
// the KPI row, the export button, and the data-shaping helpers they all read
// from. A page supplies only what makes it that page — its title, its KPIs,
// what it draws, and what it exports.
//
// The range and the filters are held in sessionStorage, so moving between
// dashboards keeps the question you were asking. Only the answer changes.
// ===============================
window.Shell = (function () {
  const { money, moneyCompact, percent, count, COLOR, isoToday, daysOverdue, DataTable } = Viz;

  const TODAY = isoToday();
  const RANGE_KEY = "dash:range";
  const FILTER_KEY = "dash:filters";

  // ===============================
  // Sidebar — one list, rendered on every page, so a new dashboard is added
  // in exactly one place.
  // ===============================
  const NAV = [
    {
      id: "reconciliation",
      href: "index.html",
      label: "Reconciliation",
      icon: '<rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><path d="M2.5 7.5h15M7.5 7.5v9"/>',
    },
    {
      id: "collections",
      href: "collections.html",
      label: "Collections",
      icon: '<path d="M3 17h14" stroke-linecap="round"/><rect x="4.5" y="9" width="3" height="5" rx="1"/><rect x="9.5" y="5.5" width="3" height="8.5" rx="1"/><rect x="14.5" y="11.5" width="3" height="2.5" rx="1"/>',
    },
    {
      id: "owner-collections",
      href: "owner-collections.html",
      label: "By Deal Owner",
      icon: '<circle cx="10" cy="6.5" r="3"/><path d="M4 16.5c0-3 2.7-5 6-5s6 2 6 5" stroke-linecap="round"/>',
    },
    // The other insight dashboards (batches, owners, ageing, mix, trend, risk)
    // are deliberately not listed. The pages and their scripts are still
    // served, and still work if opened directly — this menu is the only thing
    // that changed, so putting one back is a matter of adding its entry here.
  ];

  function renderNav(activeId) {
    const nav = document.querySelector(".sidebar");
    if (!nav) return;
    nav.textContent = "";

    const brand = document.createElement("div");
    brand.className = "sidebar-brand";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = "PR";
    const name = document.createElement("b");
    name.className = "sidebar-label";
    name.textContent = "Payments";
    brand.append(mark, name);
    nav.appendChild(brand);

    const list = document.createElement("ul");
    list.className = "sidebar-nav";
    for (const entry of NAV) {
      const li = document.createElement("li");
      if (entry.group) {
        li.className = "sidebar-group";
        const label = document.createElement("span");
        label.className = "sidebar-label";
        label.textContent = entry.group;
        li.appendChild(label);
        list.appendChild(li);
        continue;
      }
      const link = document.createElement("a");
      link.href = entry.href;
      link.className = `sidebar-link${entry.id === activeId ? " active" : ""}`;
      if (entry.id === activeId) link.setAttribute("aria-current", "page");
      // The icon paths are literals from NAV above, never data — the only
      // innerHTML in the app, and it never touches a CRM string.
      link.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${entry.icon}</svg>`;
      const text = document.createElement("span");
      text.className = "sidebar-label";
      text.textContent = entry.label;
      link.appendChild(text);
      li.appendChild(link);
      list.appendChild(li);
    }
    nav.appendChild(list);

    const foot = document.createElement("p");
    foot.className = "sidebar-foot";
    foot.textContent = "Zoho CRM & Books";
    nav.appendChild(foot);
  }

  // ===============================
  // Data shaping — shared by every insight page, so two dashboards can never
  // disagree about what "pending" or "past due" means.
  // ===============================
  function dealKey(item) {
    return item.dealId || `${item.dealName}|${item.email}|${item.phone}`;
  }

  function isOverdue(item) {
    return !item.paid && item.expectedDate && item.expectedDate < TODAY;
  }

  function aggregate(items, keyOf, emptyLabel) {
    const map = new Map();
    for (const item of items) {
      const key = keyOf(item) || "";
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          label: key || emptyLabel || "— not set —",
          total: 0, paid: 0, pending: 0, overdue: 0,
          payments: 0, paidCount: 0, pendingCount: 0,
          dealSet: new Set(),
          earliestDue: "",
          maxDaysLate: 0,
        };
        map.set(key, group);
      }
      group.total += item.amount;
      group.payments++;
      group.dealSet.add(dealKey(item));
      if (item.paid) {
        group.paid += item.amount;
        group.paidCount++;
      } else {
        group.pending += item.amount;
        group.pendingCount++;
        if (isOverdue(item)) group.overdue += item.amount;
        group.maxDaysLate = Math.max(group.maxDaysLate, daysOverdue(item.expectedDate, TODAY));
        if (item.expectedDate && (!group.earliestDue || item.expectedDate < group.earliestDue)) {
          group.earliestDue = item.expectedDate;
        }
      }
    }
    return Array.from(map.values()).map((group) => ({
      key: group.key,
      label: group.label,
      total: group.total,
      paid: group.paid,
      pending: group.pending,
      overdue: group.overdue,
      payments: group.payments,
      paidCount: group.paidCount,
      pendingCount: group.pendingCount,
      deals: group.dealSet.size,
      earliestDue: group.earliestDue,
      maxDaysLate: group.maxDaysLate,
      rate: group.total > 0 ? group.paid / group.total : 0,
    }));
  }

  function totalsOf(items) {
    const totals = {
      expected: 0, paid: 0, pending: 0, overdue: 0,
      payments: items.length, paidCount: 0, pendingCount: 0,
      maxDaysLate: 0,
    };
    const deals = new Set();
    const pendingDeals = new Set();
    const overdueDeals = new Set();
    for (const item of items) {
      totals.expected += item.amount;
      deals.add(dealKey(item));
      if (item.paid) {
        totals.paid += item.amount;
        totals.paidCount++;
      } else {
        totals.pending += item.amount;
        totals.pendingCount++;
        pendingDeals.add(dealKey(item));
        if (isOverdue(item)) {
          totals.overdue += item.amount;
          overdueDeals.add(dealKey(item));
          totals.maxDaysLate = Math.max(totals.maxDaysLate, daysOverdue(item.expectedDate, TODAY));
        }
      }
    }
    totals.deals = deals.size;
    totals.pendingDeals = pendingDeals.size;
    totals.overdueDeals = overdueDeals.size;
    totals.rate = totals.expected > 0 ? totals.paid / totals.expected : 0;
    return totals;
  }

  // The paid-vs-pending breakdown shape, shared by every stacked bar chart.
  function splitRow(group) {
    return {
      key: group.key,
      label: group.label,
      total: group.total,
      segments: [
        { name: "Collected", value: group.paid, color: COLOR.paid },
        { name: "Pending", value: group.pending, color: COLOR.pending },
      ],
      group,
    };
  }

  function splitTooltip(row) {
    const g = row.group;
    const rows = [
      { name: "Collected", value: money(g.paid), color: COLOR.paid },
      { name: "Pending", value: money(g.pending), color: COLOR.pending },
    ];
    if (g.overdue > 0) {
      rows.push({ name: "of which past due", value: money(g.overdue), color: null });
    }
    return {
      title: g.label,
      rows,
      foot: `${count(g.payments)} payment(s) · ${count(g.deals)} deal(s) · ${percent(g.rate)} collected`,
    };
  }

  function splitTrailing(row) {
    return `${moneyCompact(row.total)} · ${percent(row.group.rate)}`;
  }

  // Fixed bucket order, darkening with age. The names are printed beside the
  // bars, so the ordering never rests on colour alone.
  //
  // `test` reads days-late; `accepts` reads the whole payment, because the
  // first bucket can't be told from the others by a day count alone — a full
  // payment has no due date, so it is neither late nor "not yet due", and
  // letting its zero days fall into "Not yet due" would quietly claim a
  // deadline it doesn't have.
  const AGE_BUCKETS = [
    {
      key: "no-due-date",
      label: "No due date",
      color: COLOR.muted,
      test: () => false,
      accepts: (item) => !item.expectedDate,
    },
    { key: "future", label: "Not yet due", color: COLOR.pending, test: (d) => d === 0 },
    { key: "1-30", label: "1–30 days late", color: COLOR.age[0], test: (d) => d >= 1 && d <= 30 },
    { key: "31-60", label: "31–60 days late", color: COLOR.age[1], test: (d) => d >= 31 && d <= 60 },
    { key: "61-90", label: "61–90 days late", color: COLOR.age[2], test: (d) => d >= 61 && d <= 90 },
    { key: "90+", label: "Over 90 days late", color: COLOR.age[3], test: (d) => d > 90 },
  ];

  // The one bucket a payment belongs in — the same rule the chart, the table
  // and the Excel export all read, so a row can never be labelled one way and
  // counted another.
  function bucketOf(item) {
    return AGE_BUCKETS.find((bucket) =>
      bucket.accepts
        ? bucket.accepts(item)
        : item.expectedDate && bucket.test(daysOverdue(item.expectedDate, TODAY))
    );
  }

  function ageingRows(items) {
    const unpaid = items.filter((item) => !item.paid);
    return AGE_BUCKETS.map((bucket, index) => {
      const inBucket = unpaid.filter((item) => bucketOf(item) === bucket);
      const amount = inBucket.reduce((acc, item) => acc + item.amount, 0);
      return {
        key: bucket.key,
        // Ordered by age, not alphabet — the table sorts on this, never on
        // the label ("1–30" would otherwise sort above "Not yet due").
        order: String(index),
        label: bucket.label,
        color: bucket.color,
        amount,
        payments: inBucket.length,
        deals: new Set(inBucket.map(dealKey)).size,
        oldest: inBucket.reduce(
          (acc, item) => (!acc || item.expectedDate < acc ? item.expectedDate : acc),
          ""
        ),
        maxDays: inBucket.reduce(
          (acc, item) => Math.max(acc, daysOverdue(item.expectedDate, TODAY)),
          0
        ),
        items: inBucket,
      };
    });
  }

  // The month axis comes from the loaded range, not from the filtered rows, so
  // a month that filters down to nothing still reads as a gap in the series
  // rather than vanishing from the axis.
  function trendRows(items, months) {
    const buckets = new Map();
    for (const month of months) {
      buckets.set(month.month, {
        key: month.month,
        label: month.label,
        expected: 0, collected: 0, pending: 0, overdue: 0, payments: 0,
      });
    }
    for (const item of items) {
      const bucket = buckets.get((item.expectedDate || "").slice(0, 7));
      if (!bucket) continue;
      bucket.expected += item.amount;
      bucket.payments++;
      if (item.paid) bucket.collected += item.amount;
      else {
        bucket.pending += item.amount;
        if (isOverdue(item)) bucket.overdue += item.amount;
      }
    }

    let runExpected = 0;
    let runCollected = 0;
    return Array.from(buckets.values()).map((bucket) => {
      runExpected += bucket.expected;
      runCollected += bucket.collected;
      return {
        ...bucket,
        cumExpected: runExpected,
        cumCollected: runCollected,
        shortfall: runExpected - runCollected,
        rate: bucket.expected > 0 ? bucket.collected / bucket.expected : 0,
      };
    });
  }

  function riskRows(items) {
    const map = new Map();
    for (const item of items) {
      const key = dealKey(item);
      let deal = map.get(key);
      if (!deal) {
        deal = {
          __id: key,
          label: item.dealName || "— unnamed deal —",
          batch: item.batch || "",
          dealOwner: item.dealOwner || "",
          paymentType: item.paymentType || "",
          email: item.email || "",
          phone: item.phone || "",
          // Carried so the customer detail panel can show the batch's start
          // date beside the due dates it gates, without a second lookup.
          batchStartDate: item.batchStartDate || "",
          closingDate: item.closingDate || "",
          dealId: item.dealId || "",
          scheduled: 0, collected: 0, pending: 0, overdue: 0,
          pendingCount: 0, paidCount: 0,
          earliestDue: "",
          maxDaysLate: 0,
          payments: [],
        };
        map.set(key, deal);
      }
      deal.scheduled += item.amount;
      deal.payments.push(item);
      if (item.paid) {
        deal.collected += item.amount;
        deal.paidCount++;
      } else {
        deal.pending += item.amount;
        deal.pendingCount++;
        deal.maxDaysLate = Math.max(deal.maxDaysLate, daysOverdue(item.expectedDate, TODAY));
        if (isOverdue(item)) deal.overdue += item.amount;
        if (item.expectedDate && (!deal.earliestDue || item.expectedDate < deal.earliestDue)) {
          deal.earliestDue = item.expectedDate;
        }
      }
    }
    return Array.from(map.values());
  }

  // Rates go out as whole percents — a bare 0.63 in a column headed
  // "Collected %" reads as sixty-three hundredths of a percent in Excel.
  function breakdownSheet(header, groups, name) {
    return {
      name: name || header,
      columns: [
        { header, key: "label", type: "text", width: 24 },
        { header: "Deals", key: "deals", type: "number", width: 10 },
        { header: "Payments", key: "payments", type: "number", width: 12 },
        { header: "Expected", key: "total", type: "money", width: 16 },
        { header: "Collected", key: "paid", type: "money", width: 16 },
        { header: "Pending", key: "pending", type: "money", width: 16 },
        { header: "Past due", key: "overdue", type: "money", width: 16 },
        { header: "Collected %", key: "rate", type: "number", width: 13 },
      ],
      rows: groups
        .slice()
        .sort((a, b) => b.pending - a.pending)
        .map((group) => ({ ...group, rate: group.rate * 100 })),
    };
  }

  // The standard breakdown table, used by every "by dimension" dashboard.
  function breakdownTable(tableEl, singular) {
    return new DataTable(
      tableEl,
      [
        { key: "label", label: singular, type: "text" },
        { key: "deals", label: "Deals", type: "num" },
        { key: "payments", label: "Payments", type: "num" },
        { key: "total", label: "Expected", type: "money" },
        { key: "paid", label: "Collected", type: "money" },
        { key: "pending", label: "Pending", type: "money" },
        { key: "overdue", label: "Past due", type: "money" },
        { key: "rate", label: "Collected %", type: "percent" },
      ],
      {
        sortKey: "pending",
        sortDir: "desc",
        emptyText: "No payments match the current filters.",
        footer: (rows) => {
          const sum = (key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);
          const total = sum("total");
          return [
            `${rows.length} row(s)`,
            count(sum("deals")),
            count(sum("payments")),
            money(total),
            money(sum("paid")),
            money(sum("pending")),
            money(sum("overdue")),
            percent(total > 0 ? sum("paid") / total : 0),
          ];
        },
      }
    );
  }

  // ===============================
  // The page controller.
  // ===============================
  const CHART_ROW_CAP = 20;

  function start(page) {
    renderNav(page.nav);

    const els = {
      controls: document.getElementById("controls"),
      status: document.getElementById("status"),
      dashboard: document.getElementById("dashboard"),
      filters: document.getElementById("filters"),
      kpis: document.getElementById("kpis"),
      metaValue: document.getElementById("metaValue"),
      metaLabel: document.getElementById("metaLabel"),
      topMeta: document.getElementById("topMeta"),
    };

    buildControls(els.controls, page);
    buildFilters(els.filters);

    const ui = {
      fromDate: document.getElementById("fromDate"),
      toDate: document.getElementById("toDate"),
      runBtn: document.getElementById("runBtn"),
      exportBtn: document.getElementById("exportBtn"),
      batchFilter: document.getElementById("batchFilter"),
      ownerFilter: document.getElementById("ownerFilter"),
      typeFilter: document.getElementById("typeFilter"),
      statusFilter: document.getElementById("statusFilter"),
      searchBox: document.getElementById("searchBox"),
      clearFilters: document.getElementById("clearFilters"),
      chips: document.getElementById("chips"),
      filterbar: document.getElementById("filterbar"),
    };

    let payload = null;
    const filters = restoreFilters();

    // --- range ---
    function markActivePreset(preset) {
      document.querySelectorAll(".presets button").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.preset === preset);
      });
    }

    function isoShift(months) {
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth() + months, 1);
      const pad = (n) => String(n).padStart(2, "0");
      return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-01`;
    }

    function applyPreset(preset) {
      const now = new Date();
      if (preset === "ytd") {
        ui.fromDate.value = `${now.getFullYear()}-01-01`;
        ui.toDate.value = `${now.getFullYear()}-12-31`;
      } else if (preset === "last6") {
        ui.fromDate.value = isoShift(-5);
        ui.toDate.value = TODAY;
      } else if (preset === "last12") {
        ui.fromDate.value = isoShift(-11);
        ui.toDate.value = TODAY;
      } else if (preset === "next6") {
        ui.fromDate.value = isoShift(0);
        ui.toDate.value = isoShift(6);
      }
      markActivePreset(preset);
    }

    function saveRange() {
      write(RANGE_KEY, { fromDate: ui.fromDate.value, toDate: ui.toDate.value });
    }

    // --- filtering ---
    function filteredItems() {
      if (!payload) return [];
      const q = filters.q.trim().toLowerCase();
      return payload.items.filter((item) => {
        if (filters.batch && (item.batch || "") !== filters.batch) return false;
        if (filters.owner && (item.dealOwner || "") !== filters.owner) return false;
        if (filters.type && (item.paymentType || "") !== filters.type) return false;
        if (filters.status === "collected" && !item.paid) return false;
        if (filters.status === "pending" && item.paid) return false;
        if (filters.status === "overdue" && !isOverdue(item)) return false;
        if (q) {
          const hay = `${item.dealName} ${item.email} ${item.phone} ${item.batch} ${item.dealOwner}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    }

    function hasFilters() {
      return Boolean(
        filters.batch || filters.owner || filters.type || filters.q || filters.status !== "all"
      );
    }

    const CHIP_LABELS = {
      batch: "Batch", owner: "Owner", type: "Payment type",
      status: "Status", q: "Search",
    };

    function renderChips() {
      ui.chips.textContent = "";
      const active = Object.entries(filters).filter(([key, value]) =>
        key === "status" ? value !== "all" : Boolean(value)
      );
      ui.clearFilters.disabled = active.length === 0;

      for (const [key, value] of active) {
        const chip = document.createElement("span");
        chip.className = "chip";
        const text = document.createElement("span");
        const strong = document.createElement("b");
        strong.textContent = `${CHIP_LABELS[key]}: `;
        text.append(strong, document.createTextNode(String(value)));
        const clear = document.createElement("button");
        clear.type = "button";
        clear.setAttribute("aria-label", `Clear ${CHIP_LABELS[key]} filter`);
        clear.textContent = "×";
        clear.addEventListener("click", () => setFilter(key, key === "status" ? "all" : ""));
        chip.append(text, clear);
        ui.chips.appendChild(chip);
      }
    }

    function setFilter(key, value) {
      // Clicking the bar you are already filtered to clears the filter — the
      // chart doubles as the way back out.
      filters[key] = filters[key] === value && key !== "status" ? "" : value;
      syncFilterControls();
      write(FILTER_KEY, filters);
      refresh();
    }

    function syncFilterControls() {
      ui.batchFilter.value = filters.batch;
      ui.ownerFilter.value = filters.owner;
      ui.typeFilter.value = filters.type;
      ui.searchBox.value = filters.q;
      ui.statusFilter.querySelectorAll("button").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.status === filters.status));
      });
    }

    function fillSelect(select, values, allLabel) {
      select.textContent = "";
      const all = document.createElement("option");
      all.value = "";
      all.textContent = allLabel;
      select.appendChild(all);
      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value || "— not set —";
        select.appendChild(option);
      }
    }

    function populateFilters() {
      const uniq = (keyOf) =>
        Array.from(new Set(payload.items.map(keyOf).map((v) => v || ""))).sort((a, b) =>
          String(a).localeCompare(String(b))
        );
      fillSelect(ui.batchFilter, uniq((i) => i.batch), "All batches");
      fillSelect(ui.ownerFilter, uniq((i) => i.dealOwner), "All owners");
      fillSelect(ui.typeFilter, uniq((i) => i.paymentType), "All types");

      // A filter carried over from another dashboard can name something this
      // range doesn't contain. Drop it rather than showing a chip that
      // silently matches nothing.
      syncFilterControls();
      for (const [key, select] of [
        ["batch", ui.batchFilter],
        ["owner", ui.ownerFilter],
        ["type", ui.typeFilter],
      ]) {
        if (filters[key] && select.value !== filters[key]) filters[key] = "";
      }
      syncFilterControls();
      write(FILTER_KEY, filters);
    }

    // --- KPIs ---
    function defaultKpis(totals) {
      return [
        { label: "Expected in view", value: moneyCompact(totals.expected), sub: `${count(totals.payments)} payment(s)` },
        { label: "Collected", value: moneyCompact(totals.paid), sub: `${count(totals.paidCount)} payment(s)`, accent: "paid" },
        { label: "Pending", value: moneyCompact(totals.pending), sub: `${count(totals.pendingCount)} payment(s)`, accent: "pending" },
        { label: "Pending & past due", value: moneyCompact(totals.overdue), sub: `as at ${TODAY}`, accent: "overdue" },
        { label: "Collection rate", value: percent(totals.rate), sub: "of expected, in view" },
        { label: "Deals in view", value: count(totals.deals), sub: `${count(totals.pendingDeals)} still owe` },
      ];
    }

    function renderKpis(totals, items, months) {
      const tiles = (page.kpis ? page.kpis(totals, items, months) : defaultKpis(totals)).filter(Boolean);
      els.kpis.textContent = "";
      for (const tile of tiles) {
        const box = document.createElement("div");
        box.className = `kpi${tile.accent ? ` accent-${tile.accent}` : ""}`;
        const label = document.createElement("span");
        label.className = "kpi-label";
        label.textContent = tile.label;
        const value = document.createElement("span");
        value.className = "kpi-value";
        value.textContent = tile.value;
        const sub = document.createElement("span");
        sub.className = "kpi-sub";
        sub.textContent = tile.sub || "";
        box.append(label, value, sub);
        els.kpis.appendChild(box);
      }

      if (els.topMeta) {
        els.topMeta.hidden = false;
        const meta = page.meta ? page.meta(totals) : { value: moneyCompact(totals.pending), label: "pending" };
        els.metaValue.textContent = meta.value;
        els.metaLabel.textContent = hasFilters() ? `${meta.label}, filtered` : `${meta.label} in range`;
      }
    }

    // --- render ---
    function refresh() {
      if (!payload) return;
      const items = filteredItems();
      const totals = totalsOf(items);
      renderChips();
      renderKpis(totals, items, payload.months);
      page.render({ items, totals, months: payload.months, payload, setFilter, filters });
      ui.exportBtn.disabled = items.length === 0;
    }

    // --- load ---
    async function load(options) {
      const fromDate = ui.fromDate.value;
      const toDate = ui.toDate.value;
      if (!fromDate || !toDate) return setStatus("Pick both a from and to date.", true);
      if (fromDate > toDate) return setStatus("The from date must not be after the to date.", true);
      saveRange();

      const cached = (options || {}).force ? null : Viz.cache.read(fromDate, toDate);
      if (cached) {
        payload = cached;
        afterLoad(true);
        return;
      }

      ui.runBtn.disabled = true;
      ui.runBtn.classList.add("is-busy");
      ui.exportBtn.disabled = true;
      setStatus("Loading Closed Won deals from CRM…", false);
      els.dashboard.classList.add("loading");

      try {
        const data = await Viz.postJson("/api/collections", { fromDate, toDate });
        payload = data;
        Viz.cache.write(fromDate, toDate, data);
        afterLoad(false);
      } catch (err) {
        setStatus(`Error: ${err.message}`, true);
      } finally {
        ui.runBtn.disabled = false;
        ui.runBtn.classList.remove("is-busy");
        els.dashboard.classList.remove("loading");
      }
    }

    function afterLoad(fromCache) {
      populateFilters();
      // Unhide BEFORE drawing: the charts size their bands from the
      // container's width, and a `display: none` container measures zero.
      els.dashboard.hidden = false;
      refresh();
      setStatus(notes(payload, fromCache), payload.invalidDates.count > 0);
    }

    function setStatus(message, isError) {
      els.status.textContent = message;
      els.status.classList.toggle("error", Boolean(isError));
    }

    // --- export ---
    function exportView() {
      const items = filteredItems();
      if (items.length === 0) return;
      const bytes = XlsxWriter.buildXlsx(
        page.sheets({ items, months: payload.months, totals: totalsOf(items) })
      );
      Viz.download(
        bytes,
        `${page.exportName}-${ui.fromDate.value}-to-${ui.toDate.value}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      Viz.toast(`${page.title} exported to Excel.`);
    }

    // --- wiring ---
    ui.runBtn.addEventListener("click", () => load({ force: true }));
    ui.exportBtn.addEventListener("click", exportView);
    ui.clearFilters.addEventListener("click", () => {
      filters.batch = ""; filters.owner = ""; filters.type = "";
      filters.status = "all"; filters.q = "";
      syncFilterControls();
      write(FILTER_KEY, filters);
      refresh();
    });
    ui.batchFilter.addEventListener("change", () => setFilter("batch", ui.batchFilter.value));
    ui.ownerFilter.addEventListener("change", () => setFilter("owner", ui.ownerFilter.value));
    ui.typeFilter.addEventListener("change", () => setFilter("type", ui.typeFilter.value));
    ui.statusFilter.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setFilter("status", btn.dataset.status));
    });

    // Typing filters as you go, but only once you have paused — re-aggregating
    // on every keystroke over a few thousand payments is wasted work.
    let searchTimer = null;
    ui.searchBox.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => setFilter("q", ui.searchBox.value), 180);
    });

    document.querySelectorAll(".presets button").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyPreset(btn.dataset.preset);
        load();
      });
    });
    // Typing a date by hand means none of the presets describes the range now.
    [ui.fromDate, ui.toDate].forEach((input) => {
      input.addEventListener("input", () => markActivePreset(null));
    });

    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        ui.searchBox.focus();
      }
    });

    // The charts size themselves to their container, so a resize would
    // otherwise leave them stretched or clipped.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (!payload) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(refresh, 140);
    });

    // A shadow under the filter bar, but only once it has actually stuck.
    const sentinel = document.createElement("div");
    sentinel.style.height = "1px";
    ui.filterbar.parentNode.insertBefore(sentinel, ui.filterbar);
    new IntersectionObserver(
      ([entry]) => {
        if (els.dashboard.hidden) return;
        ui.filterbar.classList.toggle("is-stuck", !entry.isIntersecting);
      },
      { threshold: 1 }
    ).observe(sentinel);

    // --- boot ---
    const saved = read(RANGE_KEY);
    if (saved && saved.fromDate && saved.toDate) {
      ui.fromDate.value = saved.fromDate;
      ui.toDate.value = saved.toDate;
    } else {
      applyPreset("last6");
    }
    syncFilterControls();
    load();
  }

  // ===============================
  // "By dimension" dashboards — batches and owners ask the same question of
  // a different column, so they share one implementation and differ only in
  // the config they pass.
  // ===============================
  function startBreakdown(config) {
    let table = null;
    start({
      nav: config.nav,
      title: config.title,
      exportName: config.exportName,
      kpis: config.kpis,
      meta: config.meta,
      render({ items, setFilter }) {
        const groups = aggregate(items, config.keyOf).sort((a, b) => b.total - a.total);
        const chartEl = document.getElementById(config.chart);
        const shown = groups.slice(0, CHART_ROW_CAP);

        Viz.bars(chartEl, {
          rows: shown.map(splitRow),
          trailing: splitTrailing,
          tooltip: splitTooltip,
          onSelect: (row) => setFilter(config.filterKey, row.key),
          emptyText: "No payments match the current filters.",
        });
        capNote(chartEl, shown.length, groups.length, config.plural);

        if (!table) {
          table = breakdownTable(document.getElementById(config.table), config.singular);
        }
        table.render(groups);
      },
      sheets: ({ items }) => [
        breakdownSheet(config.singular, aggregate(items, config.keyOf)),
      ],
    });
  }

  // The weakest performer by collection rate, for the headline KPI on the
  // breakdown dashboards. Groups with nothing expected have no rate to rank.
  function weakest(groups) {
    const ranked = groups.filter((g) => g.total > 0).sort((a, b) => a.rate - b.rate);
    return ranked[0] || null;
  }

  function largestPending(groups) {
    const ranked = groups.slice().sort((a, b) => b.pending - a.pending);
    return ranked[0] || null;
  }

  // ===============================
  // Shared markup: the controls row and the filter bar are identical on every
  // dashboard, so they are built once here rather than copied into six files.
  // ===============================
  function buildControls(mount, page) {
    mount.className = "controls";
    mount.innerHTML = `
      <div class="field">
        <label for="fromDate">From (payment due)</label>
        <input type="date" id="fromDate" />
      </div>
      <div class="field">
        <label for="toDate">To (payment due)</label>
        <input type="date" id="toDate" />
      </div>
      <div class="presets" role="group" aria-label="Quick ranges">
        <button type="button" data-preset="ytd">This year</button>
        <button type="button" data-preset="last6">Last 6 months</button>
        <button type="button" data-preset="last12">Last 12 months</button>
        <button type="button" data-preset="next6">Next 6 months</button>
      </div>
      <button id="runBtn" class="run-btn">Reload</button>
      <button id="exportBtn" class="csv-btn" disabled>Export to Excel</button>`;
  }

  function buildFilters(mount) {
    mount.innerHTML = `
      <section class="filterbar" id="filterbar" aria-label="Filters">
        <div class="field">
          <label for="batchFilter">Batch</label>
          <select id="batchFilter"><option value="">All batches</option></select>
        </div>
        <div class="field">
          <label for="ownerFilter">Deal owner</label>
          <select id="ownerFilter"><option value="">All owners</option></select>
        </div>
        <div class="field">
          <label for="typeFilter">Payment type</label>
          <select id="typeFilter"><option value="">All types</option></select>
        </div>
        <div class="field">
          <label id="statusLabel">Status</label>
          <div class="segmented" role="group" aria-labelledby="statusLabel" id="statusFilter">
            <button type="button" data-status="all" aria-pressed="true">All</button>
            <button type="button" data-status="collected" aria-pressed="false">Collected</button>
            <button type="button" data-status="pending" aria-pressed="false">Pending</button>
            <button type="button" data-status="overdue" aria-pressed="false">Past due</button>
          </div>
        </div>
        <div class="field search-field">
          <label for="searchBox">Search</label>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" stroke="currentColor"/>
            <path d="M13 13l4 4" stroke="currentColor" stroke-linecap="round"/>
          </svg>
          <input type="search" id="searchBox" placeholder="Deal, email, phone…" />
        </div>
        <button type="button" id="clearFilters" class="ghost-btn" disabled>Clear filters</button>
      </section>
      <div class="chips" id="chips"></div>`;
  }

  // The same caveats the collections dashboard prints — money the report
  // cannot see is always said out loud, never quietly dropped.
  function notes(payload, fromCache) {
    let note = `${count(payload.items.length)} scheduled payment(s) across ${
      payload.months.length
    } month(s), from ${count(payload.totalClosedWonDeals)} Closed Won deal(s).`;
    if (fromCache) note += " Loaded from this session's cache — press Reload to refetch.";
    if (payload.undated.count > 0) {
      note += ` Note: ${payload.undated.count} payment(s) worth ${money(
        payload.undated.amount
      )} have no due date in CRM and are excluded.`;
    }
    if (payload.invalidDates.count > 0) {
      note += ` Warning: ${payload.invalidDates.count} payment(s) worth ${money(
        payload.invalidDates.amount
      )} have a due date CRM didn't return as a real date (e.g. ${payload.invalidDates.samples.join(
        ", "
      )}) — they can't be placed in a month and are excluded.`;
    }
    if (payload.unrecognisedDeals > 0) {
      note += ` ${payload.unrecognisedDeals} deal(s) have an unrecognised Payment Type and contribute no scheduled payments.`;
    }
    return note;
  }

  // Session storage is best-effort everywhere it is used here: a full quota or
  // a private window just means the defaults come back.
  function read(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch (err) {
      return null;
    }
  }

  function write(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* nothing depends on this sticking */
    }
  }

  function restoreFilters() {
    const base = { batch: "", owner: "", type: "", status: "all", q: "" };
    return Object.assign(base, read(FILTER_KEY) || {});
  }

  // ===============================
  // Customer detail panel.
  //
  // Clicking a record anywhere opens the same panel, so "open the customer"
  // means one thing in the whole app. It takes a deal row in the shape
  // riskRows() produces and shows the contact details, the money, and the full
  // payment schedule behind the two numbers on the dashboard.
  //
  // The frame is built once from literal markup; every value that comes from
  // CRM is written with textContent, so a deal name containing markup is text
  // here and nothing else.
  // ===============================
  let detailEls = null;
  let detailReturnFocus = null;

  function buildDetail() {
    if (detailEls) return detailEls;
    const root = document.createElement("div");
    root.className = "detail";
    root.hidden = true;
    root.innerHTML = [
      '<div class="detail-backdrop" data-close></div>',
      '<div class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detailTitle">',
      '  <header class="detail-head">',
      '    <div><h2 id="detailTitle"></h2><p class="detail-sub"></p></div>',
      '    <button type="button" class="detail-close" data-close aria-label="Close">&times;</button>',
      '  </header>',
      '  <div class="detail-stats"></div>',
      '  <div class="detail-body">',
      '    <div class="detail-meterwrap">',
      '      <div class="detail-meterhead">',
      '        <span class="detail-meterlabel">Collected of scheduled</span>',
      '        <b class="detail-metervalue"></b>',
      '      </div>',
      '      <div class="meter"><div class="meter-fill"></div></div>',
      '    </div>',
      '    <h3 class="detail-h3">Customer</h3>',
      '    <dl class="detail-grid"></dl>',
      '    <h3 class="detail-h3">Payment schedule</h3>',
      '    <div class="table-wrap flat">',
      '      <table class="data-table detail-table">',
      '        <thead></thead><tbody></tbody><tfoot></tfoot>',
      '      </table>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join("");
    document.body.appendChild(root);

    detailEls = {
      root,
      title: root.querySelector("#detailTitle"),
      sub: root.querySelector(".detail-sub"),
      stats: root.querySelector(".detail-stats"),
      meterValue: root.querySelector(".detail-metervalue"),
      meterFill: root.querySelector(".meter-fill"),
      grid: root.querySelector(".detail-grid"),
      table: root.querySelector(".detail-table"),
      close: root.querySelector(".detail-close"),
    };

    root.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", closeDetail);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !root.hidden) closeDetail();
    });
    return detailEls;
  }

  function statTile(label, value, accent) {
    const box = document.createElement("div");
    box.className = "stat";
    const v = document.createElement("span");
    v.className = "stat-value";
    v.textContent = value;
    const l = document.createElement("span");
    l.className = accent ? "stat-label " + accent : "stat-label";
    l.textContent = label;
    box.append(v, l);
    return box;
  }

  function defineRow(list, term, value) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value || "—";
    if (!value) dd.classList.add("is-empty");
    list.append(dt, dd);
  }

  function openDetail(deal) {
    const els = buildDetail();
    const rate = deal.scheduled > 0 ? deal.collected / deal.scheduled : 0;

    els.title.textContent = deal.label || "— unnamed deal —";
    els.sub.textContent = [
      deal.dealOwner || "no owner",
      deal.batch || "no batch",
      deal.paymentType || "no payment type",
    ].join(" · ");

    els.stats.textContent = "";
    els.stats.append(
      statTile("Scheduled", money(deal.scheduled)),
      statTile("Collected", money(deal.collected), "paid"),
      statTile("Pending", money(deal.pending), "pending-amt"),
      statTile("Pending & past due", money(deal.overdue), "overdue")
    );

    els.meterValue.textContent = percent(rate) + " of " + moneyCompact(deal.scheduled);
    els.meterFill.style.width = Math.round(rate * 100) + "%";

    els.grid.textContent = "";
    defineRow(els.grid, "Deal owner", deal.dealOwner);
    defineRow(els.grid, "Batch", deal.batch);
    // Shown as a plain CRM field. Nothing in the app filters or calculates on
    // it — it is here because it is worth seeing beside the schedule below.
    defineRow(els.grid, "Batch start date", deal.batchStartDate);
    defineRow(els.grid, "Payment type", deal.paymentType);
    defineRow(els.grid, "Closing date", deal.closingDate);
    defineRow(els.grid, "Email", deal.email);
    defineRow(els.grid, "Phone", deal.phone);

    renderDetailTable(
      els.table,
      deal.payments.slice().sort(function (a, b) {
        // Undated last: a full payment has no due date, so it can't lead a
        // list ordered by when the money was due.
        return (a.expectedDate || "9999-12-31").localeCompare(
          b.expectedDate || "9999-12-31"
        );
      })
    );

    detailReturnFocus = document.activeElement;
    els.root.hidden = false;
    document.body.classList.add("drill-open");
    els.close.focus();
  }

  function renderDetailTable(table, rows) {
    const head = table.querySelector("thead");
    const body = table.querySelector("tbody");
    const foot = table.querySelector("tfoot");
    const columns = ["Payment", "Due date", "Amount", "Status"];

    head.textContent = "";
    const headRow = document.createElement("tr");
    columns.forEach(function (label, i) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      if (i === 2) th.style.textAlign = "right";
      headRow.appendChild(th);
    });
    head.appendChild(headRow);

    body.textContent = "";
    if (rows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.className = "table-empty";
      td.textContent = "This deal has no scheduled payments in the current view.";
      tr.appendChild(td);
      body.appendChild(tr);
    }

    for (const item of rows) {
      const tr = document.createElement("tr");
      const late = isOverdue(item);
      if (late) tr.classList.add("is-overdue");

      const name = document.createElement("td");
      name.textContent = item.component;

      const due = document.createElement("td");
      due.textContent = item.expectedDate || "— no due date";

      const amount = document.createElement("td");
      amount.className = "num";
      amount.textContent = money(item.amount);

      const status = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = item.paid ? "pill is-paid" : late ? "pill is-late" : "pill is-pending";
      pill.textContent = item.paid
        ? "Collected"
        : late
        ? "Pending · " + count(daysOverdue(item.expectedDate, TODAY)) + " days late"
        : "Pending";
      status.appendChild(pill);

      tr.append(name, due, amount, status);
      body.appendChild(tr);
    }

    foot.textContent = "";
    if (rows.length > 0) {
      const tr = document.createElement("tr");
      const cells = [
        rows.length + " payment(s)",
        "",
        money(rows.reduce(function (acc, r) { return acc + r.amount; }, 0)),
        "",
      ];
      cells.forEach(function (text, i) {
        const td = document.createElement("td");
        td.textContent = text;
        if (i === 2) td.className = "num";
        tr.appendChild(td);
      });
      foot.appendChild(tr);
    }
  }

  function closeDetail() {
    if (!detailEls) return;
    detailEls.root.hidden = true;
    document.body.classList.remove("drill-open");
    if (detailReturnFocus && detailReturnFocus.focus) detailReturnFocus.focus();
    detailReturnFocus = null;
  }

  // Never cap silently: a chart showing a slice says what it left out.
  function capNote(container, shown, total, noun) {
    if (total <= shown) return;
    const note = document.createElement("p");
    note.className = "card-note";
    note.textContent = `Showing the ${shown} largest of ${total} ${noun} — the table below lists them all.`;
    container.appendChild(note);
  }

  return {
    TODAY,
    CHART_ROW_CAP,
    renderNav,
    start,
    startBreakdown,
    weakest,
    largestPending,
    dealKey,
    isOverdue,
    aggregate,
    totalsOf,
    splitRow,
    splitTooltip,
    splitTrailing,
    AGE_BUCKETS,
    bucketOf,
    ageingRows,
    trendRows,
    riskRows,
    breakdownSheet,
    breakdownTable,
    capNote,
    openDetail,
    closeDetail,
  };
})();

// Pages that run their own controller (reconciliation, collections) still get
// the shared sidebar by declaring which entry is current.
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".sidebar[data-nav]");
  if (nav) Shell.renderNav(nav.dataset.nav);
});
