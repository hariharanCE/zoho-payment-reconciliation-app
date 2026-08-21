const { getAccessToken } = require("./zohoAuth");

const API_DOMAIN = () => process.env.ZOHO_API_DOMAIN;

async function zohoGet(path) {
  const token = await getAccessToken();
  const url = `${API_DOMAIN()}${path}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Zoho API error ${resp.status} for ${path}: ${text}`);
  }
  return resp.json();
}

// ===============================
// CRM: fetch all "Closed Won" deals, paginated (mirrors the
// pageNumbers 1..50 loop in the original Deluge script)
// ===============================
async function fetchAllClosedWonDeals() {
  const allDeals = [];
  let page = 1;
  let moreRecords = true;

  while (moreRecords && page <= 50) {
    const criteria = encodeURIComponent("(Stage:equals:Closed Won)");
    const data = await zohoGet(
      `/crm/v2/Deals/search?criteria=${criteria}&page=${page}&per_page=200`
    );
    const deals = data.data;
    if (!deals || deals.length === 0) {
      moreRecords = false;
    } else {
      allDeals.push(...deals);
      if (deals.length < 200) moreRecords = false;
      page++;
    }
  }

  return allDeals;
}

// ===============================
// BOOKS: 3-tier customer matching, same order/logic as the
// original script (email -> verified last-10-digit phone -> search_text)
// ===============================
async function findBooksCustomerAndInvoices(email, phone, orgId) {
  const emailNormalized = (email || "").trim();
  const phoneDigitsOnly = (phone || "").replace(/[^0-9]/g, "");
  const phoneLast10 =
    phoneDigitsOnly.length > 10 ? phoneDigitsOnly.slice(-10) : phoneDigitsOnly;

  let booksCustomerId = "";
  let matchMethod = "";
  let phoneMismatchNote = "";
  let matchedInvoices = [];

  // --- Try 1: email search ---
  if (emailNormalized) {
    const data = await zohoGet(
      `/books/v3/contacts?organization_id=${orgId}&email=${encodeURIComponent(
        emailNormalized
      )}`
    );
    const contacts = data.contacts || [];
    for (const c of contacts) {
      const invoices = await fetchBooksInvoices(c.contact_id, orgId);
      if (invoices.length > 0) {
        booksCustomerId = c.contact_id;
        matchedInvoices = invoices;
        matchMethod = "Email";
        break;
      }
    }
  }

  // --- Try 2: verified last-10-digit phone match ---
  if (!booksCustomerId && phoneLast10) {
    const data = await zohoGet(
      `/books/v3/contacts?organization_id=${orgId}&phone=${phoneLast10}`
    );
    const contacts = data.contacts || [];
    let phoneVerified = false;
    for (const candidate of contacts) {
      if (booksCustomerId) break;
      const candidateDigits = (candidate.phone || "").replace(/[^0-9]/g, "");
      const candidateLast10 =
        candidateDigits.length > 10 ? candidateDigits.slice(-10) : candidateDigits;
      if (candidateLast10 && candidateLast10 === phoneLast10) {
        booksCustomerId = candidate.contact_id;
        matchMethod = "Phone";
        phoneVerified = true;
      }
    }
    if (!phoneVerified && contacts.length > 0) {
      phoneMismatchNote = ` | Phone search returned ${contacts.length} contact(s) but none had a last-10-digit phone match to CRM phone ${phone} (Books returned a loose match only)`;
    }
  }

  // --- Try 3: search_text fallback (catches contact_persons-level matches) ---
  if (!booksCustomerId) {
    const searchTextValue = emailNormalized || phoneLast10;
    if (searchTextValue) {
      const data = await zohoGet(
        `/books/v3/contacts?organization_id=${orgId}&search_text=${encodeURIComponent(
          searchTextValue
        )}`
      );
      const contacts = data.contacts || [];
      for (const c of contacts) {
        const invoices = await fetchBooksInvoices(c.contact_id, orgId);
        if (invoices.length > 0) {
          booksCustomerId = c.contact_id;
          matchedInvoices = invoices;
          matchMethod = "Search_Text (contact_persons match)";
          break;
        }
      }
    }
  }

  return { booksCustomerId, matchMethod, phoneMismatchNote, matchedInvoices };
}

async function fetchBooksInvoices(customerId, orgId) {
  const data = await zohoGet(
    `/books/v3/invoices?organization_id=${orgId}&customer_id=${customerId}&per_page=200&sort_column=date`
  );
  return data.invoices || [];
}

module.exports = {
  fetchAllClosedWonDeals,
  findBooksCustomerAndInvoices,
  fetchBooksInvoices,
};
