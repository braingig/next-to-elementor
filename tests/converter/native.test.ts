import { describe, expect, it } from "vitest";
import {
  canonicalizeElementorJson,
  convertToNativeElementor,
  loadElementorFreeCatalog,
  type IrDocument,
  type IrNode,
  type ElementorElement,
} from "@/lib/converter";

function doc(root: IrNode): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "fixture" },
    root,
    diagnostics: [],
  };
}

function walkEl(el: ElementorElement, visit: (e: ElementorElement) => void): void {
  visit(el);
  for (const child of el.elements) walkEl(child, visit);
}

describe("convertToNativeElementor Phase 5", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  it("emits classic document version 0.4", () => {
    const result = convertToNativeElementor(
      doc({
        id: "c",
        kind: "container",
        props: { as: "div" },
        style: { layout: { display: "flex", flexDirection: "column" } },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [],
      }),
      { catalog, title: "Simple" },
    );
    expect(result.outcome).toBe("success");
    expect(result.document?.version).toBe("0.4");
    expect(result.document?.content[0]?.elType).toBe("container");
    expect(result.compliancePassed).toBe(true);
  });

  it("converts nested containers with children", () => {
    const result = convertToNativeElementor(
      doc({
        id: "outer",
        kind: "container",
        props: { as: "section" },
        style: { layout: { display: "flex", flexDirection: "column", gap: "16px" } },
        provenance: { htmlTag: "section", classNames: [], attributes: {} },
        children: [
          {
            id: "inner",
            kind: "container",
            props: { as: "div" },
            style: { layout: { display: "flex", flexDirection: "row" } },
            provenance: { htmlTag: "div", classNames: [], attributes: {} },
            children: [
              {
                id: "h",
                kind: "heading",
                props: { level: 2, text: "Nested" },
                provenance: { htmlTag: "h2", classNames: [], attributes: {} },
                children: [],
              },
            ],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("success");
    const root = result.document!.content[0]!;
    expect(root.elType).toBe("container");
    expect(root.elements[0]?.elType).toBe("container");
    expect(root.elements[0]?.elements[0]?.widgetType).toBe("heading");
    expect(root.settings.flex_gap).toMatchObject({
      column: "16",
      row: "16",
      unit: "px",
    });
  });

  it("maps heading text, tag, color, typography", () => {
    const result = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "h",
            kind: "heading",
            props: { level: 1, text: "Title" },
            style: {
              typography: {
                color: "#111111",
                fontSize: "32px",
                fontWeight: "700",
                textAlign: "center",
              },
            },
            provenance: { htmlTag: "h1", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    const heading = result.document!.content[0]!.elements[0]!;
    expect(heading.widgetType).toBe("heading");
    expect(heading.settings.title).toBe("Title");
    expect(heading.settings.header_size).toBe("h1");
    expect(heading.settings.title_color).toBe("#111111");
    expect(heading.settings.typography_font_size).toEqual({
      unit: "px",
      size: 32,
    });
    expect(heading.settings.align).toBe("center");
  });

  it("maps text to text-editor without inventing HTML", () => {
    const result = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "t",
            kind: "text",
            props: { text: "Plain paragraph" },
            provenance: { htmlTag: "p", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    const widget = result.document!.content[0]!.elements[0]!;
    expect(widget.widgetType).toBe("text-editor");
    expect(widget.settings.editor).toBe("Plain paragraph");
  });

  it("maps image with URL media and no fabricated attachment id", () => {
    const result = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "img",
            kind: "image",
            props: { src: "/a.jpg", alt: "Alt", width: 100, height: 80 },
            provenance: { htmlTag: "img", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    const widget = result.document!.content[0]!.elements[0]!;
    expect(widget.widgetType).toBe("image");
    expect(widget.settings.image).toEqual({
      url: "/a.jpg",
      id: "",
      alt: "Alt",
      source: "url",
    });
  });

  it("maps button text, url, colors", () => {
    const result = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "b",
            kind: "button",
            props: { text: "Go", href: "/x", type: "link" },
            style: {
              typography: { color: "#fff" },
              background: { color: "#0f766e" },
            },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    const widget = result.document!.content[0]!.elements[0]!;
    expect(widget.widgetType).toBe("button");
    expect(widget.settings.text).toBe("Go");
    expect(widget.settings.link).toMatchObject({ url: "/x" });
    expect(widget.settings.button_text_color).toBe("#fff");
    expect(widget.settings.background_color).toBe("#0f766e");
  });

  it("maps divider and spacer", () => {
    const result = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "d",
            kind: "divider",
            props: {},
            style: { border: { color: "#e2e8f0", style: "solid" } },
            provenance: { htmlTag: "hr", classNames: [], attributes: {} },
            children: [],
          },
          {
            id: "s",
            kind: "spacer",
            props: { axis: "y", size: "48px" },
            provenance: { htmlTag: "div", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    const types = result.document!.content[0]!.elements.map((e) => e.widgetType);
    expect(types).toEqual(["divider", "spacer"]);
    expect(result.document!.content[0]!.elements[1]!.settings.space).toEqual({
      unit: "px",
      size: 48,
    });
  });

  it("maps named icon natively and defers svg-only icon", () => {
    const named = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "i",
            kind: "icon",
            props: { name: "check" },
            provenance: { classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(named.document!.content[0]!.elements[0]!.widgetType).toBe("icon");
    expect(named.document!.content[0]!.elements[0]!.settings.selected_icon).toMatchObject({
      library: "fa-solid",
    });

    const svgOnly = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "i",
            kind: "icon",
            props: { svg: "<svg/>" },
            provenance: { classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(svgOnly.outcome).toBe("partial");
    expect(
      svgOnly.decisions.some(
        (d) => d.strategy === "needs-fallback" && d.irKind === "icon",
      ),
    ).toBe(true);
  });

  it("maps responsive styles to Elementor _tablet/_mobile suffixes", () => {
    const result = convertToNativeElementor(
      doc({
        id: "c",
        kind: "container",
        props: {},
        style: {
          layout: { display: "flex", flexDirection: "row", gap: "24px" },
          box: { padding: "32px" },
          responsive: {
            md: { layout: { flexDirection: "column" }, box: { padding: "24px" } },
            sm: { layout: { flexDirection: "column" }, box: { padding: "16px" } },
          },
        },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [],
      }),
      { catalog },
    );
    const s = result.document!.content[0]!.settings;
    expect(s.flex_direction).toBe("row");
    expect(s.flex_direction_tablet).toBe("column");
    expect(s.flex_direction_mobile).toBe("column");
    expect(s.padding).toMatchObject({ top: "32" });
    expect(s.padding_tablet).toMatchObject({ top: "24" });
    expect(s.padding_mobile).toMatchObject({ top: "16" });
  });

  it("defers IR link (no silent button conversion)", () => {
    const result = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "l",
            kind: "link",
            props: { href: "/docs", text: "Docs" },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
            children: [],
          },
          {
            id: "h",
            kind: "heading",
            props: { level: 3, text: "Still native" },
            provenance: { htmlTag: "h3", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("partial");
    expect(result.document!.content[0]!.elements).toHaveLength(1);
    expect(result.document!.content[0]!.elements[0]!.widgetType).toBe("heading");
    expect(
      result.decisions.some(
        (d) => d.irKind === "link" && d.strategy === "needs-fallback",
      ),
    ).toBe(true);
  });

  it("maps explicit html-embed to html widget only", () => {
    const result = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "html",
            kind: "html-embed",
            props: { html: "<div class=\"badge\">X</div>" },
            provenance: { classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.document!.content[0]!.elements[0]!.widgetType).toBe("html");
    expect(result.document!.content[0]!.elements[0]!.settings.html).toBe(
      "<div class=\"badge\">X</div>",
    );
  });

  it("rejects Pro widgets via denylist / compliance", () => {
    const result = convertToNativeElementor(
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
              reasonCode: "pro-only-feature",
              message: "form",
              originalSummary: "form",
            },
            provenance: { classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("partial");
    const json = JSON.stringify(result.document);
    expect(json).not.toContain('"widgetType":"form"');
    expect(json).not.toContain("custom_css");
  });

  it("is deterministic for the same IR", () => {
    const ir = doc({
      id: "c",
      kind: "container",
      props: {},
      style: { layout: { display: "flex", gap: "8px" } },
      provenance: { htmlTag: "div", classNames: [], attributes: {} },
      children: [
        {
          id: "h",
          kind: "heading",
          props: { level: 2, text: "Hi" },
          provenance: { htmlTag: "h2", classNames: [], attributes: {} },
          children: [],
        },
      ],
    });
    const a = convertToNativeElementor(ir, { catalog, title: "T" });
    const b = convertToNativeElementor(ir, { catalog, title: "T" });
    expect(canonicalizeElementorJson(a.document!)).toBe(
      canonicalizeElementorJson(b.document!),
    );
  });

  it("fails closed when root cannot be converted natively", () => {
    const result = convertToNativeElementor(
      doc({
        id: "bad",
        kind: "unsupported",
        props: {
          reasonCode: "parse-error",
          message: "no root",
        },
        provenance: { classNames: [], attributes: {} },
        children: [],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("failed");
    expect(result.document).toBeUndefined();
  });

  it("never emits unknown control ids for native widgets", () => {
    const result = convertToNativeElementor(
      doc({
        id: "c",
        kind: "container",
        props: {},
        style: {
          layout: { display: "flex", flexDirection: "column" },
          box: { padding: "20px" },
          background: { color: "#fff" },
        },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "h",
            kind: "heading",
            props: { level: 1, text: "A" },
            style: { typography: { color: "#000", fontSize: "24px" } },
            provenance: { htmlTag: "h1", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.compliancePassed).toBe(true);
    expect(result.complianceViolations).toEqual([]);
    walkEl(result.document!.content[0]!, (el) => {
      expect(["container", "widget"]).toContain(el.elType);
      if (el.elType === "widget") {
        expect(el.widgetType).toBeTruthy();
      }
    });
  });
});
