import test from "node:test";
import assert from "node:assert/strict";
import { workerTiers, pickWorker, cascade, WorkerFailure, MAX_WORKER_ATTEMPTS, COOLDOWN_MS } from "../src/delegation.mjs";
import { investigate } from "../src/investigation.mjs";

const model = (id, price) => ({ provider: "openrouter", id, input: ["text"], contextWindow: 200000, cost: { input: price, output: price } });
const pool = () => [model("paid-a", 1), model("free-a", 0), model("free-b", 0), model("paid-b", 1), model("free-c", 0)];
const primaryCost = { input: 3, output: 3 };
const ok = (text) => ({ stopReason: "stop", content: [{ type: "text", text }], usage: { output: 10 } });

// 21 files forces delegation past the small-repo threshold.
const inventory = async () => Array.from({ length: 21 }, (_, i) => `missing-${i}.txt`);
const run = (complete, extra = {}) => investigate({ cwd: process.cwd(), question: "how does routing work", pool: pool(), primaryCost, complete, inventory, ...extra });

test("workerTiers groups equal prices and orders tiers cheapest first", () => {
  const tiers = workerTiers(pool(), { estTokens: 1000, complexity: "simple", primaryCost });
  assert.deepEqual(tiers.map((tier) => tier.map((m) => m.id)), [["free-a", "free-b", "free-c"], ["paid-a", "paid-b"]]);
  assert.equal(pickWorker(pool(), { estTokens: 1000, complexity: "simple", primaryCost }).id, "free-a");
});

test("workerTiers skips workers on cooldown", () => {
  const cooldown = { "openrouter/free-a": Date.now() + COOLDOWN_MS };
  const tiers = workerTiers(pool(), { estTokens: 1000, complexity: "simple", primaryCost, cooldown });
  assert.deepEqual(tiers[0].map((m) => m.id), ["free-b", "free-c"]);
});

test("a thrown provider error passes the task to a same-price sibling", async () => {
  const calls = [];
  const cooldown = {};
  const result = await run(async (m) => {
    calls.push(m.id);
    if (m.id === "free-a") throw new Error("429 rate limited");
    return ok("Summary: routing lives in router.js");
  }, { cooldown });
  assert.deepEqual(calls, ["free-a", "free-b"]);
  assert.equal(result.worker, "openrouter/free-b");
  assert.ok(cooldown["openrouter/free-a"] > Date.now());
});

test("an incomplete draft is carried to the next sibling", async () => {
  const prompts = [];
  const cooldown = {};
  await run(async (m, context) => {
    prompts.push(context.messages[0].content);
    if (m.id === "free-a") return { stopReason: "length", content: [{ type: "text", text: "half of the findings" }], usage: { output: 2000 } };
    return ok("Complete handoff");
  }, { cooldown });
  assert.equal(prompts.length, 2);
  assert.doesNotMatch(prompts[0], /INCOMPLETE DRAFT/);
  assert.match(prompts[1], /previous worker \(openrouter\/free-a\)[\s\S]*half of the findings/);
  assert.deepEqual(cooldown, {}, "length failures depend on the prompt, not the provider");
});

test("free models get more output headroom than paid ones", async () => {
  const budgets = {};
  await run(async (m, _context, options) => {
    budgets[m.id] = options.maxTokens;
    if (m.id.startsWith("free")) throw new Error("down");
    return ok("done");
  });
  assert.equal(budgets["free-a"], 2000);
  assert.equal(budgets["paid-a"], 900);
});

test("escalates to the next tier only after every sibling fails", async () => {
  const calls = [];
  const result = await run(async (m) => {
    calls.push(m.id);
    if (m.id.startsWith("free")) return { stopReason: "error", errorMessage: "upstream", content: [], usage: {} };
    return ok("Paid handoff");
  });
  assert.deepEqual(calls, ["free-a", "free-b", "free-c", "paid-a"]);
  assert.equal(result.worker, "openrouter/paid-a");
});

test("reports every attempt once all tiers fail", async () => {
  let calls = 0;
  await assert.rejects(run(async () => { calls++; return ok('{"neither":true}'); }), (error) => {
    assert.match(error.message, /All 5 worker attempt\(s\) failed/);
    assert.match(error.message, /openrouter\/free-a: no summary/);
    assert.match(error.message, /openrouter\/paid-b: no summary/);
    return true;
  });
  assert.equal(calls, 5);
});

test("cascade respects the attempt budget", async () => {
  const tiers = [Array.from({ length: MAX_WORKER_ATTEMPTS + 3 }, (_, i) => model(`m${i}`, 0))];
  let calls = 0;
  await assert.rejects(cascade(tiers, async () => { calls++; throw new WorkerFailure("nope"); }));
  assert.equal(calls, MAX_WORKER_ATTEMPTS);
});

test("user cancellation stops the cascade", async () => {
  const controller = new AbortController();
  const calls = [];
  await assert.rejects(run(async (m) => {
    calls.push(m.id);
    controller.abort();
    throw new Error("aborted");
  }, { signal: controller.signal }));
  assert.deepEqual(calls, ["free-a"]);
});
