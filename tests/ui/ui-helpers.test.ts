import { describe, expect, it } from "vitest";

/**
 * Lightweight UI contract checks that do not require a browser or RTL.
 * Mirrors filename sanitization used by ConverterWorkspace download.
 */
function safeDownloadBasename(title: string): string {
  return (
    (title.trim() || "converted-section")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "converted-section"
  );
}

describe("Phase 12 UI helpers", () => {
  it("sanitizes download filenames", () => {
    expect(safeDownloadBasename("My Hero!")).toBe("My-Hero");
    expect(safeDownloadBasename("  ")).toBe("converted-section");
    expect(safeDownloadBasename("../evil")).toBe("..-evil");
  });
});
