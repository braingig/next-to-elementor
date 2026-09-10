/**
 * End-to-end validation of Phase A–C folder input using a realistic multi-file section.
 * Does not change resolver / convertSource behavior — observes and asserts only.
 */
import {
  readdirSync,
  readFileSync,
  statSync,
  existsSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalizeElementorJson,
  convertSectionInput,
  convertSource,
  loadElementorFreeCatalog,
  resolveSectionInput,
  validateElementorDocument,
  type ElementorDocument,
  type VirtualFiles,
} from "@/lib/converter";

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/section-input/RealWorldSection",
);

const catalog = loadElementorFreeCatalog("4.2.4");

/** Load fixture directory into a section-root-relative VirtualFiles map. */
function loadVirtualFiles(dir: string): VirtualFiles {
  const files: VirtualFiles = {};

  function walk(current: string) {
    for (const name of readdirSync(current)) {
      const abs = join(current, name);
      const rel = relative(dir, abs).replace(/\\/g, "/");
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      // Text sources as utf8; binary assets as base64 marker is unnecessary —
      // converter never executes assets; include png as utf8-lossy only if needed.
      // For validation we only need TSX/CSS in the map for resolution; still include
      // asset path presence for realism (binary stored as base64 string).
      if (/\.(png|jpe?g|gif|webp)$/i.test(name)) {
        files[rel] = readFileSync(abs).toString("base64");
      } else {
        files[rel] = readFileSync(abs, "utf8");
      }
    }
  }

  walk(dir);
  return files;
}

function collectTexts(doc: ElementorDocument): string {
  return JSON.stringify(doc);
}

function walkWidgets(
  elements: ElementorDocument["content"],
  out: Array<{ elType: string; widgetType?: string; title?: string }>,
) {
  for (const el of elements) {
    out.push({
      elType: el.elType,
      ...(el.widgetType ? { widgetType: el.widgetType } : {}),
      ...(typeof el.settings.title === "string"
        ? { title: el.settings.title }
        : {}),
    });
    if (el.elements?.length) {
      walkWidgets(el.elements, out);
    }
  }
}

describe("Phase A–C RealWorldSection folder validation", () => {
  it("fixture exists with expected multi-file layout", () => {
    expect(existsSync(join(FIXTURE_ROOT, "RealWorldSection.tsx"))).toBe(true);
    expect(existsSync(join(FIXTURE_ROOT, "HeroContent.tsx"))).toBe(true);
    expect(existsSync(join(FIXTURE_ROOT, "HeroButton.tsx"))).toBe(true);
    expect(existsSync(join(FIXTURE_ROOT, "FeatureCard.tsx"))).toBe(true);
    expect(existsSync(join(FIXTURE_ROOT, "Icon.tsx"))).toBe(true);
    expect(existsSync(join(FIXTURE_ROOT, "styles.css"))).toBe(true);
    expect(existsSync(join(FIXTURE_ROOT, "assets/hero.png"))).toBe(true);
  });

  it("resolves entry, graph, bindings, and converts end-to-end", () => {
    const files = loadVirtualFiles(FIXTURE_ROOT);
    // Component modules only for resolution — css/png may sit alongside.
    const componentFiles: VirtualFiles = Object.fromEntries(
      Object.entries(files).filter(([p]) => /\.(tsx|jsx|ts|js)$/i.test(p)),
    );

    const resolved = resolveSectionInput({
      files: componentFiles,
      sectionName: "RealWorldSection",
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      console.error("RESOLVE FAILED", resolved.diagnostics);
      return;
    }

    const { resolved: section, convertOptions } = resolved;

    // --- B/C: entry + graph (also printed for the validation report) ---
    expect(section.entryPath).toBe("RealWorldSection.tsx");

    console.log(
      "\n[RealWorldSection] entry:",
      section.entryPath,
      "\n[RealWorldSection] dependency graph nodes:",
      section.graph.nodes,
      "\n[RealWorldSection] dependency edges:",
      section.graph.edges.map(
        (e) => `${e.from} -[${e.specifier} as ${e.localNames.join(",")}]→ ${e.to}`,
      ),
      "\n[RealWorldSection] bindingPaths:",
      section.bindingPaths,
      "\n[RealWorldSection] knownComponentSources keys:",
      Object.keys(section.knownComponentSources),
    );

    expect(section.graph.nodes.sort()).toEqual(
      [
        "FeatureCard.tsx",
        "HeroButton.tsx",
        "HeroContent.tsx",
        "Icon.tsx",
        "RealWorldSection.tsx",
      ].sort(),
    );

    const edgePairs = section.graph.edges.map((e) => `${e.from}->${e.to}`).sort();
    expect(edgePairs).toEqual(
      [
        "FeatureCard.tsx->Icon.tsx",
        "HeroContent.tsx->HeroButton.tsx",
        "RealWorldSection.tsx->FeatureCard.tsx",
        "RealWorldSection.tsx->HeroContent.tsx",
      ].sort(),
    );

    // Nested: RealWorldSection → HeroContent → HeroButton
    expect(
      section.graph.edges.some(
        (e) => e.from === "HeroContent.tsx" && e.to === "HeroButton.tsx",
      ),
    ).toBe(true);
    expect(
      section.graph.edges.some(
        (e) => e.from === "FeatureCard.tsx" && e.to === "Icon.tsx",
      ),
    ).toBe(true);

    // --- F: knownComponentSources bindings ---
    expect(Object.keys(section.knownComponentSources).sort()).toEqual(
      ["FeatureCard", "HeroButton", "HeroContent", "Icon"].sort(),
    );
    expect(section.knownComponentSources.HeroContent).toContain("HeroButton");
    expect(section.knownComponentSources.HeroButton).toContain("Start converting");
    expect(section.knownComponentSources.FeatureCard).toContain("{title}");
    expect(section.knownComponentSources.Icon).toContain("data-icon");

    expect(convertOptions.source).toContain("function RealWorldSection");
    expect(convertOptions.sourcePath).toBe("RealWorldSection.tsx");

    // --- E2E: existing convertSource pipeline (via convertSectionInput) ---
    // Caller supplies CSS explicitly (CSS import collection is NOT Phase A–C).
    const css = files["styles.css"] ?? "";
    const result = convertSectionInput({
      files: componentFiles,
      sectionName: "RealWorldSection",
      convert: {
        language: "tsx",
        catalog,
        css,
        title: "RealWorldSection",
      },
    });

    console.log("\n[RealWorldSection] conversion summary:", result.report.summary);
    console.log(
      "[RealWorldSection] diagnostics:",
      result.report.diagnostics.map((d) => `${d.severity}:${d.code}: ${d.message}`),
    );

    expect(["complete", "partial"]).toContain(result.outcome);
    expect(result.elementorJson).not.toBeNull();
    assertValidDocument(result.elementorJson);

    const summary = result.report.summary;
    expect(summary.errorCount).toBe(0);
    expect(summary.totalNodes).toBeGreaterThan(5);

    // --- 10: no unknown-component / missing dependency for local imports ---
    const bad = result.report.diagnostics.filter(
      (d) =>
        d.code === "unknown-component" ||
        d.code === "missing-dependency" ||
        /unknown component/i.test(d.message),
    );
    expect(bad).toEqual([]);

    // Nodes must not be unsupported solely because they came from another file.
    const crossFileUnsupported = result.report.nodes.filter(
      (n) =>
        n.decision === "unsupported" &&
        /unknown-component|import/i.test(n.message ?? "") ,
    );
    expect(crossFileUnsupported).toEqual([]);

    // --- 9: distinctive copy from each file appears in Elementor JSON ---
    const html = collectTexts(result.elementorJson as ElementorDocument);
    expect(html).toContain("Ship landing sections without rebuilding layouts"); // HeroContent
    expect(html).toContain("Start converting"); // HeroButton
    expect(html).toContain("Why teams choose FlowSpace"); // RealWorldSection
    // Phase E: static Array.map() expands three FeatureCard instances with distinct props
    expect(html).toContain("Fast setup");
    expect(html).toContain("Reliable output");
    expect(html).toContain("Responsive design");
    expect(html).toContain("Convert a section folder without rebuilding");
    expect(html).toContain("fas fa-bolt");
    expect(html).toContain("fas fa-shield");
    expect(html).toContain('"widgetType":"icon"');

    expect(summary.unsupportedCount).toBe(0);
    expect(summary.errorCount).toBe(0);

    const widgets: Array<{
      elType: string;
      widgetType?: string;
      title?: string;
    }> = [];
    walkWidgets((result.elementorJson as ElementorDocument).content, widgets);
    console.log(
      "[RealWorldSection] widget walk (first 40):",
      widgets.slice(0, 40),
    );

    expect(widgets.some((w) => w.widgetType === "heading")).toBe(true);
    expect(widgets.some((w) => w.widgetType === "icon")).toBe(true);
    expect(widgets.some((w) => w.widgetType === "button")).toBe(true);
    expect(widgets.some((w) => w.widgetType === "image")).toBe(true);
    expect(widgets.some((w) => w.elType === "container")).toBe(true);

    // Stable canonicalize smoke
    void canonicalizeElementorJson(result.elementorJson as ElementorDocument);
  });

  it("negative: missing relative import fails resolution", () => {
    const result = resolveSectionInput({
      files: {
        "RealWorldSection.tsx": `import Missing from "./Missing";
export default function RealWorldSection() { return <Missing />; }`,
      },
      entryPath: "RealWorldSection.tsx",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((d) => d.code === "missing-dependency"),
      ).toBe(true);
    }
  });

  it("negative: circular dependency fails with cycle path", () => {
    const result = resolveSectionInput({
      files: {
        "A.tsx": `import B from "./B";
export default function A() { return <B />; }`,
        "B.tsx": `import A from "./A";
export default function B() { return <A />; }`,
      },
      entryPath: "A.tsx",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const cycle = result.diagnostics.find(
        (d) => d.code === "circular-dependency",
      );
      expect(cycle?.message).toMatch(/A\.tsx → B\.tsx → A\.tsx/);
    }
  });

  it("single-file convertSource behavior remains unchanged vs one-file map", () => {
    const source = readFileSync(
      join(FIXTURE_ROOT, "HeroButton.tsx"),
      "utf8",
    );
    const single = convertSource({
      source,
      language: "tsx",
      catalog,
      title: "HeroButton",
    });
    const folder = convertSectionInput({
      files: { "HeroButton.tsx": source },
      entryPath: "HeroButton.tsx",
      convert: { language: "tsx", catalog, title: "HeroButton" },
    });
    expect(folder.outcome).toBe(single.outcome);
    expect(
      canonicalizeElementorJson(folder.elementorJson as ElementorDocument),
    ).toEqual(
      canonicalizeElementorJson(single.elementorJson as ElementorDocument),
    );
  });
});

function assertValidDocument(
  json: unknown,
): asserts json is ElementorDocument {
  expect(json).not.toBeNull();
  const doc = json as ElementorDocument;
  expect(doc.version).toBe("0.4");
  const validation = validateElementorDocument(doc, catalog);
  expect(validation.passed).toBe(true);
}
