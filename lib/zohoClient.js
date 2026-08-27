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
    const text = await resp.text().catch(() => "");
    throw new Error(`Zoho API error ${resp.status} for ${path}: ${text}`);
  }

  // ===============================
  // Never hand an empty body to JSON.parse.
  //
  // Zoho says "nothing to send" with 204 No Content and a zero-byte body.
  // CRM's search endpoint does exactly that for a page past the last record.
  // 204 is a success, so resp.ok is true and the guard above lets it through
  // — and resp.json() on an empty body throws "Unexpected end of JSON input",
  // a parse error that says nothing about what actually happened.
  //
  // An empty object is the honest translation: every caller reads an optional
  // collection off the result (data.data, data.contacts, data.invoices) and
  // already treats a missing one as "none found".
  // ===============================
  if (resp.status === 204) return {};

  const text = await resp.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch (err) {
    // A gateway or maintenance page rather than the API. Say what came back
    // instead of reporting it as malformed JSON.
    throw new Error(
      `Zoho returned a non-JSON body (HTTP ${resp.status}) for ${path}: ${text.slice(0, 200)}`
    );
  }
}

// ===============================
// CRM: fetch all "Closed Won" deals, paginated (mirrors the
// pageNumbers 1..50 loop in the original Deluge script)
// ===============================
const PAGE_SIZE = 200;
const MAX_PAGES = 50;

async function fetchAllClosedWonDeals() {
  const allDeals = [];
  let page = 1;
  let moreRecords = true;

  while (moreRecords && page <= MAX_PAGES) {
    const criteria = encodeURIComponent("(Stage:equals:Closed Won)");
    const data = await zohoGet(
      `/crm/v2/Deals/search?criteria=${criteria}&page=${page}&per_page=${PAGE_SIZE}`
    );
    const deals = data.data || [];
    allDeals.push(...deals);

    // CRM states outright whether another page exists, so ask it rather than
    // inferring. The old rule — "a page shorter than per_page is the last
    // one" — holds until the total is an exact multiple of the page size: at
    // 600 deals page 3 came back full, so page 4 was requested, and CRM
    // answered 204 with an empty body. The length check stays as a fallback
    // for a response that omits `info`.
    const info = data.info;
    moreRecords =
      info && typeof info.more_records === "boolean"
        ? info.more_records
        : deals.length === PAGE_SIZE;

    page++;
  }

  // The page ceiling is a guard against an unbounded loop, not a limit anyone
  // should hit silently. If it ever truncates, say so in the logs.
  if (moreRecords) {
    console.warn(
      `[zoho] stopped at the ${MAX_PAGES}-page ceiling with ${allDeals.length} deals; CRM says more remain. Raise MAX_PAGES in lib/zohoClient.js.`
    );
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
