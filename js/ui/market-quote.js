/** Client-side live quote helpers — pure functions + async fetch via /api/quote proxy. */

export const DEFAULT_TICKER = "SLS";

export function parseQuotePayload(json) {
  if (!json || typeof json !== "object") return { ok: false, error: "invalid response" };
  if (json.error) return { ok: false, error: String(json.error) };
  const price = json.price;
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "no price" };
  return {
    ok: true,
    symbol: json.symbol,
    price,
    previousClose: json.previousClose,
    changePct: json.changePct,
    marketCapM: json.marketCapM,
    marketCapEstimated: !!json.marketCapEstimated,
    currency: json.currency || "USD",
    asOf: json.asOf,
    source: json.source
  };
}

export function formatPrice(price, currency = "USD") {
  if (!Number.isFinite(price)) return "—";
  return currency === "USD" ? `$${price.toFixed(2)}` : `${price.toFixed(2)} ${currency}`;
}

export function formatMarketCapM(capM) {
  if (!Number.isFinite(capM) || capM <= 0) return "—";
  if (capM >= 1000) return `$${(capM / 1000).toFixed(1)}B`;
  return `$${Math.round(capM)}M`;
}

export function formatAsOf(iso, tz = "America/New_York") {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
      timeZoneName: "short"
    }).format(d);
  } catch {
    return "";
  }
}

/** One-line meta: mkt cap + as-of + source. */
export function buildQuoteMeta(quote) {
  if (!quote?.ok) return "";
  const parts = [];
  if (quote.marketCapM != null) {
    const label = quote.marketCapEstimated ? "Implied mkt cap" : "Mkt cap";
    parts.push(`${label} ${formatMarketCapM(quote.marketCapM)}`);
  }
  const asOf = formatAsOf(quote.asOf);
  if (asOf) parts.push(`as of ${asOf}`);
  return parts.join(" · ");
}

export function formatChangePct(pct) {
  if (!Number.isFinite(pct)) return "";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Model equity vs live market cap upside (same formula as DRTS vs-ref).
 * @param {number} equityM — model equity ($M)
 * @param {number|null} marketCapM
 */
export function computeVsMarketUpside(equityM, marketCapM) {
  if (!Number.isFinite(equityM) || !Number.isFinite(marketCapM) || marketCapM <= 0) {
    return { upsidePct: NaN, upsideMult: NaN, upsideLabel: "—" };
  }
  const upsidePct = (equityM / marketCapM - 1) * 100;
  const upsideMult = equityM / marketCapM;
  const upsideLabel = `${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(0)}% (${upsideMult.toFixed(2)}×)`;
  return { upsidePct, upsideMult, upsideLabel };
}

export async function fetchLiveQuote(symbol, options = {}) {
  const { fetchFn = globalThis.fetch, apiBase = "/api/quote", sharesM, signal } = options;
  const params = new URLSearchParams({ symbol });
  if (Number.isFinite(sharesM) && sharesM > 0) params.set("sharesM", String(sharesM));
  const res = await fetchFn(`${apiBase}?${params}`, { signal, credentials: "same-origin" });
  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (!res.ok) return parseQuotePayload({ error: json.error || res.statusText });
  return parseQuotePayload(json);
}

/** Poll helper — fetches once, then on interval; returns stop() cleanup. */
export function startLiveQuotePoll(symbol, onUpdate, options = {}) {
  const intervalMs = options.intervalMs ?? 5 * 60 * 1000;
  const sharesM = options.sharesM;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    onUpdate({ ok: false, loading: true });
    try {
      const quote = await fetchLiveQuote(symbol, { fetchFn, sharesM });
      if (!stopped) onUpdate(Object.assign({ loading: false }, quote));
    } catch (err) {
      if (!stopped) onUpdate({ ok: false, loading: false, error: err?.message || "fetch failed" });
    }
  }

  tick();
  if (intervalMs > 0 && typeof setInterval !== "undefined") {
    timer = setInterval(tick, intervalMs);
  }

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
