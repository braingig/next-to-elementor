import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalizeConversionReport,
  canonicalizeElementorJson,
  convertSource,
  loadElementorFreeCatalog,
  resolveTailwindUtility,
  type ConversionResult,
  type ElementorDocument,
} from "@/lib/converter";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/real-world",
);

type FixtureMeta = {
  id: string;
  title: string;
  category: string;
  expectedOutcomes: Array<"complete" | "partial" | "failed">;
  notes?: string;
};

type GoldenContract = {
  id: string;
  outcome: ConversionResult["outcome"];
  summary: ConversionResult["report"]["summary"];
  decisions: Array<{
    irKind: string;
    decision: string;
    reasonCode?: string;
    widgetType?: string;
  }>;
  diagnosticCodes: Array<{ severity: string; code: string }>;
  freeCompliancePassed: boolean;
  tree: unknown;
};

function listFixtureDirs(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{2}-/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function loadMeta(dir: string): FixtureMeta {
  return JSON.parse(readFileSync(join(ROOT, dir, "meta.json"), "utf8"));
}

function loadSource(dir: string): { source: string; css?: string } {
  const source = readFileSync(join(ROOT, dir, "source.tsx"), "utf8");
  const cssPath = join(ROOT, dir, "styles.css");
  const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : undefined;
  return { source, css };
}

function summarizeTree(doc: ElementorDocument | null): unknown {
  if (!doc) return null;
  const walk = (el: ElementorDocument["content"][number]): unknown => ({
    elType: el.elType,
    ...(el.widgetType ? { widgetType: el.widgetType } : {}),
    settingKeys: Object.keys(el.settings).sort(),
    children: el.elements.map(walk),
  });
  return {
    version: doc.version,
    type: doc.type,
    content: doc.content.map(walk),
  };
}

function toGolden(id: string, result: ConversionResult): GoldenContract {
  return {
    id,
    outcome: result.outcome,
    summary: result.report.summary,
    decisions: result.report.nodes.map((n) => ({
      irKind: n.irKind,
      decision: n.decision,
      ...(n.reasonCode ? { reasonCode: n.reasonCode } : {}),
      ...(n.widgetType ? { widgetType: n.widgetType } : {}),
    })),
    diagnosticCodes: result.report.diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
    })),
    freeCompliancePassed: result.report.freeCompliance.passed,
    tree: summarizeTree(result.elementorJson as ElementorDocument | null),
  };
}

function goldenPath(dir: string): string {
  return join(ROOT, dir, "golden.json");
}

describe("Phase 9 real-world fixture validation", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");
  const dirs = listFixtureDirs();
  const updateGoldens = process.env.UPDATE_GOLDENS === "1";

  it("fixture corpus is present (8 categories)", () => {
    expect(dirs.length).toBeGreaterThanOrEqual(8);
  });

  for (const dir of dirs) {
    describe(dir, () => {
      const meta = loadMeta(dir);
      const { source, css } = loadSource(dir);

      it("converts deterministically and matches golden contract", () => {
        const run = () =>
          convertSource({
            source,
            language: "tsx",
            css: css ?? [],
            catalog,
            title: meta.title,
            sourcePath: `fixtures/real-world/${dir}/source.tsx`,
          });

        const a = run();
        const b = run();
        const c = run();

        expect(a.outcome).toBe(b.outcome);
        expect(b.outcome).toBe(c.outcome);
        expect(canonicalizeConversionReport(a.report)).toBe(
          canonicalizeConversionReport(b.report),
        );
        expect(canonicalizeConversionReport(b.report)).toBe(
          canonicalizeConversionReport(c.report),
        );
        if (a.elementorJson && b.elementorJson && c.elementorJson) {
          expect(
            canonicalizeElementorJson(a.elementorJson as ElementorDocument),
          ).toBe(
            canonicalizeElementorJson(b.elementorJson as ElementorDocument),
          );
          expect(
            canonicalizeElementorJson(b.elementorJson as ElementorDocument),
          ).toBe(
            canonicalizeElementorJson(c.elementorJson as ElementorDocument),
          );
        } else {
          expect(a.elementorJson).toBeNull();
          expect(b.elementorJson).toBeNull();
        }

        expect(meta.expectedOutcomes).toContain(a.outcome);
        expect(a.report.freeCompliance.passed).toBe(
          a.outcome !== "failed" ? true : a.report.freeCompliance.passed,
        );
        if (a.outcome !== "failed") {
          expect(a.elementorJson).not.toBeNull();
          expect(a.report.freeCompliance.passed).toBe(true);
        }

        // Every decision is explicit
        expect(a.report.summary.totalNodes).toBe(a.report.nodes.length);
        expect(
          a.report.summary.nativeCount +
            a.report.summary.customCount +
            a.report.summary.unsupportedCount,
        ).toBe(a.report.summary.totalNodes);

        const contract = toGolden(meta.id, a);
        const path = goldenPath(dir);
        if (updateGoldens || !existsSync(path)) {
          writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);
        }
        const expected = JSON.parse(readFileSync(path, "utf8")) as GoldenContract;
        expect(contract).toEqual(expected);
      });
    });
  }
});

describe("Phase 9 accuracy audits", () => {
  const catalog = loadElementorFreeCatalog("4.2.4");

  it("Tailwind: known utilities resolve; unknown utilities warn", () => {
    expect(resolveTailwindUtility("flex")).toEqual({
      layout: { display: "flex" },
    });
    expect(resolveTailwindUtility("w-1/2")).toEqual({
      box: { width: "50%" },
    });
    expect(resolveTailwindUtility("unknown-utility-xyz")).toBeNull();

    const result = convertSource({
      source: readFileSync(join(ROOT, "06-tailwind-heavy/source.tsx"), "utf8"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("partial");
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "unknown-tailwind-class" &&
          d.message.includes("unknown-utility-xyz"),
      ),
    ).toBe(true);
  });

  it("CSS classes from stylesheets are not mislabeled as unknown Tailwind", () => {
    const result = convertSource({
      source: readFileSync(join(ROOT, "07-css-heavy/source.tsx"), "utf8"),
      css: readFileSync(join(ROOT, "07-css-heavy/styles.css"), "utf8"),
      language: "tsx",
      catalog,
    });
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "unknown-tailwind-class" &&
          d.message.includes("css-hero"),
      ),
    ).toBe(false);
  });

  it("box-shadow style loss is reported (no silent approximation)", () => {
    const result = convertSource({
      source: readFileSync(join(ROOT, "05-pricing/source.tsx"), "utf8"),
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("partial");
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.code === "unsupported-css" && d.message.includes("box-shadow"),
      ),
    ).toBe(true);
  });

  it("navbar keeps native siblings while links are custom (node-scoped)", () => {
    const result = convertSource({
      source: readFileSync(join(ROOT, "04-navbar/source.tsx"), "utf8"),
      language: "tsx",
      catalog,
    });
    expect(result.elementorJson).not.toBeNull();
    const root = (result.elementorJson as ElementorDocument).content[0]!;
    expect(root.elType).toBe("container");
    expect(root.widgetType).toBeUndefined();
    expect(
      result.report.nodes.some((n) => n.irKind === "image" && n.decision === "native"),
    ).toBe(true);
    expect(
      result.report.nodes.some((n) => n.irKind === "link" && n.decision === "custom"),
    ).toBe(true);
    expect(
      result.report.nodes.some((n) => n.irKind === "button" && n.decision === "native"),
    ).toBe(true);
  });

  it("hero uses Free-native widgets for heading/text/image/button", () => {
    const result = convertSource({
      source: readFileSync(join(ROOT, "01-hero/source.tsx"), "utf8"),
      language: "tsx",
      catalog,
    });
    const kinds = Object.fromEntries(
      result.report.nodes.map((n) => [`${n.irKind}:${n.decision}`, n.widgetType]),
    );
    expect(kinds["heading:native"]).toBe("heading");
    expect(kinds["text:native"]).toBe("text-editor");
    expect(kinds["image:native"]).toBe("image");
    expect(kinds["button:native"]).toBe("button");
    expect(kinds["link:custom"]).toBe("html");
  });
});
