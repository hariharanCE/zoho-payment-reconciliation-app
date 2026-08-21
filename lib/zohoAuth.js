// Handles Zoho OAuth2 access-token issuance/caching.
// A single long-lived refresh token (set once, see README) is exchanged
// for short-lived access tokens as needed. Access tokens are cached in
// memory and refreshed ~60s before they actually expire.

let cachedToken = null;
let cachedExpiryMs = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiryMs) {
    return cachedToken;
  }

  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!accountsUrl || !clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Zoho OAuth env vars. Check ZOHO_ACCOUNTS_URL, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN in your .env"
    );
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const resp = await fetch(`${accountsUrl}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });

  const data = await resp.json().catch(() => ({}));

  if (!data.access_token) {
    throw new Error(
      `Zoho token refresh failed: ${JSON.stringify(data)}\n${explainError(data.error)}`
    );
  }

  cachedToken = data.access_token;
  // expires_in is in seconds (usually 3600). Refresh 60s early to be safe.
  cachedExpiryMs = now + (data.expires_in - 60) * 1000;

  return cachedToken;
}

// Zoho's token endpoint returns a distinct error string per failure mode, so
// point at the one credential actually at fault instead of listing all three.
function explainError(error) {
  switch (error) {
    case "invalid_code":
      return (
        "ZOHO_REFRESH_TOKEN is not a valid refresh token. Most often this is a\n" +
        "grant token (from the Self Client 'Generate Code' tab) pasted in as-is —\n" +
        "those expire in ~10 minutes and must be exchanged first. It can also mean\n" +
        "the refresh token was revoked, or was pushed out by Zoho's 20-tokens-per-\n" +
        "client limit. Fix: generate a fresh grant code, then run\n" +
        "  npm run get-refresh-token -- <GRANT_CODE> --write"
      );
    case "invalid_client":
      return (
        "ZOHO_CLIENT_ID isn't recognised on this data center. Make sure\n" +
        "ZOHO_ACCOUNTS_URL matches where the Self Client was created\n" +
        "(e.g. https://accounts.zoho.in for the India DC)."
      );
    case "invalid_client_secret":
      return "ZOHO_CLIENT_SECRET doesn't match ZOHO_CLIENT_ID.";
    default:
      return "Check ZOHO_ACCOUNTS_URL, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN in .env";
  }
}

module.exports = { getAccessToken };
