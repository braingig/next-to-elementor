/**
 * Fidelity regressions: dynamic class recovery, custom CSS emission,
 * fixed overlay escalation, theme colors in HTML widget.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSource,
  convertToElementor,
  elementorIdFromIrId,
  loadElementorFreeCatalog,
  resolveStyles,
  resolveTailwindUtility,
  validateElementorDocument,
  type ElementorDocument,
  type ElementorElement,
  type IrDocument,
  type IrNode,
} from "@/lib/converter";
import { extractPartialStaticClassNames } from "@/lib/converter/parse/analyze/static-value";
import { parse as parseBabel } from "@babel/parser";

function walk(
  els: ElementorElement[] | undefined,
  visit: (el: ElementorElement) => void,
) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

function htmlWidgets(doc: ElementorDocument): string[] {
  const out: string[] = [];
  walk(doc.content, (el) => {
    if (el.widgetType === "html") out.push(String(el.settings.html ?? ""));
  });
  return out;
}

function doc(root: IrNode): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "fidelity" },
    root,
    diagnostics: [],
  };
}

describe("partial static className recovery", () => {
  it("keeps static prefix + both ternary arms from template className", () => {
    const ast = parseBabel(
      "(`fixed inset-x-0 top-0 z-50 ${solid ? \"bg-background/95\" : \"bg-transparent\"}`)",
      { plugins: ["jsx", "typescript"] },
    );
    const expr = (ast.program.body[0] as { expression: import("@babel/types").Node })
      .expression;
    const { tokens, partial } = extractPartialStaticClassNames(expr);
    expect(partial).toBe(true);
    expect(tokens).toEqual(
      expect.arrayContaining([
        "fixed",
        "inset-x-0",
        "top-0",
        "z-50",
        "bg-transparent",
      ]),
    );
    expect(tokens).not.toContain("bg-background/95");
  });

  it("analyzeReactSource recovers fixed + overlay classes from scroll ternary", () => {
    const analyzed = analyzeReactSource(
      `
      export function Header() {
        const solid = false;
        return (
          <header
            className={\`fixed inset-x-0 top-0 z-50 isolate \${
              solid ? "bg-background/95" : "bg-transparent"
            }\`}
          >
            <a href="#x" className={\`text-sm \${solid ? "text-foreground/80" : "text-evergreen-foreground/90"}\`}>Nav</a>
          </header>
        );
      }
    `,
      { language: "tsx" },
    );
    const root = analyzed.document.root;
    expect(root.provenance?.classNames).toEqual(
      expect.arrayContaining(["fixed", "inset-x-0", "top-0", "z-50", "isolate"]),
    );
    expect(root.provenance?.classNames).toEqual(
      expect.arrayContaining(["bg-transparent"]),
    );
    const link = root.children.find((c) => c.kind === "link");
    expect(link?.provenance?.classNames).toEqual(
      expect.arrayContaining(["text-sm", "text-evergreen-foreground/90"]),
    );
  });
});

describe("custom HTML widget includes scoped CSS that styles children", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");
  const themeCss = `
    @theme inline {
      --color-evergreen-foreground: oklch(0.97 0.01 95);
    }
    :root {
      --evergreen-foreground: oklch(0.97 0.01 95);
      --color-evergreen-foreground: var(--evergreen-foreground);
    }
    @utility garland-wire {
      position: absolute;
      inset-inline: 0;
      top: 0;
      height: 2px;
      background: linear-gradient(to right, transparent, oklch(0.55 0.03 150 / 0.85) 50%, transparent);
    }
  `;

  it("emits child color/background/typography inside HTML widget <style>", () => {
    const result = convertSource({
      source: `
        export function Bar() {
          return (
            <header className="fixed inset-x-0 top-0 z-50 bg-transparent isolate">
              <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                <span className="inline-flex rounded-xl border border-white/80 bg-white/95 px-2 py-1.5">
                  <img src="/logo.png" alt="Logo" className="h-12 w-auto" />
                </span>
                <nav className="flex items-center gap-7">
                  <a href="#a" className="text-sm font-medium text-evergreen-foreground/90">Services</a>
                  <a href="tel:+1" className="rounded-full border border-evergreen-foreground/35 bg-evergreen-foreground/10 px-4 py-2 text-sm font-semibold text-evergreen-foreground">Call</a>
                </nav>
              </div>
              <div className="garland-wire" />
            </header>
          );
        }
      `,
      css: themeCss,
      catalogTarget: "4.2.4",
    });
    expect(result.elementorJson).not.toBeNull();
    const validation = validateElementorDocument(
      result.elementorJson as ElementorDocument,
      catalog,
    );
    expect(validation.passed).toBe(true);

    const htmls = htmlWidgets(result.elementorJson as ElementorDocument);
    expect(htmls.length).toBeGreaterThanOrEqual(1);
    const joined = htmls.join("\n");
    expect(joined).toContain("<style>");
    // Fixed overlay semantics in scoped CSS
    expect(joined).toMatch(/position:\s*fixed/);
    expect(joined).toMatch(/z-index:\s*50/);
    // Nav / CTA colors
    expect(joined).toMatch(/color:\s*rgba?\(/);
    expect(joined).toMatch(/background-color:\s*rgba?\(/);
    // Logo wrapper
    expect(joined).toMatch(/border-radius:\s*0\.75rem/);
    // Garland wire from @utility
    expect(joined).toMatch(/background-image:\s*linear-gradient/);
    expect(joined).toMatch(/height:\s*2px/);
  });

  it("escalates fixed overlay nodes to custom rather than native approximation", () => {
    const result = convertToElementor(
      doc({
        id: "h",
        kind: "container",
        props: { as: "header" },
        style: {
          position: {
            position: "fixed",
            top: "0px",
            left: "0px",
            right: "0px",
            zIndex: "50",
          },
          background: { color: "transparent" },
        },
        provenance: { htmlTag: "header", classNames: [], attributes: {} },
        children: [
          {
            id: "t",
            kind: "text",
            props: { text: "Hi" },
            style: { typography: { color: "#f7f5ee" } },
            provenance: { htmlTag: "p", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.decisions[0]?.strategy).toBe("custom");
    const html = String(result.document!.content[0]!.settings.html);
    expect(html).toContain("position:fixed");
    expect(html).toContain("color:#f7f5ee");
    expect(html).toContain("<style>");
  });
});

describe("tailwind fidelity utilities", () => {
  it("maps backdrop-blur, isolate, and arbitrary shadows", () => {
    expect(resolveTailwindUtility("isolate")).toEqual({
      effects: { isolation: "isolate" },
    });
    expect(resolveTailwindUtility("backdrop-blur-sm")).toEqual({
      effects: { backdropFilter: "blur(4px)" },
    });
    expect(
      resolveTailwindUtility("shadow-[0_12px_40px_-12px_oklch(0.16_0.04_162/0.6)]"),
    ).toEqual({
      effects: {
        boxShadow: "0 12px 40px -12px oklch(0.16 0.04 162/0.6)",
      },
    });
  });
});
