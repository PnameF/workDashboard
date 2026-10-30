import fs from "node:fs";
import ts from "typescript";
const account = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN,
  id = process.env.CLOUDFLARE_D1_DATABASE_ID,
  publicUrl = process.env.R2_PUBLIC_URL;
if (!publicUrl) throw new Error("Missing R2_PUBLIC_URL");
const base = new URL(publicUrl.endsWith("/") ? publicUrl : publicUrl + "/")
  .href;
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${id}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: "UPDATE attachments SET url=? || id WHERE url IS NULL OR url=''",
      params: [base],
    }),
    signal: AbortSignal.timeout(30000),
  },
);
const data = await response.json();
if (!data.success) throw new Error("Attachment URL backfill failed");
const config = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  fs.readFileSync("wrangler.jsonc", "utf8"),
).config;
config.vars = { ...config.vars, R2_PUBLIC_URL: publicUrl };
fs.writeFileSync("wrangler.jsonc", JSON.stringify(config, null, 2) + "\n");
console.log(
  JSON.stringify({
    attachment_links_updated: data.result[0].meta.changes,
    worker_public_url_configured: true,
  }),
);
