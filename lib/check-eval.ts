import { getByPath } from "./jsonpath";

export interface CheckVerdict {
  up: boolean;
  reason: string | null; // set when down
}

/** Does an HTTP status code satisfy `expect`? `""`/`"2xx"` = any 200–299. */
export function statusMatches(code: number | null, expect: string | null): boolean {
  if (code == null) return false;
  const e = (expect ?? "").trim().toLowerCase();
  if (e === "" || e === "2xx") return code >= 200 && code < 300;
  const range = e.match(/^(\d{3})\s*-\s*(\d{3})$/);
  if (range) return code >= Number(range[1]) && code <= Number(range[2]);
  if (/^\d{3}$/.test(e)) return code === Number(e);
  // Unparseable expectation → fall back to 2xx.
  return code >= 200 && code < 300;
}

function keywordOk(body: string, keyword: string | null): boolean {
  if (!keyword || !keyword.trim()) return true;
  return body.includes(keyword);
}

/** Generic HTTP monitor: UP when status matches and (optional) keyword present. */
export function evaluateHttp(
  code: number | null,
  body: string,
  cfg: { expectStatus: string | null; keyword: string | null },
): CheckVerdict {
  if (!statusMatches(code, cfg.expectStatus)) {
    return { up: false, reason: `HTTP ${code ?? "error"}` };
  }
  if (!keywordOk(body, cfg.keyword)) {
    return { up: false, reason: `keyword "${cfg.keyword}" not found` };
  }
  return { up: true, reason: null };
}

const HEALTHY_VALUES = new Set([
  "up",
  "ok",
  "healthy",
  "green",
  "pass",
  "passing",
  "true",
  "1",
]);

/** Is a value at the status path "up"? Explicit `upValue` compares equal
 * (case-insensitive); otherwise a small healthy-value set is used. */
export function valueIsUp(value: unknown, upValue: string | null): boolean {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  if (upValue && upValue.trim()) return s === upValue.trim().toLowerCase();
  if (typeof value === "boolean") return value;
  return HEALTHY_VALUES.has(s);
}

/** Dynamic JSON monitor: 2xx + the value at statusPath means "up". */
export function evaluateJson(
  code: number | null,
  body: string,
  cfg: { statusPath: string; statusUpValue: string | null; keyword: string | null },
): CheckVerdict {
  if (!statusMatches(code, "2xx")) return { up: false, reason: `HTTP ${code ?? "error"}` };
  if (!keywordOk(body, cfg.keyword)) {
    return { up: false, reason: `keyword "${cfg.keyword}" not found` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { up: false, reason: "response is not JSON" };
  }
  const value = getByPath(parsed, cfg.statusPath);
  if (value === undefined) {
    return { up: false, reason: `path ${cfg.statusPath} not found` };
  }
  if (!valueIsUp(value, cfg.statusUpValue)) {
    return { up: false, reason: `${cfg.statusPath} = ${JSON.stringify(value)}` };
  }
  return { up: true, reason: null };
}
