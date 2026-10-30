import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
declare global {
  interface CloudflareEnv {
    R2_PUBLIC_URL?: string;
    DB: D1Database;
    BUCKET: R2Bucket;
  }
}
