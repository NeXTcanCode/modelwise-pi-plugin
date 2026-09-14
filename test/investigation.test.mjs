import test from "node:test";
import assert from "node:assert/strict";
import { investigate } from "../src/investigation.mjs";
const pool = [{ provider: "test", id: "cheap", reasoning: true, cost: { input: 1, output: 1 }, contextWindow: 200000 }];
const twoWorkerPool = [
  { provider: "test", id: "broken-but-cheapest", reasoning: true, cost: { input: 1, output: 1 }, contextWindow: 200000 },
  { provider: "test", id: "backup", reasoning: true, cost: { input: 2, output: 2 }, contextWindow: 200000 },
];
const base = { cwd: process.cwd(), question: "Explain the plugin", pool, primaryCost: { input: 10, output: 10 }, inventory: async () => ["package.json"] };
const response = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], usage: { cost: { total: 0.001 } } });
test("normal plain-text handoff succeeds without another provider call", async () => {
  let calls = 0;
  const result = await investigate({ ...base, complete: async () => {
    calls++;
    return { stopReason: "stop", content: [{ type: "text", text: "Findings: package.json:1 defines this package. Verify the entry point before editing." }] };
  } });
  assert.equal(result.format, "text");
  assert.match(result.summary, /package.json/);
  assert.equal(calls, 1);
});
test("empty and malformed structured handoffs still fail", async () => {
  for (const text of ["", '{"summary":"broken']) {
    await assert.rejects(investigate({ ...base, complete: async () => ({ stopReason: "stop", content: [{ type: "text", text }] }) }));
  }
});
test("announces selected worker before inference and diagnoses truncated output", async () => {
  let announced;
  await assert.rejects(investigate({ ...base,
    onWorker: (model) => { announced = model.id; },
    complete: async () => {
      assert.equal(announced, "cheap");
      return { content: [{ type: "text", text: '{"summary":"unfinished' }], stopReason: "length", usage: { output: 900 } };
    },
  }), /test\/cheap: output token limit reached.*output tokens=900/);
});
test("timeout preserves locally gathered evidence without claiming completed analysis", async () => {
  const controller = new AbortController();
  const result = await investigate({ ...base, signal: controller.signal, complete: async () => {
    controller.abort(new DOMException("Budget elapsed", "TimeoutError"));
    throw controller.signal.reason;
  } });
  assert.equal(result.partial, true);
  assert.deepEqual(result.files, ["package.json"]);
  assert.match(result.summary, /No completed model analysis/);
  assert.match(result.summary, /1: \{/);
});
test("worker discovers files and hands back evidence with accounted usage", async () => {
  let calls = 0;
  let cost = 0;
  const result = await investigate({ ...base, onUsage: (usage) => cost += usage.cost.total,
    complete: async (_model, context) => {
      calls++;
      assert.match(context.messages.at(-1).content, /1: \{/);
      assert.doesNotMatch(context.messages.at(-1).content, /FILE ..\/secret/);
      return response({ summary: "Package metadata is in package.json:1." });
    } });
  assert.deepEqual(result.files, ["package.json"]);
  assert.equal(calls, 1);
  assert.equal(cost, 0.001);
});
test("no cheaper model causes fallback without provider calls", async () => {
  await assert.rejects(investigate({ ...base, primaryCost: null, complete: () => assert.fail("must not call provider") }), /No approved cheaper/);
});
test("invalid output and exhausted rounds terminate investigation", async () => {
  await assert.rejects(investigate({ ...base, complete: async () => ({ content: [{ type: "text", text: "invalid" }] }) }), /invalid/);
  let calls = 0;
  await assert.rejects(investigate({ ...base, complete: async () => { calls++; return response({ paths: ["package.json"] }); } }), /budget/);
  assert.equal(calls, 1);
});
test("cancellation prevents inference", async () => {
  await assert.rejects(investigate({ ...base, signal: AbortSignal.abort(), complete: () => assert.fail() }), /cancelled/);
});
test("falls back to the next-cheapest worker when the cheapest one errors (e.g. a provider-account restriction)", async () => {
  let calls = 0;
  const result = await investigate({
    ...base, pool: twoWorkerPool, primaryCost: { input: 100, output: 100 },
    complete: async (model) => {
      calls++;
      if (model.id === "broken-but-cheapest") return { content: [], usage: { cost: { total: 0 } }, stopReason: "error", errorMessage: "model not supported for this account" };
      return response({ summary: "Done via backup worker." });
    },
  });
  assert.equal(result.worker, "test/backup");
  assert.equal(calls, 2);
});
test("throws naming the unusable worker(s) once every candidate has errored", async () => {
  await assert.rejects(
    investigate({ ...base, pool: twoWorkerPool, primaryCost: { input: 100, output: 100 },
      complete: async () => ({ content: [], usage: { cost: { total: 0 } }, stopReason: "error", errorMessage: "nope" }) }),
    /excluded as unusable this session/,
  );
});
