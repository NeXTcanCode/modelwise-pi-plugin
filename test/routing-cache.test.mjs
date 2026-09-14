import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCatalogCache } from "../src/catalog-cache.mjs";
import { pickWorker } from "../src/delegation.mjs";
import { investigate } from "../src/investigation.mjs";

test("catalog persists, coalesces calls and refreshes after TTL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mw-cache-"));
  try {
    let calls = 0;
    const fetch = async () => { calls++; return [{ id: "p/m" }]; };
    const path = join(dir, "catalog.json");
    const first = createCatalogCache(path, fetch, () => 100);
    await Promise.all([first(), first()]);
    await createCatalogCache(path, fetch, () => 200)();
    assert.equal(calls, 1);
    await createCatalogCache(path, fetch, () => 86400200)();
    assert.equal(calls, 2);
    assert.deepEqual(await createCatalogCache(path, async () => { throw Error(); }, () => 172800300)(), [{ id: "p/m" }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
const model = (id, input) => ({ provider: "p", id, reasoning: true, contextWindow: 200000, cost: { input, output: input } });
test("timing history cannot exclude a cheaper candidate", () => {
  const pool = [model("slow", 1), model("fast", 2), model("expensive", 20)];
  const options = { estTokens: 1000, complexity: "complex", primaryCost: { input: 10, output: 10 } };
  assert.equal(pickWorker(pool, options).id, "slow");
  assert.equal(pickWorker(pool, { ...options, timings: { "p/slow": 10000, "p/fast": 1000, "p/expensive": 100 } }).id, "slow");
  const free = { ...model("free", 0), reasoning: false };
  assert.equal(pickWorker([...pool, free], { ...options, timings: { "p/fast": 1000 } }).id, "free");
});
test("short prompt goes to worker and direct decision needs only one call", async () => {
  let calls = 0;
  const result = await investigate({ cwd: process.cwd(), question: "thanks", pool: [model("fast", 1)], primaryCost: { input: 10, output: 10 }, inventory: async () => ["package.json"], complete: async () => {
    calls++;
    return { content: [{ type: "text", text: '{"direct":true,"reason":"No repository work"}' }] };
  } });
  assert.equal(result.direct, true);
  assert.equal(calls, 1);
});
