export function comparisonLine({ workers, worker, primary, cost, estimate, outcome }) {
  const price = (n) => Number.isFinite(n) && n >= 0 ? `$${n.toFixed(4)}` : "n/a";
  const valid = Number.isFinite(cost) && cost >= 0 && Number.isFinite(estimate) && estimate > 0;
  const diff = valid ? (estimate - cost) / estimate * 100 : null;
  const percent = diff === null ? "diff n/a" : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}% est.`;
  // A failed investigation is not a successful saving, even if its call was cheaper.
  const color = outcome !== "completed" ? "" : diff > 0 ? "\u001b[32m" : diff < 0 ? "\u001b[31m" : "";
  return `MW: ${workers} workers | ${worker} (${price(cost)}) vs ${primary} (~${price(estimate)}) | ${color}${percent}${color ? "\u001b[0m" : ""}${outcome === "completed" ? "" : ` · ${outcome}`}`;
}
