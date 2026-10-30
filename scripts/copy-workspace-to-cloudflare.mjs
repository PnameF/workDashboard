import { getPlatformProxy } from "wrangler";
import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const account = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN,
  database = process.env.CLOUDFLARE_D1_DATABASE_ID,
  bucket = process.env.R2_BUCKET_NAME;
if (!account || !token || !database || !bucket)
  throw new Error("Missing Cloudflare configuration");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function query(sql, params = []) {
  const response = await fetch(`${base}/d1/database/${database}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success)
    throw new Error(`Remote D1 copy failed (${response.status})`);
  return data.result[0].results;
}
const local = await getPlatformProxy({
  configPath: "wrangler.local.jsonc",
  remoteBindings: false,
  envFiles: [],
});
try {
  const plans = [
    ["task_groups", ["id", "name", "color"]],
    ["custom_columns", ["id", "name", "type", "options"]],
    [
      "tasks",
      [
        "id",
        "name",
        "person",
        "status",
        "date",
        "priority",
        "project",
        "hours",
        "custom",
        "assignees",
        "sort_order",
        "group_id",
        "created_by",
        "archived_at",
      ],
    ],
    [
      "attachments",
      [
        "id",
        "task_id",
        "name",
        "content_type",
        "size",
        "created_at",
        "column_id",
        "url",
      ],
    ],
    ["board_settings", ["id", "layout"]],
  ];
  const verify = await fetch(`${base}/tokens/verify`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const verified = await verify.json();
  if (!verified.success || !verified.result?.id)
    throw new Error("R2 token verification failed");
  const s3 = new AwsClient({
    accessKeyId: verified.result.id,
    secretAccessKey: createHash("sha256").update(token).digest("hex"),
    service: "s3",
    region: "auto",
    retries: 1,
  });
  for (const [table, columns] of plans) {
    const { results } = await local.env.DB.prepare(
      `SELECT ${columns.join(",")} FROM ${table} ORDER BY rowid`,
    ).all();
    for (const row of results) {
      if (table === "attachments") {
        const object = await local.env.BUCKET.get(row.id);
        if (!object)
          throw new Error(
            "A local attachment file is missing; its metadata was not copied",
          );
        const response = await s3.fetch(
          `https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${encodeURIComponent(row.id)}`,
          {
            method: "PUT",
            body: await object.arrayBuffer(),
            headers: { "Content-Type": row.content_type },
          },
        );
        if (!response.ok)
          throw new Error(`R2 attachment copy failed (${response.status})`);
      }
      await query(
        `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO NOTHING`,
        columns.map((c) =>
          table === "attachments" && c === "url"
            ? new URL(
                encodeURIComponent(row.id),
                process.env.R2_PUBLIC_URL.endsWith("/")
                  ? process.env.R2_PUBLIC_URL
                  : process.env.R2_PUBLIC_URL + "/",
              ).href
            : (row[c] ?? null),
        ),
      );
      const copied = await query(`SELECT id FROM ${table} WHERE id=?`, [
        row.id,
      ]);
      assert.equal(copied.length, 1, `Copy verification failed for ${table}`);
    }
    console.log(
      JSON.stringify({ table, local_rows: results.length, verified: true }),
    );
  }
  console.log(
    "PASS: local workspace and attachment data copied to remote D1/R2. Existing remote records were preserved.",
  );
} finally {
  await local.dispose();
}
