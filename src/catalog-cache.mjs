import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

// Shared in-flight refresh; disk cache contains public metadata only.
export function createCatalogCache(path, fetchCatalog, now = Date.now) {
  let pending;
  return () => pending ??= (async () => {
    let cached;
    try { cached = JSON.parse(await readFile(path, "utf8")); } catch {}
    const valid = cached?.version === 1 && Array.isArray(cached.data) && Number.isFinite(cached.at);
    if (valid && now() - cached.at < 86400000 && now() >= cached.at) return cached.data;
    try {
      const data = await fetchCatalog();
      await mkdir(dirname(path), { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      try {
        await writeFile(temp, JSON.stringify({ version: 1, at: now(), data }), { mode: 0o600 });
        await rename(temp, path);
      } catch { /* Persistence is optional. */ }
      return data;
    } catch { return valid && now() - cached.at < 7 * 86400000 ? cached.data : []; }
  })();
}
