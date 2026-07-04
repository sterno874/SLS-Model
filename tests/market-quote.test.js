import test from "node:test";
import assert from "node:assert/strict";
import {
  parseQuotePayload,
  formatPrice,
  formatMarketCapM,
  formatAsOf,
  buildQuoteMeta,
  formatChangePct,
  computeVsMarketUpside,
  fetchLiveQuote
} from "../js/ui/market-quote.js";

test("parseQuotePayload accepts valid quote", () => {
  const q = parseQuotePayload({
    symbol: "SLS",
    price: 14.98,
    previousClose: 13.27,
    changePct: 12.9,
    marketCapM: 2710,
    currency: "USD",
    asOf: "2026-07-02T20:00:00.000Z",
    source: "finnhub"
  });
  assert.equal(q.ok, true);
  assert.equal(q.price, 14.98);
  assert.equal(q.marketCapM, 2710);
});

test("parseQuotePayload rejects missing price", () => {
  assert.equal(parseQuotePayload({ symbol: "SLS" }).ok, false);
  assert.equal(parseQuotePayload({ error: "nope" }).error, "nope");
});

test("formatPrice and formatMarketCapM", () => {
  assert.equal(formatPrice(14.98), "$14.98");
  assert.equal(formatMarketCapM(2710), "$2.7B");
  assert.equal(formatMarketCapM(450), "$450M");
});

test("formatAsOf renders ET timestamp", () => {
  const s = formatAsOf("2026-07-02T20:00:00.000Z");
  assert.match(s, /Jul/);
});

test("buildQuoteMeta includes cap and as-of", () => {
  const meta = buildQuoteMeta({
    ok: true,
    marketCapM: 1200,
    marketCapEstimated: false,
    asOf: "2026-07-02T20:00:00.000Z"
  });
  assert.match(meta, /Mkt cap \$1\.2B/);
  assert.match(meta, /as of/);
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
      currency: "USD",
      asOf: "2026-07-02T20:00:00.000Z",
      source: "finnhub"
    })
  });
  const q = await fetchLiveQuote("SLS", { fetchFn: mockFetch });
  assert.equal(q.ok, true);
  assert.equal(q.price, 10);
});
