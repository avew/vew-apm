import { describe, it, expect } from "vitest";
import { deriveState, overallState, publicIncidentLabel } from "./status";

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
