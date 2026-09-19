import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, utimes, readdir } from "node:fs/promises";
import { createMemory, pruneIdleProjects, forgetAllProjects } from "../src/introvert/memory.mjs";
import { filterReply, effectiveLevel } from "../src/introvert/output.mjs";
import { compressHistory } from "../src/introvert/compress.mjs";

test("memory is fresh only while file text is unchanged", async () => {
  const mem = createMemory(await mkdtemp(join(tmpdir(), "iv-")), "/repo");
  await mem.set("a.js", "v1", "does a");
  await mem.save();
  assert.ok(await mem.fresh("a.js", "v1"));
  assert.equal(await mem.fresh("a.js", "v2"), undefined);
  const reloaded = createMemory(mem.file.replace(/\/[^/]+$/, ""), "/repo");
  assert.ok(await reloaded.fresh("a.js", "v1"));
  await reloaded.forget();
  assert.equal(await reloaded.fresh("a.js", "v1"), undefined);
});

test("filter drops filler but keeps code, errors and questions", () => {
  const out = filterReply("Sure! Fixed the bug.\n```js\nSure! keep()\n```\nLet me know if you need anything else.");
  assert.equal(out, "Fixed the bug.\n```js\nSure! keep()\n```");
  assert.match(filterReply("I'll fail loudly: error in build\nDone."), /error in build/);
  assert.match(filterReply("Do you want me to proceed?"), /proceed\?/);
});

test("aggressive downgrades on complex tasks", () => {
  assert.equal(effectiveLevel("aggressive", "complex"), "normal");
  assert.equal(effectiveLevel("aggressive", "simple"), "aggressive");
});

const turns = (n) => Array.from({ length: n }, (_, i) => [
  { role: "user", content: `question ${i} ${"x".repeat(6000)}`, timestamp: i },
  { role: "assistant", content: [{ type: "text", text: `answer ${i} ${"y".repeat(6000)}` }], timestamp: i },
]).flat();

test("history compresses past threshold, keeps recent turns, and freezes the summary", async () => {
  const state = {};
  let calls = 0;
  const summarize = async () => { calls++; return "short summary"; };
  const msgs = turns(10);
  const r1 = await compressHistory(msgs, state, { summarize });
  assert.ok(r1.saved > 1500);
  assert.equal(r1.messages[0].role, "user");
  assert.equal(r1.messages.length, 1 + 6);
  const r2 = await compressHistory([...msgs, ...turns(1)], state, { summarize });
  assert.equal(calls, 1);
  assert.equal(r2.messages[0], r1.messages[0]);
});

test("small history is left alone", async () => {
  const r = await compressHistory(turns(2), {}, { summarize: async () => "s" });
  assert.equal(r.saved, 0);
});

test("pruneMissing drops entries for deleted files only", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "iv-cwd-"));
  await writeFile(join(cwd, "keep.js"), "k");
  const mem = createMemory(await mkdtemp(join(tmpdir(), "iv-")), cwd);
  await mem.set("keep.js", "k", "kept");
  await mem.set("gone.js", "g", "gone");
  assert.equal(await mem.pruneMissing(), 1);
  assert.ok(await mem.fresh("keep.js", "k"));
  assert.equal(await mem.entry("gone.js"), undefined);
});

test("fresh hit refreshes last-used time", async () => {
  const mem = createMemory(await mkdtemp(join(tmpdir(), "iv-")), "/repo");
  await mem.set("a.js", "v", "s");
  const e = await mem.entry("a.js");
  e.used = 1;
  await mem.fresh("a.js", "v");
  assert.ok((await mem.entry("a.js")).used > 1);
});

test("idle project files are deleted after 30 days, recent ones kept; forget all clears dir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iv-dir-"));
  await writeFile(join(dir, "old.json"), "{}");
  await writeFile(join(dir, "new.json"), "{}");
  const old = new Date(Date.now() - 40 * 86400000);
  await utimes(join(dir, "old.json"), old, old);
  assert.equal(await pruneIdleProjects(dir), 1);
  assert.deepEqual(await readdir(dir), ["new.json"]);
  await forgetAllProjects(dir);
  assert.deepEqual(await readdir(dir).catch(() => []), []);
});
