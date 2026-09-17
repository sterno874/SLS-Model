export function truncatedNormal(mu, sd, lo, hi, normalFn, uniformFn, maxAttempts = 100) {
  if (!(hi > lo) || !(sd >= 0)) throw new RangeError("invalid truncated-normal bounds");
  if (sd === 0) return Math.max(lo, Math.min(hi, mu));
  for (let i = 0; i < maxAttempts; i++) {
    const value = mu + sd * normalFn();
    if (value >= lo && value <= hi) return value;
  }
  return lo + (hi - lo) * uniformFn();
}

export function weightedQuantile(rows, field, q, weightField = "w") {
  const sorted = rows
    .filter((row) => Number.isFinite(row[field]) && Number.isFinite(row[weightField]) && row[weightField] > 0)
    .slice()
    .sort((a, b) => a[field] - b[field]);
  if (!sorted.length) return NaN;
  const total = sorted.reduce((sum, row) => sum + row[weightField], 0);
  const target = Math.max(0, Math.min(1, q)) * total;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row[weightField];
    if (cumulative >= target) return row[field];
  }
  return sorted[sorted.length - 1][field];
}
