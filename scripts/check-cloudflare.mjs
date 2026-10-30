import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const account = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN,
  database = process.env.CLOUDFLARE_D1_DATABASE_ID,
  bucket = process.env.R2_BUCKET_NAME;
if (!account || !token || !database || !bucket)
  throw new Error("Run with --env-file=.env after setup");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
const response = await fetch(`${base}/d1/database/${database}/query`, {
  method: "POST",
  headers,
  body: JSON.stringify({ sql: "SELECT COUNT(*) AS count FROM d1_migrations" }),
  signal: AbortSignal.timeout(30000),
});
const data = await response.json();
assert.ok(data.success);
console.log(
  JSON.stringify({
    database: "workly-db",
    applied_migrations: data.result[0].results[0].count,
  }),
);
const verified = await (
  await fetch(`${base}/tokens/verify`, {
    headers,
    signal: AbortSignal.timeout(15000),
  })
).json();
assert.ok(verified.success);
const aws = new AwsClient({
  accessKeyId: verified.result.id,
  secretAccessKey: createHash("sha256").update(token).digest("hex"),
  service: "s3",
  region: "auto",
  retries: 1,
});
const key = `workly-connection-check/${crypto.randomUUID()}.txt`;
const url = `https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`;
try {
  assert.ok(
    (await aws.fetch(url, { method: "PUT", body: "workly remote R2 check" }))
      .ok,
  );
  const object = await aws.fetch(url);
  assert.equal(await object.text(), "workly remote R2 check");
  console.log("PASS: remote D1 and R2 write/read.");
} finally {
  assert.ok((await aws.fetch(url, { method: "DELETE" })).ok);
}
