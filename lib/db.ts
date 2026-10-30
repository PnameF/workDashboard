import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import type { Database, Statement } from "./database";
import { RemoteDatabase, remoteBucket } from "./remote-storage";
class NativeStatement implements Statement {
  raw: D1PreparedStatement;
  constructor(raw: D1PreparedStatement) {
    this.raw = raw;
  }
  bind(...values: unknown[]) {
    return new NativeStatement(this.raw.bind(...values));
  }
  all<T = Record<string, unknown>>() {
    return this.raw.all<T>();
  }
  first<T = Record<string, unknown>>() {
    return this.raw.first<T>();
  }
  run() {
    return this.raw.run();
  }
}
class NativeDatabase implements Database {
  raw: D1Database;
  constructor(raw: D1Database) {
    this.raw = raw;
  }
  prepare(sql: string) {
    return new NativeStatement(this.raw.prepare(sql));
  }
  batch(statements: Statement[]) {
    return this.raw.batch<Record<string, unknown>>(
      statements.map((s) => {
        if (!(s instanceof NativeStatement))
          throw new Error("Invalid statement in native batch");
        return s.raw;
      }),
    );
  }
}
const remoteDb = new RemoteDatabase();
export async function getDb(): Promise<Database> {
  if (process.env.CLOUDFLARE_STORAGE_MODE === "remote") return remoteDb;
  const { env } = await getCloudflareContext({ async: true });
  return new NativeDatabase(env.DB);
}
export async function getBucket() {
  if (process.env.CLOUDFLARE_STORAGE_MODE === "remote") return remoteBucket;
  const { env } = await getCloudflareContext({ async: true });
  return env.BUCKET;
}
export async function getPublicFileUrl(id: string) {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.CLOUDFLARE_STORAGE_MODE !== "remote"
  )
    return `/api/files/${id}`;
  let base = process.env.R2_PUBLIC_URL;
  if (!base) {
    const { env } = await getCloudflareContext({ async: true });
    base = env.R2_PUBLIC_URL;
  }
  if (!base)
    throw new Error("R2_PUBLIC_URL is required to store attachment links");
  return new URL(encodeURIComponent(id), base.endsWith("/") ? base : base + "/")
    .href;
}
