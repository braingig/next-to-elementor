/**
 * Hybrid native/custom boundary: parent custom must not absorb native siblings.
 */

import { describe, expect, it } from "vitest";
import {
  convertSource,
  convertToElementor,
  loadElementorFreeCatalog,
  type ElementorDocument,
  type ElementorElement,
  type IrDocument,
  type IrNode,
} from "@/lib/converter";
import {
  detectAbsoluteClusterFidelityGap,
  detectNativeFidelityGap,
} from "@/lib/converter/rules/native/fidelity";

function doc(root: IrNode): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "hybrid" },
    root,
    diagnostics: [],
  };
}

function walk(
  els: ElementorElement[] | undefined,
  visit: (el: ElementorElement) => void,
) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

function countWidgets(doc: ElementorDocument): Record<string, number> {
  const out: Record<string, number> = {};
  walk(doc.content, (el) => {
    const key =
      el.elType === "widget"
        ? `widget:${el.widgetType ?? "?"}`
        : (el.elType ?? "?");
    out[key] = (out[key] ?? 0) + 1;
  });
  return out;
}

describe("hybrid native/custom boundary", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  it("keeps simple heading, text, image, button, and container native", () => {
    const result = convertSource({
      source: `
        export default function Block() {
          return (
            <section className="flex flex-col gap-4 p-8 bg-white">
              <h1 className="text-3xl font-bold text-slate-900">Title</h1>
              <p className="text-base text-slate-600">Body copy here.</p>
              <img src="https://cdn.example.com/a.png" alt="A" className="h-24 w-auto" />
              <a role="button" href="/go" className="rounded bg-blue-600 px-4 py-2 text-white font-semibold">Go</a>
            </section>
          );
        }
      `,
      catalogTarget: "4.2.4",
    });
    expect(result.report.summary.nativeCount).toBeGreaterThanOrEqual(4);
    expect(result.report.summary.customCount).toBe(0);
    const kinds = Object.fromEntries(
      ["heading", "text", "image", "button", "container"].map((k) => [
        k,
        result.report.nodes.filter(
          (n) => n.irKind === k && n.decision === "native",
        ).length,
      ]),
    );
    expect(kinds.heading).toBeGreaterThanOrEqual(1);
    expect(kinds.text).toBeGreaterThanOrEqual(1);
    expect(kinds.image).toBeGreaterThanOrEqual(1);
    expect(kinds.button).toBeGreaterThanOrEqual(1);
    expect(kinds.container).toBeGreaterThanOrEqual(1);
  });

  it("does not escalate for isolation alone", () => {
    expect(
      detectNativeFidelityGap({
        id: "s",
        kind: "container",
        props: { as: "section" },
        style: {
          position: { position: "relative" },
          effects: { isolation: "isolate" },
        },
        provenance: { htmlTag: "section", classNames: ["isolate"], attributes: {} },
        children: [],
      }),
    ).toBeNull();
  });

  it("still escalates backdrop-filter nodes", () => {
    expect(
      detectNativeFidelityGap({
        id: "b",
        kind: "container",
        props: {},
        style: { effects: { backdropFilter: "blur(12px)" } },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [],
      })?.reasonCode,
    ).toBe("native-mapping-unavailable");
  });

  it("fixed chrome siblings do not force page-root absolute-cluster escalation", () => {
    const gap = detectAbsoluteClusterFidelityGap([
      {
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
        },
        provenance: { htmlTag: "header", classNames: [], attributes: {} },
        children: [],
      },
      {
        id: "m",
        kind: "container",
        props: { as: "main" },
        provenance: { htmlTag: "main", classNames: [], attributes: {} },
        children: [
          {
            id: "t",
            kind: "heading",
            props: { level: 1, text: "Hi" },
            provenance: { htmlTag: "h1", classNames: [], attributes: {} },
            children: [],
          },
        ],
      },
      {
        id: "bar",
        kind: "container",
        props: {},
        style: {
          position: {
            position: "fixed",
            bottom: "0px",
            left: "0px",
            right: "0px",
            zIndex: "40",
          },
        },
        provenance: { htmlTag: "div", classNames: [], attributes: {} },
        children: [],
      },
    ]);
    expect(gap).toBeNull();
  });

  it("absolute decoration does not convert native heading/button siblings to custom", () => {
    const result = convertSource({
      source: `
        export default function Hero() {
          return (
            <section className="relative isolate overflow-hidden py-20">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-slate-900/40" aria-hidden />
              <h1 className="text-4xl font-bold text-white">Hero</h1>
              <p className="text-lg text-white/80">Subtitle</p>
              <a role="button" href="#c" className="rounded-full bg-red-600 px-5 py-2 text-white font-semibold">CTA</a>
            </section>
          );
        }
      `,
      catalogTarget: "4.2.4",
    });
    expect(result.elementorJson).not.toBeNull();
    const counts = countWidgets(result.elementorJson as ElementorDocument);
    expect(counts["container"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts["widget:heading"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(
      (counts["widget:button"] ?? 0) + (counts["widget:html"] ?? 0),
    ).toBeGreaterThanOrEqual(1);

    const heading = result.report.nodes.find((n) => n.irKind === "heading");
    expect(heading?.decision).toBe("native");
    const absorbedHeading = result.report.nodes.find(
      (n) =>
        n.irKind === "heading" &&
        (n.message ?? "").startsWith("Included in parent custom HTML"),
    );
    expect(absorbedHeading).toBeUndefined();
  });

  it("genuinely unsupported transform still escalates that node only", () => {
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
            props: { level: 2, text: "Plain" },
            provenance: { htmlTag: "h2", classNames: [], attributes: {} },
            children: [],
          },
          {
            id: "t",
            kind: "heading",
            props: { level: 2, text: "Tilt" },
            style: { effects: { transform: "rotate(-3deg)" } },
            provenance: { htmlTag: "h2", classNames: [], attributes: {} },
            children: [],
          },
        ],
      }),
      { catalog },
    );
    expect(result.outcome).toBe("success");
    const root = result.document!.content[0]!;
    expect(root.elType).toBe("container");
    const widgets = root.elements ?? [];
    expect(widgets.some((w) => w.widgetType === "heading")).toBe(true);
    expect(widgets.some((w) => w.widgetType === "html")).toBe(true);
  });

  it("gradient section peels paint layer; heading/text/button/image stay native widgets", () => {
    const result = convertSource({
      source: `
        export default function Feature() {
          return (
            <section
              className="relative overflow-hidden py-20"
              style={{
                backgroundColor: "#0f172a",
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12), transparent 40%)",
              }}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-300">Badge</span>
              <h2 className="text-3xl font-bold text-white">Feature title</h2>
              <p className="text-base text-white/80">Supporting paragraph copy.</p>
              <a role="button" href="#go" className="rounded-full bg-red-600 px-5 py-2 text-white font-semibold">Get started</a>
              <img src="https://cdn.example.com/hero.png" alt="Hero" className="h-40 w-auto" />
            </section>
          );
        }
      `,
      catalogTarget: "4.2.4",
    });
    expect(result.elementorJson).not.toBeNull();
    const counts = countWidgets(result.elementorJson as ElementorDocument);
    expect(counts.container ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts["widget:heading"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts["widget:text-editor"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts["widget:button"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts["widget:image"] ?? 0).toBeGreaterThanOrEqual(1);
    // Decorative paint only — not the whole section as one HTML blob.
    expect(counts["widget:html"] ?? 0).toBeGreaterThanOrEqual(1);

    const section = result.report.nodes.find(
      (n) => n.irKind === "container" && n.provenance?.htmlTag === "section",
    );
    expect(section?.decision).toBe("native");
    expect(
      result.report.nodes.find(
        (n) =>
          n.irKind === "heading" &&
          (n.message ?? "").startsWith("Included in parent custom HTML"),
      ),
    ).toBeUndefined();
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "heading" && n.decision === "native",
      ),
    ).toBe(true);
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "text" && n.decision === "native",
      ),
    ).toBe(true);
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "button" && n.decision === "native",
      ),
    ).toBe(true);
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "image" && n.decision === "native",
      ),
    ).toBe(true);

    const htmlWidgets: string[] = [];
    walk(result.elementorJson!.content, (el) => {
      if (el.widgetType === "html") htmlWidgets.push(String(el.settings.html ?? ""));
    });
    expect(htmlWidgets.some((h) => h.includes("radial-gradient"))).toBe(true);
    expect(htmlWidgets.every((h) => !h.includes("Feature title"))).toBe(true);
  });

  it("fixed header chrome may stay whole-subtree custom while page content stays native", () => {
    const result = convertSource({
      source: `
        export default function Page() {
          return (
            <div>
              <header className="fixed inset-x-0 top-0 z-50 bg-slate-900 px-4 py-3">
                <a href="#a" className="text-sm text-white">Nav</a>
              </header>
              <main className="pt-20">
                <h1 className="text-3xl font-bold">Page title</h1>
                <p className="text-base">Body</p>
              </main>
            </div>
          );
        }
      `,
      catalogTarget: "4.2.4",
    });
    const counts = countWidgets(result.elementorJson as ElementorDocument);
    expect(counts["widget:heading"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts["widget:html"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(
      result.report.nodes.some(
        (n) => n.irKind === "heading" && n.decision === "native",
      ),
    ).toBe(true);
  });
});
