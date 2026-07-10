export interface Group<T> {
  /** null = the ungrouped bucket. */
  name: string | null;
  items: T[];
}

/**
 * Bucket items by a group label. Named groups come first (case-insensitive
 * alphabetical); the ungrouped bucket (blank/null label) comes last as
 * `name: null`. Item order within a group is preserved. Blank/whitespace labels
 * are treated as ungrouped.
 */
export function groupByName<T>(
  items: T[],
  getName: (x: T) => string | null | undefined,
): Group<T>[] {
  const buckets = new Map<string, T[]>(); // "" = ungrouped
  for (const it of items) {
    const raw = getName(it);
    const key = raw && raw.trim() ? raw.trim() : "";
    const arr = buckets.get(key);
    if (arr) arr.push(it);
    else buckets.set(key, [it]);
  }
  const named = [...buckets.keys()]
    .filter((k) => k !== "")
    .sort((a, b) => {
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
  const groups: Group<T>[] = named.map((k) => ({ name: k, items: buckets.get(k)! }));
  const ungrouped = buckets.get("");
  if (ungrouped) groups.push({ name: null, items: ungrouped });
  return groups;
}
