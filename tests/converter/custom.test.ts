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

  it("emits scoped CSS for fallback node styles with mobile-first media queries", () => {
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
    expect(html).toContain(
      `@media (min-width: 640px){.${scope}{font-size:14px}}`,
    );
    expect(html).not.toContain("padding:40px");
    // Dead Tailwind/utility class names are stripped; styles come from scoped CSS.
    expect(html).not.toContain("nav-link");
    expect(html).toContain(`class="${scope}"`);
  });

  it("preserves child IrStyle facts inside a custom fallback subtree", () => {
    const result = convertToElementor(
      doc({
        id: "nav",
        kind: "list",
        props: { listType: "ul" },
        style: {
          layout: {
            display: "flex",
            flexDirection: "row",
            gap: "1rem",
          },
        },
        provenance: {
          htmlTag: "ul",
          classNames: ["flex", "gap-4"],
          attributes: {},
        },
        children: [
          {
            id: "li1",
            kind: "list-item",
            props: { text: "A" },
            style: { typography: { color: "#111111", fontSize: "14px" } },
            provenance: {
              htmlTag: "li",
              classNames: ["text-sm"],
              attributes: {},
            },
            children: [],
          },
          {
            id: "li2",
            kind: "list-item",
            props: { text: "B" },
            style: {
              typography: { color: "#222222", fontWeight: "600" },
              box: { padding: "8px" },
              responsive: {
                md: { typography: { fontSize: "16px" } },
              },
            },
            provenance: {
              htmlTag: "li",
              classNames: ["font-semibold", "p-2"],
              attributes: {},
            },
            children: [],
          },
        ],
      }),
      { catalog },
    );

    expect(result.outcome).toBe("success");
    // List is the document root → Free HTML widget at content[0].
    const html = String(result.document!.content[0]!.settings.html);
    const rootScope = `nte-fb-${elementorIdFromIrId("nav")}`;
    const c1 = `${rootScope}__${elementorIdFromIrId("li1")}`;
    const c2 = `${rootScope}__${elementorIdFromIrId("li2")}`;

    expect(html).toContain(`class="${rootScope}"`);
    expect(html).toContain(`class="${c1}"`);
    expect(html).toContain(`class="${c2}"`);
    expect(html).toContain(`.${rootScope}{`);
    expect(html).toContain("display:flex");
    expect(html).toContain("gap:1rem");
    expect(html).toContain(`.${c1}{`);
    expect(html).toContain("color:#111111");
    expect(html).toContain("font-size:14px");
    expect(html).toContain(`.${c2}{`);
    expect(html).toContain("color:#222222");
    expect(html).toContain("padding:8px");
    expect(html).toContain(
      `@media (min-width: 768px){.${c2}{font-size:16px}}`,
    );
    expect(html).not.toContain("text-sm");
    expect(html).not.toContain("font-semibold");
    expect(html).not.toContain("gap-4");
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
            props: {
              svg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>',
            },
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
          d.reasonCode === "unsafe-url",
      ),
    ).toBe(true);
  });

  it("marks script-bearing embeds unsafe when forced through custom", () => {
    expect(
      findUnsafeCustomPatterns({ html: '<div onclick="x()">x</div>' })?.code,
    ).toBe("unsafe-html");
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
    // Scope class only — original utility classes stripped; attributes sorted
    expect(a).toBe(
      '<a aria-label="Z" class="nte-fb-scope" data-x="1" href="/z" rel="noopener" target="_blank">Z</a>',
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
