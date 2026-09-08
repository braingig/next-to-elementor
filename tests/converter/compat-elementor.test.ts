import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildElementorSourceInventory,
  convertSource,
  getRuntimeImportStatus,
  loadElementorFreeCatalog,
  MVP_WIDGETS,
  resolveElementorFree424SourceRoot,
  scanProContamination,
  validateElementorDocument,
  validateStaticElementorCompatibility,
  type ElementorDocument,
  type ElementorElement,
} from "@/lib/converter";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/compatibility",
);

const REAL_WORLD = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/real-world",
);

const COMPAT_CASES = [
  {
    id: "01-hero",
    sourceDir: "01-hero",
    expectWidgets: ["container", "heading", "text-editor", "button", "image", "html"],
    expectResponsive: true,
    notes: "Hero with native CTA + custom docs link",
  },
  {
    id: "02-features",
    sourceDir: "02-features",
    expectWidgets: ["container", "heading", "text-editor", "icon"],
    expectResponsive: true,
    notes: "Feature cards with named icons",
  },
  {
    id: "03-cta",
    sourceDir: "03-cta",
    expectWidgets: ["container", "heading", "text-editor", "button"],
    expectResponsive: true,
    notes: "CTA background + button",
  },
  {
    id: "04-navbar",
    sourceDir: "04-navbar",
    expectWidgets: ["container", "image", "html", "button"],
    expectResponsive: false,
    notes: "Native image/button + custom links; parent stays container",
  },
  {
    id: "05-pricing",
    sourceDir: "05-pricing",
    expectWidgets: ["container", "heading", "text-editor", "button", "divider", "spacer"],
    expectResponsive: true,
    notes: "Nested cards, divider, spacer",
  },
  {
    id: "06-tailwind-heavy",
    sourceDir: "06-tailwind-heavy",
    expectWidgets: ["container", "heading", "text-editor"],
    expectResponsive: true,
    notes: "Tailwind-heavy layout",
  },
  {
    id: "07-css-heavy",
    sourceDir: "07-css-heavy",
    expectWidgets: ["container", "heading", "text-editor", "button"],
    expectResponsive: true,
    notes: "CSS-heavy section",
  },
  {
    id: "08-mixed",
    sourceDir: "08-mixed",
    expectWidgets: ["container", "heading", "text-editor", "button"],
    expectResponsive: true,
    notes: "Mixed Tailwind + CSS + inline",
  },
] as const;

function walkWidgets(el: ElementorElement, out: string[]): void {
  if (el.elType === "container") out.push("container");
  if (el.elType === "widget" && el.widgetType) out.push(el.widgetType);
  for (const child of el.elements) walkWidgets(child, out);
}

function findWidget(
  el: ElementorElement,
  widgetType: string,
): ElementorElement | undefined {
  if (el.widgetType === widgetType) return el;
  for (const child of el.elements) {
    const found = findWidget(child, widgetType);
    if (found) return found;
  }
  return undefined;
}

describe("Phase 10 Elementor Free 4.2.4 compatibility", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");
  const source = resolveElementorFree424SourceRoot();
  const runtime = getRuntimeImportStatus();

  it("resolves Elementor Free 4.2.4 source (not the in-repo 4.2.1 tree)", () => {
    expect("error" in source).toBe(false);
    if ("error" in source) return;
    expect(source.version).toBe("4.2.4");
    expect(source.root.includes("Downloads/elementor") || process.env.ELEMENTOR_FREE_4_2_4_PATH).toBeTruthy();
  });

  it("runtime import is never a fabricated PASS without execution", () => {
    // Phase 11: BLOCKED until harness setup, READY when environment.json exists.
    // Actual RUNTIME_PASS/FAIL comes only from npm run test:elementor:runtime.
    expect(["BLOCKED", "READY"]).toContain(runtime.status);
    expect(runtime.executed).toBe(false);
    expect(runtime.elementorVersion).toBe("4.2.4");
    expect(runtime.status === "READY" || runtime.reasons.length > 0).toBe(true);
  });

  it("source inventory lists MVP Free widgets + container + tablet/mobile breakpoints", () => {
    expect("error" in source).toBe(false);
    if ("error" in source) return;
    const inventory = buildElementorSourceInventory(source.root, source.version);
    for (const w of MVP_WIDGETS) {
      expect(inventory.freeWidgetNames).toContain(w);
    }
    expect(inventory.containerElementName).toBe("container");
    expect(inventory.breakpointKeysFromSource).toContain("tablet");
    expect(inventory.breakpointKeysFromSource).toContain("mobile");
    expect(inventory.htmlWidgetControlIds).toContain("html");
    expect(inventory.controlIdsByWidget.heading).toContain("title");
    expect(inventory.controlIdsByWidget.heading).toContain("header_size");
  });

  for (const testCase of COMPAT_CASES) {
    it(`STATIC compat: ${testCase.id} — ${testCase.notes}`, () => {
      expect("error" in source).toBe(false);
      if ("error" in source) return;

      const dir = join(REAL_WORLD, testCase.sourceDir);
      const input = {
        source: readFileSync(join(dir, "source.tsx"), "utf8"),
        css: existsSync(join(dir, "styles.css"))
          ? readFileSync(join(dir, "styles.css"), "utf8")
          : [],
        language: "tsx" as const,
        catalog,
        title: testCase.id,
      };
      const result = convertSource(input);
      expect(result.elementorJson).not.toBeNull();
      const document = result.elementorJson as ElementorDocument;

      // Catalog structural validation
      const catalogValidation = validateElementorDocument(document, catalog);
      expect(catalogValidation.passed).toBe(true);

      const inventory = buildElementorSourceInventory(
        source.root,
        source.version,
      );
      const staticResult = validateStaticElementorCompatibility(
        document,
        inventory,
        catalog,
      );
      expect(staticResult.label).toBe("STATIC PASS");
      expect(staticResult.passed).toBe(true);
      expect(scanProContamination(document)).toEqual([]);

      const widgets: string[] = [];
      for (const el of document.content) walkWidgets(el, widgets);
      for (const expected of testCase.expectWidgets) {
        expect(widgets).toContain(expected);
      }

      if (testCase.expectResponsive) {
        expect(staticResult.responsiveSuffixesSeen.length).toBeGreaterThan(0);
      }

      // Compatibility fixture artifact (stable contract, no WP IDs/timestamps)
      const fixtureDir = join(FIXTURES, testCase.id);
      mkdirSync(fixtureDir, { recursive: true });
      const contract = {
        id: testCase.id,
        elementorTarget: "4.2.4",
        runtimeImport: "BLOCKED" as const,
        staticValidation: staticResult.label,
        conversionOutcome: result.outcome,
        expectedWidgetTypes: testCase.expectWidgets,
        widgetsSeen: staticResult.widgetsSeen,
        responsiveSuffixesSeen: staticResult.responsiveSuffixesSeen,
        freeCompliancePassed: result.report.freeCompliance.passed,
        unsupportedDecisions: result.report.nodes
          .filter((n) => n.decision === "unsupported")
          .map((n) => ({
            irKind: n.irKind,
            reasonCode: n.reasonCode,
          })),
        notes: testCase.notes,
        // Full generated JSON for offline review / future runtime import
        generatedDocument: document,
        reportSummary: result.report.summary,
      };

      if (process.env.UPDATE_COMPAT_FIXTURES === "1" || !existsSync(join(fixtureDir, "contract.json"))) {
        writeFileSync(
          join(fixtureDir, "contract.json"),
          `${JSON.stringify(contract, null, 2)}\n`,
        );
      }

      const saved = JSON.parse(
        readFileSync(join(fixtureDir, "contract.json"), "utf8"),
      );
      expect(saved.staticValidation).toBe("STATIC PASS");
      expect(saved.runtimeImport).toBe("BLOCKED");
      expect(saved.elementorTarget).toBe("4.2.4");
    });
  }

  it("custom fallback remains node-scoped HTML under native container", () => {
    expect("error" in source).toBe(false);
    if ("error" in source) return;

    const result = convertSource({
      source: readFileSync(join(REAL_WORLD, "04-navbar/source.tsx"), "utf8"),
      language: "tsx",
      catalog,
    });
    const root = (result.elementorJson as ElementorDocument).content[0]!;
    expect(root.elType).toBe("container");
    expect(root.widgetType).toBeUndefined();

    const html = findWidget(root, "html");
    expect(html).toBeTruthy();
    expect(typeof html!.settings.html).toBe("string");
    expect(String(html!.settings.html)).toContain("nte-fb-");

    expect(
      result.report.nodes.some((n) => n.irKind === "link" && n.decision === "custom"),
    ).toBe(true);
    expect(
      result.report.nodes.some((n) => n.irKind === "image" && n.decision === "native"),
    ).toBe(true);
    expect(
      result.report.nodes.some((n) => n.irKind === "button" && n.decision === "native"),
    ).toBe(true);
  });

  it("unsupported nodes are omitted from JSON but remain in the report", () => {
    const result = convertSource({
      source: `export function Mixed() {
  return (
    <div>
      <h2>Ok</h2>
      <FancyThing />
    </div>
  );
}`,
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("partial");
    const widgets: string[] = [];
    for (const el of (result.elementorJson as ElementorDocument).content) {
      walkWidgets(el, widgets);
    }
    expect(widgets).toContain("heading");
    expect(widgets).not.toContain("fancything");
    expect(
      result.report.nodes.some(
        (n) =>
          n.decision === "unsupported" && n.reasonCode === "unknown-component",
      ),
    ).toBe(true);
  });

  it("rejects invalid documents rather than treating them as compatible", () => {
    expect("error" in source).toBe(false);
    if ("error" in source) return;
    const inventory = buildElementorSourceInventory(source.root, source.version);
    const bogus = {
      version: "0.4" as const,
      title: "bad",
      type: "page" as const,
      content: [
        {
          id: "x",
          elType: "widget" as const,
          widgetType: "form",
          settings: {},
          elements: [],
        },
      ],
    };
    const catalogCheck = validateElementorDocument(bogus, catalog);
    expect(catalogCheck.passed).toBe(false);
    const staticCheck = validateStaticElementorCompatibility(
      bogus,
      inventory,
      catalog,
    );
    expect(staticCheck.label).toBe("STATIC FAIL");
    expect(scanProContamination(bogus).length).toBeGreaterThan(0);
  });

  it("round-trip runtime check is not fabricated as PASS", () => {
    const status = getRuntimeImportStatus();
    expect(status.status).not.toBe("PASS");
    expect(status.executed).toBe(false);
  });
});
