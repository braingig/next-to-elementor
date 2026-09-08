import { describe, expect, it } from "vitest";
import {
  canonicalizeElementorJson,
  convertToElementor,
  convertToNativeElementor,
  elementorIdFromIrId,
  loadElementorFreeCatalog,
  serializeIrNodeHtml,
  serializeScopedCss,
  findUnsafeCustomPatterns,
  type IrDocument,
  type IrNode,
} from "@/lib/converter";

function doc(root: IrNode): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "fixture" },
    root,
    diagnostics: [],
  };
}

describe("Phase 6 custom fallback", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  it("keeps native siblings and falls back only the link node", () => {
    const result = convertToElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "h",
            kind: "heading",
            props: { level: 2, text: "Title" },
            provenance: { htmlTag: "h2", classNames: [], attributes: {} },
            children: [],
          },
          {
            id: "l",
            kind: "link",
            props: { href: "/docs", text: "Docs" },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
            children: [],
          },
          {
            id: "b",
            kind: "button",
            props: { text: "Go", href: "/go" },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );

    expect(result.outcome).toBe("success");
    expect(result.document!.content[0]!.elements).toHaveLength(3);

    const [heading, linkHtml, button] = result.document!.content[0]!.elements;
    expect(heading!.widgetType).toBe("heading");
    expect(linkHtml!.widgetType).toBe("html");
    expect(button!.widgetType).toBe("button");

    const html = String(linkHtml!.settings.html);
    const scope = `nte-fb-${elementorIdFromIrId("l")}`;
    expect(html).toContain(`class="${scope}"`);
    expect(html).toContain('href="/docs"');
    expect(html).toContain("Docs");
    expect(html).not.toContain("<script");

    expect(
      result.decisions.some((d) => d.irKind === "link" && d.strategy === "custom"),
    ).toBe(true);
    expect(
      result.decisions.some(
        (d) => d.irKind === "heading" && d.strategy === "native",
      ),
    ).toBe(true);
    expect(result.decisions.every((d) => d.strategy !== "needs-fallback")).toBe(
      true,
    );
  });

  it("does not convert the whole container to custom when one child needs fallback", () => {
    const result = convertToElementor(
      doc({
        id: "section",
        kind: "container",
        props: { as: "section" },
        provenance: { htmlTag: "section", classNames: [], attributes: {} },
        children: [
          {
            id: "l",
            kind: "link",
            props: { href: "#x", text: "X" },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );

    expect(result.document!.content[0]!.elType).toBe("container");
    expect(result.document!.content[0]!.widgetType).toBeUndefined();
    expect(result.document!.content[0]!.elements[0]!.widgetType).toBe("html");
  });

  it("Phase 5 native API still defers links without custom upgrade", () => {
    const native = convertToNativeElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "l",
            kind: "link",
            props: { href: "/a", text: "A" },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(native.document!.content[0]!.elements).toHaveLength(0);
    expect(
      native.decisions.some(
        (d) => d.irKind === "link" && d.strategy === "needs-fallback",
      ),
    ).toBe(true);
  });

  it("emits scoped CSS only for the fallback node styles", () => {
    const result = convertToElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        style: { box: { padding: "40px" } },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "l",
            kind: "link",
            props: { href: "/x", text: "Styled" },
            style: {
              typography: { color: "#112233", fontSize: "18px" },
              responsive: {
                sm: { typography: { fontSize: "14px" } },
              },
            },
            provenance: { htmlTag: "a", classNames: ["nav-link"], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );

    const html = String(result.document!.content[0]!.elements[0]!.settings.html);
    const scope = `nte-fb-${elementorIdFromIrId("l")}`;
    expect(html).toContain(`<style>.${scope}{`);
    expect(html).toContain("color:#112233");
    expect(html).toContain("font-size:18px");
    expect(html).toContain(`@media (max-width: 767px){.${scope}{font-size:14px}}`);
    expect(html).not.toContain("padding:40px");
    expect(html).toContain("nav-link");
  });

  it("falls back SVG icons via html widget", () => {
    const result = convertToElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "ico",
            kind: "icon",
            props: { svg: "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0h10v10H0z\"/></svg>" },
            provenance: { htmlTag: "span", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("success");
    const html = String(result.document!.content[0]!.elements[0]!.settings.html);
    expect(html).toContain("<svg");
    expect(
      result.decisions.some((d) => d.irKind === "icon" && d.strategy === "custom"),
    ).toBe(true);
  });

  it("falls back lists as nested HTML", () => {
    const result = convertToElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "ul",
            kind: "list",
            props: { listType: "ul" },
            provenance: { htmlTag: "ul", classNames: [], attributes: {} },
            children: [
              {
                id: "li1",
                kind: "list-item",
                props: { text: "One" },
                provenance: { htmlTag: "li", classNames: [], attributes: {} },
                children: [],
              },
              {
                id: "li2",
                kind: "list-item",
                props: { text: "Two & Three" },
                provenance: { htmlTag: "li", classNames: [], attributes: {} },
                children: [],
              },
            ],
          },
        ],
      }),
      { catalog },
    );
    const html = String(result.document!.content[0]!.elements[0]!.settings.html);
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("One");
    expect(html).toContain("Two &amp; Three");
  });

  it("marks unsafe javascript: links unsupported", () => {
    const result = convertToElementor(
      doc({
        id: "wrap",
        kind: "container",
        props: {},
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [
          {
            id: "bad",
            kind: "link",
            props: { href: "javascript:alert(1)", text: "Bad" },
            provenance: { htmlTag: "a", classNames: [], attributes: {} },
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
    expect(result.outcome).toBe("partial");
    expect(result.document!.content[0]!.elements).toHaveLength(1);
    expect(result.document!.content[0]!.elements[0]!.widgetType).toBe("heading");
    expect(
      result.decisions.some(
        (d) =>
          d.irKind === "link" &&
          d.strategy === "unsupported" &&
          d.reasonCode === "unsafe-custom",
      ),
    ).toBe(true);
  });

  it("marks script-bearing embeds unsafe when forced through custom", () => {
    expect(
      findUnsafeCustomPatterns({ html: '<div onclick="x()">x</div>' }),
    ).toMatch(/event-handler/i);
  });

  it("serializes HTML deterministically", () => {
    const node: IrNode = {
      id: "l",
      kind: "link",
      props: { href: "/z", text: "Z", target: "_blank", rel: "noopener" },
      provenance: {
        htmlTag: "a",
        classNames: ["b", "a"],
        attributes: { "data-x": "1", "aria-label": "Z" },
      },
      children: [],
    };
    const a = serializeIrNodeHtml(node, "nte-fb-scope");
    const b = serializeIrNodeHtml(node, "nte-fb-scope");
    expect(a).toBe(b);
    // class tokens sorted; attributes sorted
    expect(a).toBe(
      '<a aria-label="Z" class="a b nte-fb-scope" data-x="1" href="/z" rel="noopener" target="_blank">Z</a>',
    );
  });

  it("scoped CSS serializer is deterministic", () => {
    const css = serializeScopedCss("nte-fb-x", {
      typography: { color: "red", fontSize: "12px" },
      box: { padding: "8px" },
    });
    expect(css).toBe(
      serializeScopedCss("nte-fb-x", {
        typography: { color: "red", fontSize: "12px" },
        box: { padding: "8px" },
      }),
    );
    expect(css.startsWith(".nte-fb-x{")).toBe(true);
  });

  it("full document emit is deterministic", () => {
    const ir = doc({
      id: "wrap",
      kind: "container",
      props: {},
      provenance: { htmlTag: "div", classNames: [], attributes: {} },
      children: [
        {
          id: "l",
          kind: "link",
          props: { href: "/d", text: "D" },
          provenance: { htmlTag: "a", classNames: [], attributes: {} },
          children: [],
        },
      ],
    });
    const a = convertToElementor(ir, { catalog, title: "T" });
    const b = convertToElementor(ir, { catalog, title: "T" });
    expect(canonicalizeElementorJson(a.document!)).toBe(
      canonicalizeElementorJson(b.document!),
    );
  });

  it("falls back uncertain groups without promoting parent container", () => {
    const result = convertToElementor(
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
            props: {},
            provenance: { htmlTag: "div", classNames: ["card"], attributes: {} },
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
    expect(result.document!.content[0]!.elType).toBe("container");
    expect(result.document!.content[0]!.elements[0]!.widgetType).toBe("html");
    expect(String(result.document!.content[0]!.elements[0]!.settings.html)).toContain(
      "Inside",
    );
    expect(
      result.decisions.some((d) => d.irKind === "group" && d.strategy === "custom"),
    ).toBe(true);
  });
});
