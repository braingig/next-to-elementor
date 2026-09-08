import { describe, expect, it } from "vitest";
import {
  emptyBlockedReport,
  getRuntimeImportStatus,
  probePhase11Runtime,
  REQUIRED_ELEMENTOR_FREE_VERSION,
} from "@/lib/converter";

describe("Phase 11 runtime harness scaffolding", () => {
  it("targets Elementor Free 4.2.4 only", () => {
    expect(REQUIRED_ELEMENTOR_FREE_VERSION).toBe("4.2.4");
  });

  it("never fabricates RUNTIME_PASS in getRuntimeImportStatus", () => {
    const status = getRuntimeImportStatus();
    expect(status.status).not.toBe("PASS");
    expect(status.executed).toBe(false);
    expect(status.elementorVersion).toBe("4.2.4");
  });

  it("emptyBlockedReport stays BLOCKED", () => {
    const report = emptyBlockedReport(["docker down"]);
    expect(report.runtimeStatus).toBe("BLOCKED");
    expect(report.fixtures).toEqual([]);
  });

  it("probePhase11Runtime reports structured availability", () => {
    const probe = probePhase11Runtime();
    expect(["available", "blocked"]).toContain(probe.status);
    if (probe.status === "blocked") {
      expect(probe.reasons.length).toBeGreaterThan(0);
    }
  });
});
