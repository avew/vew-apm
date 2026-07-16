// Minimal Prometheus text exposition (v0.0.4) parser — enough to read gauge /
// counter samples from a scraped endpoint (e.g. Spring `/actuator/prometheus`).
// Pure + dependency-free, matching the style of check-eval / jsonpath. Histogram
// and counter sub-samples (`_bucket{le=…}`, `_sum`, `_count`) parse as ordinary
// samples — no aggregation. rate()/histogram_quantile are out of scope.

export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*/;

function parseValue(tok: string): number | null {
  if (tok === "+Inf" || tok === "Inf") return Infinity;
  if (tok === "-Inf") return -Infinity;
  if (tok === "NaN" || tok === "Nan") return null; // unusable for thresholds
  const n = Number(tok); // handles ints, floats, and scientific (1.234E7)
  return Number.isNaN(n) ? null : n;
}

// Parse a `{k="v",...}` label set starting at str[start] === '{'.
// Returns the labels and the index just past the closing '}', or null on a
// malformed set.
function parseLabels(
  str: string,
  start: number,
): { labels: Record<string, string>; end: number } | null {
  const labels: Record<string, string> = {};
  const n = str.length;
  let i = start + 1;
  const skipWs = () => {
    while (i < n && (str[i] === " " || str[i] === "\t")) i++;
  };

  skipWs();
  if (str[i] === "}") return { labels, end: i + 1 };

  while (i < n) {
    skipWs();
    const m = str.slice(i).match(LABEL_NAME_RE);
    if (!m) return null;
    const key = m[0];
    i += key.length;
    skipWs();
    if (str[i] !== "=") return null;
    i++;
    skipWs();
    if (str[i] !== '"') return null;
    i++;
    let val = "";
    while (i < n && str[i] !== '"') {
      if (str[i] === "\\") {
        const nx = str[i + 1];
        if (nx === "\\") val += "\\";
        else if (nx === '"') val += '"';
        else if (nx === "n") val += "\n";
        else val += nx ?? "";
        i += 2;
      } else {
        val += str[i];
        i++;
      }
    }
    if (str[i] !== '"') return null; // unterminated value
    i++;
    labels[key] = val;
    skipWs();
    if (str[i] === ",") {
      i++;
      skipWs();
      if (str[i] === "}") return { labels, end: i + 1 };
      continue;
    }
    if (str[i] === "}") return { labels, end: i + 1 };
    return null; // unexpected char
  }
  return null; // missing closing brace
}

/** Parse Prometheus exposition text into samples. Malformed lines are skipped. */
export function parsePromText(text: string): PromSample[] {
  const out: PromSample[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    const nm = line.match(NAME_RE);
    if (!nm) continue;
    const name = nm[0];

    let labels: Record<string, string> = {};
    let rest = line.slice(name.length);
    if (rest.replace(/^[ \t]*/, "").startsWith("{")) {
      const braceIdx = line.indexOf("{", name.length);
      const parsed = parseLabels(line, braceIdx);
      if (!parsed) continue;
      labels = parsed.labels;
      rest = line.slice(parsed.end);
    }

    // remaining: value [timestamp] — timestamp ignored
    const tokens = rest.trim().split(/[ \t]+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const value = parseValue(tokens[0]);
    if (value === null) continue;

    out.push({ name, labels, value });
  }
  return out;
}

/**
 * Return the value of the first sample matching `name` whose labels superset-match
 * every entry in `matchers` (empty/absent matchers = match by name only), or null
 * if none match.
 */
export function selectSample(
  samples: PromSample[],
  name: string,
  matchers?: Record<string, string> | null,
): number | null {
  for (const s of samples) {
    if (s.name !== name) continue;
    if (matchers) {
      let ok = true;
      for (const [k, v] of Object.entries(matchers)) {
        if (s.labels[k] !== v) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }
    return s.value;
  }
  return null;
}
