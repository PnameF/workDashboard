import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["lib/color.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const c = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
for (const [h, color] of [
  [0, "#ff0000"],
  [60, "#ffff00"],
  [120, "#00ff00"],
  [180, "#00ffff"],
  [240, "#0000ff"],
  [300, "#ff00ff"],
  [360, "#ff0000"],
])
  assert.equal(c.hsvToHex({ h, s: 1, v: 1 }), color);
for (const r of [0, 1, 15, 64, 127, 128, 220, 254, 255])
  for (const g of [0, 1, 15, 64, 127, 128, 220, 254, 255])
    for (const b of [0, 1, 15, 64, 127, 128, 220, 254, 255]) {
      const hex =
        "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      assert.equal(c.hsvToHex(c.hexToHsv(hex)), hex);
    }
assert.equal(c.hsvToHex({ h: 25, s: 0, v: 1 }), "#ffffff");
assert.equal(c.hsvToHex({ h: 25, s: 1, v: 0 }), "#000000");
assert.equal(c.parseColorCode("#F54927", "hex"), "#f54927");
assert.equal(c.parseColorCode("0066FF", "hex"), "#0066ff");
assert.equal(c.parseColorCode("fff", "hex"), "#ffffff");
assert.equal(c.parseColorCode("245, 73, 39", "rgb"), "#f54927");
assert.equal(c.parseColorCode("rgb(245, 73, 39)", "rgb"), "#f54927");
for (const code of [
  "256,0,0",
  "-1,0,0",
  "1.5,0,0",
  "1,2",
  "1,2,3)",
  "rgb(1,2,3",
  "red",
])
  assert.equal(c.parseColorCode(code, "rgb"), null);
for (const code of ["#ff", "#fffffff", "#GGGGGG", "red"])
  assert.equal(c.parseColorCode(code, "hex"), null);
const color = c.hexToHsv("#f54927");
assert.equal(c.colorCode(color, "hex"), "F54927");
assert.equal(c.colorCode(color, "rgb"), "245, 73, 39");
console.log(
  "PASS: hue endpoints, 729 RGB/HSV round trips, black/white, HEX/RGB input, and invalid color rejection.",
);
