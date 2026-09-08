import { describe, expect, it } from "vitest";
import {
  convertSource,
  loadElementorFreeCatalog,
  mapIrStyleToSettings,
  resolveTailwindUtility,
  toBoxShadow,
  type ElementorDocument,
} from "@/lib/converter";

function findHtmlWidgets(doc: ElementorDocument): string[] {
  const out: string[] = [];
  const walk = (els: ElementorDocument["content"]) => {
    for (const el of els) {
      if (el.widgetType === "html" && typeof el.settings.html === "string") {
        out.push(el.settings.html);
      }
      if (el.elements?.length) walk(el.elements);
    }
  };
  walk(doc.content);
  return out;
}

describe("P0: leaf child coverage", () => {
  it("button with nested SVG does not emit insufficient-source-information", () => {
    const result = convertSource({
      language: "tsx",
      source: `export function Cta() {
  return (
    <button type="button" className="px-4 py-2">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      Continue
    </button>
  );
}`,
    });
    expect(
      result.report.diagnostics.some(
        (d) => d.code === "insufficient-source-information",
      ),
    ).toBe(false);
    expect(
      result.report.nodes.some(
        (n) => n.reasonCode === "insufficient-source-information",
      ),
    ).toBe(false);
    expect(result.elementorJson).not.toBeNull();
    const htmls = findHtmlWidgets(result.elementorJson as ElementorDocument);
    expect(htmls.some((h) => h.includes("M5 12h14") && h.includes("<svg"))).toBe(
      true,
    );
  });

  it("button with nested span uses custom fallback and covers children", () => {
    const result = convertSource({
      language: "tsx",
      source: `export function B() {
  return (
    <button type="button">
      <span className="font-bold">Go</span>
    </button>
  );
}`,
    });
    expect(
      result.report.nodes.some(
        (n) => n.reasonCode === "insufficient-source-information",
      ),
    ).toBe(false);
    expect(result.report.nodes.some((n) => n.decision === "custom")).toBe(true);
    const htmls = findHtmlWidgets(result.elementorJson as ElementorDocument);
    expect(htmls.some((h) => h.includes("Go"))).toBe(true);
  });

  it("nested html-embed structures become custom and preserve descendants", () => {
    const result = convertSource({
      language: "tsx",
      source: `export function Tabley() {
  return (
    <div>
      <table>
        <tbody>
          <tr>
            <td>Cell</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}`,
    });
    expect(
      result.report.diagnostics.some(
        (d) => d.code === "insufficient-source-information",
      ),
    ).toBe(false);
    const htmls = findHtmlWidgets(result.elementorJson as ElementorDocument);
    expect(htmls.some((h) => h.includes("Cell") && h.includes("<td"))).toBe(
      true,
    );
  });
});

describe("P0: SVG markup preservation", () => {
  it("preserves path data in custom HTML for unnamed SVG", () => {
    const result = convertSource({
      language: "tsx",
      source: `export function IconOnly() {
  return (
    <div>
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 22h20L12 2z" stroke="currentColor" />
      </svg>
    </div>
  );
}`,
    });
    expect(result.elementorJson).not.toBeNull();
    const htmls = findHtmlWidgets(result.elementorJson as ElementorDocument);
    expect(htmls.some((h) => h.includes("M12 2L2 22h20L12 2z"))).toBe(true);
    expect(htmls.every((h) => !h.includes("<svg />"))).toBe(true);
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "semantic-ambiguous" &&
          d.message.includes("<path>"),
      ),
    ).toBe(false);
  });
});

describe("P1: style + Tailwind accuracy", () => {
  it("maps requested Tailwind utilities", () => {
    const cases: Array<[string, boolean]> = [
      ["p-7", true],
      ["gap-14", true],
      ["bg-teal-50", true],
      ["bg-blue-50", true],
      ["bg-purple-50", true],
      ["text-6xl", true],
      ["leading-7", true],
      ["leading-8", true],
      ["tracking-tight", true],
      ["shadow-xl", true],
      ["hover:-translate-y-1", false],
      ["grid-cols-3", false],
    ];
    for (const [cls, ok] of cases) {
      if (cls.includes(":")) {
        // hover handled at class-list level
        continue;
      }
      expect(Boolean(resolveTailwindUtility(cls)), cls).toBe(ok);
    }
  });

  it("maps box-shadow onto container Free control", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    const settings = mapIrStyleToSettings(
      {
        effects: {
          boxShadow:
            "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        },
      },
      { catalog, widgetId: "container", spacingPrefix: "" },
    );
    expect(settings.box_shadow_box_shadow).toBeTruthy();
    const shadow = settings.box_shadow_box_shadow as Record<string, unknown>;
    expect(shadow.vertical).toBe(20);
    expect(shadow.blur).toBe(25);
  });

  it("maps line-height and letter-spacing on heading", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    const settings = mapIrStyleToSettings(
      {
        typography: {
          lineHeight: "2rem",
          letterSpacing: "-0.025em",
        },
      },
      { catalog, widgetId: "heading", spacingPrefix: "_" },
    );
    expect(settings.typography_line_height).toEqual({
      unit: "rem",
      size: 2,
    });
    expect(settings.typography_letter_spacing).toEqual({
      unit: "em",
      size: -0.025,
    });
  });

  it("toBoxShadow parses modern rgb() shadows", () => {
    const s = toBoxShadow("0 4px 6px -1px rgb(0 0 0 / 0.1)");
    expect(s).toMatchObject({
      horizontal: 0,
      vertical: 4,
      blur: 6,
      spread: -1,
    });
  });

  it("heading with shadow-xl does not warn unsupported box-shadow", () => {
    const result = convertSource({
      language: "tsx",
      source: `export function Card() {
  return (
    <section className="shadow-xl p-7 bg-teal-50">
      <h2 className="text-6xl leading-8 tracking-tight">Title</h2>
    </section>
  );
}`,
    });
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "unsupported-css" && d.message.includes("box-shadow"),
      ),
    ).toBe(false);
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "unknown-tailwind-class" &&
          /p-7|gap-14|bg-teal-50|text-6xl|leading-8|tracking-tight|shadow-xl/.test(
            d.message,
          ),
      ),
    ).toBe(false);
  });
});
