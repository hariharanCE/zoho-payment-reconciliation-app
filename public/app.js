// ===============================
// Reconciliation report.
//
// The table is the whole page here, so it carries the interaction: every
// column sorts, the search box and the result filter narrow it live, and the
// stat tiles double as one-click filters. Rendering goes through Viz.DataTable
// (textContent, never innerHTML), so CRM free text can't inject markup.
// ===============================
(function () {
  const { money, count, DataTable } = Viz;

  // `core: true` marks the columns worth seeing at a glance; the rest are one
  // dropdown away, and every one of them is always in the CSV.
  const COLUMNS = [
    { key: "dealName", label: "Deal Name", type: "text", core: true },
    { key: "dealOwner", label: "Deal Owner", type: "text", core: true },
    { key: "email", label: "Email", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "batch", label: "Batch", type: "text", core: true },
    { key: "batchStartDate", label: "Batch Start Date", type: "text", core: true },
    { key: "closingDate", label: "Closing Date", type: "text", core: true },
    { key: "paymentType", label: "Payment Type", type: "text", core: true },
    { key: "courseAmount", label: "Course Amount", type: "money", core: true },
    { key: "registrationAmount", label: "Registration Amount", type: "money" },
    { key: "regPaid", label: "Registration Paid (CRM)", type: "bool" },
    { key: "regInvoiceDate", label: "Registration Invoice Date", type: "text" },
    { key: "inst1Amount", label: "Instalment1 Amount", type: "money" },
    { key: "inst1Paid", label: "Instalment1 Paid (CRM)", type: "bool" },
    { key: "inst1DueDate", label: "Instalment1 Due Date (CRM)", type: "text" },
    { key: "inst1InvoiceDate", label: "Instalment1 Invoice Date", type: "text" },
    { key: "inst1OverdueDays", label: "Instalment1 Overdue Days", type: "num" },
    { key: "inst2Amount", label: "Instalment2 Amount", type: "money" },
    { key: "inst2Paid", label: "Instalment2 Paid (CRM)", type: "bool" },
    { key: "inst2DueDate", label: "Instalment2 Due Date (CRM)", type: "text" },
    { key: "inst2InvoiceDate", label: "Instalment2 Invoice Date", type: "text" },
    { key: "inst2OverdueDays", label: "Instalment2 Overdue Days", type: "num" },
    { key: "inst3Amount", label: "Instalment3 Amount", type: "money" },
    { key: "inst3Paid", label: "Instalment3 Paid (CRM)", type: "bool" },
    { key: "inst3DueDate", label: "Instalment3 Due Date (CRM)", type: "text" },
    { key: "inst3InvoiceDate", label: "Instalment3 Invoice Date", type: "text" },
    { key: "inst3OverdueDays", label: "Instalment3 Overdue Days", type: "num" },
    { key: "loanAmount", label: "Loan Amount", type: "money" },
    { key: "loanPaid", label: "Loan Amount Paid (CRM)", type: "bool" },
    { key: "loanDueDate", label: "Loan Due Date (CRM)", type: "text" },
    { key: "loanInvoiceDate", label: "Loan Invoice Date", type: "text" },
    { key: "loanOverdueDays", label: "Loan Overdue Days", type: "num" },
    { key: "fullAmount", label: "Full Amount", type: "money" },
    { key: "fullPaid", label: "Full Amount Paid (CRM)", type: "bool" },
    { key: "fullInvoiceDate", label: "Full Amount Invoice Date", type: "text" },
    { key: "crmPaidTotal", label: "CRM Expected Paid Amount", type: "money", core: true },
    { key: "booksInvoiceAmount", label: "Books Total Invoice Amount", type: "money" },
    { key: "booksPaidAmount", label: "Books Total Paid Amount", type: "money", core: true },
    { key: "booksBalanceAmount", label: "Books Balance Amount", type: "money", core: true },
    { key: "booksStatus", label: "Books Status", type: "text" },
    { key: "validationResult", label: "Validation Result", type: "text", core: true },
    { key: "remarks", label: "Remarks", type: "text", core: true },
  ];

  const els = {
    fromDate: document.getElementById("fromDate"),
    toDate: document.getElementById("toDate"),
    runBtn: document.getElementById("runBtn"),
    csvBtn: document.getElementById("csvBtn"),
    status: document.getElementById("status"),
    summary: document.getElementById("summary"),
    monthly: document.getElementById("monthly"),
    monthlyTable: document.getElementById("monthlyTable"),
    filterbar: document.getElementById("filterbar"),
    table: document.getElementById("reportTable"),
    searchBox: document.getElementById("searchBox"),
    resultFilter: document.getElementById("resultFilter"),
    columnMode: document.getElementById("columnMode"),
    clearFilters: document.getElementById("clearFilters"),
    topMeta: document.getElementById("topMeta"),
    metaRows: document.getElementById("metaRows"),
  };

  let allRows = [];
  let table = null;
  const filters = { q: "", result: "all" };

  // Default date range: first day of current month to today.
  (function setDefaultDates() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    els.toDate.value = iso(now);
    els.fromDate.value = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  })();

  // ===============================
  // Table
  // ===============================
  function tableColumns() {
    const wanted = els.columnMode.value === "all" ? COLUMNS : COLUMNS.filter((c) => c.core);
    return wanted.map((col) => {
      if (col.type === "bool") {
        return {
          key: col.key,
          label: col.label,
          type: "text",
          render: (row) => (row[col.key] ? "Yes" : "No"),
        };
      }
      if (col.key === "validationResult") {
        return {
          key: col.key,
          label: col.label,
          type: "text",
          cellClass: (row) => `validation ${row.validationResult || ""}`,
        };
      }
      return { key: col.key, label: col.label, type: col.type };
    });
  }

  function buildTable() {
    table = new DataTable(els.table, tableColumns(), {
      sortKey: "dealName",
      sortDir: "asc",
      rowClass: (row) => row.validationResult || "",
      emptyText: "No deals match the current search or filter.",
      footer: (rows) => {
        const cells = new Array(tableColumns().length).fill("");
        cells[0] = `${rows.length} deal(s)`;
        tableColumns().forEach((col, i) => {
          if (col.key === "crmPaidTotal" || col.key === "booksPaidAmount" || col.key === "booksBalanceAmount") {
            cells[i] = money(rows.reduce((acc, r) => acc + (r[col.key] || 0), 0));
          }
        });
        return cells;
      },
    });
  }

  function visibleRows() {
    const q = filters.q.trim().toLowerCase();
    return allRows.filter((row) => {
      if (filters.result !== "all" && row.validationResult !== filters.result) return false;
      if (!q) return true;
      const hay = `${row.dealName} ${row.email} ${row.phone} ${row.batch} ${row.dealOwner} ${row.remarks}`;
      return hay.toLowerCase().includes(q);
    });
  }

  function refresh() {
    const rows = visibleRows();
    table.render(rows);
    els.metaRows.textContent = count(rows.length);
    els.topMeta.hidden = allRows.length === 0;
    els.clearFilters.disabled = filters.result === "all" && !filters.q;
    els.csvBtn.disabled = rows.length === 0;
  }

  function setResultFilter(result) {
    // Clicking the filter you are already on takes it off again.
    filters.result = filters.result === result ? "all" : result;
    els.resultFilter.querySelectorAll("button").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.result === filters.result));
    });
    refresh();
  }

  // ===============================
  // Summary
  // ===============================
  function updateSummary(rows) {
    const counts = { MATCH: 0, MISMATCH: 0, PENDING: 0 };
    let gap = 0;
    for (const row of rows) {
      if (counts[row.validationResult] !== undefined) counts[row.validationResult]++;
      if (row.validationResult === "MISMATCH") {
        gap += Math.abs((row.crmPaidTotal || 0) - (row.booksPaidAmount || 0));
      }
    }
    document.getElementById("statMatch").textContent = count(counts.MATCH);
    document.getElementById("statMismatch").textContent = count(counts.MISMATCH);
    document.getElementById("statPending").textContent = count(counts.PENDING);
    document.getElementById("statTotal").textContent = count(rows.length);
    document.getElementById("statGap").textContent = money(gap);
    els.summary.hidden = false;
    els.filterbar.hidden = false;
  }

  // ===============================
  // Monthly closing deal amount
  //
  // Groups the report rows by the month of their Closing Date and adds up the
  // deal (course) amount. Built with createElement/textContent only, the same
  // rule as the main table, so nothing from the CRM is ever treated as markup.
  // ===============================
  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function monthLabel(key) {
    // key is "yyyy-MM"
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[Number(m) - 1] || m} ${y}`;
  }

  function summariseByMonth(rows) {
    const byMonth = new Map();
    for (const row of rows) {
      // closingDate is yyyy-MM-dd (from toDateOnly), so the first 7 chars are the month.
      const key = (row.closingDate || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const entry = byMonth.get(key) || { key, deals: 0, amount: 0 };
      entry.deals += 1;
      entry.amount += Number(row.courseAmount) || 0;
      byMonth.set(key, entry);
    }
    // Oldest month first; yyyy-MM sorts correctly as plain text.
    return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  function makeCell(tag, text, className) {
    const cell = document.createElement(tag);
    cell.textContent = text;
    if (className) cell.className = className;
    return cell;
  }

  function updateMonthly(rows) {
    const months = summariseByMonth(rows);
    const thead = els.monthlyTable.tHead;
    const tbody = els.monthlyTable.tBodies[0];
    const tfoot = els.monthlyTable.tFoot;
    thead.replaceChildren();
    tbody.replaceChildren();
    tfoot.replaceChildren();

    if (months.length === 0) {
      els.monthly.hidden = true;
      return;
    }

    const headRow = document.createElement("tr");
    headRow.append(
      makeCell("th", "Month"),
      makeCell("th", "Deals", "num"),
      makeCell("th", "Total closing amount", "num"),
      makeCell("th", "Share")
    );
    thead.appendChild(headRow);

    const maxAmount = Math.max(...months.map((m) => m.amount), 1);
    let totalDeals = 0;
    let totalAmount = 0;

    for (const m of months) {
      totalDeals += m.deals;
      totalAmount += m.amount;

      const tr = document.createElement("tr");
      const barCell = document.createElement("td");
      barCell.className = "monthly-bar-cell";
      const bar = document.createElement("div");
      bar.className = "monthly-bar";
      bar.style.width = `${Math.round((m.amount / maxAmount) * 100)}%`;
      barCell.appendChild(bar);

      tr.append(
        makeCell("td", monthLabel(m.key)),
        makeCell("td", count(m.deals), "num"),
        makeCell("td", money(m.amount), "num"),
        barCell
      );
      tbody.appendChild(tr);
    }

    const footRow = document.createElement("tr");
    footRow.append(
      makeCell("td", "Total"),
      makeCell("td", count(totalDeals), "num"),
      makeCell("td", money(totalAmount), "num"),
      makeCell("td", "")
    );
    tfoot.appendChild(footRow);

    els.monthly.hidden = false;
  }

  // ===============================
  // CSV — always every column, whatever the table is showing.
  // ===============================
  function toCsv(rows) {
    const escape = (v) =>
      `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
    return [
      COLUMNS.map((c) => escape(c.label)).join(","),
      ...rows.map((row) => COLUMNS.map((c) => escape(row[c.key])).join(",")),
    ].join("\n");
  }

  function downloadCsv() {
    const rows = visibleRows();
    const stamp = new Date().toISOString().slice(0, 10);
    Viz.download(toCsv(rows), `payment-reconciliation-${stamp}.csv`, "text/csv;charset=utf-8;");
    Viz.toast(`${rows.length} row(s) exported.`);
  }

  // ===============================
  // Run
  // ===============================
  async function runReport() {
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

    els.runBtn.disabled = true;
    els.runBtn.classList.add("is-busy");
    els.csvBtn.disabled = true;
    setStatus(
      "Fetching deals from CRM and matching against Books… this can take a bit for large ranges.",
      false
    );

    try {
      const data = await Viz.postJson("/api/run-report", { fromDate, toDate });

      allRows = data.rows;
      updateSummary(allRows);
      updateMonthly(allRows);
      refresh();
      setStatus(
        `Done. ${data.dealsInRange} deal(s) in range out of ${data.totalClosedWonDeals} total Closed Won deals. Click any column heading to sort.`,
        false
      );
    } catch (err) {
      setStatus(`Error: ${err.message}`, true);
    } finally {
      els.runBtn.disabled = false;
      els.runBtn.classList.remove("is-busy");
    }
  }

  function setStatus(message, isError) {
    els.status.textContent = message;
    els.status.classList.toggle("error", Boolean(isError));
  }

  // ===============================
  // Wiring
  // ===============================
  els.runBtn.addEventListener("click", runReport);
  els.csvBtn.addEventListener("click", downloadCsv);

  let searchTimer = null;
  els.searchBox.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      filters.q = els.searchBox.value;
      refresh();
    }, 180);
  });

  els.resultFilter.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setResultFilter(btn.dataset.result));
  });

  document.querySelectorAll(".stat-clickable").forEach((tile) => {
    tile.addEventListener("click", () => setResultFilter(tile.dataset.result));
  });

  els.columnMode.addEventListener("change", () => {
    buildTable();
    refresh();
  });

  els.clearFilters.addEventListener("click", () => {
    filters.q = "";
    filters.result = "all";
    els.searchBox.value = "";
    els.resultFilter.querySelectorAll("button").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.result === "all"));
    });
    refresh();
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      els.searchBox.focus();
    }
  });

  buildTable();
})();