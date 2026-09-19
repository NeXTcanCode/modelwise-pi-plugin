import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const hashText = (text) => createHash("sha1").update(text).digest("hex");
export const projectKey = (cwd) => hashText(cwd).slice(0, 16);

export const MAX_IDLE_DAYS = 30;

// Deletes memory files of projects not used for `maxIdleDays`. Returns count removed.
export async function pruneIdleProjects(dir, maxIdleDays = MAX_IDLE_DAYS, now = Date.now()) {
  let removed = 0;
  let names = [];
  try { names = await readdir(dir); } catch { return 0; }
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    try {
      if (now - (await stat(join(dir, name))).mtimeMs > maxIdleDays * 86400000) { await rm(join(dir, name), { force: true }); removed++; }
    } catch { /* Best effort cleanup. */ }
  }
  return removed;
}

// Removes every project's memory.
export const forgetAllProjects = (dir) => rm(dir, { recursive: true, force: true });

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
    async fresh(path, text) {
      const e = (await load())[path];
      if (!e || e.hash !== hashText(text)) return undefined;
      e.used = Date.now();
      return e;
    },
    async set(path, text, summary) {
      (await load())[path] = { hash: hashText(text), summary: String(summary).slice(0, 1200), updated: Date.now(), used: Date.now() };
    },
    // Drops entries whose file no longer exists under cwd. Returns count removed.
    async pruneMissing() {
      const all = await load();
      let removed = 0;
      for (const path of Object.keys(all)) {
        try { await access(join(cwd, path)); } catch { delete all[path]; removed++; }
      }
      if (removed) await save();
      return removed;
    },
    async drop(path) { delete (await load())[path]; },
    save,
    async list() { return Object.entries(await load()); },
    async forget() { files = {}; await rm(file, { force: true }); },
  };
}
