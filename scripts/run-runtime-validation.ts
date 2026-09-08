/**
 * Run Phase 11 runtime compatibility checks against WordPress + Elementor Free 4.2.4.
 * Writes tests/runtime/generated/runtime-report.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  convertSource,
  collectResponsiveKeys,
  collectWidgets,
  emptyBlockedReport,
  findFirstWidget,
  flattenWidgetTypes,
  generateDocumentFromFixture,
  importDocumentJson,
  probePhase11Runtime,
  readRuntimeEnv,
  runSetup,
  writeReport,
  wpCli,
  type FixtureRuntimeResult,
  type RuntimeStatus,
  type RuntimeValidationReport,
  validateStaticElementorCompatibility,
  buildElementorSourceInventory,
  resolveElementorFree424SourceRoot,
  loadElementorFreeCatalog,
  type ElementorDocument,
} from "@/lib/converter";
import { REAL_WORLD_FIXTURES } from "../tests/runtime/fixtures";

const REAL_WORLD = join(process.cwd(), "tests/converter/fixtures/real-world");

function loadFixture(id: string): { source: string; css?: string } {
  const source = readFileSync(join(REAL_WORLD, id, "source.tsx"), "utf8");
  const cssPath = join(REAL_WORLD, id, "styles.css");
  const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : undefined;
  return { source, css };
}

function verifySettings(tree: ReturnType<typeof collectWidgets>): Record<string, boolean> {
  const heading = findFirstWidget(tree, "heading");
  const button = findFirstWidget(tree, "button");
  const image = findFirstWidget(tree, "image");
  const html = findFirstWidget(tree, "html");
  const spacer = findFirstWidget(tree, "spacer");
  const container = tree[0];

  return {
    headingText: Boolean(heading && typeof heading.settings.title === "string"),
    headingTag: Boolean(heading && heading.settings.header_size),
    buttonText: Boolean(button && (button.settings.text || button.settings.link)),
    buttonUrl: Boolean(
      button &&
        button.settings.link &&
        typeof button.settings.link === "object" &&
        "url" in (button.settings.link as object),
    ),
    imageSource: Boolean(
      image &&
        (image.settings.image ||
          image.settings.url ||
          (image.settings.image &&
            typeof image.settings.image === "object")),
    ),
    htmlFallback: Boolean(html && typeof html.settings.html === "string"),
    containerFlex: Boolean(
      container &&
        (container.settings.flex_direction ||
          container.settings.container_type === "flex"),
    ),
    spacing: Boolean(
      container &&
        (container.settings.padding ||
          container.settings.margin ||
          container.settings.flex_gap),
    ),
    spacerSize: spacer
      ? Boolean(spacer.settings.space || spacer.settings.size)
      : true,
  };
}

async function main(): Promise<void> {
  const autoSetup = process.env.N2E_RUNTIME_AUTO_SETUP === "1";
  let probe = probePhase11Runtime();
  const envExisting = readRuntimeEnv();

  if (!envExisting && autoSetup && probe.status !== "blocked") {
    console.log("Auto-running runtime setup...");
    runSetup();
    probe = probePhase11Runtime();
  } else if (!envExisting && dockerOkButNeedsSetup(probe)) {
    console.log("Running runtime setup (environment.json missing)...");
    try {
      runSetup();
      probe = probePhase11Runtime();
    } catch (e) {
      const report = emptyBlockedReport([
        ...probe.reasons,
        e instanceof Error ? e.message : String(e),
      ]);
      writeReport(report);
      console.error("BLOCKED: setup failed");
      process.exitCode = 2;
      return;
    }
  }

  if (probe.status === "blocked" && !readRuntimeEnv()) {
    const report = emptyBlockedReport(probe.reasons);
    writeReport(report);
    console.error("BLOCKED:", probe.reasons.join(" | "));
    process.exitCode = 2;
    return;
  }

  const env = readRuntimeEnv();
  if (!env || env.elementor !== "4.2.4") {
    const report = emptyBlockedReport([
      `Elementor version verification failed: ${env?.elementor ?? "missing"}`,
    ]);
    writeReport(report);
    process.exitCode = 1;
    return;
  }

  // Version gate
  const pluginVersion = wpCli(["plugin", "get", "elementor", "--field=version"])
    .trim()
    .replace(/\r/g, "");
  if (pluginVersion !== "4.2.4") {
    const report = emptyBlockedReport([
      `FAIL: live Elementor version is ${pluginVersion}, required 4.2.4`,
    ]);
    report.runtimeStatus = "RUNTIME_FAIL";
    report.environment = {
      wordpress: env.wordpress,
      php: env.php,
      elementor: pluginVersion,
      docker: true,
      baseUrl: env.baseUrl,
      elementorSourcePath: env.elementorSourcePath,
      proActive: env.proActive,
    };
    writeReport(report);
    process.exitCode = 1;
    return;
  }

  const sourceRoot = resolveElementorFree424SourceRoot();
  const catalog = loadElementorFreeCatalog("4.2.4");
  let staticValidation: RuntimeValidationReport["staticValidation"] = "NOT_RUN";
  if (!("error" in sourceRoot)) {
    const inventory = buildElementorSourceInventory(
      sourceRoot.root,
      sourceRoot.version,
    );
    staticValidation = "STATIC PASS";
    for (const id of REAL_WORLD_FIXTURES) {
      const { source, css } = loadFixture(id);
      const converted = convertSource({ source, css, title: id, catalog });
      if (!converted.elementorJson) {
        staticValidation = "STATIC FAIL";
        break;
      }
      const check = validateStaticElementorCompatibility(
        converted.elementorJson as ElementorDocument,
        inventory,
        catalog,
      );
      if (check.label !== "STATIC PASS") {
        staticValidation = "STATIC FAIL";
        break;
      }
    }
  }

  const fixtures: FixtureRuntimeResult[] = [];
  let anyFail = false;

  // Custom fallback + unsupported fixtures (inline controlled sources)
  const specialCases: Array<{
    name: string;
    source: string;
    expectHtml: boolean;
    expectUnsupportedInReport: boolean;
  }> = [
    {
      name: "custom-fallback-scoped",
      source: `export function NativeCustom() {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Docs</h2>
      <a href="/docs" className="text-teal-700">Read docs</a>
      <a role="button" href="/ok" className="bg-teal-600 text-white px-3 py-2">OK</a>
    </div>
  );
}`,
      expectHtml: true,
      expectUnsupportedInReport: false,
    },
    {
      name: "unsupported-sibling",
      source: `export function Mixed() {
  return (
    <div>
      <h2>Ok</h2>
      <FancyThing />
      <p>Still here</p>
    </div>
  );
}`,
      expectHtml: false,
      expectUnsupportedInReport: true,
    },
  ];

  for (const id of REAL_WORLD_FIXTURES) {
    const issues: string[] = [];
    let importStatus: RuntimeStatus = "RUNTIME_PASS";
    const renderStatus: RuntimeStatus | "SKIPPED" = "SKIPPED";
    try {
      const { source, css } = loadFixture(id);
      const { path, result } = generateDocumentFromFixture(id, source, css);
      const imported = importDocumentJson(path);
      const tree = collectWidgets(imported.elements as unknown[]);
      const widgets = flattenWidgetTypes(tree);
      const responsive = collectResponsiveKeys(tree);
      const settingsChecks = verifySettings(tree);

      if (imported.editMode !== "builder") {
        issues.push(`editMode expected builder, got ${imported.editMode}`);
        importStatus = "RUNTIME_FAIL";
      }
      if (!imported.hasElementorData) {
        issues.push("missing _elementor_data after save");
        importStatus = "RUNTIME_FAIL";
      }
      if (!imported.permalink) {
        issues.push("missing permalink");
        importStatus = "RUNTIME_FAIL";
      }

      // Native widgets must be from allowlist
      for (const w of widgets) {
        const allowed = [
          "container",
          "heading",
          "text-editor",
          "image",
          "button",
          "icon",
          "divider",
          "spacer",
          "html",
        ];
        if (!allowed.includes(w)) {
          issues.push(`unexpected widget type after import: ${w}`);
          importStatus = "RUNTIME_FAIL";
        }
      }

      // unsupported must not appear as widgets
      if (widgets.some((w) => w.includes("fancy") || w === "form")) {
        issues.push("unsupported/pro widget leaked into imported document");
        importStatus = "RUNTIME_FAIL";
      }

      fixtures.push({
        name: id,
        importStatus,
        renderStatus,
        visualStatus: "BLOCKED",
        issues,
        postId: imported.postId,
        permalink: rewritePermalink(imported.permalink, env.baseUrl),
        widgetsSeen: widgets,
        responsiveKeysSeen: responsive,
        settingsChecks,
      });
      if (importStatus === "RUNTIME_FAIL") anyFail = true;

      // Persist mapping for Playwright
      writeFileSync(
        join(process.cwd(), "tests/runtime/generated", `page-${id}.json`),
        JSON.stringify(
          {
            name: id,
            postId: imported.postId,
            permalink: rewritePermalink(imported.permalink, env.baseUrl),
            conversionOutcome: result.outcome,
          },
          null,
          2,
        ) + "\n",
      );
    } catch (e) {
      anyFail = true;
      fixtures.push({
        name: id,
        importStatus: "RUNTIME_FAIL",
        renderStatus: "SKIPPED",
        visualStatus: "BLOCKED",
        issues: [e instanceof Error ? e.message : String(e)],
      });
    }
  }

  for (const special of specialCases) {
    const issues: string[] = [];
    let importStatus: RuntimeStatus = "RUNTIME_PASS";
    try {
      const generated = generateDocumentFromFixture(
        special.name,
        special.source,
      );
      const imported = importDocumentJson(generated.path);
      const tree = collectWidgets(imported.elements as unknown[]);
      const widgets = flattenWidgetTypes(tree);

      if (special.expectHtml && !widgets.includes("html")) {
        issues.push("expected HTML fallback widget");
        importStatus = "RUNTIME_FAIL";
      }
      if (special.expectHtml && !widgets.includes("heading")) {
        issues.push("expected native heading beside custom fallback");
        importStatus = "RUNTIME_FAIL";
      }
      if (special.expectHtml && !widgets.includes("container")) {
        issues.push("expected native container parent");
        importStatus = "RUNTIME_FAIL";
      }
      if (special.expectUnsupportedInReport) {
        const hasUnsupported = generated.result.report.nodes.some(
          (n: { decision: string }) => n.decision === "unsupported",
        );
        if (!hasUnsupported) {
          issues.push("expected unsupported decision in report");
          importStatus = "RUNTIME_FAIL";
        }
        if (widgets.includes("fancything") || widgets.some((w) => w.includes("Fancy"))) {
          issues.push("unsupported node was emitted");
          importStatus = "RUNTIME_FAIL";
        }
        if (!widgets.includes("heading")) {
          issues.push("valid sibling heading missing after unsupported omit");
          importStatus = "RUNTIME_FAIL";
        }
      }

      // Scoped CSS leak check: HTML widget html should contain a scope class/id-ish marker if custom
      if (special.expectHtml) {
        const htmlWidget = findFirstWidget(tree, "html");
        const html = String(htmlWidget?.settings.html ?? "");
        if (!html.includes("nte-fb-") && !html.includes("<style")) {
          issues.push(
            "advisory: HTML fallback did not include scoped nte-fb / style marker",
          );
        }
      }

      fixtures.push({
        name: special.name,
        importStatus,
        renderStatus: "SKIPPED",
        visualStatus: "BLOCKED",
        issues,
        postId: imported.postId,
        permalink: rewritePermalink(imported.permalink, env.baseUrl),
        widgetsSeen: widgets,
      });
      if (importStatus === "RUNTIME_FAIL") anyFail = true;
      writeFileSync(
        join(process.cwd(), "tests/runtime/generated", `page-${special.name}.json`),
        JSON.stringify(
          {
            name: special.name,
            postId: imported.postId,
            permalink: rewritePermalink(imported.permalink, env.baseUrl),
          },
          null,
          2,
        ) + "\n",
      );
    } catch (e) {
      anyFail = true;
      fixtures.push({
        name: special.name,
        importStatus: "RUNTIME_FAIL",
        renderStatus: "SKIPPED",
        visualStatus: "BLOCKED",
        issues: [e instanceof Error ? e.message : String(e)],
      });
    }
  }

  // Malformed / Pro contamination rejection probe
  try {
    const malformedOut = wpCli([
      "eval-file",
      "/opt/n2e-scripts/reject-malformed.php",
    ]);
    writeFileSync(
      join(process.cwd(), "tests/runtime/generated", "malformed-probe.json"),
      malformedOut.slice(malformedOut.indexOf("{")),
    );
    fixtures.push({
      name: "malformed-pro-form-probe",
      importStatus: "RUNTIME_PASS",
      renderStatus: "SKIPPED",
      visualStatus: "NOT_COMPARABLE",
      issues: [
        "Probe executed; see malformed-probe.json. Converter still must never emit Pro widgets.",
      ],
    });
  } catch (e) {
    fixtures.push({
      name: "malformed-pro-form-probe",
      importStatus: "RUNTIME_FAIL",
      renderStatus: "SKIPPED",
      visualStatus: "NOT_COMPARABLE",
      issues: [e instanceof Error ? e.message : String(e)],
    });
    anyFail = true;
  }

  const report: RuntimeValidationReport = {
    environment: {
      wordpress: env.wordpress,
      php: env.php,
      elementor: env.elementor,
      docker: true,
      baseUrl: env.baseUrl,
      elementorSourcePath: env.elementorSourcePath,
      proActive: env.proActive,
    },
    runtimeStatus: anyFail ? "RUNTIME_FAIL" : "RUNTIME_PASS",
    staticValidation,
    fixtures,
    blockedReasons: [],
    generatedAt: new Date().toISOString(),
  };
  const out = writeReport(report);
  console.log(`Wrote ${out}`);
  console.log(`runtimeStatus=${report.runtimeStatus}`);
  process.exitCode = anyFail ? 1 : 0;
}

function dockerOkButNeedsSetup(probe: ReturnType<typeof probePhase11Runtime>): boolean {
  return (
    probe.reasons.some((r) => r.includes("not set up") || r.includes("environment.json")) ||
    (probe.status === "available" && !readRuntimeEnv())
  );
}

function rewritePermalink(permalink: string, baseUrl: string): string {
  try {
    const u = new URL(permalink);
    const b = new URL(baseUrl);
    return `${b.origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return permalink;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
