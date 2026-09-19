import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const hashText = (text) => createHash("sha1").update(text).digest("hex");
export const projectKey = (cwd) => hashText(cwd).slice(0, 16);

// Per-project codebase memory: path -> { hash, summary, updated }.
// Stores summaries and structure only, never raw source.
export function createMemory(dir, cwd) {
  const file = join(dir, `${projectKey(cwd)}.json`);
  let files = null;
  const load = async () => {
    if (files) return files;
    try { files = JSON.parse(await readFile(file, "utf8")).files ?? {}; } catch { files = {}; }
    return files;
  };
  const save = async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify({ cwd, files }, null, 2) + "\n", { mode: 0o600 });
  };
  return {
    file,
    async entry(path) { return (await load())[path]; },
    // Fresh means the cached hash matches the current file text.
    async fresh(path, text) { const e = (await load())[path]; return e && e.hash === hashText(text) ? e : undefined; },
    async set(path, text, summary) {
      (await load())[path] = { hash: hashText(text), summary: String(summary).slice(0, 1200), updated: Date.now() };
    },
    async drop(path) { delete (await load())[path]; },
    save,
    async list() { return Object.entries(await load()); },
    async forget() { files = {}; await rm(file, { force: true }); },
  };
}
