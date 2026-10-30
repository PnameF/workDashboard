import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (
  process.env.NODE_ENV === "development" &&
  process.env.CLOUDFLARE_STORAGE_MODE !== "remote"
)
  initOpenNextCloudflareForDev({
    configPath: "wrangler.local.jsonc",
    remoteBindings: false,
  });
const config: NextConfig = { poweredByHeader: false };
export default config;
