import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(fs.readFileSync("lib/board.ts", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { reorderColumn } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const columns = ["name", "hidden", "status", "hours"];
assert.deepEqual(reorderColumn(columns, "hours", "name"), [
  "hours",
  "name",
  "hidden",
  "status",
]);
assert.deepEqual(reorderColumn(columns, "name", "hours", true), [
  "hidden",
  "status",
  "hours",
  "name",
]);
assert.deepEqual(reorderColumn(columns, "hours", "status", true), columns);
assert.deepEqual(reorderColumn(columns, "hours", "status"), [
  "name",
  "hidden",
  "hours",
  "status",
]);
assert.deepEqual(reorderColumn(columns, "name", "name", true), columns);
assert.deepEqual(reorderColumn(columns, "missing", "status"), columns);
assert.deepEqual(columns, ["name", "hidden", "status", "hours"]);
console.log(
  "PASS: column drops before/after, first/last placement, hidden column preservation, self/missing targets, and unchanged source order.",
);
