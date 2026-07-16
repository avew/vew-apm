import { describe, it, expect } from "vitest";
import { parsePromText, selectSample } from "./prom-parse";

describe("parsePromText", () => {
  it("parses a bare gauge and skips comments/blank lines", () => {
    const s = parsePromText(
      [
        "# HELP process_cpu_usage The recent CPU usage.",
        "# TYPE process_cpu_usage gauge",
        "",
        "process_cpu_usage 0.42",
      ].join("\n"),
    );
    expect(s).toEqual([{ name: "process_cpu_usage", labels: {}, value: 0.42 }]);
  });

  it("parses labels and scientific notation", () => {
    const [m] = parsePromText('jvm_memory_used_bytes{area="heap",id="Eden Space"} 1.234E7');
    expect(m).toEqual({
      name: "jvm_memory_used_bytes",
      labels: { area: "heap", id: "Eden Space" },
      value: 12_340_000,
    });
  });

  it("unescapes label values", () => {
    const [m] = parsePromText('x{a="b\\"c",d="e\\\\f",g="h\\ni"} 1');
    expect(m.labels).toEqual({ a: 'b"c', d: "e\\f", g: "h\ni" });
  });

  it("handles +Inf/-Inf and drops NaN", () => {
    const s = parsePromText(["a +Inf", "b -Inf", "c NaN", "d 5"].join("\n"));
    expect(s).toEqual([
      { name: "a", labels: {}, value: Infinity },
      { name: "b", labels: {}, value: -Infinity },
      { name: "d", labels: {}, value: 5 },
    ]);
  });

  it("ignores a trailing timestamp and parses histogram buckets as samples", () => {
    const s = parsePromText(
      [
        'http_server_requests_seconds_bucket{le="0.5"} 3 1700000000000',
        'http_server_requests_seconds_bucket{le="+Inf"} 7',
      ].join("\n"),
    );
    expect(s).toEqual([
      { name: "http_server_requests_seconds_bucket", labels: { le: "0.5" }, value: 3 },
      { name: "http_server_requests_seconds_bucket", labels: { le: "+Inf" }, value: 7 },
    ]);
  });

  it("skips malformed lines without throwing", () => {
    const s = parsePromText(['ok 1', 'broken{unterminated 2', 'also_ok 3'].join("\n"));
    expect(s.map((x) => x.name)).toEqual(["ok", "also_ok"]);
  });
});

describe("selectSample", () => {
  const samples = parsePromText(
    [
      'jvm_memory_used_bytes{area="heap",id="Eden Space"} 100',
      'jvm_memory_used_bytes{area="heap",id="Old Gen"} 200',
      'jvm_memory_used_bytes{area="nonheap",id="Metaspace"} 50',
      "hikaricp_connections_active 12",
    ].join("\n"),
  );

  it("matches by name only (first sample)", () => {
    expect(selectSample(samples, "hikaricp_connections_active")).toBe(12);
    expect(selectSample(samples, "jvm_memory_used_bytes")).toBe(100);
  });

  it("superset-matches labels", () => {
    expect(selectSample(samples, "jvm_memory_used_bytes", { area: "heap", id: "Old Gen" })).toBe(200);
    expect(selectSample(samples, "jvm_memory_used_bytes", { area: "nonheap" })).toBe(50);
  });

  it("returns null when nothing matches", () => {
    expect(selectSample(samples, "does_not_exist")).toBeNull();
    expect(selectSample(samples, "jvm_memory_used_bytes", { area: "missing" })).toBeNull();
  });
});
