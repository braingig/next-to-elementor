import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalizeConversionReport,
  canonicalizeElementorJson,
  convert,
  loadElementorFreeCatalog,
  parseIrDocument,
  resolveStyles,
  type IrDocument,
  type IrNode,
} from "@/lib/converter";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/report",
);

function loadFixture(name: string): IrDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
  return parseIrDocument(raw);
}

function doc(root: IrNode, diagnostics: IrDocument["diagnostics"] = []): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "test" },
    root,
    diagnostics,
  };
}

describe("Phase 7 convert() report", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  it("1. all-native conversion is complete", () => {
    const result = convert(loadFixture("complete-native.json"), { catalog });
    expect(result.outcome).toBe("complete");
    expect(result.elementorJson).not.toBeNull();
    expect(result.report.summary.unsupportedCount).toBe(0);
    expect(result.report.summary.customCount).toBe(0);
    expect(result.report.summary.nativeCount).toBe(3);
    expect(result.report.nodes).toHaveLength(3);
    expect(
      result.report.nodes.every((n) => n.decision === "native"),
    ).toBe(true);
  });

  it("2. native + custom", () => {
    const result = convert(
      doc({
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
      }),
      { catalog },
    );
    expect(result.outcome).toBe("complete");
    expect(result.report.summary.nativeCount).toBe(2);
    expect(result.report.summary.customCount).toBe(1);
    const json = result.elementorJson as { content: Array<{ elements: unknown[] }> };
    expect(json.content[0]!.elements).toHaveLength(2);
  });

  it("3. native + unsupported", () => {
    const result = convert(
      doc({
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
            id: "u",
            kind: "unsupported",
            props: {
              reasonCode: "unknown-component",
              message: "Unknown <X />",
            },
            provenance: {
              componentName: "X",
              classNames: [],
              attributes: {},
            },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("partial");
    expect(result.report.summary.unsupportedCount).toBe(1);
    const json = result.elementorJson as {
      content: Array<{ elements: Array<{ widgetType?: string }> }>;
    };
    expect(json.content[0]!.elements).toHaveLength(1);
    expect(json.content[0]!.elements[0]!.widgetType).toBe("heading");
  });

  it("4. native + custom + unsupported (fixture)", () => {
    const result = convert(
      loadFixture("mixed-native-custom-unsupported.json"),
      { catalog },
    );
    expect(result.outcome).toBe("partial");
    expect(result.report.summary.totalNodes).toBe(5);
    const byId = Object.fromEntries(
      result.report.nodes.map((n) => [n.nodeId, n]),
    );
    expect(byId.h!.decision).toBe("native");
    expect(byId.l!.decision).toBe("custom");
    expect(byId.dyn!.decision).toBe("unsupported");
    expect(byId.dyn!.reasonCode).toBe("dynamic-content");
    expect(byId.btn!.decision).toBe("native");
    expect(byId.root!.decision).toBe("native");

    const json = result.elementorJson as {
      content: Array<{ elements: unknown[] }>;
    };
    expect(json.content[0]!.elements).toHaveLength(3);
  });

  it("5. nested unsupported preserves ancestors", () => {
    const result = convert(loadFixture("nested-unsupported.json"), { catalog });
    expect(result.outcome).toBe("partial");
    const json = result.elementorJson as {
      content: Array<{
        elType: string;
        elements: Array<{
          elType: string;
          elements: Array<{ widgetType?: string }>;
        }>;
      }>;
    };
    expect(json.content[0]!.elType).toBe("container");
    expect(json.content[0]!.elements[0]!.elType).toBe("container");
    expect(json.content[0]!.elements[0]!.elements).toHaveLength(1);
    expect(json.content[0]!.elements[0]!.elements[0]!.widgetType).toBe(
      "heading",
    );
    expect(
      result.report.nodes.find((n) => n.nodeId === "unk")?.reasonCode,
    ).toBe("unknown-component");
  });

  it("6. multiple unsupported nodes", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "a",
            kind: "unsupported",
            props: {
              reasonCode: "dynamic-content",
              message: "dyn a",
            },
            provenance: { classNames: [], attributes: {} },
            children: [],
          },
          {
            id: "b",
            kind: "unsupported",
            props: {
              reasonCode: "unknown-component",
              message: "unk b",
            },
            provenance: { classNames: [], attributes: {} },
            children: [],
          },
          {
            id: "h",
            kind: "heading",
            props: { level: 2, text: "Ok" },
            provenance: { htmlTag: "h2", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.report.summary.unsupportedCount).toBe(2);
    expect(
      (result.elementorJson as { content: Array<{ elements: unknown[] }> })
        .content[0]!.elements,
    ).toHaveLength(1);
  });

  it("7. dynamic content reason", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "d",
            kind: "unsupported",
            props: {
              reasonCode: "dynamic-content",
              message: "Dynamic `{count}`",
            },
            provenance: { classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(
      result.report.nodes.find((n) => n.nodeId === "d")?.reasonCode,
    ).toBe("dynamic-content");
  });

  it("8. unknown component reason", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "u",
            kind: "unsupported",
            props: {
              reasonCode: "unknown-component",
              message: "Unknown <Widget />",
            },
            provenance: {
              componentName: "Widget",
              classNames: [],
              attributes: {},
            },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(
      result.report.nodes.find((n) => n.nodeId === "u")?.reasonCode,
    ).toBe("unknown-component");
    expect(
      result.report.nodes.find((n) => n.nodeId === "u")?.provenance
        ?.componentName,
    ).toBe("Widget");
  });

  it("9. unsafe HTML", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "l",
            kind: "link",
            props: { href: "/ok", text: "X" },
            provenance: {
              htmlTag: "a",
              classNames: [],
              attributes: { onclick: "alert(1)" },
            },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("partial");
    expect(
      result.report.nodes.find((n) => n.nodeId === "l")?.reasonCode,
    ).toBe("unsafe-html");
  });

  it("10. unsafe URL", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "l",
            kind: "link",
            props: { href: "javascript:alert(1)", text: "X" },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(
      result.report.nodes.find((n) => n.nodeId === "l")?.reasonCode,
    ).toBe("unsafe-url");
  });

  it("11. unsupported CSS diagnostic", () => {
    const styled = resolveStyles(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: {
          htmlTag: "div",
          classNames: ["box"],
          attributes: {},
        },
        children: [
          {
            id: "h",
            kind: "heading",
            props: { level: 2, text: "T" },
            provenance: { htmlTag: "h2", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { css: ".box { -webkit-mask-image: url(x); }" },
    );
    const result = convert(styled.document, { catalog });
    expect(
      result.report.diagnostics.some((d) => d.code === "unsupported-css"),
    ).toBe(true);
  });

  it("12. unresolved CSS variable diagnostic", () => {
    const styled = resolveStyles(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: {
          htmlTag: "div",
          classNames: ["box"],
          attributes: {},
        },
        children: [],
      }),
      { css: ".box { color: var(--missing); }" },
    );
    expect(
      styled.document.diagnostics.some((d) => d.code === "unresolved-style"),
    ).toBe(true);
    const result = convert(styled.document, { catalog });
    expect(
      result.report.diagnostics.some((d) => d.code === "unresolved-style"),
    ).toBe(true);
    expect(result.outcome).toBe("partial");
  });

  it("13. responsive style diagnostic", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        style: {
          layout: { display: "flex" },
          responsive: {
            "weird-bp": { box: { padding: "8px" } },
          },
        },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [],
      }),
      { catalog },
    );
    expect(
      result.report.diagnostics.some(
        (d) => d.code === "responsive-unsupported",
      ),
    ).toBe(true);
    expect(result.outcome).toBe("partial");
  });

  it("14. diagnostic aggregation from IR", () => {
    const result = convert(
      loadFixture("mixed-native-custom-unsupported.json"),
      { catalog },
    );
    expect(
      result.report.diagnostics.some(
        (d) => d.code === "dynamic-content" && d.nodeId === "dyn",
      ),
    ).toBe(true);
    expect(
      result.report.diagnostics.some(
        (d) => d.severity === "error" && d.nodeId === "dyn",
      ),
    ).toBe(true);
  });

  it("15. deterministic report", () => {
    const ir = loadFixture("mixed-native-custom-unsupported.json");
    const a = convert(ir, { catalog, title: "T" });
    const b = convert(ir, { catalog, title: "T" });
    expect(canonicalizeConversionReport(a.report)).toBe(
      canonicalizeConversionReport(b.report),
    );
    expect(canonicalizeElementorJson(a.elementorJson as never)).toBe(
      canonicalizeElementorJson(b.elementorJson as never),
    );
  });

  it("16. overall status complete/partial/failed", () => {
    expect(
      convert(loadFixture("complete-native.json"), { catalog }).outcome,
    ).toBe("complete");
    expect(
      convert(loadFixture("mixed-native-custom-unsupported.json"), {
        catalog,
      }).outcome,
    ).toBe("partial");
    expect(convert(loadFixture("failed-root.json"), { catalog }).outcome).toBe(
      "failed",
    );
    expect(
      convert(loadFixture("failed-root.json"), { catalog }).elementorJson,
    ).toBeNull();
  });

  it("17. source provenance on decisions", () => {
    const result = convert(loadFixture("complete-native.json"), { catalog });
    const h = result.report.nodes.find((n) => n.nodeId === "h1");
    expect(h?.provenance?.sourcePath).toBe("fixtures/Hero.tsx");
    expect(h?.provenance?.htmlTag).toBe("h1");
    expect(h?.provenance?.loc).toEqual({ line: 2, column: 2 });
  });

  it("18. no silent node loss — every IR node has a decision", () => {
    const ir = loadFixture("mixed-native-custom-unsupported.json");
    const result = convert(ir, { catalog });
    const ids: string[] = [];
    const walk = (n: IrNode) => {
      ids.push(n.id);
      n.children.forEach(walk);
    };
    walk(ir.root);
    expect(result.report.nodes.map((n) => n.nodeId).sort()).toEqual(
      [...ids].sort(),
    );
  });

  it("reports native style loss without claiming silent accuracy", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "h",
            kind: "heading",
            props: { level: 2, text: "T" },
            style: {
              effects: { transform: "rotate(3deg)", boxShadow: "0 0 4px #000" },
            },
            provenance: { htmlTag: "h2", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.report.nodes.find((n) => n.nodeId === "h")?.decision).toBe(
      "native",
    );
    expect(
      result.report.diagnostics.filter((d) => d.code === "unsupported-css")
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "unsupported-css" && d.message.includes("transform"),
      ),
    ).toBe(true);
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "unsupported-css" && d.message.includes("box-shadow"),
      ),
    ).toBe(false);
    expect(result.outcome).toBe("partial");
  });

  it("includes children absorbed into custom group fallback", () => {
    const result = convert(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "g",
            kind: "group",
            status: "uncertain",
            uncertainty: { message: "Ambiguous group" },
            props: {},
            provenance: { htmlTag: "div", classNames: [], attributes: {} },
            children: [
              {
                id: "t",
                kind: "text",
                props: { text: "Inside" },
                provenance: { htmlTag: "p", classNames: [], attributes: {} },
                children: [],
              },
            ],
          },
        ],
      }),
      { catalog },
    );
    expect(result.report.nodes.find((n) => n.nodeId === "g")?.decision).toBe(
      "custom",
    );
    expect(result.report.nodes.find((n) => n.nodeId === "t")?.decision).toBe(
      "custom",
    );
    expect(result.report.summary.totalNodes).toBe(3);
  });
});
