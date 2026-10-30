import { AwsClient } from "aws4fetch";
import type { Database, Statement, QueryResult } from "./database";

function settings() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID,
    token = process.env.CLOUDFLARE_API_TOKEN,
    database = process.env.CLOUDFLARE_D1_DATABASE_ID,
    bucket = process.env.R2_BUCKET_NAME;
  if (!account || !token || !database || !bucket)
    throw new Error("Cloudflare storage configuration is incomplete");
  return { account, token, database, bucket };
}
class RemoteStatement implements Statement {
  sql: string;
  params: unknown[];
  db: RemoteDatabase;
  constructor(db: RemoteDatabase, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...values: unknown[]) {
    return new RemoteStatement(this.db, this.sql, values);
  }
  async all<T = Record<string, unknown>>() {
    return (
      await this.db.execute([{ sql: this.sql, params: this.params }])
    )[0] as QueryResult<T>;
  }
  async first<T = Record<string, unknown>>() {
    return (await this.all<T>()).results[0] ?? null;
  }
  async run() {
    return this.all();
  }
}
export class RemoteDatabase implements Database {
  prepare(sql: string) {
    return new RemoteStatement(this, sql);
  }
  async batch(statements: Statement[]) {
    return this.execute(
      statements.map((s) => {
        if (!(s instanceof RemoteStatement) || s.db !== this)
          throw new Error("Invalid statement in batch");
        return { sql: s.sql, params: s.params };
      }),
    );
  }
  async execute(
    queries: { sql: string; params: unknown[] }[],
  ): Promise<QueryResult[]> {
    if (!queries.length) return [];
    const { account, token, database } = settings();
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          queries.length === 1 ? queries[0] : { batch: queries },
        ),
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = (await response.json()) as {
      success: boolean;
      errors?: { message: string }[];
      result?: QueryResult[];
    };
    if (
      !response.ok ||
      !data.success ||
      !data.result ||
      data.result.some((r) => r.success === false)
    )
      throw new Error(
        `D1 query failed (${response.status}): ${data.errors?.map((e) => e.message).join("; ") || "Query rejected"}`,
      );
    return data.result.map((r) => ({
      ...r,
      results: r.results || [],
      meta: { ...r.meta, changes: r.meta?.changes ?? 0 },
    }));
  }
}
let client: Promise<AwsClient> | undefined;
async function r2Client() {
  if (!client)
    client = (async () => {
      const { account, token } = settings();
      let accessKeyId = process.env.R2_ACCESS_KEY_ID,
        secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      if (!accessKeyId || !secretAccessKey) {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          },
        );
        const data = (await response.json()) as {
          success: boolean;
          result?: { id: string };
        };
        if (!response.ok || !data.success || !data.result?.id)
          throw new Error("R2 account token could not be verified");
        accessKeyId = data.result.id;
        secretAccessKey = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(token),
            ),
          ),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      return new AwsClient({
        accessKeyId,
        secretAccessKey,
        service: "s3",
        region: "auto",
        retries: 1,
      });
    })().catch((e) => {
      client = undefined;
      throw e;
    });
  return client;
}
function objectUrl(key: string) {
  const { account, bucket } = settings();
  return `https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
export const remoteBucket = {
  async put(
    key: string,
    value: Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    const aws = await r2Client();
    const body =
      typeof value === "string" ? value : Uint8Array.from(value).buffer;
    const response = await aws.fetch(objectUrl(key), {
      method: "PUT",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: {
        "Content-Length": String(
          typeof value === "string"
            ? new TextEncoder().encode(value).byteLength
            : value.byteLength,
        ),
        "Content-Type":
          options?.httpMetadata?.contentType || "application/octet-stream",
      },
    });
    if (!response.ok) {
      const code = (await response.text()).match(/<Code>([^<]+)<\/Code>/)?.[1];
      throw new Error(
        `R2 upload failed (${response.status}${code ? `, ${code}` : ""})`,
      );
    }
  },
  async get(key: string) {
    const aws = await r2Client();
    const response = await aws.fetch(objectUrl(key), { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 read failed (${response.status})`);
    return {
      httpMetadata: {
        contentType:
          response.headers.get("Content-Type") || "application/octet-stream",
      },
      arrayBuffer: () => response.arrayBuffer(),
      text: () => response.text(),
    };
  },
  async delete(keys: string | string[]) {
    const aws = await r2Client();
    for (const key of typeof keys === "string" ? [keys] : keys) {
      const response = await aws.fetch(objectUrl(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404)
        throw new Error(`R2 delete failed (${response.status})`);
    }
  },
};
