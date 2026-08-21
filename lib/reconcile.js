const { findBooksCustomerAndInvoices } = require("./zohoClient");
const { toBool, toDateOnly, lookupName, paidFlags } = require("./payments");

function daysBetween(dueDateStr, invoiceDateStr) {
  if (!dueDateStr || !invoiceDateStr) return 0;
  const due = new Date(dueDateStr);
  const inv = new Date(invoiceDateStr);
  const diffDays = Math.round((inv - due) / (1000 * 60 * 60 * 24));
  return diffDays < 0 ? 0 : diffDays;
}

async function reconcileDeal(deal, orgId) {
  const closingDate = toDateOnly(deal.Closing_Date);
  const dealName = deal.Deal_Name || "";
  const dealOwner = (deal.Owner && deal.Owner.name) || "";
  const email = deal.Email || "";
  const phone = deal.Phone || "";
  const batch = lookupName(deal.Batch);
  // Carried straight through to its own column — a CRM field the report shows,
  // nothing more.
  const batchStartDate = toDateOnly(deal.Batch_Start_Date);
  const paymentType = deal.Payment_Type || "";
  const courseAmount = deal.Amount || 0;

  // The paid checkboxes come from the shared payment module, so these columns
  // and the collections dashboard can never report different flags.
  const { regPaid, inst1Paid, inst2Paid, inst3Paid, loanPaid, fullPaid } =
    paidFlags(deal);

  const registrationAmount = deal.Registration_Amount || 0;

  const inst1Amount = deal.Instalment_1_Amount || 0;
  const inst1DueDate = deal.Instalment_1Due_Date || "";

  const inst2Amount = deal.Instalment_2_Amount || 0;
  const inst2DueDate = deal.Instalment_2Due_Date || "";

  const inst3Amount = deal.Instalment_3_Amount || 0;
  const inst3DueDate = deal.Instalment_3Due_Date || "";

  const loanAmount = deal.Loan_Amount || 0;
  const loanDueDate = deal.Loan_Due_Date || "";

  const fullAmount = deal.Full_Amount || 0;

  // ===============================
  // CRM expected paid total
  // ===============================
  let crmPaidTotal = 0;
  if (paymentType === "Full Payment") {
    if (fullPaid) {
      crmPaidTotal = registrationAmount + fullAmount;
    } else if (regPaid) {
      crmPaidTotal += registrationAmount;
    }
  } else if (["Instalments", "Installments", "Installment"].includes(paymentType)) {
    if (regPaid) crmPaidTotal += registrationAmount;
    if (inst1Paid) crmPaidTotal += inst1Amount;
    if (inst2Paid) crmPaidTotal += inst2Amount;
    if (inst3Paid) crmPaidTotal += inst3Amount;
  } else if (paymentType === "NACL(Northern Arc Capital Ltd)") {
    if (loanPaid) crmPaidTotal = registrationAmount + loanAmount;
  }

  // ===============================
  // Books customer + invoice matching
  // ===============================
  const { booksCustomerId, matchMethod, phoneMismatchNote, matchedInvoices } =
    await findBooksCustomerAndInvoices(email, phone, orgId);

  let booksInvoiceAmount = 0;
  let booksPaidAmount = 0;
  let booksBalanceAmount = 0;
  let booksStatus = "";
  let validationResult = "";
  let remarks = "";
  let regInvoiceDate = "";
  let inst1InvoiceDate = "";
  let inst1OverdueDays = 0;
  let inst2InvoiceDate = "";
  let inst2OverdueDays = 0;
  let inst3InvoiceDate = "";
  let inst3OverdueDays = 0;
  let loanInvoiceDate = "";
  let loanOverdueDays = 0;
  let fullInvoiceDate = "";

  if (booksCustomerId) {
    let invoiceList = matchedInvoices;
    if (!invoiceList || invoiceList.length === 0) {
      const { fetchBooksInvoices } = require("./zohoClient");
      invoiceList = await fetchBooksInvoices(booksCustomerId, orgId);
    }

    if (!invoiceList || invoiceList.length === 0) {
      remarks += ` | Matched Books customer (ID: ${booksCustomerId}, via ${matchMethod}) but ZERO invoices found for this customer in Books`;
    } else {
      const validInvoiceDates = [];
      for (const invoice of invoiceList) {
        const status = invoice.status || "";
        if (status !== "credits_applied") {
          booksInvoiceAmount += invoice.total || 0;
          booksBalanceAmount += invoice.balance || 0;
          booksStatus = status;
          if (invoice.date) validInvoiceDates.push(invoice.date);
        }
      }
      booksPaidAmount = booksInvoiceAmount - booksBalanceAmount;

      validInvoiceDates.sort(); // ascending, ISO yyyy-MM-dd sorts lexically fine
      if (validInvoiceDates[0]) regInvoiceDate = validInvoiceDates[0];
      if (validInvoiceDates[1]) inst1InvoiceDate = validInvoiceDates[1];
      if (validInvoiceDates[2]) inst2InvoiceDate = validInvoiceDates[2];
      if (validInvoiceDates[3]) inst3InvoiceDate = validInvoiceDates[3];
      if (validInvoiceDates[4]) loanInvoiceDate = validInvoiceDates[4];
      if (validInvoiceDates[5]) fullInvoiceDate = validInvoiceDates[5];

      inst1OverdueDays = daysBetween(inst1DueDate, inst1InvoiceDate);
      inst2OverdueDays = daysBetween(inst2DueDate, inst2InvoiceDate);
      inst3OverdueDays = daysBetween(inst3DueDate, inst3InvoiceDate);
      loanOverdueDays = daysBetween(loanDueDate, loanInvoiceDate);
    }

    const diff = Math.abs(crmPaidTotal - booksPaidAmount);
    if (crmPaidTotal === 0 && booksPaidAmount === 0) {
      validationResult = "PENDING";
      remarks = "No payment marked in CRM and no payment found in Books";
    } else if (diff <= 1) {
      validationResult = "MATCH";
      remarks = "CRM paid amount matches Books paid amount";
    } else if (booksPaidAmount < crmPaidTotal) {
      validationResult = "MISMATCH";
      remarks = `CRM shows payment(s) marked paid (Rs.${crmPaidTotal}) but Books has only Rs.${booksPaidAmount} recorded as paid`;
    } else {
      validationResult = "MISMATCH";
      remarks = `Books shows more paid (Rs.${booksPaidAmount}) than CRM has marked as paid (Rs.${crmPaidTotal})`;
    }
  } else {
    validationResult = "MISMATCH";
    remarks = `Customer not found in Zoho Books (checked email, verified last-10-digit phone, and search_text fallback)${phoneMismatchNote}`;
  }

  return {
    dealName,
    dealOwner,
    email,
    phone,
    batch,
    batchStartDate,
    closingDate,
    paymentType,
    courseAmount,
    registrationAmount,
    regPaid,
    regInvoiceDate,
    inst1Amount,
    inst1Paid,
    inst1DueDate,
    inst1InvoiceDate,
    inst1OverdueDays,
    inst2Amount,
    inst2Paid,
    inst2DueDate,
    inst2InvoiceDate,
    inst2OverdueDays,
    inst3Amount,
    inst3Paid,
    inst3DueDate,
    inst3InvoiceDate,
    inst3OverdueDays,
    loanAmount,
    loanPaid,
    loanDueDate,
    loanInvoiceDate,
    loanOverdueDays,
    fullAmount,
    fullPaid,
    fullInvoiceDate,
    crmPaidTotal,
    booksInvoiceAmount,
    booksPaidAmount,
    booksBalanceAmount,
    booksStatus,
    validationResult,
    remarks,
  };
}

module.exports = { reconcileDeal, toBool, toDateOnly, daysBetween };
