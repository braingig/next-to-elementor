import { describe, expect, it } from "vitest";
import {
  convertSource,
  isButtonLikeLink,
  loadElementorFreeCatalog,
  type ElementorDocument,
  type IrNode,
} from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");

function findWidgets(
  doc: ElementorDocument,
  type: string,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (els: ElementorDocument["content"]) => {
    for (const el of els) {
      if (el.widgetType === type) out.push(el.settings);
      if (el.elements?.length) walk(el.elements);
    }
  };
  walk(doc.content);
  return out;
}

function findHtml(doc: ElementorDocument): string[] {
  return findWidgets(doc, "html").map((s) => String(s.html ?? ""));
}

describe("button-like <a> → Free Button", () => {
  it("normal text link remains custom HTML", () => {
    const result = convertSource({
      language: "tsx",
      catalog,
      source: `export function Nav() {
  return <a href="/pricing" className="text-sm font-medium text-slate-600">Pricing</a>;
}`,
    });
    expect(result.elementorJson).not.toBeNull();
    const doc = result.elementorJson as ElementorDocument;
    expect(findWidgets(doc, "button")).toHaveLength(0);
    expect(findHtml(doc).some((h) => h.includes('href="/pricing"'))).toBe(true);
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "link" && n.decision === "custom",
      ),
    ).toBe(true);
  });

  it("filled CTA link becomes native Button and preserves href", () => {
    const result = convertSource({
      language: "tsx",
      catalog,
      source: `export function Cta() {
  return (
    <a
      href="/get-started"
      className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white"
    >
      Get Started
    </a>
  );
}`,
    });
    const buttons = findWidgets(result.elementorJson as ElementorDocument, "button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.text).toBe("Get Started");
    expect(buttons[0]!.link).toMatchObject({ url: "/get-started" });
    expect(buttons[0]!.background_color).toBe("#0d9488");
    expect(buttons[0]!.button_text_color).toBe("#ffffff");
    expect(
      result.report.nodes.some(
        (n) =>
          n.irKind === "link" &&
          n.decision === "native" &&
          n.widgetType === "button",
      ),
    ).toBe(true);
  });

  it("outlined CTA link becomes native Button", () => {
    const result = convertSource({
      language: "tsx",
      catalog,
      source: `export function Cta() {
  return (
    <a
      href="/demo"
      className="rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-center font-semibold text-slate-700"
    >
      Book a Demo
    </a>
  );
}`,
    });
    const buttons = findWidgets(result.elementorJson as ElementorDocument, "button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.text).toBe("Book a Demo");
    expect(buttons[0]!.link).toMatchObject({ url: "/demo" });
  });

  it('a role="button" still becomes native Button', () => {
    const result = convertSource({
      language: "tsx",
      catalog,
      source: `export function Cta() {
  return (
    <a role="button" href="/start" className="bg-teal-600 text-white px-5 py-3 rounded-lg">
      Start
    </a>
  );
}`,
    });
    const buttons = findWidgets(result.elementorJson as ElementorDocument, "button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.link).toMatchObject({ url: "/start" });
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "button" && n.decision === "native",
      ),
    ).toBe(true);
  });

  it("ambiguous styled link without chrome stays Custom HTML", () => {
    const result = convertSource({
      language: "tsx",
      catalog,
      source: `export function More() {
  return (
    <a href="/features/org" className="mt-5 inline-block font-semibold text-teal-700">
      Learn more →
    </a>
  );
}`,
    });
    const doc = result.elementorJson as ElementorDocument;
    expect(findWidgets(doc, "button")).toHaveLength(0);
    expect(findHtml(doc).some((h) => h.includes("Learn more"))).toBe(true);
  });

  it("isButtonLikeLink requires padding plus fill or box border", () => {
    const base = {
      id: "l",
      kind: "link" as const,
      status: "ok" as const,
      props: { href: "/x", text: "Go" },
      provenance: { htmlTag: "a", classNames: [], attributes: {} },
      notes: [],
      children: [],
    };

    expect(
      isButtonLikeLink({
        ...base,
        style: {
          background: { color: "#0d9488" },
          box: { paddingLeft: "1.25rem", paddingRight: "1.25rem", paddingTop: "0.625rem", paddingBottom: "0.625rem" },
        },
      } as IrNode),
    ).toBe(true);

    expect(
      isButtonLikeLink({
        ...base,
        style: {
          typography: { fontWeight: "600", color: "#0f766e" },
          layout: { display: "inline-block" },
        },
      } as IrNode),
    ).toBe(false);

    expect(
      isButtonLikeLink({
        ...base,
        style: {
          border: { width: "0 0 1px 0", style: "solid", color: "#e2e8f0" },
          box: { paddingTop: "0.5rem", paddingBottom: "0.5rem" },
        },
      } as IrNode),
    ).toBe(false);
  });
});
