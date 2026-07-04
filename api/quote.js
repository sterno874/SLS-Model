/**
 * Vercel serverless quote proxy — Yahoo Finance only (unofficial, delayed).
 * Primary: quoteSummary (price + marketCap + sharesOutstanding).
 * Fallback: v8 chart (price only). Optional sharesM query → implied cap.
 */
const UA = "Mozilla/5.0 (compatible; SLS-Model/1.0)";

function rawNum(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && Number.isFinite(v.raw)) return v.raw;
  return null;
}

function mergeCookies(existing, setCookies) {
  const map = {};
  for (const part of (existing || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) map[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  for (const sc of setCookies || []) {
    const pair = sc.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq > 0) map[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function yahooQuoteSummary(symbol) {
  let cookie = "";
  const warm = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } });
  cookie = mergeCookies(cookie, warm.headers.getSetCookie?.() ?? []);

  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie }
  });
  cookie = mergeCookies(cookie, crumbRes.headers.getSetCookie?.() ?? []);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.startsWith("{")) throw new Error("Yahoo crumb failed");

  const url =
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    "?modules=price,summaryDetail,defaultKeyStatistics" +
    `&crumb=${encodeURIComponent(crumb)}`;
  const sumRes = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
  if (!sumRes.ok) throw new Error(`Yahoo quoteSummary ${sumRes.status}`);
  const data = await sumRes.json();
  const block = data?.quoteSummary?.result?.[0];
  if (!block) throw new Error("No quoteSummary result");

  const price = rawNum(block.price?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error("No price");

  const prev =
    rawNum(block.price?.regularMarketPreviousClose) ?? rawNum(block.summaryDetail?.previousClose);
  const changePct = rawNum(block.price?.regularMarketChangePercent);
  const marketCapRaw = rawNum(block.summaryDetail?.marketCap);
  const marketCapM = marketCapRaw != null ? Math.round(marketCapRaw / 1e6) : null;
  const sharesOut = rawNum(block.defaultKeyStatistics?.sharesOutstanding);
  const sharesOutstandingM = sharesOut != null ? sharesOut / 1e6 : null;
  const ts = rawNum(block.price?.regularMarketTime);

  return {
    symbol,
    price,
    previousClose: prev,
    changePct: changePct ?? (prev ? ((price - prev) / prev) * 100 : null),
    marketCapM,
    sharesOutstandingM,
    marketCapEstimated: false,
    currency: block.price?.currency || block.summaryDetail?.currency || "USD",
    asOf: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
    source: "yahoo"
  };
}

async function yahooChartPrice(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?range=1d&interval=1d";
  const yRes = await fetch(url, { headers: { "User-Agent": UA } });
  if (!yRes.ok) throw new Error(`Yahoo chart ${yRes.status}`);
  const data = await yRes.json();
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (!Number.isFinite(price) || price <= 0) throw new Error("No chart price");
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
  return {
    symbol,
    price,
    previousClose: prev,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    marketCapM: null,
    sharesOutstandingM: null,
    marketCapEstimated: false,
    currency: meta.currency || "USD",
    asOf: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    source: "yahoo-chart"
  };
}

function applyImpliedCap(payload, sharesM) {
  if ((!payload.marketCapM || payload.marketCapM <= 0) && Number.isFinite(sharesM) && sharesM > 0) {
    payload.marketCapM = Math.round(payload.price * sharesM);
    payload.marketCapEstimated = true;
  }
  return payload;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const symbol = String(req.query.symbol || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const sharesM = parseFloat(req.query.sharesM);
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");

  try {
    const result = applyImpliedCap(await yahooQuoteSummary(symbol), sharesM);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Yahoo quoteSummary error:", err);
  }

  try {
    const result = applyImpliedCap(await yahooChartPrice(symbol), sharesM);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Yahoo chart error:", err);
    return res.status(502).json({ error: "Upstream quote failed" });
  }
}
