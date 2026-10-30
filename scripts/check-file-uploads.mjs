import assert from "node:assert/strict";
import { installTestSession } from "./test-session.mjs";
await installTestSession();
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import fs from "node:fs";
import { resolve } from "node:path";
const origin = "http://127.0.0.1:3000";
async function api(path, method = "GET", body) {
  const r = await fetch(origin + path, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(`${method} ${path}: ${r.status} ${data.error}`);
  return data;
}
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const b of buffer) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type),
    len = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
};
function png(width, height) {
  const raw = randomBytes(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0;
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const fixture = ".wrangler/upload-ui-fixture.json";
if (process.argv.includes("--prepare-ui")) {
  if (fs.existsSync(fixture)) throw Error("Clean up previous UI fixture first");
  const task = await api("/api/tasks", "POST", {
    name: "QA upload UI temporary",
  });
  const image = resolve(".wrangler/upload-ui-fixture.png");
  fs.writeFileSync(image, png(640, 480));
  fs.writeFileSync(fixture, JSON.stringify({ id: task.id, image }));
  console.log("UI upload fixture ready: " + image);
} else if (process.argv.includes("--cleanup-ui")) {
  const state = JSON.parse(fs.readFileSync(fixture, "utf8"));
  const workspace = await api("/api/workspace");
  if (
    workspace.tasks.some(
      (t) => t.id === state.id && t.name === "QA upload UI temporary",
    )
  )
    await api("/api/tasks", "DELETE", { id: state.id });
  fs.unlinkSync(fixture);
  fs.unlinkSync(resolve(".wrangler/upload-ui-fixture.png"));
  console.log("UI upload fixture removed.");
} else {
  const task = await api("/api/tasks", "POST", {
    name: "QA upload regression temporary",
  });
  try {
    for (const bytes of [png(32, 32), png(640, 480), png(800, 800)]) {
      const form = new FormData();
      form.set("taskId", task.id);
      form.set(
        "file",
        new Blob([bytes], { type: "image/png" }),
        `QA-${bytes.length}.png`,
      );
      const file = await api("/api/files", "POST", form);
      const image = await fetch(file.url);
      assert.equal(image.status, 200);
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
      await api("/api/files/" + file.id, "DELETE");
      console.log(
        `PASS: ${bytes.length} byte PNG uploaded; public R2 bytes verified.`,
      );
    }
  } finally {
    await api("/api/tasks", "DELETE", { id: task.id });
    console.log("Upload regression records cleaned up.");
  }
}
