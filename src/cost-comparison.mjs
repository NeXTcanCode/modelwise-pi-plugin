// Counterfactual only: primary tokenization/output length may differ.
export function estimateEquivalentPrimary(usage, cost) {
  if (!usage || !cost) return null;
  const input = usage.input;
  const output = usage.output;
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  if (![input, output, cacheRead, cacheWrite, cost.input, cost.output].every((n) => Number.isFinite(n) && n >= 0)) return null;
  // Treat all source tokens as uncached; primary cache state is unknown.
  return ((input + cacheRead + cacheWrite) * cost.input + output * cost.output) / 1e6;
}
