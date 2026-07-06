import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseHTML } from "linkedom";
import { P, INV } from "./fixtures/presets.js";
import { SHARE_SLSP, SHARE_VALP } from "../js/ui/state.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeLocation() {
  const loc = {
    origin: "http://127.0.0.1:8765",
    pathname: "/index.html",
    search: "",
    hash: "",
    href: "http://127.0.0.1:8765/index.html"
  };
  loc.assign = (url) => {
    const u = new URL(url, loc.origin);
    loc.origin = u.origin;
    loc.pathname = u.pathname;
    loc.search = u.search;
    loc.hash = u.hash;
    loc.href = u.href;
  };
  loc.replace = loc.assign;
  loc.toString = () => loc.href;
  return loc;
}

function makeCanvasContext(canvas) {
  const bump = (name, args) => {
    canvas.__drawCalls = (canvas.__drawCalls || 0) + 1;
    for (const arg of args) {
      if (typeof arg === "number" && !Number.isFinite(arg)) {
        throw new Error(`canvas ${canvas.id || "unknown"} ${name} received ${arg}`);
      }
      if (Array.isArray(arg)) {
        for (const n of arg) {
          if (typeof n === "number" && !Number.isFinite(n)) {
            throw new Error(`canvas ${canvas.id || "unknown"} ${name} received ${n}`);
          }
        }
      }
    }
  };
  const ctx = {};
  for (const name of [
    "setTransform",
    "clearRect",
    "fillText",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "fill",
    "closePath",
    "save",
    "restore",
    "translate",
    "rotate",
    "setLineDash",
    "fillRect"
  ]) {
    ctx[name] = (...args) => bump(name, args);
  }
  return ctx;
}

function installDom() {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const { window } = parseHTML(html);
  const location = makeLocation();
  const history = {
    replaceState(_state, _title, url) {
      if (url) location.assign(url);
    }
  };
  const errors = [];

  window.location = location;
  window.history = history;
  window.devicePixelRatio = 1;
  window.innerWidth = 1200;
  window.scrollTo = () => {};
  window.print = () => {};
  window.confirm = () => true;
  window.prompt = () => "";
  Object.defineProperty(window, "navigator", {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true
  });
  window.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.__SLS_MODEL_MC_DRAWS = { regal: 12000, inverse: 800, sls: 2000, val: 2000 };
  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return makeCanvasContext(this);
  };
  if (window.HTMLSelectElement) {
    Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
      get() {
        const selected = this.querySelector("option[selected]");
        const first = this.querySelector("option");
        return this.getAttribute("value") || selected?.getAttribute("value") || first?.getAttribute("value") || "";
      },
      set(v) {
        const value = String(v);
        this.setAttribute("value", value);
        this.querySelectorAll("option").forEach((option) => {
          if (option.getAttribute("value") === value) option.setAttribute("selected", "");
          else option.removeAttribute("selected");
        });
      },
      configurable: true
    });
  }
  window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason || event);
  });

  const computed = () => ({
    getPropertyValue(name) {
      return {
        "--bat": "#d64545",
        "--gps": "#2f6fed",
        "--data": "#24a148",
        "--good": "#1a7f37",
        "--bad": "#b42318",
        "--accent": "#2f6fed",
        "--muted": "#6b7280",
        "--ink": "#111827"
      }[name] || "#111827";
    }
  });

  Object.assign(globalThis, {
    window,
    document: window.document,
    location,
    history,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    HTMLElement: window.HTMLElement,
    HTMLCanvasElement: window.HTMLCanvasElement,
    getComputedStyle: computed,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    confirm: window.confirm,
    prompt: window.prompt,
    fetch: undefined
  });
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true
  });
  globalThis.__presetSmokeErrors = errors;

  return { window, document: window.document, errors };
}

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, label, timeoutMs = 20000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const value = fn();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await sleep(10);
  }
  if (last) throw last;
  throw new Error(`timed out waiting for ${label}`);
}

function click(document, selector) {
  const el = document.querySelector(selector);
  assert.ok(el, `missing ${selector}`);
  el.dispatchEvent(new Event("click", { bubbles: true }));
  return el;
}

function noBadText(document, ids, label) {
  const text = ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
  assert.doesNotMatch(text, /\bNaN\b|undefined/i, `${label} contains bad text: ${text}`);
}

function assertRegalRendered(document, label, previousDraws) {
  const chart = document.getElementById("chart");
  assert.ok(chart.width > 0 && chart.height > 0, `${label} chart should have dimensions`);
  assert.ok((chart.__drawCalls || 0) > previousDraws, `${label} should redraw main chart`);
  noBadText(
    document,
    ["vBat", "vBatc", "vGpsc", "vGpsu", "oHRnum", "oPower", "verdict", "mcStatus", "mcStats"],
    label
  );
  assert.ok(document.getElementById("verdict").textContent.trim(), `${label} verdict should be populated`);
}

async function runRegalMC(document, label) {
  click(document, "#mcRun");
  await waitFor(
    () => document.getElementById("mcStatus").textContent !== "running…",
    `${label} REGAL MC`,
    12000
  );
  const status = document.getElementById("mcStatus").textContent;
  const stats = document.getElementById("mcStats").textContent;
  const hist = document.getElementById("mcHist").innerHTML;
  assert.doesNotMatch(`${status} ${stats} ${hist}`, /\bNaN\b|undefined/i, `${label} MC contains bad output`);
  if (/usable draws/.test(status)) {
    assert.match(status, /widen priors|loosen the floor/i, `${label} low-draw MC should explain next step`);
  } else {
    assert.match(status, /draws · effective N/i, `${label} MC status should summarize draws`);
    assert.match(stats, /P\(win/, `${label} MC stats should include P(win)`);
    assert.match(hist, /mc-hist-wrap/, `${label} MC histogram should render`);
  }
}

async function assertRegalClearsStaleMC(document, seedSelector, changeSelector) {
  const before = document.getElementById("chart").__drawCalls || 0;
  click(document, seedSelector);
  await waitFor(() => (document.getElementById("chart").__drawCalls || 0) > before, "stale-state seed draw");
  const drawCfg = window.__SLS_MODEL_MC_DRAWS;
  const oldRegalDraws = drawCfg.regal;
  drawCfg.regal = 80000;
  try {
    await runRegalMC(document, "stale-state seed");
  } finally {
    drawCfg.regal = oldRegalDraws;
  }
  assert.match(document.getElementById("mcStats").textContent, /P\(win/);
  click(document, changeSelector);
  await sleep(20);
  assert.equal(document.getElementById("mcStats").textContent, "");
  assert.equal(document.getElementById("mcHist").innerHTML, "");
  assert.match(document.getElementById("mcStatus").textContent, /click Run/i);
}

async function runSlsMC(document, label) {
  click(document, "#mcSlsRun");
  try {
    await waitFor(
      () => document.getElementById("mcSlsStatus").textContent !== "running…",
      `${label} SLS MC`,
      20000
    );
  } catch (err) {
    const status = document.getElementById("mcSlsStatus").textContent;
    const details = (globalThis.__presetSmokeErrors || []).map((e) => e?.stack || e?.message || String(e)).join(" | ");
    throw new Error(`${err.message}; status=${status}; errors=${details}`);
  }
  const out = [
    document.getElementById("mcSlsStatus").textContent,
    document.getElementById("mcSlsStats").textContent,
    document.getElementById("mcSlsHist").innerHTML
  ].join(" ");
  assert.doesNotMatch(out, /\bNaN\b|undefined/i, `${label} SLS MC contains bad output`);
  assert.match(out, /[0-9,]+ draws/);
  assert.match(out, /mc-hist-wrap/);
}

async function runValMC(document, label) {
  click(document, "#mcValRun");
  try {
    await waitFor(
      () => document.getElementById("mcValStatus").textContent !== "running…",
      `${label} valuation MC`,
      20000
    );
  } catch (err) {
    const status = document.getElementById("mcValStatus").textContent;
    const details = (globalThis.__presetSmokeErrors || []).map((e) => e?.stack || e?.message || String(e)).join(" | ");
    throw new Error(`${err.message}; status=${status}; errors=${details}`);
  }
  const out = [
    document.getElementById("mcValStatus").textContent,
    document.getElementById("mcValStats").textContent,
    document.getElementById("mcValHist").innerHTML
  ].join(" ");
  assert.doesNotMatch(out, /\bNaN\b|undefined/i, `${label} valuation MC contains bad output`);
  assert.match(out, /[0-9,]+ draws/);
  assert.match(out, /mc-hist-wrap/);
}

test("all pre-canned scenarios click, graph, and run Monte Carlo", { timeout: 150000 }, async () => {
  const { document, errors } = installDom();
  await import(`${pathToFileURL(path.join(root, "js/main.js")).href}?preset-dom-matrix=${Date.now()}`);
  await waitFor(() => document.getElementById("chart").__drawCalls > 0, "initial REGAL draw");

  const forward = [...document.querySelectorAll("button[data-preset]")].map((b) => b.dataset.preset);
  const inverse = [...document.querySelectorAll("button[data-inv]")].map((b) => b.dataset.inv);
  const sls = [...document.querySelectorAll("button[data-sls]")].map((b) => b.dataset.sls);
  const val = [...document.querySelectorAll("button[data-val]")].map((b) => b.dataset.val);
  const dilution = [...document.querySelectorAll("button[data-dilution-stress]")].map((b) => Number(b.dataset.dilutionStress));

  assert.deepEqual(new Set(forward), new Set(Object.keys(P)));
  assert.deepEqual(new Set(inverse), new Set(Object.keys(INV)));
  assert.deepEqual(new Set(sls), new Set(Object.keys(SHARE_SLSP)));
  assert.deepEqual(new Set(val), new Set(Object.keys(SHARE_VALP)));
  assert.deepEqual(dilution, [181.3, 222, 240]);

  for (const name of forward) {
    const before = document.getElementById("chart").__drawCalls || 0;
    click(document, `button[data-preset="${name}"]`);
    await waitFor(() => (document.getElementById("chart").__drawCalls || 0) > before, `forward ${name} draw`);
    assert.equal(document.querySelector("button[data-preset].p-def")?.dataset.preset, name);
    assert.ok(document.getElementById("modeForward").classList.contains("active"), `${name} should be forward`);
    assert.equal(document.getElementById("bat").disabled, false, `${name} should re-enable BAT slider`);
    assert.equal(Number(document.getElementById("gpsc").value), P[name].gpsc, `${name} GPS cure slider`);
    assertRegalRendered(document, `forward ${name}`, before);
    await runRegalMC(document, `forward ${name}`);
  }

  for (const name of inverse) {
    const before = document.getElementById("chart").__drawCalls || 0;
    click(document, `button[data-inv="${name}"]`);
    await waitFor(() => (document.getElementById("chart").__drawCalls || 0) > before, `inverse ${name} draw`);
    assert.equal(document.querySelector("button[data-inv].p-def")?.dataset.inv, name);
    assert.ok(document.getElementById("modeInverse").classList.contains("active"), `${name} should be inverse`);
    assert.equal(document.getElementById("bat").disabled, true, `${name} should disable derived BAT slider`);
    assert.equal(Number(document.getElementById("gpsc").value), INV[name].gpsc, `${name} GPS cure slider`);
    assert.match(document.getElementById("invStatus").textContent, /Mandatory constraint|reproduce 60\/72\/78/);
    assertRegalRendered(document, `inverse ${name}`, before);
    await runRegalMC(document, `inverse ${name}`);
  }

  await assertRegalClearsStaleMC(document, `button[data-preset="best"]`, `button[data-preset="moderate"]`);

  click(document, '.tabbtn[data-tab="sls009"]');
  await waitFor(() => (document.getElementById("slsChart").__drawCalls || 0) > 0, "SLS chart draw");
  for (const name of sls) {
    const before = document.getElementById("slsChart").__drawCalls || 0;
    click(document, `button[data-sls="${name}"]`);
    await waitFor(() => (document.getElementById("slsChart").__drawCalls || 0) > before, `SLS ${name} draw`);
    assert.equal(document.querySelector("button[data-sls].p-def")?.dataset.sls, name);
    noBadText(document, ["oFold", "oHReq", "oGain", "oORR", "oApprov", "oFront"], `SLS ${name}`);
    await runSlsMC(document, `SLS ${name}`);
  }
  assert.match(document.getElementById("mcSlsStats").textContent, /median OS fold/);
  click(document, `button[data-sls="best"]`);
  await sleep(20);
  assert.equal(document.getElementById("mcSlsStats").textContent, "");
  assert.equal(document.getElementById("mcSlsHist").innerHTML, "");
  assert.match(document.getElementById("mcSlsStatus").textContent, /click Run/i);

  click(document, '.tabbtn[data-tab="value"]');
  await waitFor(() => document.getElementById("oEV").textContent !== "–", "valuation render");
  for (const name of val) {
    click(document, `button[data-val="${name}"]`);
    await waitFor(() => document.querySelector("button[data-val].p-def")?.dataset.val === name, `valuation ${name}`);
    noBadText(document, ["oGpsPeak", "oSlsPeak", "oTotPeak", "oEV", "oEquity", "oPS", "oBuy"], `valuation ${name}`);
    await runValMC(document, `valuation ${name}`);
  }
  for (const shares of dilution) {
    click(document, `button[data-dilution-stress="${shares}"]`);
    await waitFor(() => Math.abs(Number(document.getElementById("v_shares").value)-shares)<0.05, `dilution ${shares}`);
    noBadText(document, ["vv_shares", "oEV", "oEquity", "oPS", "oBuy", "oPsDil"], `dilution ${shares}`);
    await runValMC(document, `dilution ${shares}`);
  }
  assert.match(document.getElementById("mcValStats").textContent, /median EV/);
  click(document, `button[data-val="best"]`);
  await sleep(20);
  assert.equal(document.getElementById("mcValStats").textContent, "");
  assert.equal(document.getElementById("mcValHist").innerHTML, "");
  assert.match(document.getElementById("mcValStatus").textContent, /click Run/i);

  assert.deepEqual(errors, []);
});
