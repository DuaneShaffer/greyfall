// Regenerates the README screenshots in docs/media/ against the real app.
// Usage: npm run shots   (requires Chrome/Chromium; node >= 21 for WebSocket)
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.dirname(new URL(import.meta.url).pathname) + "/..";
const OUT = path.resolve(ROOT, "docs/media");
const PORT = 5217;
const CDP_PORT = 9333;
const VIEW = { width: 1600, height: 1000 };

const chromeBin = ["google-chrome", "chromium-browser", "chromium"].find((b) => {
  try { execSync(`which ${b}`, { stdio: "ignore" }); return true; } catch { return false; }
});
if (!chromeBin) { console.error("no chrome/chromium found"); process.exit(1); }

const children = [];
const cleanup = () => children.forEach((c) => { try { c.kill("SIGKILL"); } catch {} });
process.on("exit", cleanup);

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: ROOT, stdio: "ignore",
});
children.push(vite);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "greyfall-shots-"));
const chrome = spawn(chromeBin, [
  "--headless=new", `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`, `--window-size=${VIEW.width},${VIEW.height}`,
  "--no-first-run", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "about:blank",
], { stdio: "ignore" });
children.push(chrome);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, what, tries = 50, gap = 300) {
  for (let i = 0; i < tries; i++) { try { const v = await fn(); if (v) return v; } catch {} await sleep(gap); }
  throw new Error("timeout waiting for " + what);
}

await waitFor(() => fetch(`http://localhost:${PORT}`).then((r) => r.ok), "vite");
const page = await waitFor(async () => {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  return targets.find((t) => t.type === "page");
}, "chrome");

let msgId = 0;
const pending = new Map();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression: `(function(){${expression}})()`, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
async function click(x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: 1 });
    await sleep(40);
  }
  await sleep(250);
}
async function clickText(sel, text) {
  const hit = await evaluate(`
    const want = ${JSON.stringify(text)}.toLowerCase();
    for (const e of document.querySelectorAll(${JSON.stringify(sel)})) {
      const t = (e.innerText || "").trim().toLowerCase();
      if (!t.includes(want)) continue;
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;`);
  if (!hit) return false;
  await click(hit.x, hit.y);
  return true;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, "base64"));
  console.log("wrote", name);
}
async function advanceDialogue() {
  for (let i = 0; i < 20; i++) {
    const d = await evaluate(`
      const e = document.querySelector(".gf-dialogue");
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;`);
    if (!d) return;
    await click(d.x, d.y);
    await sleep(350);
  }
}
async function intoBattle(campaignText) {
  await send("Page.navigate", { url: `http://localhost:${PORT}` });
  await sleep(2500);
  await evaluate(`localStorage.clear(); return true;`);
  await send("Page.navigate", { url: `http://localhost:${PORT}` });
  await sleep(2500);
  await clickText(".gf-menu-entry, .gf-record-row, button, li", campaignText);
  await sleep(500);
  for (const label of ["new file", "open"]) if (await clickText("button, .gf-menu-entry", label)) break;
  await sleep(500);
  await clickText("button", "move out");
  await sleep(900);
  await clickText(".gf-menu-entry", "take the field");
  await sleep(1200);
  await advanceDialogue();
  await sleep(2500);
  await waitFor(() => evaluate(`
    const m = document.querySelector(".gf-mode-bar");
    return m && /orders/i.test(m.innerText);`), "player orders phase", 60, 500);
  await sleep(600);
}

fs.mkdirSync(OUT, { recursive: true });
await intoBattle("skirmishes");
await shot("meter-house.png");
await intoBattle("foundry");
await shot("battle-hud.png");

console.log("done");
cleanup();
process.exit(0);
