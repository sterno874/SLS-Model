import test from "node:test";
import assert from "node:assert/strict";
import {
  b64urlEncode,
  b64urlDecode,
  buildShareHash,
  decodeShareHash,
  parseEmbedMode,
  DEFAULT_STATE,
  SHARE_P,
  SHARE_INV,
  SHARE_SLSP,
  SHARE_VALP,
  SHARE_FIELD_DEFS
} from "../js/ui/state.js";

const clone = (o) => JSON.parse(JSON.stringify(o));
const hashLen = (h) => h.length;

/** Mirror of js/main.js applyRegalPreset — sets exactly these gps fields. */
function applyForward(state, name) {
  const q = SHARE_P[name];
  const g = state.gps;
  g.bat = q.bat; g.batc = q.batc; g.gpsc = q.gpsc; g.gpsu = q.gpsu;
  g.delay = q.delay; g.mid = q.mid; g.k = q.k; g.autofit = !!q.auto;
  g.xtx = q.xtx != null ? q.xtx : 0; g.cens = q.cens != null ? q.cens : 0;
  if (q.mcFloor != null) g.mcFloor = !!q.mcFloor;
  state.regalMode = "forward";
  state.activeRegalPreset = name;
  return state;
}

/** The state the app shows on a fresh load: defaults + "best" preset applied. */
function freshLoadState() {
  return applyForward(clone(DEFAULT_STATE), "best");
}

test("default (fresh-load) share link is tiny and round-trips exactly", () => {
  const s = freshLoadState();
  const hash = buildShareHash(s);
  assert.match(hash, /^#s1=/);
  assert.ok(hashLen(hash) < 20, `default hash too long: ${hashLen(hash)} (${hash})`);
  assert.deepEqual(decodeShareHash(hash), s);
});

test("every forward REGAL preset encodes short and round-trips", () => {
  for (const name of Object.keys(SHARE_P)) {
    const s = applyForward(clone(DEFAULT_STATE), name);
    const hash = buildShareHash(s);
    assert.ok(hashLen(hash) < 100, `forward "${name}" hash ${hashLen(hash)}: ${hash}`);
    assert.deepEqual(decodeShareHash(hash), s, `forward "${name}" round-trip`);
  }
});

test("every valuation preset encodes short and round-trips (was the longest payload)", () => {
  for (const name of Object.keys(SHARE_VALP)) {
    const s = freshLoadState();
    s.tab = "value";
    s.activeValPreset = name;
    Object.assign(s.val, SHARE_VALP[name]);
    const hash = buildShareHash(s);
    assert.ok(hashLen(hash) < 100, `val "${name}" hash ${hashLen(hash)}: ${hash}`);
    assert.deepEqual(decodeShareHash(hash), s, `val "${name}" round-trip`);
  }
});

test("every SLS-009 preset encodes short and round-trips", () => {
  for (const name of Object.keys(SHARE_SLSP)) {
    const s = freshLoadState();
    s.tab = "sls009";
    s.activeSlsPreset = name;
    Object.assign(s.sls, SHARE_SLSP[name]);
    const hash = buildShareHash(s);
    assert.ok(hashLen(hash) < 100, `sls "${name}" hash ${hashLen(hash)}: ${hash}`);
    assert.deepEqual(decodeShareHash(hash), s, `sls "${name}" round-trip`);
  }
});

test("inverse REGAL preset round-trips (bat/gpsu carried as deltas)", () => {
  const s = clone(DEFAULT_STATE);
  s.regalMode = "inverse";
  s.activeInvPreset = "cw42";
  // simulate a solved inverse result written back to sliders
  const q = SHARE_INV.cw42;
  s.gps.gpsc = q.gpsc; s.gps.batcap = q.batcap; s.gps.delay = q.delay;
  s.gps.mid = q.mid; s.gps.k = q.k; s.gps.xtx = q.xtx; s.gps.cens = q.cens;
  s.gps.mcFloor = !!q.mcFloor;
  s.gps.bat = 8.123456; s.gps.gpsu = 27.654321; // solver output
  const hash = buildShareHash(s);
  const decoded = decodeShareHash(hash);
  assert.equal(decoded.gps.bat, 8.123456);
  assert.equal(decoded.gps.gpsu, 27.654321);
  assert.equal(decoded.regalMode, "inverse");
  assert.equal(decoded.activeInvPreset, "cw42");
  assert.deepEqual(decoded, s);
});

test("a custom slider tweak is short and exact", () => {
  const s = freshLoadState();
  s.tab = "value";
  s.val.v_platform = 6.5;
  s.ui.explainLvl = "phd";
  const hash = buildShareHash(s);
  assert.ok(hashLen(hash) < 60, `custom hash ${hashLen(hash)}: ${hash}`);
  assert.deepEqual(decodeShareHash(hash), s);
});

test("arbitrary full state round-trips (all fields, tabs, modes, explain levels)", () => {
  const s = clone(DEFAULT_STATE);
  s.tab = "explain";
  s.regalMode = "inverse";
  s.activeRegalPreset = "bull";
  s.activeInvPreset = "cw50";
  s.activeSlsPreset = "bear";
  s.activeValPreset = "cw";
  s.gps.bat = 7.5; s.gps.k = 0.23; s.gps.stratF = 0.87; s.gps.zfut = 0.55;
  s.gps.autofit = true; s.gps.fhTest = true; s.gps.mcFloor = false; s.gps.cutoff = 80;
  s.sls.sls_flev = 320;
  s.val.v_riskadj = false; s.val.v_pgps = 80; s.val.v_psls = 40;
  s.ui.showUncertainty = true; s.ui.irm_lead = 4.5; s.ui.bf_e58 = 70;
  s.ui.bf_cure = 30; s.ui.explainLvl = "col";
  assert.deepEqual(decodeShareHash(buildShareHash(s)), s);
});

test("rounds float noise instead of emitting 12-decimal values", () => {
  const s = freshLoadState();
  s.gps.k = 0.1 + 0.2; // 0.30000000000000004
  const hash = buildShareHash(s);
  const payload = JSON.parse(b64urlDecode(hash.slice(4)));
  assert.equal(payload.kk, 0.3);
});

test("legacy #s= full-state hashes still decode (backward compat)", () => {
  const legacy = {
    v: 1,
    tab: "gps",
    regalMode: "inverse",
    activeRegalPreset: "best",
    gps: { bat: 10, gpsc: 42, gpsu: 27, mcFloor: true },
    ui: { explainLvl: "phd" }
  };
  const hash = "#s=" + b64urlEncode(JSON.stringify(legacy));
  const decoded = decodeShareHash(hash);
  assert.equal(decoded.regalMode, "inverse");
  assert.equal(decoded.gps.gpsc, 42);
  assert.equal(decoded.ui.explainLvl, "phd");
});

test("corrupt or unknown hashes decode to null (caller falls back)", () => {
  assert.equal(decodeShareHash("#s1=%%%not-base64%%%"), null);
  assert.equal(decodeShareHash("#s=@@@garbage@@@"), null);
  assert.equal(decodeShareHash("#nonsense"), null);
  assert.equal(decodeShareHash(""), null);
  assert.equal(decodeShareHash(null), null);
});

test("b64url encode strips padding and url-unsafe chars; unicode round-trip", () => {
  const enc = b64urlEncode('{"v":1,"tab":"value"}');
  assert.ok(!enc.includes("+"));
  assert.ok(!enc.includes("/"));
  assert.ok(!enc.endsWith("="));
  const unicode = "Δ≥±—share/test?foo=bar";
  const enc2 = b64urlEncode(unicode);
  assert.ok(!enc2.includes("+") && !enc2.includes("/"));
  assert.equal(b64urlDecode(enc2), unicode);
});

test("decode tolerates a hash missing the leading # or with a URL prefix", () => {
  const s = freshLoadState();
  s.val.v_mult = 6;
  const hash = buildShareHash(s);
  assert.deepEqual(decodeShareHash(hash.slice(1)), s); // no leading #
  assert.deepEqual(decodeShareHash("https://x.app/" + hash), s); // full URL
});

test("share field code map is a bijection (no duplicate codes or fields)", () => {
  const codes = SHARE_FIELD_DEFS.map((d) => d[0]);
  const fields = SHARE_FIELD_DEFS.map((d) => `${d[1]}.${d[2]}`);
  assert.equal(new Set(codes).size, codes.length, "duplicate short code");
  assert.equal(new Set(fields).size, fields.length, "duplicate field");
});

test("parseEmbedMode reads embed flag from a delta hash", () => {
  const hash = buildShareHash({ ...clone(DEFAULT_STATE), embed: true });
  assert.equal(parseEmbedMode("", hash), true);
  assert.equal(parseEmbedMode("", buildShareHash(freshLoadState())), false);
});
