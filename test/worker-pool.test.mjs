import test from "node:test";
import assert from "node:assert/strict";
import { liveWorkerPool } from "../src/worker-pool.mjs";
const model = (id) => ({ provider: "p", id, input: ["text"] });
test("live pool follows additions/removals and preserves exclusions on reappearance", () => {
  const primary = model("primary"), excluded = [model("excluded")];
  assert.deepEqual(liveWorkerPool([primary, model("old")], excluded, primary).map(m => m.id), ["old"]);
  assert.deepEqual(liveWorkerPool([primary, model("new"), model("excluded")], excluded, primary).map(m => m.id), ["new"]);
  assert.deepEqual(liveWorkerPool([primary, model("excluded")], excluded, primary), []);
});
