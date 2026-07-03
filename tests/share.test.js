import test from "node:test";
import assert from "node:assert/strict";

function b64urlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString("utf8");
}

function captureStateSample() {
  return {
    v: 1,
    tab: "gps",
    regalMode: "inverse",
    gps: { bat: 10, gpsc: 42 },
    ui: { explainLvl: "phd" }
  };
}

function roundTrip(state) {
  return JSON.parse(b64urlDecode(b64urlEncode(JSON.stringify(state))));
}

test("share URL b64 round-trip preserves nested fields", () => {
  const sample = captureStateSample();
  const decoded = roundTrip(sample);
  assert.equal(decoded.regalMode, "inverse");
  assert.equal(decoded.ui.explainLvl, "phd");
  assert.equal(decoded.gps.gpsc, 42);
});

test("share URL round-trip preserves tab and version", () => {
  const sample = captureStateSample();
  const decoded = roundTrip(sample);
  assert.equal(decoded.v, 1);
  assert.equal(decoded.tab, "gps");
});

test("b64url encode avoids padding and url-unsafe chars", () => {
  const enc = b64urlEncode('{"v":1,"tab":"value"}');
  assert.ok(!enc.includes("+"));
  assert.ok(!enc.includes("/"));
  assert.ok(!enc.endsWith("="));
});

test("hash fragment format #s= round-trip", () => {
  const hash = "#s=" + b64urlEncode(JSON.stringify(captureStateSample()));
  const payload = JSON.parse(b64urlDecode(hash.slice(3)));
  assert.equal(payload.regalMode, "inverse");
});
