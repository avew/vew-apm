import { describe, it, expect } from "vitest";
import { buildMetricsText, type MetricsSnapshot } from "./metrics";

const snap: MetricsSnapshot = {
  schedulerLastTickAtMs: 1_700_000_000_000,
  monitorsTotal: 3,
  monitors: [
    {
      id: 1,
      name: 'billing "svc"', // quotes must be escaped
      group: "core",
      up: 1,
      responseMs: 87,
      lastCheckAtMs: 1_700_000_000_000,
      certDaysLeft: 41,
      disks: [{ path: "/", usedPct: 72.3456 }],
    },
    {
      id: 2,
      name: "api-gw",
      group: null,
      up: 0,
      responseMs: null,
      lastCheckAtMs: null,
      certDaysLeft: -3,
      disks: [],
    },
    {
      id: 3,
      name: "never-checked",
      group: null,
      up: null, // omitted from apm_monitor_up
      responseMs: null,
      lastCheckAtMs: null,
      certDaysLeft: null,
      disks: [],
    },
  ],
  incidentsOpen: { critical: 1, warning: 3 },
};

describe("buildMetricsText", () => {
  const txt = buildMetricsText(snap);

  it("emits instance-level gauges", () => {
    expect(txt).toContain("apm_up 1");
    expect(txt).toContain("apm_monitors_total 3");
    expect(txt).toContain("apm_scheduler_last_tick_timestamp_seconds 1700000000");
  });

  it("escapes label values and includes group when present", () => {
    expect(txt).toContain(
      'apm_monitor_up{monitor="billing \\"svc\\"",id="1",group="core"} 1',
    );
  });

  it("emits up=0 for DOWN, omits the group label when null, and omits never-checked", () => {
    expect(txt).toContain('apm_monitor_up{monitor="api-gw",id="2"} 0');
    expect(txt).not.toMatch(/apm_monitor_up\{monitor="never-checked"/);
  });

  it("rounds disk percent and emits cert (incl. negative) + incidents", () => {
    expect(txt).toContain(
      'apm_monitor_disk_used_percent{monitor="billing \\"svc\\"",id="1",path="/"} 72.35',
    );
    expect(txt).toContain('apm_monitor_cert_days_left{monitor="api-gw",id="2"} -3');
    expect(txt).toContain('apm_incidents_open{severity="critical"} 1');
    expect(txt).toContain('apm_incidents_open{severity="warning"} 3');
  });

  it("only emits response_ms for checked monitors", () => {
    expect(txt).toContain('apm_monitor_response_ms{monitor="billing \\"svc\\"",id="1"} 87');
    expect(txt).not.toMatch(/apm_monitor_response_ms\{monitor="api-gw"/);
  });

  it("ends with a trailing newline", () => {
    expect(txt.endsWith("\n")).toBe(true);
  });
});
