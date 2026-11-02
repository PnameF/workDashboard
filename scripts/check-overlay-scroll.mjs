import assert from "node:assert/strict";
import { build } from "esbuild";
const code = await build({
  entryPoints: ["lib/overlay-scroll.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { installOverlayScrollLock } = await import(
  "data:text/javascript;base64," +
    Buffer.from(code.outputFiles[0].text).toString("base64")
);
class FakeElement {
  constructor(parent = null) {
    this.parentElement = parent;
    this.style = { overflow: "", paddingRight: "" };
    this.attrs = new Map();
    this.clientWidth = 100;
    this.clientHeight = 100;
    this.scrollWidth = 100;
    this.scrollHeight = 100;
    this.scrollTop = 0;
    this.scrollLeft = 0;
  }
  contains(target) {
    for (let node = target; node; node = node.parentElement)
      if (node === this) return true;
    return false;
  }
  setAttribute(name, value) {
    this.attrs.set(name, value);
  }
  removeAttribute(name) {
    this.attrs.delete(name);
  }
  closest() {
    return this.slider ? this : null;
  }
}
class FakeHTMLElement extends FakeElement {}
globalThis.Element = FakeElement;
globalThis.HTMLElement = FakeHTMLElement;
let mutation;
globalThis.MutationObserver = class {
  constructor(callback) {
    mutation = callback;
  }
  observe() {}
  disconnect() {}
};
const root = new FakeHTMLElement(),
  body = new FakeHTMLElement(root);
root.style.overflow = "auto";
root.clientWidth = 1185;
body.style.paddingRight = "4px";
const listeners = new Map();
const doc = {
  body,
  documentElement: root,
  active: [],
  querySelectorAll() {
    return this.active;
  },
  addEventListener(type, callback) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
  },
  removeEventListener(type, callback) {
    listeners.get(type)?.delete(callback);
  },
};
const win = {
  innerWidth: 1200,
  getComputedStyle(element) {
    return {
      paddingRight: element === body ? "4px" : "0px",
      overflowY: element.vertical ? "auto" : "visible",
      overflowX: element.horizontal ? "auto" : "visible",
    };
  },
};
const fire = (type, event = {}) => {
  event.preventDefault = () => {
    event.prevented = true;
  };
  for (const callback of listeners.get(type) || []) callback(event);
  return !!event.prevented;
};
const tick = async () => {
  fire("toggle");
  await Promise.resolve();
};
const dialog = new FakeHTMLElement(body),
  popup = new FakeHTMLElement(dialog),
  child = new FakeHTMLElement(popup),
  background = new FakeHTMLElement(body);
dialog.vertical = popup.vertical = background.vertical = true;
dialog.scrollHeight = 600;
popup.scrollHeight = 300;
background.scrollHeight = 1000;
const cleanup = installOverlayScrollLock(doc, win);
assert.equal(body.style.overflow, "");
doc.active = [dialog];
await tick();
assert.equal(body.style.overflow, "hidden");
assert.equal(root.style.overflow, "hidden");
assert.equal(body.style.paddingRight, "19px");
assert.ok(fire("wheel", { target: background, deltaY: 20, deltaX: 0 }));
assert.ok(!fire("wheel", { target: dialog, deltaY: 20, deltaX: 0 }));
doc.active = [dialog, popup];
await tick();
assert.ok(
  fire("wheel", { target: dialog, deltaY: 20, deltaX: 0 }),
  "Parent dialog is background while a child popup is open",
);
assert.ok(!fire("wheel", { target: child, deltaY: 20, deltaX: 0 }));
popup.scrollTop = 200;
assert.ok(
  fire("wheel", { target: child, deltaY: 20, deltaX: 0 }),
  "Do not chain scroll through popup boundary",
);
assert.ok(!fire("wheel", { target: child, deltaY: -20, deltaX: 0 }));
popup.horizontal = true;
popup.scrollWidth = 400;
assert.ok(
  !fire("wheel", { target: child, deltaY: 20, deltaX: 0, shiftKey: true }),
);
const svg = new FakeElement(child);
assert.ok(
  !fire("wheel", { target: svg, deltaY: -20, deltaX: 0 }),
  "Wheel over an icon should scroll its popup",
);
assert.ok(
  !fire("wheel", { target: background, deltaY: 20, deltaX: 0, ctrlKey: true }),
  "Preserve browser zoom",
);
fire("touchstart", {
  target: background,
  touches: [{ clientX: 0, clientY: 50 }],
});
assert.ok(
  fire("touchmove", {
    target: background,
    touches: [{ clientX: 0, clientY: 20 }],
  }),
);
child.slider = true;
fire("touchstart", { target: child, touches: [{ clientX: 0, clientY: 50 }] });
assert.ok(
  !fire("touchmove", {
    target: child,
    touches: [{ clientX: 20, clientY: 50 }],
  }),
  "Color sliders retain native touch dragging",
);
doc.active = [dialog];
await tick();
assert.equal(body.style.overflow, "hidden");
doc.active = [];
mutation([]);
await Promise.resolve();
assert.equal(body.style.overflow, "");
assert.equal(root.style.overflow, "auto");
assert.equal(body.style.paddingRight, "4px");
doc.active = [dialog];
await tick();
fire("toggle");
cleanup();
await Promise.resolve();
assert.equal(body.style.overflow, "");
assert.equal(root.style.overflow, "auto");
assert.equal(
  [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  0,
);
console.log(
  "PASS: nested overlay locks, background wheel/touch blocking, internal/horizontal/icon scrolling, boundary chaining, slider gestures, zoom, restoration and unmount cleanup.",
);
