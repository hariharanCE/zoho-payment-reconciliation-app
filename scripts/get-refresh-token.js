// One-time helper: exchange a Self Client grant token for a refresh token.
//
//   npm run get-refresh-token -- <GRANT_CODE>
//   npm run get-refresh-token -- <GRANT_CODE> --write
//
// The grant code comes from the Zoho API Console -> your Self Client ->
// Generate Code tab. It expires in ~10 minutes, so run this right after
// generating it. Client id/secret/accounts URL are read from .env.

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const code = args.find((a) => !a.startsWith("--"));

  if (!code) {
    console.error("Usage: npm run get-refresh-token -- <GRANT_CODE> [--write]");
    process.exit(1);
  }

  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!accountsUrl || !clientId || !clientSecret) {
    console.error(
      "Missing ZOHO_ACCOUNTS_URL / ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET in .env"
    );
    process.exit(1);
  }

  // NOTE: no redirect_uri here. Self Clients have none registered, and
  // sending one makes Zoho reject the exchange.
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });

  const resp = await fetch(`${accountsUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await resp.json().catch(() => ({}));

  if (!data.refresh_token) {
    console.error("\nExchange failed. Zoho said:", JSON.stringify(data));
    console.error(explainError(data.error));
    process.exit(1);
  }

  console.log("\nSuccess. Your refresh token:\n");
  console.log(data.refresh_token);
  console.log("");

  if (write) {
    updateEnv("ZOHO_REFRESH_TOKEN", data.refresh_token);
    console.log(`Wrote ZOHO_REFRESH_TOKEN to ${ENV_PATH}`);
  } else {
    console.log("Put it in .env as ZOHO_REFRESH_TOKEN=... (or re-run with --write)");
  }
}

function explainError(error) {
  switch (error) {
    case "invalid_code":
      return (
        "  -> The grant code is expired or already used. Grant codes are\n" +
        "     single-use and last ~10 minutes. Generate a fresh one and\n" +
        "     re-run this immediately."
      );
    case "invalid_client":
      return (
        "  -> Client ID not found on this data center. Check ZOHO_ACCOUNTS_URL\n" +
        "     matches where the Self Client was created (e.g. https://accounts.zoho.in)."
      );
    case "invalid_client_secret":
      return "  -> ZOHO_CLIENT_SECRET doesn't match the client ID.";
    case "invalid_redirect_uri":
      return "  -> A redirect_uri was sent to a Self Client. This script sends none.";
    default:
      return "";
  }
}

function updateEnv(key, value) {
  const line = `${key}=${value}`;
  let contents = fs.readFileSync(ENV_PATH, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  contents = re.test(contents)
    ? contents.replace(re, line)
    : contents.replace(/\s*$/, `\n${line}\n`);
  fs.writeFileSync(ENV_PATH, contents);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
