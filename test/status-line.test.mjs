import test from "node:test";
import assert from "node:assert/strict";
import { comparisonLine } from "../src/status-line.mjs";
const base = { workers: 15, worker: "grok", primary: "astra", cost: 0.0482, estimate: 0.2554, outcome: "completed" };
test("compact line colors positive and negative estimated differences", () => {
  assert.match(comparisonLine(base), /\u001b\[32m\+81\.1% est\./);
  assert.match(comparisonLine({ ...base, cost: 0.3 }), /\u001b\[31m-/);
  assert.equal(comparisonLine(base).includes("\n"), false);
});
test("unknown estimates and failures do not show green savings", () => {
  assert.match(comparisonLine({ ...base, estimate: 0 }), /diff n\/a/);
  assert.match(comparisonLine({ ...base, cost: null }), /n\/a/);
  assert.doesNotMatch(comparisonLine({ ...base, outcome: "failed" }), /\u001b\[32m/);
});
