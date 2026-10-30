import fs from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
const source = ts.transpileModule(
  fs.readFileSync("lib/column-summary.ts", "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const { calculate, formatSummary } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const values = [null, "", false, "3", 9, -2, "not a number"];
assert.equal(calculate(values, "sum"), 10);
assert.equal(calculate(values, "count"), 3);
assert.equal(calculate(values, "average"), 10 / 3);
assert.equal(calculate(values, "median"), 3);
assert.equal(calculate([2, 8, 4, 6], "median"), 5);
assert.equal(calculate(values, "min"), -2);
assert.equal(calculate(values, "max"), 9);
assert.equal(calculate([], "sum"), 0);
assert.equal(calculate([], "average"), null);
assert.equal(calculate(values, "none"), null);
assert.equal(
  formatSummary(12, { unit: "ชิ้น", position: "right", calculation: "sum" }),
  "12 ชิ้น",
);
assert.equal(
  formatSummary(12, { unit: "$", position: "left", calculation: "sum" }),
  "$ 12",
);
console.log(
  "PASS: Sum/Average/Median/Min/Max/Count/None, empty values, and unit placement.",
);
