import fs from "node:fs";
import { installTestSession } from "./test-session.mjs";
await installTestSession();
import { deflateSync } from "node:zlib";
const file = ".wrangler/qa-ui-fixture.json",
  origin = "http://localhost:3000";
async function api(path, method = "GET", body) {
  const response = await fetch(origin + path, {
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
  if (!response.ok)
    throw new Error(`QA request ${path} failed (${response.status})`);
  return response.json();
}
let state = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : {};
const save = () => {
  fs.mkdirSync(".wrangler", { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state));
};
if (process.argv[2] === "cleanup") {
  const workspace = await api("/api/workspace");
  if (state.column) {
    const layout = structuredClone(workspace.layout);
    for (const key of ["numberSummaries", "overrides", "widths"])
      if (layout[key]) delete layout[key][state.column.id];
    for (const key of ["order", "hidden"])
      layout[key] = layout[key].filter((id) => id !== state.column.id);
    if (state.group) {
      for (const key of ["groupNames", "groupColors"])
        if (layout[key]) delete layout[key][state.group.id];
      if (layout.groupOrder)
        layout.groupOrder = layout.groupOrder.filter(
          (id) => id !== state.group.id,
        );
    }
    await api("/api/table-layout", "PUT", layout);
  }
  if (state.task) await api("/api/tasks", "DELETE", { id: state.task.id });
  if (state.column)
    await api("/api/columns", "DELETE", { id: state.column.id });
  if (state.group) await api("/api/groups", "DELETE", { id: state.group.id });
  if (fs.existsSync(file)) fs.unlinkSync(file);
  console.log("QA UI fixture removed.");
} else {
  if (Object.keys(state).length)
    throw new Error("Clean up the previous fixture first");
  state.group = await api("/api/groups", "POST", {
    name: "QA preview temporary",
    color: "#7c8eac",
  });
  save();
  state.column = await api("/api/columns", "POST", {
    name: "QA quantity",
    type: "number",
  });
  save();
  state.task = await api("/api/tasks", "POST", {
    name: "QA preview fixture",
    group_id: state.group.id,
    custom: { [state.column.id]: "5" },
  });
  save();
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
      length = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, crc]);
  };
  const width = 320,
    height = 200,
    raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * (1 + width * 3) + 1 + x * 3;
      raw[at] = 32 + Math.round((x / width) * 72);
      raw[at + 1] = 45 + Math.round((y / height) * 65);
      raw[at + 2] = 80 + Math.round((x / width) * 70);
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const form = new FormData();
  form.set("taskId", state.task.id);
  form.set(
    "file",
    new Blob([png], { type: "image/png" }),
    "QA preview image.png",
  );
  state.image = await api("/api/files", "POST", form);
  save();
  const workspace = await api("/api/workspace");
  await api("/api/table-layout", "PUT", {
    ...workspace.layout,
    numberSummaries: {
      ...workspace.layout.numberSummaries,
      [state.column.id]: {
        unit: "ชิ้น",
        position: "right",
        calculation: "sum",
      },
    },
  });
  console.log(
    "QA UI fixture ready: image preview, zoom, and quantity summary.",
  );
}
