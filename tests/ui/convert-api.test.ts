import { describe, expect, it } from "vitest";
import {
  MAX_CONVERT_BODY_BYTES,
  estimateJsonBodyBytes,
  runConvertRequest,
} from "@/app/lib/server-convert";

describe("POST /api/convert handler (runConvertRequest)", () => {
  it("rejects empty / invalid bodies with 400", () => {
    expect(runConvertRequest({}).status).toBe(400);
    expect(runConvertRequest({ source: "" }).status).toBe(400);
    expect(runConvertRequest({ source: "ok", extra: true }).status).toBe(400);
    const bad = runConvertRequest({ source: "" });
    expect(bad.payload.ok).toBe(false);
  });

  it("converts a simple heading to Elementor JSON", () => {
    const { status, payload } = runConvertRequest({
      source: `export function Hero() {
  return <h1 className="text-xl font-bold">Hello</h1>;
}`,
      language: "tsx",
      title: "ui-test-hero",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(["complete", "partial"]).toContain(payload.result.outcome);
    expect(payload.result.elementorJson).not.toBeNull();
    expect(payload.result.elementorTarget).toBe("4.2.4");
    const doc = payload.result.elementorJson as {
      version: string;
      content: unknown[];
    };
    expect(doc.version).toBe("0.4");
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it("returns failed ConversionResult for unparseable source (HTTP 200)", () => {
    const { status, payload } = runConvertRequest({
      source: "export function Broken( { return <<<<<<<; }",
      language: "tsx",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.outcome).toBe("failed");
    expect(payload.result.elementorJson).toBeNull();
    expect(payload.result.report.diagnostics.length).toBeGreaterThan(0);
  });

  it("surfaces unsupported nodes in partial reports", () => {
    const { status, payload } = runConvertRequest({
      source: `export function Mixed() {
  return (
    <div>
      <h2>Ok</h2>
      <FancyThing />
    </div>
  );
}`,
      language: "tsx",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.outcome).toBe("partial");
    expect(
      payload.result.report.nodes.some((n) => n.decision === "unsupported"),
    ).toBe(true);
    expect(payload.result.elementorJson).not.toBeNull();
  });

  it("enforces body size constant for route protection", () => {
    expect(MAX_CONVERT_BODY_BYTES).toBe(512 * 1024);
    expect(estimateJsonBodyBytes("abc")).toBe(3);
  });
});
