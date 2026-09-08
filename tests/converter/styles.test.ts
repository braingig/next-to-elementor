import { describe, expect, it } from "vitest";
import {
  STYLE_MERGE_PRECEDENCE,
  analyzeReactSource,
  canonicalizeIrJson,
  parseCssSources,
  resolveInlineStyleRaw,
  resolveStyles,
  resolveTailwindClasses,
  type IrDocument,
} from "@/lib/converter";

function baseDoc(overrides?: Partial<IrDocument>): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "test" },
    root: {
      id: "root",
      kind: "container",
      status: "ok",
      props: { as: "div" },
      style: {},
      provenance: {
        htmlTag: "div",
        classNames: ["hero"],
        attributes: { id: "main" },
      },
      notes: [],
      children: [
        {
          id: "title",
          kind: "heading",
          status: "ok",
          props: { level: 1, text: "Hello" },
          style: {},
          provenance: {
            htmlTag: "h1",
            classNames: ["hero-title"],
            attributes: {},
          },
          notes: [],
          children: [],
        },
      ],
    },
    diagnostics: [],
    ...overrides,
  };
}

describe("resolveStyles Phase 4", () => {
  it("documents merge precedence order", () => {
    expect(STYLE_MERGE_PRECEDENCE).toEqual(["tailwind", "css", "inline"]);
  });

  it("resolves class-based CSS onto matching nodes", () => {
    const { document } = resolveStyles(baseDoc(), {
      css: `
        .hero { display: flex; gap: 16px; padding: 24px; }
        .hero-title { color: #0f766e; font-size: 32px; }
      `,
      resolveTailwind: false,
    });
    expect(document.root.style?.layout?.display).toBe("flex");
    expect(document.root.style?.layout?.gap).toBe("16px");
    expect(document.root.style?.box?.padding).toBe("24px");
    const title = document.root.children[0]!;
    expect(title.style?.typography?.color).toBe("#0f766e");
    expect(title.style?.typography?.fontSize).toBe("32px");
  });

  it("supports element, id, grouped, and descendant selectors", () => {
    const { document } = resolveStyles(baseDoc(), {
      css: `
        div { overflow: hidden; }
        #main { max-width: 960px; }
        h1, .hero-title { font-weight: 700; }
        .hero h1 { letter-spacing: 0.02em; }
      `,
      resolveTailwind: false,
    });
    expect(document.root.style?.layout?.overflow).toBe("hidden");
    expect(document.root.style?.box?.maxWidth).toBe("960px");
    const title = document.root.children[0]!;
    expect(title.style?.typography?.fontWeight).toBe("700");
    expect(title.style?.typography?.letterSpacing).toBe("0.02em");
  });

  it("maps media queries into responsive IR breakpoints", () => {
    const { document } = resolveStyles(baseDoc(), {
      css: `
        .hero { flex-direction: row; }
        @media (max-width: 767px) {
          .hero { flex-direction: column; }
        }
      `,
      resolveTailwind: false,
    });
    expect(document.root.style?.layout?.flexDirection).toBe("row");
    expect(document.root.style?.responsive?.sm?.layout?.flexDirection).toBe(
      "column",
    );
  });

  it("resolves safe custom properties and warns on unresolved vars", () => {
    const { document } = resolveStyles(baseDoc(), {
      css: `
        :root { --brand: #0f766e; }
        .hero-title { color: var(--brand); background-color: var(--missing, #fff); }
        .hero { color: var(--unset-only); }
      `,
      resolveTailwind: false,
    });
    const title = document.root.children[0]!;
    expect(title.style?.typography?.color).toBe("#0f766e");
    expect(title.style?.background?.color).toBe("#fff");
    expect(
      document.diagnostics.some((d) =>
        d.message.includes("Custom property could not be resolved"),
      ),
    ).toBe(true);
  });

  it("does not apply hover/focus pseudo selectors; emits diagnostics", () => {
    const { document } = resolveStyles(baseDoc(), {
      css: `.hero:hover { color: red; }`,
      resolveTailwind: false,
    });
    expect(document.root.style?.typography?.color).toBeUndefined();
    expect(
      document.diagnostics.some((d) => d.message.includes("pseudo-state")),
    ).toBe(true);
  });

  it("resolves curated Tailwind utilities including responsive variants", () => {
    const doc = baseDoc({
      root: {
        id: "root",
        kind: "container",
        status: "ok",
        props: { as: "div" },
        style: {},
        provenance: {
          htmlTag: "div",
          classNames: ["flex", "gap-4", "p-6", "bg-white", "md:flex-col"],
          attributes: {},
        },
        notes: [],
        children: [],
      },
    });
    const { document } = resolveStyles(doc, { css: [], resolveInline: false });
    expect(document.root.style?.layout?.display).toBe("flex");
    expect(document.root.style?.layout?.gap).toBe("1rem");
    expect(document.root.style?.box?.padding).toBe("1.5rem");
    expect(document.root.style?.background?.color).toBe("#ffffff");
    expect(document.root.style?.responsive?.md?.layout?.flexDirection).toBe(
      "column",
    );
  });

  it("warns on unknown Tailwind classes without inventing values", () => {
    const result = resolveTailwindClasses(["flex", "shadow-mystery"]);
    expect(result.style.layout?.display).toBe("flex");
    expect(result.unknown).toEqual(["shadow-mystery"]);

    const doc = baseDoc({
      root: {
        ...baseDoc().root,
        provenance: {
          htmlTag: "div",
          classNames: ["shadow-mystery"],
          attributes: {},
        },
        children: [],
      },
    });
    const { document } = resolveStyles(doc, { css: [] });
    expect(
      document.diagnostics.some((d) => d.code === "unknown-tailwind-class"),
    ).toBe(true);
    expect(document.root.style?.effects?.boxShadow).toBeUndefined();
  });

  it("resolves inline styles from provenance.inlineStyleRaw", () => {
    const inline = resolveInlineStyleRaw(
      "color:#0f172a;font-size:18px;background-color:#f8fafc;padding:8px 12px",
    );
    expect(inline.style.typography?.color).toBe("#0f172a");
    expect(inline.style.typography?.fontSize).toBe("18px");
    expect(inline.style.background?.color).toBe("#f8fafc");
    expect(inline.style.box?.padding).toBe("8px 12px");
  });

  it("applies merge precedence: inline > css > tailwind", () => {
    const doc: IrDocument = {
      version: "0.2.0",
      meta: { sourceLanguage: "tsx" },
      diagnostics: [],
      root: {
        id: "n",
        kind: "text",
        status: "ok",
        props: { text: "x" },
        style: {},
        provenance: {
          htmlTag: "p",
          classNames: ["text-xl", "title"],
          attributes: {},
          inlineStyleRaw: "font-size:11px",
        },
        notes: [],
        children: [],
      },
    };
    const { document } = resolveStyles(doc, {
      css: `.title { font-size: 20px; color: #111; }`,
    });
    // Tailwind text-xl = 1.25rem, CSS = 20px, inline = 11px → inline wins
    expect(document.root.style?.typography?.fontSize).toBe("11px");
    expect(document.root.style?.typography?.color).toBe("#111");
  });

  it("is deterministic for the same IR + CSS", () => {
    const doc = baseDoc();
    const css = `.hero { display: flex; } .hero-title { color: #123; }`;
    const a = resolveStyles(doc, { css });
    const b = resolveStyles(doc, { css });
    expect(canonicalizeIrJson(a.document)).toBe(canonicalizeIrJson(b.document));
  });

  it("integrates with Phase 3 analyzer output", () => {
    const source = `
      export default function Hero() {
        return (
          <div className="flex gap-4 p-6 bg-white md:flex-col">
            <h1 className="hero-title text-2xl font-bold">Welcome</h1>
          </div>
        );
      }
    `;
    const { document: ir } = analyzeReactSource(source, {
      sourcePath: "Hero.tsx",
    });
    const { document } = resolveStyles(ir, {
      css: `.hero-title { color: #0f766e; }`,
    });
    expect(document.root.style?.layout?.display).toBe("flex");
    expect(document.root.children[0]?.style?.typography?.fontSize).toBe("1.5rem");
    expect(document.root.children[0]?.style?.typography?.fontWeight).toBe("700");
    expect(document.root.children[0]?.style?.typography?.color).toBe("#0f766e");
    expect(JSON.stringify(document)).not.toMatch(/"widgetType"/);
  });

  it("parseCssSources reports malformed CSS without throwing", () => {
    const parsed = parseCssSources([`{ broken`]);
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(parsed.rules).toEqual([]);
  });
});
