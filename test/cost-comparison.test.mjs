import test from "node:test";
import assert from "node:assert/strict";
import { estimateEquivalentPrimary } from "../src/cost-comparison.mjs";
test("equivalent primary estimate includes input, output and cached source tokens", () => {
  assert.equal(estimateEquivalentPrimary({ input: 1000, output: 100, cacheRead: 500, cacheWrite: 500 }, { input: 10, output: 50 }), 0.025);
});
test("unknown or invalid usage/pricing stays unavailable", () => {
  assert.equal(estimateEquivalentPrimary(undefined, { input: 10, output: 50 }), null);
  assert.equal(estimateEquivalentPrimary({ input: 1, output: 2 }, {}), null);
  assert.equal(estimateEquivalentPrimary({ input: -1, output: 2 }, { input: 10, output: 50 }), null);
});
