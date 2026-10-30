import fs from "node:fs";
import ts from "typescript";
const config = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  fs.readFileSync("wrangler.jsonc", "utf8"),
).config;
let source = fs.readFileSync(".env", "utf8");
const values = {
  CLOUDFLARE_D1_DATABASE_ID: config.d1_databases[0].database_id,
  R2_BUCKET_NAME: config.r2_buckets[0].bucket_name,
  CLOUDFLARE_STORAGE_MODE: "remote",
};
for (const [name, value] of Object.entries(values)) {
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(source))
    source = source.replace(pattern, `${name}=${value}`);
  else source += `\n${name}=${value}`;
}
fs.writeFileSync(".env", source.trimEnd() + "\n");
console.log("Remote D1/R2 settings saved in .env. Secrets were not printed.");
