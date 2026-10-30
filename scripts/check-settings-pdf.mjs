import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
async function load(file) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
}
const { normalizePreferences, defaultPreferences } =
    await load("lib/preferences.ts"),
  { fitPdfPage } = await load("lib/pdf-fit.ts");
assert.deepEqual(normalizePreferences(null), defaultPreferences);
assert.deepEqual(
  normalizePreferences({
    homePage: "https://evil.example",
    taskTab: "other",
    density: "invalid",
  }),
  defaultPreferences,
);
assert.deepEqual(
  normalizePreferences({
    homePage: "/reports",
    taskTab: "open",
    density: "compact",
  }),
  { homePage: "/reports", taskTab: "open", density: "compact" },
);
for (const [width, height] of [
  [2240, 3600],
  [3600, 2240],
  [2240, 16000],
  [900, 3000],
]) {
  const p = fitPdfPage(width, height, 210, 297);
  assert.ok(p.width <= 194 + 0.001 && p.height <= 281 + 0.001);
  assert.ok(p.x >= 8 - 0.001 && p.y >= 8 - 0.001);
  assert.ok(Math.abs(p.width / p.height - width / height) < 0.0001);
}
assert.throws(() => fitPdfPage(0, 100, 210, 297));
console.log(
  "PASS: per-user preference defaults/validation and aspect-preserving single-page PDF fitting, including tall reports.",
);
