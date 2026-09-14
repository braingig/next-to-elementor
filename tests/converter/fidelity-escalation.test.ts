/**
 * Generic fidelity: custom subtree styles, native→custom escalation, Free compliance.
 */

import { describe, expect, it } from "vitest";
import {
  convertSource,
  convertToElementor,
  elementorIdFromIrId,
  loadElementorFreeCatalog,
  resolveTailwindUtility,
  validateElementorDocument,
  type ElementorDocument,
  type IrDocument,
  type IrNode,
} from "@/lib/converter";
import { detectNativeFidelityGap } from "@/lib/converter/rules/native/fidelity";

function doc(root: IrNode): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "fidelity" },
    root,
    diagnostics: [],
  };
}

describe("native fidelity escalation", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  it("detects unequal grids, transforms, and gradients", () => {
    expect(
      detectNativeFidelityGap({
        id: "g",
        kind: "container",
        props: {},
        style: { layout: { gridTemplateColumns: "minmax(0,1fr)_auto" } },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [],
      })?.reasonCode,
    ).toBe("layout-unsupported");

    expect(
      detectNativeFidelityGap({
        id: "t",
        kind: "heading",
        props: { level: 1, text: "Hi" },
        style: { effects: { transform: "translateY(-4px)" } },
        provenance: { htmlTag: "h1", classNames: [], attributes: {} },
        children: [],
      })?.reasonCode,
    ).toBe("native-mapping-unavailable");

    expect(
      detectNativeFidelityGap({
        id: "b",
        kind: "container",
        props: {},
        style: {
          background: { image: "linear-gradient(to right, #000, #fff)" },
        },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [],
      })?.reasonCode,
    ).toBe("native-mapping-unavailable");
  });

  it("escalates transform nodes to Free HTML with scoped transform CSS", () => {
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
            props: { level: 2, text: "Tilt" },
            style: {
              effects: { transform: "rotate(-3deg)" },
              typography: { fontSize: "24px" },
            },
            provenance: { htmlTag: "h2", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("success");
    const htmlEl = result.document!.content[0]!.elements[0]!;
    expect(htmlEl.widgetType).toBe("html");
    const html = String(htmlEl.settings.html);
    expect(html).toContain("transform:rotate(-3deg)");
    expect(html).toContain("font-size:24px");
    expect(html).toContain("Tilt");
  });

  it("keeps simple native heading/button mappings unchanged", () => {
    const result = convertSource({
      source: `
        export default function Hero() {
          return (
            <section className="flex flex-col gap-4 p-8">
              <h1 className="text-3xl font-bold text-slate-900">Hello</h1>
              <p className="text-base text-slate-600">Body copy</p>
              <a role="button" href="/go" className="rounded bg-blue-600 px-4 py-2 text-white">Go</a>
            </section>
          );
        }
      `,
      catalogTarget: "4.2.4",
    });
    expect(result.elementorJson).not.toBeNull();
    const validation = validateElementorDocument(
      result.elementorJson as ElementorDocument,
      catalog,
    );
    expect(validation.passed).toBe(true);
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "heading" && n.decision === "native",
      ),
    ).toBe(true);
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "button" && n.decision === "native",
      ),
    ).toBe(true);
  });

  it("maps Tailwind translate utilities into IrStyle transform for custom CSS", () => {
    expect(resolveTailwindUtility("-translate-y-1")).toEqual({
      effects: { transform: "translateY(-0.25rem)" },
    });
    expect(resolveTailwindUtility("rotate-45")).toEqual({
      effects: { transform: "rotate(45deg)" },
    });
  });
});

describe("CSS module local class binding", () => {
  it("binds styles.title to .title declarations from module CSS", () => {
    const result = convertSource({
      source: `
        import styles from "./page.module.css";
        export default function Page() {
          return <h1 className={styles.title}>Modules</h1>;
        }
      `,
      css: [`.title { color: purple; font-size: 32px; }`],
      catalogTarget: "4.2.4",
    });
    expect(result.elementorJson).not.toBeNull();
    const doc = result.elementorJson as ElementorDocument;
    const heading = doc.content[0]!;
    // Either native heading with color, or custom with scoped CSS.
    const blob = JSON.stringify(doc);
    expect(blob).toMatch(/purple|#800080/i);
  });
});

describe("scoped custom CSS does not leak", () => {
  it("prefixes every rule with the fallback scope class", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    const result = convertToElementor(
      doc({
        id: "root",
        kind: "list",
        props: { listType: "ul" },
        style: { box: { padding: "10px" } },
        provenance: { htmlTag: "ul", classNames: [], attributes: {} },
        children: [
          {
            id: "c",
            kind: "list-item",
            props: { text: "Item" },
            style: { typography: { color: "red" } },
            provenance: { htmlTag: "li", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    const html = String(result.document!.content[0]!.settings.html);
    const scope = `nte-fb-${elementorIdFromIrId("root")}`;
    const styleMatch = html.match(/<style>([\s\S]*)<\/style>/);
    expect(styleMatch).toBeTruthy();
    const css = styleMatch![1]!;
    // Every selector must include the scope class.
    for (const rule of css.split("}").filter((r) => r.includes("{"))) {
      expect(rule).toContain(`.${scope}`);
    }
    expect(css).not.toMatch(/(^|})\s*(ul|li|p|div)\s*\{/);
  });
});
