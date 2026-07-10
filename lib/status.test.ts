import { describe, it, expect } from "vitest";
import {
  deriveState,
  overallState,
  publicIncidentLabel,
  groupIncidents,
  segState,
  parseWindow,
} from "./status";

const at = (min: number) => new Date(2026, 0, 1, 12, min); // deterministic times

describe("deriveState", () => {
  it("is down on an open critical incident", () => {
    expect(deriveState("UP", [{ severity: "critical" }])).toBe("down");
  });
  it("is down when the last check was DOWN", () => {
    expect(deriveState("DOWN", [])).toBe("down");
  });
  it("is degraded on an open warning (no critical)", () => {
    expect(deriveState("UP", [{ severity: "warning" }])).toBe("degraded");
  });
  it("critical wins over warning", () => {
    expect(
      deriveState("UP", [{ severity: "warning" }, { severity: "critical" }]),
    ).toBe("down");
  });
  it("is operational when UP with no open incidents", () => {
    expect(deriveState("UP", [])).toBe("operational");
  });
});

describe("overallState", () => {
  it("is worst-of across services", () => {
    expect(overallState(["operational", "operational"])).toBe("operational");
    expect(overallState(["operational", "degraded"])).toBe("degraded");
    expect(overallState(["degraded", "down"])).toBe("down");
    expect(overallState([])).toBe("operational");
  });
});

describe("publicIncidentLabel", () => {
  it("maps known kinds to generic, infra-free labels", () => {
    expect(publicIncidentLabel("availability")).toBe("Service unavailable");
    expect(publicIncidentLabel("disk")).toBe("Storage pressure");
    expect(publicIncidentLabel("component_down")).toBe("Component issue");
    expect(publicIncidentLabel("eureka")).toBe("Registry issue");
  });
  it("falls back for unknown kinds (never leaks the raw kind)", () => {
    expect(publicIncidentLabel("something_internal")).toBe("Service issue");
  });
});

describe("groupIncidents", () => {
  it("collapses same-label incidents into one row with a count", () => {
    const { shown } = groupIncidents([
      { label: "Dependency missing", severity: "warning", ongoing: false, startedAt: at(1) },
      { label: "Dependency missing", severity: "warning", ongoing: false, startedAt: at(3) },
      { label: "Dependency missing", severity: "warning", ongoing: false, startedAt: at(2) },
    ]);
    expect(shown).toHaveLength(1);
    expect(shown[0].count).toBe(3);
    expect(shown[0].startedAt).toEqual(at(3)); // most recent kept
  });

  it("keeps ongoing and resolved of the same label as separate groups, ongoing first", () => {
    const { shown } = groupIncidents([
      { label: "Storage pressure", severity: "warning", ongoing: false, startedAt: at(5) },
      { label: "Storage pressure", severity: "warning", ongoing: true, startedAt: at(1) },
    ]);
    expect(shown).toHaveLength(2);
    expect(shown[0].ongoing).toBe(true);
    expect(shown[1].ongoing).toBe(false);
  });

  it("escalates the group severity to critical if any member is critical", () => {
    const { shown } = groupIncidents([
      { label: "Component issue", severity: "warning", ongoing: true, startedAt: at(1) },
      { label: "Component issue", severity: "critical", ongoing: true, startedAt: at(2) },
    ]);
    expect(shown[0].severity).toBe("critical");
  });

  it("caps at 10 groups and reports the remainder", () => {
    const raw = Array.from({ length: 14 }, (_, i) => ({
      label: `Issue ${i}`,
      severity: "warning",
      ongoing: false,
      startedAt: at(i),
    }));
    const { shown, more } = groupIncidents(raw);
    expect(shown).toHaveLength(10);
    expect(more).toBe(4);
  });

  it("groups the same label across different services separately", () => {
    const { shown } = groupIncidents([
      { serviceName: "adri", label: "Storage pressure", severity: "warning", ongoing: false, startedAt: at(1) },
      { serviceName: "etax", label: "Storage pressure", severity: "warning", ongoing: false, startedAt: at(2) },
    ]);
    expect(shown).toHaveLength(2);
  });
});

describe("parseWindow", () => {
  it("accepts the three valid windows", () => {
    expect(parseWindow("24h")).toBe("24h");
    expect(parseWindow("7d")).toBe("7d");
    expect(parseWindow("90d")).toBe("90d");
  });
  it("defaults to 90d for missing/garbage input", () => {
    expect(parseWindow(undefined)).toBe("90d");
    expect(parseWindow("lol")).toBe("90d");
  });
});

describe("segState", () => {
  it("maps a day's up-ratio to a bar color", () => {
    expect(segState(0, 0)).toBe("none");
    expect(segState(100, 100)).toBe("up");
    expect(segState(100, 99)).toBe("up"); // >= 99%
    expect(segState(100, 95)).toBe("partial"); // >= 90%
    expect(segState(100, 50)).toBe("down");
  });
});
