const CATALOG_URL = "https://openrouter.ai/api/v1/models";

// Public, unauthenticated catalog listing. Never send prompts, file paths, or
// repo content here — this is a read-only pricing/capability reference only.
export async function fetchCatalog(fetchImpl = fetch) {
  const res = await fetchImpl(CATALOG_URL, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw new Error(`OpenRouter catalog fetch failed: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.data) ? body.data : [];
}

export function indexCatalogById(catalog) {
  const map = new Map();
  for (const entry of catalog) {
    if (entry?.id) map.set(entry.id, entry);
  }
  return map;
}

// Deterministic normalization only — no fuzzy/similarity matching. Two
// visually-close ids (e.g. "gpt-5.4" vs "gpt-5.4-mini") are different models
// with different prices; guessing "closest" risks showing the wrong price.
// This only collapses formatting differences (separators, date suffixes) that
// still refer to the same underlying model id.
export function normalizeModelId(id) {
  return String(id)
    .toLowerCase()
    .replace(/[-_](\d{4}-?\d{2}-?\d{2}|\d{8})$/, "") // trailing release-date suffix
    .replace(/[._]/g, "-");
}

// Best-effort match: Pi's provider/model-id naming does not always match
// OpenRouter's "org/model" slug. Returns null rather than guessing wrong.
export function findCatalogEntry(catalogById, provider, modelId) {
  const direct = catalogById.get(`${provider}/${modelId}`) || catalogById.get(modelId);
  if (direct) return direct;

  const needle = modelId.toLowerCase();
  for (const [key, entry] of catalogById) {
    if (key.toLowerCase().endsWith(`/${needle}`) || key.toLowerCase() === needle) return entry;
  }

  const normalizedNeedle = normalizeModelId(modelId);
  for (const [key, entry] of catalogById) {
    const bareId = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
    if (normalizeModelId(bareId) === normalizedNeedle) return entry;
  }

  return null;
}

export function summarizeCatalogEntry(entry) {
  if (!entry) return null;
  return {
    contextLength: entry.context_length ?? null,
    promptPricePerToken: entry.pricing?.prompt != null ? Number(entry.pricing.prompt) : null,
    completionPricePerToken: entry.pricing?.completion != null ? Number(entry.pricing.completion) : null,
    reasoning: Array.isArray(entry.supported_parameters) ? entry.supported_parameters.includes("reasoning") : null,
    description: entry.description ?? null,
  };
}

// OpenRouter's catalog is live market pricing; Pi's local models.json is a
// static snapshot that can go stale (a provider cuts prices, Pi's file doesn't
// know yet). So for cost/contextWindow the catalog value wins whenever a match
// is found — it is the more current, verifiable number. Pi's own data is used
// only when there is no catalog match. `reasoning` is OR'd: either source
// asserting capability is trusted; neither source can downgrade a true to
// false, since understating capability silently excludes a valid worker while
// overstating it just gets caught by the judge/quality checks downstream.
// Every field taken from the catalog is tagged in `inferredFrom` so callers can
// label routing decisions built on it as catalog-derived, not Pi-measured.
export function enrichWithCatalog(model, catalogEntry) {
  const summary = summarizeCatalogEntry(catalogEntry);
  if (!summary) return model;
  const enriched = { ...model };
  const inferred = new Set(model.inferredFrom || []);
  if (summary.promptPricePerToken != null && summary.completionPricePerToken != null) {
    enriched.cost = {
      input: summary.promptPricePerToken * 1e6,
      output: summary.completionPricePerToken * 1e6,
      cacheRead: summary.promptPricePerToken * 1e6,
      cacheWrite: summary.completionPricePerToken * 1e6,
    };
    inferred.add("cost");
  }
  if (summary.contextLength != null) {
    enriched.contextWindow = summary.contextLength;
    inferred.add("contextWindow");
  }
  if (summary.reasoning === true && enriched.reasoning !== true) {
    enriched.reasoning = true;
    inferred.add("reasoning");
  }
  if (inferred.size) enriched.inferredFrom = [...inferred];
  return enriched;
}
