import test from "node:test";
import assert from "node:assert/strict";
import {
  parseQuotePayload,
  formatPrice,
  formatApproxPrice,
  formatMarketCapM,
  formatApproxMarketCapM,
  buildQuoteMeta,
  formatChangePct,
  computeVsMarketUpside,
  fetchLiveQuote,
  QUOTE_LABEL
} from "../js/ui/market-quote.js";

test("parseQuotePayload accepts valid Yahoo quote", () => {
  const q = parseQuotePayload({
    symbol: "SLS",
    price: 14.98,
    previousClose: 13.27,
    changePct: 12.9,
    marketCapM: 2946,
    sharesOutstandingM: 196.63,
    currency: "USD",
    asOf: "2026-07-02T20:00:00.000Z",
    source: "yahoo"
  });
  assert.equal(q.ok, true);
  assert.equal(q.price, 14.98);
  assert.equal(q.marketCapM, 2946);
  assert.equal(q.sharesOutstandingM, 196.63);
});

test("parseQuotePayload rejects missing price", () => {
  assert.equal(parseQuotePayload({ symbol: "SLS" }).ok, false);
  assert.equal(parseQuotePayload({ error: "nope" }).error, "nope");
});

test("formatApproxPrice and formatApproxMarketCapM", () => {
  assert.equal(formatApproxPrice(14.98), "~$14.98");
  assert.equal(formatApproxMarketCapM(2946), "~$2.9B");
  assert.equal(formatApproxMarketCapM(450), "~$450M");
  assert.equal(formatPrice(14.98), "$14.98");
  assert.equal(formatMarketCapM(2710), "$2.7B");
});

test("buildQuoteMeta shows approx mkt cap", () => {
  const meta = buildQuoteMeta({
    ok: true,
    marketCapM: 1200,
    marketCapEstimated: false
  });
  assert.match(meta, /mkt cap ~\$1\.2B/);
  assert.doesNotMatch(meta, /as of/);
});

test("buildQuoteMeta labels implied cap", () => {
  const meta = buildQuoteMeta({
    ok: true,
    marketCapM: 800,
    marketCapEstimated: true
  });
  assert.match(meta, /implied cap ~\$800M/);
});

test("QUOTE_LABEL is honest delayed wording", () => {
  assert.equal(QUOTE_LABEL, "Approx · delayed");
});

test("formatChangePct signs correctly", () => {
  assert.equal(formatChangePct(2.3), "+2.3%");
  assert.equal(formatChangePct(-1.1), "-1.1%");
});

test("computeVsMarketUpside", () => {
  const u = computeVsMarketUpside(746, 1144);
  assert.ok(u.upsidePct < 0);
  assert.match(u.upsideLabel, /×/);
});

test("fetchLiveQuote mocks fetch", async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      symbol: "SLS",
      price: 10,
      marketCapM: 1000,
      source: "yahoo"
    })
  });
  const q = await fetchLiveQuote("SLS", { fetchFn: mockFetch });
  assert.equal(q.ok, true);
  assert.equal(q.price, 10);
});
