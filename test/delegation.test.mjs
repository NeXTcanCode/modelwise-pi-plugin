import test from "node:test";
import assert from "node:assert/strict";
import { workerPrompt, validatePaths, heuristicComplexity, countMentionedFiles, parseJudgeComplexity, pickWorker, explainPickFailure, estimatePrimaryCostUsd } from "../src/delegation.mjs";
import { fetchCatalog, indexCatalogById, findCatalogEntry, summarizeCatalogEntry, normalizeModelId, enrichWithCatalog } from "../src/openrouter.mjs";

test("rejects unsafe paths", () => {
  assert.throws(() => validatePaths("/tmp/project", ["../secret.txt"]));
  assert.throws(() => validatePaths("/tmp/project", [".env"]));
});

test("builds delimited worker prompt", () => {
  const prompt = workerPrompt("find auth", [{ path: "src/a.js", text: "const auth = true" }]);
  assert.match(prompt, /Question:/);
  assert.match(prompt, /--- FILE: src\/a\.js ---/);
  assert.match(prompt, /untrusted evidence/);
});

test("heuristic classifies small single-file question as simple", () => {
  const { complexity } = heuristicComplexity({ question: "what does this do", files: [{ path: "a.js", text: "x" }] });
  assert.equal(complexity, "simple");
});

test("heuristic classifies many/large files as complex", () => {
  const files = [1, 2, 3, 4].map((i) => ({ path: `f${i}.js`, text: "x".repeat(100) }));
  const { complexity } = heuristicComplexity({ question: "trace it", files });
  assert.equal(complexity, "complex");
});

test("countMentionedFiles counts distinct path-like tokens in free text", () => {
  assert.equal(countMentionedFiles("explain auth.js, db.js, middleware.js and session.js"), 4);
  assert.equal(countMentionedFiles("what does this do"), 0);
  assert.equal(countMentionedFiles("check src/lib/auth.js and src/lib/auth.js again"), 1);
});

test("heuristic classifies a short prompt naming several files as complex, even with no file list yet", () => {
  const { complexity } = heuristicComplexity({ question: "explain auth.js, db.js, middleware.js and session.js", files: [] });
  assert.equal(complexity, "complex");
});

test("parseJudgeComplexity accepts strict JSON and rejects garbage", () => {
  assert.equal(parseJudgeComplexity('{"complexity":"complex"}'), "complex");
  assert.equal(parseJudgeComplexity('```json\n{"complexity":"simple"}\n```'), "simple");
  assert.equal(parseJudgeComplexity("not json"), null);
  assert.equal(parseJudgeComplexity('{"complexity":"unknown"}'), null);
});

test("pickWorker chooses cheapest model that fits context window", () => {
  const pool = [
    { provider: "p", id: "cheap-small", cost: { input: 0.1, output: 1 }, contextWindow: 8000, reasoning: false },
    { provider: "p", id: "cheap-big", cost: { input: 0.2, output: 1 }, contextWindow: 200000, reasoning: false },
    { provider: "p", id: "pricey-big", cost: { input: 5, output: 1 }, contextWindow: 200000, reasoning: true },
  ];
  const pick = pickWorker(pool, { estTokens: 50000, complexity: "simple" });
  assert.equal(pick.id, "cheap-big");
});

test("reasoning metadata does not exclude cheaper models", () => {
  const pool = [
    { provider: "p", id: "cheap-big", cost: { input: 0.2, output: 1 }, contextWindow: 200000, reasoning: false },
    { provider: "p", id: "pricey-big", cost: { input: 5, output: 1 }, contextWindow: 200000, reasoning: true },
  ];
  const pick = pickWorker(pool, { estTokens: 50000, complexity: "complex" });
  assert.equal(pick.id, "cheap-big");
});

test("pickWorker rejects requests when nothing fits the context window", () => {
  const pool = [{ provider: "p", id: "small", cost: { input: 1 }, contextWindow: 1000, reasoning: false }];
  const pick = pickWorker(pool, { estTokens: 50000, complexity: "simple" });
  assert.equal(pick, null);
});

test("routing requires cheaper known pricing and capability", () => {
  const pool = [{ id: "worker", cost: { input: 1, output: 2 }, contextWindow: 10000 }];
  const request = { estTokens: 1000, complexity: "simple", primaryCost: { input: 5, output: 10 } };
  assert.equal(pickWorker(pool, request).id, "worker");
  assert.equal(pickWorker(pool, { ...request, primaryCost: { input: 0, output: 0 } }), null);
  assert.equal(pickWorker(pool, { ...request, primaryCost: null }), null);
  assert.equal(pickWorker(pool, { ...request, complexity: "complex" }).id, "worker");
  assert.equal(pickWorker([{ ...pool[0], cost: { input: 0.01, output: 100 } }], request), null);
});

test("pickWorker returns null for an empty pool", () => {
  assert.equal(pickWorker([], { estTokens: 100, complexity: "simple" }), null);
});

test("explainPickFailure names the specific blocking condition", () => {
  assert.match(explainPickFailure([], { estTokens: 100, complexity: "simple" }), /empty/);
  const tooSmall = [{ provider: "p", id: "small", contextWindow: 100, cost: { input: 1, output: 1 } }];
  assert.match(explainPickFailure(tooSmall, { estTokens: 1000, complexity: "simple" }), /contextWindow fits/);
  const unpriced = [{ provider: "p", id: "unpriced", contextWindow: 200000 }];
  assert.match(explainPickFailure(unpriced, { estTokens: 1000, complexity: "simple" }), /known pricing/);
  const pricier = [{ provider: "p", id: "pricier", contextWindow: 200000, cost: { input: 10, output: 10 } }];
  assert.match(explainPickFailure(pricier, { estTokens: 1000, complexity: "simple", primaryCost: { input: 1, output: 1 } }), /cheaper than the primary/);
  const nonReasoning = [{ provider: "p", id: "cheap", contextWindow: 200000, cost: { input: 0.1, output: 0.1 }, reasoning: false }];
  assert.equal(pickWorker(nonReasoning, { estTokens: 1000, complexity: "complex", primaryCost: { input: 1, output: 1 } }).id, "cheap");
});

test("estimatePrimaryCostUsd computes a counterfactual estimate from primary pricing", () => {
  const est = estimatePrimaryCostUsd({ estInputTokens: 1_000_000, estOutputTokens: 1_000_000, primaryCost: { input: 3, output: 15 } });
  assert.equal(est, 18);
});

test("estimatePrimaryCostUsd returns null when primary pricing is unknown", () => {
  assert.equal(estimatePrimaryCostUsd({ estInputTokens: 1000, primaryCost: null }), null);
  assert.equal(estimatePrimaryCostUsd({ estInputTokens: 1000, primaryCost: {} }), null);
});

test("fetchCatalog rejects on a non-OK response without throwing on malformed body", async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(() => fetchCatalog(fakeFetch));
});

test("fetchCatalog returns the data array from a mocked OpenRouter response", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ data: [{ id: "openai/gpt-5.4", context_length: 200000, pricing: { prompt: "0.000003", completion: "0.000015" } }] }) });
  const catalog = await fetchCatalog(fakeFetch);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, "openai/gpt-5.4");
});

test("findCatalogEntry matches direct provider/id and falls back to suffix match", () => {
  const catalog = indexCatalogById([{ id: "openai/gpt-5.4" }, { id: "anthropic/claude-sonnet-5" }]);
  assert.equal(findCatalogEntry(catalog, "openai", "gpt-5.4").id, "openai/gpt-5.4");
  assert.equal(findCatalogEntry(catalog, "openai-codex", "claude-sonnet-5").id, "anthropic/claude-sonnet-5");
  assert.equal(findCatalogEntry(catalog, "nope", "does-not-exist"), null);
});

test("normalizeModelId collapses separators and strips trailing release dates", () => {
  assert.equal(normalizeModelId("gpt-5.4"), "gpt-5-4");
  assert.equal(normalizeModelId("gpt-5.4-2026-01-15"), "gpt-5-4");
  assert.equal(normalizeModelId("gpt_5_4"), "gpt-5-4");
});

test("findCatalogEntry matches across separator/date-suffix differences", () => {
  const catalog = indexCatalogById([{ id: "openai/gpt-5.4-2026-01-15" }]);
  assert.equal(findCatalogEntry(catalog, "openai-codex", "gpt-5.4").id, "openai/gpt-5.4-2026-01-15");
});

test("findCatalogEntry does not conflate a model with its -mini variant", () => {
  const catalog = indexCatalogById([{ id: "openai/gpt-5.4-mini" }]);
  assert.equal(findCatalogEntry(catalog, "openai-codex", "gpt-5.4"), null);
});

test("summarizeCatalogEntry extracts pricing/context fields and tolerates null", () => {
  assert.equal(summarizeCatalogEntry(null), null);
  const summary = summarizeCatalogEntry({ context_length: 128000, pricing: { prompt: "0.000001", completion: "0.000002" }, description: "d" });
  assert.equal(summary.contextLength, 128000);
  assert.equal(summary.promptPricePerToken, 0.000001);
  assert.equal(summary.completionPricePerToken, 0.000002);
});

test("enrichWithCatalog fills fields when Pi's registry has none and tags them inferred", () => {
  const catalogEntry = { context_length: 64000, pricing: { prompt: "0.000001", completion: "0.000002" }, supported_parameters: ["reasoning"] };
  const model = { provider: "p", id: "bare" };
  const enriched = enrichWithCatalog(model, catalogEntry);
  assert.deepEqual(enriched.cost, { input: 1, output: 2, cacheRead: 1, cacheWrite: 2 });
  assert.equal(enriched.contextWindow, 64000);
  assert.equal(enriched.reasoning, true);
  assert.deepEqual(new Set(enriched.inferredFrom), new Set(["cost", "contextWindow", "reasoning"]));
});

test("enrichWithCatalog prefers live catalog cost/contextWindow over a stale Pi registry value", () => {
  const catalogEntry = { context_length: 64000, pricing: { prompt: "0.000001", completion: "0.000002" }, supported_parameters: [] };
  const model = { provider: "p", id: "known", cost: { input: 9, output: 9 }, contextWindow: 200000, reasoning: false };
  const enriched = enrichWithCatalog(model, catalogEntry);
  assert.deepEqual(enriched.cost, { input: 1, output: 2, cacheRead: 1, cacheWrite: 2 });
  assert.equal(enriched.contextWindow, 64000);
  assert.equal(enriched.reasoning, false); // catalog says false; never downgrades a true, but also doesn't invent one
  assert.deepEqual(new Set(enriched.inferredFrom), new Set(["cost", "contextWindow"]));
});

test("enrichWithCatalog OR-merges reasoning: catalog can only upgrade false/unset to true, never downgrade true", () => {
  const catalogEntry = { supported_parameters: ["reasoning"] };
  const upgraded = enrichWithCatalog({ provider: "p", id: "a", reasoning: false }, catalogEntry);
  assert.equal(upgraded.reasoning, true);
  const nonReasoningCatalog = { supported_parameters: [] };
  const kept = enrichWithCatalog({ provider: "p", id: "b", reasoning: true }, nonReasoningCatalog);
  assert.equal(kept.reasoning, true);
  assert.equal(kept.inferredFrom, undefined);
});

test("enrichWithCatalog is a no-op when there is no matching catalog entry", () => {
  const model = { provider: "p", id: "unmatched" };
  assert.equal(enrichWithCatalog(model, null), model);
});
