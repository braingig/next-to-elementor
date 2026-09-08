import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalizeConversionReport,
  canonicalizeElementorJson,
  convertSource,
  convertToElementor,
  convertToNativeElementor,
  flattenDecisions,
  loadElementorFreeCatalog,
  toElementorElement,
  validateElementorDocument,
  type ElementorDocument,
  type IrDocument,
  type IrNode,
} from "@/lib/converter";

const E2E = join(dirname(fileURLToPath(import.meta.url)), "fixtures/e2e");

function load(name: string): string {
  return readFileSync(join(E2E, name), "utf8");
}

function assertValidDocument(
  json: unknown,
  catalog = loadElementorFreeCatalog("4.2.4"),
): asserts json is ElementorDocument {
  expect(json).not.toBeNull();
  const doc = json as ElementorDocument;
  expect(doc.version).toBe("0.4");
  const validation = validateElementorDocument(doc, catalog);
  expect(validation.passed).toBe(true);
  expect(validation.violations).toEqual([]);
}

describe("Phase 8 convertSource end-to-end", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  it("1. simple heading", () => {
    const result = convertSource({
      source: load("01-simple-heading.tsx"),
      language: "tsx",
      catalog,
      title: "Simple",
    });
    expect(result.outcome).toBe("complete");
    assertValidDocument(result.elementorJson, catalog);
    expect(result.report.summary.unsupportedCount).toBe(0);
    expect(result.report.freeCompliance.passed).toBe(true);
    expect(
      result.report.nodes.every((n) => n.decision === "native"),
    ).toBe(true);
  });

  it("2. styled heading (CSS + inline)", () => {
    const result = convertSource({
      source: load("02-styled-heading.tsx"),
      language: "tsx",
      css: load("02-styled-heading.css"),
      catalog,
    });
    expect(result.outcome).toBe("complete");
    assertValidDocument(result.elementorJson, catalog);
    const html = JSON.stringify(result.elementorJson);
    expect(html).toContain("Styled Title");
  });

  it("3. responsive container", () => {
    const result = convertSource({
      source: load("03-responsive-container.tsx"),
      language: "tsx",
      catalog,
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    assertValidDocument(result.elementorJson, catalog);
    const root = (result.elementorJson as ElementorDocument).content[0]!;
    expect(root.elType).toBe("container");
    // flex-row + md:flex-col (mobile-first) → desktop/tablet column, mobile row
    expect(root.settings.flex_direction).toBe("column");
    expect(root.settings.flex_direction_tablet).toBe("column");
    expect(root.settings.flex_direction_mobile).toBe("row");
  });

  it("4. nested containers", () => {
    const result = convertSource({
      source: load("04-nested-containers.tsx"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("complete");
    assertValidDocument(result.elementorJson, catalog);
    const outer = (result.elementorJson as ElementorDocument).content[0]!;
    expect(outer.elType).toBe("container");
    expect(outer.elements[0]?.elType).toBe("container");
    expect(outer.elements[0]?.elements.length).toBeGreaterThanOrEqual(1);
  });

  it("5. native + custom node", () => {
    const result = convertSource({
      source: load("05-native-custom.tsx"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("complete");
    assertValidDocument(result.elementorJson, catalog);
    expect(result.report.summary.customCount).toBeGreaterThanOrEqual(1);
    expect(result.report.summary.nativeCount).toBeGreaterThanOrEqual(2);
    expect(
      result.report.nodes.some((n) => n.decision === "custom"),
    ).toBe(true);
  });

  it("6. native + unsupported node", () => {
    const result = convertSource({
      source: load("06-native-unsupported.tsx"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("partial");
    assertValidDocument(result.elementorJson, catalog);
    expect(result.report.summary.unsupportedCount).toBeGreaterThanOrEqual(1);
    expect(
      result.report.nodes.some(
        (n) =>
          n.decision === "unsupported" &&
          n.reasonCode === "unknown-component",
      ),
    ).toBe(true);
    expect(result.report.diagnostics.some((d) => d.severity === "error")).toBe(
      true,
    );
  });

  it("7. mixed native/custom/unsupported", () => {
    const result = convertSource({
      source: load("07-mixed.tsx"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("partial");
    assertValidDocument(result.elementorJson, catalog);
    const decisions = new Set(result.report.nodes.map((n) => n.decision));
    expect(decisions.has("native")).toBe(true);
    expect(decisions.has("custom")).toBe(true);
    expect(decisions.has("unsupported")).toBe(true);
  });

  it("8. Tailwind + CSS + inline styles", () => {
    const result = convertSource({
      source: load("08-styles-all.tsx"),
      language: "tsx",
      css: load("08-styles-all.css"),
      catalog,
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    assertValidDocument(result.elementorJson, catalog);
    const root = (result.elementorJson as ElementorDocument).content[0]!;
    expect(root.settings.padding || root.settings._padding).toBeTruthy();
  });

  it("9. same-file component", () => {
    const result = convertSource({
      source: load("09-same-file-component.tsx"),
      language: "tsx",
      catalog,
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    if (result.outcome !== "failed") {
      assertValidDocument(result.elementorJson, catalog);
    }
    expect(
      result.report.nodes.some(
        (n) => n.decision === "native" && n.irKind === "heading",
      ),
    ).toBe(true);
  });

  it("10. invalid JSX fails gracefully", () => {
    const result = convertSource({
      source: load("10-invalid-jsx.txt"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("failed");
    expect(result.elementorJson).toBeNull();
    expect(result.report.diagnostics.some((d) => d.severity === "error")).toBe(
      true,
    );
    expect(result.report.freeCompliance.passed).toBe(true);
  });

  it("11. unsafe fallback", () => {
    const result = convertSource({
      source: load("11-unsafe-fallback.tsx"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("partial");
    assertValidDocument(result.elementorJson, catalog);
    expect(
      result.report.nodes.some(
        (n) =>
          n.decision === "unsupported" && n.reasonCode === "unsafe-url",
      ),
    ).toBe(true);
  });

  it("12. unknown component / unrepresentable", () => {
    const result = convertSource({
      source: load("12-unknown-component.tsx"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("partial");
    assertValidDocument(result.elementorJson, catalog);
    expect(
      result.report.nodes.some(
        (n) =>
          n.decision === "unsupported" &&
          n.reasonCode === "unknown-component",
      ),
    ).toBe(true);
  });

  it("preserves report integrity (every IR node + provenance fields)", () => {
    const result = convertSource({
      source: load("05-native-custom.tsx"),
      language: "tsx",
      sourcePath: "fixtures/e2e/05-native-custom.tsx",
      catalog,
    });
    expect(result.report.summary.totalNodes).toBe(result.report.nodes.length);
    expect(
      result.report.summary.nativeCount +
        result.report.summary.customCount +
        result.report.summary.unsupportedCount,
    ).toBe(result.report.summary.totalNodes);
    expect(result.report.nodes.every((n) => n.message.length > 0)).toBe(true);
  });

  it("determinism: identical JSON/report/diagnostics across runs", () => {
    const input = {
      source: load("07-mixed.tsx"),
      language: "tsx" as const,
      catalog,
      title: "Mixed",
    };
    const a = convertSource(input);
    const b = convertSource(input);
    const c = convertSource(input);
    expect(canonicalizeElementorJson(a.elementorJson as ElementorDocument)).toBe(
      canonicalizeElementorJson(b.elementorJson as ElementorDocument),
    );
    expect(canonicalizeElementorJson(b.elementorJson as ElementorDocument)).toBe(
      canonicalizeElementorJson(c.elementorJson as ElementorDocument),
    );
    expect(canonicalizeConversionReport(a.report)).toBe(
      canonicalizeConversionReport(b.report),
    );
    expect(JSON.stringify(a.report.nodes)).toBe(JSON.stringify(b.report.nodes));
    expect(JSON.stringify(a.report.diagnostics)).toBe(
      JSON.stringify(b.report.diagnostics),
    );
    expect(a.outcome).toBe(b.outcome);
  });
});

describe("Phase 8 shared emit helpers regression", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  function doc(root: IrNode): IrDocument {
    return {
      version: "0.2.0",
      meta: { sourceLanguage: "tsx", sourceName: "emit-regression" },
      root,
      diagnostics: [],
    };
  }

  it("native + custom pipelines still emit identical validated JSON", () => {
    const ir = doc({
      id: "wrap",
      kind: "container",
      props: {},
      provenance: { htmlTag: "div", classNames: [], attributes: {} },
      children: [
        {
          id: "h",
          kind: "heading",
          props: { level: 2, text: "T" },
          provenance: { htmlTag: "h2", classNames: [], attributes: {} },
          children: [],
        },
        {
          id: "l",
          kind: "link",
          props: { href: "/x", text: "X" },
          provenance: { htmlTag: "a", classNames: [], attributes: {} },
          children: [],
        },
      ],
    });

    const native = convertToNativeElementor(ir, { catalog, title: "T" });
    const full = convertToElementor(ir, { catalog, title: "T" });

    expect(native.outcome).toBe("partial");
    expect(full.outcome).toBe("success");
    expect(native.document!.content[0]!.elements).toHaveLength(1);
    expect(full.document!.content[0]!.elements).toHaveLength(2);

    const a = convertToElementor(ir, { catalog, title: "T" });
    const b = convertToElementor(ir, { catalog, title: "T" });
    expect(canonicalizeElementorJson(a.document!)).toBe(
      canonicalizeElementorJson(b.document!),
    );
  });

  it("flattenDecisions / toElementorElement are stable", () => {
    const decision = {
      nodeId: "a",
      irKind: "container",
      strategy: "native" as const,
      message: "m",
      children: [
        {
          nodeId: "b",
          irKind: "heading",
          strategy: "native" as const,
          message: "h",
        },
      ],
    };
    expect(flattenDecisions(decision).map((d) => d.nodeId)).toEqual([
      "a",
      "b",
    ]);

    const el = toElementorElement({
      id: "abc1234",
      elType: "container",
      settings: { container_type: "flex" },
      elements: [
        {
          id: "def5678",
          elType: "widget",
          widgetType: "heading",
          settings: { title: "Hi" },
          elements: [],
        },
      ],
    });
    expect(el.isInner).toBe(false);
    expect(el.elements[0]!.widgetType).toBe("heading");
    expect(el.elements[0]!).not.toHaveProperty("isInner");
  });
});
