// Capture WhyTrace console screenshots over the Chrome DevTools Protocol.
// Brave headless-screenshot CLI stalls on macOS (CVDisplayLink), so we open
// Brave with --remote-debugging-port, drive it via CDP, and write a PNG per
// recorded run. The deep-link ?run=<id> on the SPA makes each capture URL
// deterministic. Nothing is installed globally; Brave is already present.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
// Node 22 ships a global WebSocket; no npm dep needed.

const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const WEB_BASE = process.env.WHYTRACE_WEB ?? "http://[::1]:5173";
const OUT_DIR = resolve(process.argv[2] ?? "docs/media");
const WIDTH = 1440;
const HEIGHT = 1000;

const SHOTS = [
  { run: "mvkpcv7i_5b2ce0bc39", file: "console-case-001-contain.png", caption: "case-001 contain @ 0.94 (model+policy)" },
  { run: "mvkop4ww_ef8b857b21", file: "console-case-002-benign.png",  caption: "case-002 benign (DAY3D shared-egress rejection on a DAY3E fresh-store run)" },
  { run: "mvkpwabw_095790bc2d", file: "console-case-003-escalate.png", caption: "case-003 escalate (DQ conflict; risk-gate degraded → policy fallback)" },
  { run: "mvkpsitu_a27519248c", file: "console-case-007-contain-prompt-injection.png", caption: "case-007 contain + prompt-injection panel" },
  // DAY5: dedicated capture of the "Why this verdict" panel for case-001.
  // Uses the same URL but asks the SPA to scroll the Verdict aside into view
  // and crops the shot to its bounding box (attribution bars + counterfactual
  // chips + "why not <runner-up>" line + faithfulness badge).
  { run: "mvkpcv7i_5b2ce0bc39", file: "console-explain-case-001.png", caption: "case-001 explain-why panel (attribution + counterfactuals + faithfulness)", focusAside: true },
];

mkdirSync(OUT_DIR, { recursive: true });

const profile = join(tmpdir(), `brave-whytrace-${randomUUID().slice(0, 8)}`);
mkdirSync(profile, { recursive: true });
const port = 9222;
console.log(`profile=${profile} port=${port}`);

const brave = spawn(BRAVE, [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  "--disable-dev-shm-usage",
  `--window-size=${WIDTH},${HEIGHT}`,
  "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check",
  "--disable-breakpad", "--disable-crash-reporter",
  "about:blank",
], { stdio: "ignore", detached: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { try { brave.kill("SIGTERM"); } catch { /* ignore */ } };
process.on("exit", cleanup); process.on("SIGINT", () => { cleanup(); process.exit(130); });

async function waitForCdp() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch { /* keep polling */ }
    await sleep(500);
  }
  throw new Error("Brave CDP endpoint did not come up");
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.sessionId = undefined;
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
      if (msg.method === "Runtime.consoleAPICalled") console.log(`  [console.${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a.preview || {})).join(" "));
      if (msg.method === "Runtime.exceptionThrown") console.log(`  [exception]`, msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
      if (msg.method === "Log.entryAdded") console.log(`  [log]`, msg.params.entry.text);
      if (msg.id && this.waiters.has(msg.id)) {
        const { resolve, reject } = this.waiters.get(msg.id); this.waiters.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.waiters.set(id, { resolve, reject }));
  }
}

async function run() {
  const browserWsUrl = await waitForCdp();
  const browserWs = new WebSocket(browserWsUrl);
  await new Promise((resolve, reject) => {
    browserWs.addEventListener("open", () => resolve(), { once: true });
    browserWs.addEventListener("error", (e) => reject(e), { once: true });
  });
  const browser = new Cdp(browserWs);

  // Find the initial page target the headless launch created (about:blank).
  const { targetInfos } = await browser.send("Target.getTargets");
  const page = targetInfos.find((t) => t.type === "page");
  if (!page) throw new Error("no page target in headless Brave — did it launch?");
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  browser.sessionId = sessionId;
  await browser.send("Page.enable");
  await browser.send("Runtime.enable");
  await browser.send("Log.enable");
  await browser.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });

  for (const shot of SHOTS) {
    const url = `${WEB_BASE}/?run=${shot.run}`;
    console.log(`→ ${shot.file} (${url})`);
    await browser.send("Page.navigate", { url });
    // Wait for the SPA to settle. The React app hydrates, fetches /api/runs,
    // then loadRun fetches /api/runs/:id — budget generously (12 s).
    await sleep(12000);
    // Peek at the DOM so a blank screenshot is diagnosable.
    try {
      const info = await browser.send("Runtime.evaluate", { expression: "JSON.stringify({ title: document.title, loc: location.href, body: (document.body?.innerText || '').slice(0,200), html_len: document.documentElement.outerHTML.length })", returnByValue: true });
      console.log(`  diag: ${info.result.value}`);
    } catch { /* best effort */ }
    let captureParams = { format: "png", captureBeyondViewport: false };
    if (shot.focusAside) {
      // Grow the viewport so the full aside fits, scroll the explain panel to
      // the top, then clip to a tight box that spans only the explain panel
      // (and the small verdict-chip header right above it in the aside).
      try {
        // Resize the viewport tall enough that the full aside renders without
        // needing to scroll; this guarantees the explain panel's bounding box
        // is a stable rectangle we can clip to.
        await browser.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 2800, deviceScaleFactor: 2, mobile: false });
        await sleep(500);
        const box = await browser.send("Runtime.evaluate", {
          expression: `(function(){
            // Make sure we are at the top of the page so getBoundingClientRect
            // values are absolute positions on the first screen.
            window.scrollTo(0, 0);
            const el = document.querySelector('.explain-panel');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            // Add a small margin on all sides so the shot has breathing room.
            return JSON.stringify({ x: Math.max(0, Math.floor(r.left) - 12), y: Math.max(0, Math.floor(r.top) - 12), width: Math.ceil(r.width) + 24, height: Math.ceil(r.height) + 24 });
          })()`,
          returnByValue: true,
        });
        if (box.result.value) {
          const clip = JSON.parse(box.result.value);
          captureParams = { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } };
          console.log(`  focus clip: ${clip.width}x${clip.height} @ (${clip.x}, ${clip.y})`);
        }
      } catch (err) {
        console.log(`  focus clip failed, falling back to full shot: ${err.message}`);
      }
    }
    const { data } = await browser.send("Page.captureScreenshot", captureParams);
    if (shot.focusAside) {
      // Restore the main viewport for subsequent shots.
      try { await browser.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false }); } catch { /* ignore */ }
    }
    writeFileSync(join(OUT_DIR, shot.file), Buffer.from(data, "base64"));
    console.log(`  wrote ${shot.file} (${Buffer.from(data, "base64").length.toLocaleString()} bytes)`);
  }

  cleanup();
}

try { await run(); } catch (err) { console.error("capture failed:", err.message); cleanup(); process.exit(1); }
