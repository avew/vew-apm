import { describe, it, expect } from "vitest";
import { parseHealth } from "./parser";
import { sampleHealth } from "./fixtures/sample-health";

describe("parseHealth", () => {
  const parsed = parseHealth(sampleHealth);

  it("captures overall status", () => {
    expect(parsed.overall).toBe("UP");
  });

  it("emits every component with dot-path", () => {
    const paths = parsed.components.map((c) => c.path);
    expect(paths).toContain("clientConfigServer");
    expect(paths).toContain("discoveryComposite");
    expect(paths).toContain("discoveryComposite.discoveryClient");
    expect(paths).toContain("discoveryComposite.eureka");
    expect(paths).toContain("diskSpace");
    expect(paths).toContain("livenessState");
    expect(paths).toContain("readinessState");
    expect(paths).toContain("redis");
    expect(paths).toContain("refreshScope");
    expect(paths).toContain(
      "reactiveDiscoveryClients.Spring Cloud Eureka Reactive Discovery Client",
    );
  });

  it("extracts disk snapshot with used_pct", () => {
    expect(parsed.disks).toHaveLength(1);
    const [disk] = parsed.disks;
    expect(disk.path).toBe("diskSpace");
    expect(disk.diskPath).toBe("/.");
    expect(disk.totalBytes).toBe(82086711296);
    expect(disk.freeBytes).toBe(25162928128);
    expect(disk.usedPct).toBeGreaterThan(68);
    expect(disk.usedPct).toBeLessThan(70);
  });

  it("extracts eureka applications as services", () => {
    const eurekaSvcs = parsed.services.filter((s) => s.source === "eureka");
    expect(eurekaSvcs).toHaveLength(12);
    const names = eurekaSvcs.map((s) => s.serviceName);
    expect(names).toContain("GENTA-SVC");
    expect(names).toContain("API-GATEWAY-OP");
  });

  it("extracts discoveryClient services", () => {
    const dc = parsed.services.filter((s) => s.source === "discoveryComposite");
    expect(dc.length).toBeGreaterThanOrEqual(12);
    expect(dc.map((s) => s.serviceName)).toContain("notif-svc");
  });

  it("captures property sources", () => {
    expect(parsed.propertySources).toContain("configClient");
    expect(
      parsed.propertySources.some((p) =>
        p.startsWith("configserver:file:"),
      ),
    ).toBe(true);
  });
});
