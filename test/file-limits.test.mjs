import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFiles, validatePaths } from "../src/delegation.mjs";

test("reads more than ten files exceeding former individual and aggregate caps", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mw-files-"));
  try {
    const paths = Array.from({ length: 11 }, (_, i) => `${i}.txt`);
    const content = "x".repeat(70 * 1024);
    await Promise.all(paths.map((path) => writeFile(join(dir, path), content)));
    const files = await collectFiles(dir, paths);
    assert.equal(files.length, 11);
    assert.ok(files.every((file) => file.text === content));
    assert.throws(() => validatePaths(dir, []));
    assert.throws(() => validatePaths(dir, ["../escape.txt"]));
    assert.throws(() => validatePaths(dir, [".env"]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
