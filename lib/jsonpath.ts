/**
 * Minimal JSON path reader: dot + bracket segments, optional leading `$`/`$.`.
 * Supports `a.b.c`, `a[0].b`, `["weird key"].x`. No wildcards/filters/recursion
 * (that would need a full JSONPath lib). Returns undefined if the path misses.
 */
export function getByPath(obj: unknown, path: string): unknown {
  const segments = tokenize(path);
  if (segments === null) return undefined;
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function tokenize(path: string): string[] | null {
  let p = path.trim();
  if (p.startsWith("$")) p = p.slice(1);
  if (p.startsWith(".")) p = p.slice(1);
  if (p === "") return [];
  const out: string[] = [];
  let i = 0;
  while (i < p.length) {
    if (p[i] === ".") {
      i++;
      continue;
    }
    if (p[i] === "[") {
      const close = p.indexOf("]", i);
      if (close === -1) return null;
      let key = p.slice(i + 1, close).trim();
      if (
        (key.startsWith('"') && key.endsWith('"')) ||
        (key.startsWith("'") && key.endsWith("'"))
      ) {
        key = key.slice(1, -1);
      }
      out.push(key);
      i = close + 1;
      continue;
    }
    // bare dot-segment: read until next . or [
    let j = i;
    while (j < p.length && p[j] !== "." && p[j] !== "[") j++;
    out.push(p.slice(i, j));
    i = j;
  }
  return out;
}
