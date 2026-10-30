import fs from "node:fs";
import ts from "typescript";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token)
  throw new Error("Missing Cloudflare credentials. Run with --env-file=.env");
async function cf(path, method = "GET", body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.success)
    throw new Error(
      `Cloudflare ${method} ${path.split("?")[0]} failed (${response.status}): ${data.errors?.map((e) => e.message).join("; ") || "Unknown error"}`,
    );
  return data.result;
}
const filename = "wrangler.jsonc";
const config = ts.parseConfigFileTextToJson(
  filename,
  fs.readFileSync(filename, "utf8"),
).config;
const name = process.env.CLOUDFLARE_D1_DATABASE_NAME || "workly-db";
const databases = await cf("d1/database?per_page=100");
let database = databases.find((d) => d.name === name);
if (!database) {
  database = await cf("d1/database", "POST", { name });
  console.log(`Created D1: ${name}`);
} else console.log(`Reusing D1: ${name}`);
// Persist the exact returned ID immediately so retries never create another database.
config.account_id = account;
config.d1_databases = [
  {
    binding: "DB",
    database_name: database.name,
    database_id: database.uuid,
    migrations_dir: "db/migrations",
    remote: true,
  },
];
fs.writeFileSync(filename + ".tmp", JSON.stringify(config, null, 2) + "\n");
fs.renameSync(filename + ".tmp", filename);
console.log(`D1 binding saved: ${database.name}`);
let bucket = process.env.R2_BUCKET_NAME;
if (!bucket && process.env.R2_PUBLIC_URL) {
  const host = new URL(process.env.R2_PUBLIC_URL).hostname;
  const result = await cf("r2/buckets?per_page=100");
  for (const item of result.buckets || []) {
    try {
      const managed = await cf(
        `r2/buckets/${encodeURIComponent(item.name)}/domains/managed`,
      );
      if (managed.domain === host) {
        bucket = item.name;
        break;
      }
    } catch {
      /* Managed domains can be unavailable for buckets using custom domains. */
    }
    try {
      const custom = await cf(
        `r2/buckets/${encodeURIComponent(item.name)}/domains/custom`,
      );
      if ((custom.domains || []).some((d) => d.domain === host)) {
        bucket = item.name;
        break;
      }
    } catch {
      /* A bucket may have no custom domains or permission to inspect them. */
    }
  }
}
if (bucket) {
  config.r2_buckets = [
    { binding: "BUCKET", bucket_name: bucket, remote: true },
  ];
  fs.writeFileSync(filename + ".tmp", JSON.stringify(config, null, 2) + "\n");
  fs.renameSync(filename + ".tmp", filename);
  console.log(`R2 binding matched: ${bucket}`);
} else
  console.log(
    "R2 public URL could not be matched; existing bucket binding was preserved.",
  );
console.log(
  "Setup complete. Apply remote migrations before enabling development traffic.",
);
