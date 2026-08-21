// Single source of truth for a deal's payment schedule and its paid flags.
//
// Both pages read from here: the reconciliation report renders these flags as
// its "... Paid (CRM)" columns, and the collections dashboard buckets the same
// components into paid vs. pending. Deriving them twice is how the two views
// drift apart, so they are derived once, here.

const PAYMENT_TYPE = {
  FULL: "Full Payment",
  LOAN: "NACL(Northern Arc Capital Ltd)",
  INSTALMENTS: ["Instalments", "Installments", "Installment"],
};

// ===============================
// Robust checkbox -> boolean parsing.
// CRM can return checkbox fields as a real boolean OR as a string
// ("true"/"false", any case) OR null. Normalize all of them the same way.
// ===============================
function toBool(raw) {
  if (raw === true) return true;
  if (raw === null || raw === undefined) return false;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
}

function toDateOnly(dateStr) {
  if (!dateStr) return "";
  return dateStr.length > 10 ? dateStr.substring(0, 10) : dateStr;
}

// ===============================
// Lookup / picklist field -> display text.
//
// CRM returns a lookup field as an object ({id, name}), a multi-select lookup
// as an array of those objects, and a plain picklist as a string. Rendering
// the object straight into a cell is what produces "[object Object]", so every
// shape is reduced to its display text here. Falls back to the record id when
// a lookup has no name, so a cell never goes blank on a real linked record.
// ===============================
function lookupName(raw) {
  if (raw === null || raw === undefined) return "";
  if (Array.isArray(raw)) {
    return raw.map(lookupName).filter(Boolean).join(", ");
  }
  if (typeof raw === "object") {
    return String(raw.name || raw.display_value || raw.Name || raw.id || "");
  }
  return String(raw);
}

// ===============================
// Strict due-date parsing.
//
// The month/year a payment lands in is derived from this date, so a value
// that isn't a real ISO date must never be passed through: slicing
// "10/03/2026" would yield the month key "10/03/2", which then silently
// falls outside every date range and disappears from the dashboard.
//
// Zoho CRM v2 returns date fields as yyyy-MM-dd and datetime fields as ISO
// 8601, both of which parse here. Anything else is reported as invalid so it
// can be surfaced, rather than guessed at (dd/MM vs MM/dd cannot be told
// apart for the first twelve days of a month, and guessing wrong would move
// money into the wrong month).
// ===============================
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normaliseDate(raw) {
  if (raw === null || raw === undefined) return { date: "", raw: "", invalid: false };
  const text = String(raw).trim();
  if (!text) return { date: "", raw: "", invalid: false };

  const match = ISO_DATE.exec(text);
  if (!match) return { date: "", raw: text, invalid: true };

  const [, year, month, day] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    return { date: "", raw: text, invalid: true };
  }
  return { date: `${year}-${month}-${day}`, raw: text, invalid: false };
}

// The six paid checkboxes exactly as the report shows them — raw CRM values,
// no inference. The report's "CRM Expected Paid Amount" column layers its own
// rules on top of these (a paid full/loan payment implying registration); that
// stays in reconcile.js, since it is a money rule, not a checkbox value.
function paidFlags(deal) {
  return {
    regPaid: toBool(deal.Registration_Amount_Paid),
    inst1Paid: toBool(deal.Instalment_1_Amount_Paid),
    inst2Paid: toBool(deal.Instalment_2_Amount_Paid),
    inst3Paid: toBool(deal.Instalment_3_Amount_Paid),
    loanPaid: toBool(deal.Loan_Amount_Paid),
    fullPaid: toBool(deal.Full_Amount_Paid),
  };
}

// ===============================
// The deal's scheduled payments, in the shape the collections dashboard
// buckets: amount, paid flag, and the date the money was expected.
//
// Registration is deliberately NOT a scheduled payment here — collections
// tracks the five instalment/loan/full components only.
//
// Which components exist depends on Payment_Type. A Full Payment has no due
// date at all: CRM carries no due-date field for it, and it is payable up
// front rather than on a schedule, so none is inferred here either.
// ===============================
function scheduledPayments(deal) {
  const paymentType = deal.Payment_Type || "";
  const closing = normaliseDate(deal.Closing_Date);
  // Batch_Start_Date, straight from CRM. It is carried for display only —
  // nothing here or downstream computes on it, so it is taken as-is rather
  // than parsed strictly the way a due date is.
  const batchStartDate = toDateOnly(deal.Batch_Start_Date);
  const flags = paidFlags(deal);

  // A component with no due date. Deliberately not the closing date: standing
  // in a proxy date would put the money in a month it was never actually due,
  // which is worse than reporting it as undated.
  const NO_DUE_DATE = { date: "", raw: "", invalid: false };

  let components = [];

  if (paymentType === PAYMENT_TYPE.FULL) {
    components = [
      {
        component: "Full Payment",
        amount: deal.Full_Amount || 0,
        paid: flags.fullPaid,
        due: NO_DUE_DATE,
        dueSource: "",
      },
    ];
  } else if (PAYMENT_TYPE.INSTALMENTS.includes(paymentType)) {
    components = [
      {
        component: "Instalment 1",
        amount: deal.Instalment_1_Amount || 0,
        paid: flags.inst1Paid,
        due: normaliseDate(deal.Instalment_1Due_Date),
        dueSource: "Instalment 1 Due Date",
      },
      {
        component: "Instalment 2",
        amount: deal.Instalment_2_Amount || 0,
        paid: flags.inst2Paid,
        due: normaliseDate(deal.Instalment_2Due_Date),
        dueSource: "Instalment 2 Due Date",
      },
      {
        component: "Instalment 3",
        amount: deal.Instalment_3_Amount || 0,
        paid: flags.inst3Paid,
        due: normaliseDate(deal.Instalment_3Due_Date),
        dueSource: "Instalment 3 Due Date",
      },
    ];
  } else if (paymentType === PAYMENT_TYPE.LOAN) {
    components = [
      {
        component: "Loan",
        amount: deal.Loan_Amount || 0,
        paid: flags.loanPaid,
        due: normaliseDate(deal.Loan_Due_Date),
        dueSource: "Loan Due Date",
      },
    ];
  }

  // A zero-amount component isn't a scheduled payment, it's an unused field.
  return components
    .filter((c) => c.amount > 0)
    .map(({ due, ...c }) => ({
      ...c,
      // "" when the date is missing or unusable — callers must not month-key
      // a component without checking this first.
      expectedDate: due.date,
      expectedDateRaw: due.raw,
      expectedDateInvalid: due.invalid,
      dealId: deal.id || "",
      dealName: deal.Deal_Name || "",
      dealOwner: (deal.Owner && deal.Owner.name) || "",
      email: deal.Email || "",
      phone: deal.Phone || "",
      batch: lookupName(deal.Batch),
      paymentType,
      closingDate: closing.date,
      // Display only — never filtered, bucketed or compared against.
      batchStartDate,
    }));
}

module.exports = {
  PAYMENT_TYPE,
  toBool,
  toDateOnly,
  lookupName,
  normaliseDate,
  paidFlags,
  scheduledPayments,
};
