/**
 * Merge advisory visual comparison artifacts into runtime-report.json.
 * Never promotes BLOCKED runtime to PASS.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  RuntimeValidationReport,
  VisualStatus,
} from "../lib/converter/runtime/report";

const GENERATED = join(process.cwd(), "tests/runtime/generated");
const SCREENSHOTS = join(GENERATED, "screenshots");
const REPORT = join(GENERATED, "runtime-report.json");

if (!existsSync(REPORT)) {
  console.error("No runtime-report.json — run test:elementor:runtime first.");
  process.exit(2);
}

const report = JSON.parse(
  readFileSync(REPORT, "utf8"),
) as RuntimeValidationReport;

const visuals = new Map<string, VisualStatus>();
if (existsSync(SCREENSHOTS)) {
  for (const file of readdirSync(SCREENSHOTS)) {
    if (!file.endsWith("-visual.json")) continue;
    const data = JSON.parse(
      readFileSync(join(SCREENSHOTS, file), "utf8"),
    ) as { visualStatus?: VisualStatus };
    const name = file.replace(/-(desktop|tablet|mobile)-visual\.json$/, "");
    const status = data.visualStatus;
    if (!status) continue;
    const prev = visuals.get(name);
    // Keep the worst advisory status across viewports.
    const rank: Record<string, number> = {
      VISUAL_CLOSE: 1,
      VISUAL_MINOR_DIFFERENCE: 2,
      VISUAL_SIGNIFICANT_DIFFERENCE: 3,
      NOT_COMPARABLE: 4,
      BLOCKED: 5,
    };
    if (!prev || (rank[status] ?? 0) > (rank[prev] ?? 0)) {
      visuals.set(name, status);
    }
  }
}

for (const fixture of report.fixtures) {
  const v = visuals.get(fixture.name);
  if (v) {
    fixture.visualStatus = v;
    if (fixture.renderStatus === "SKIPPED") {
      fixture.renderStatus =
        report.runtimeStatus === "BLOCKED" ? "SKIPPED" : "RUNTIME_PASS";
    }
  } else if (fixture.importStatus === "RUNTIME_PASS") {
    // Browser suite may not cover every fixture; leave NOT_COMPARABLE/BLOCKED as-is
    if (fixture.visualStatus === "BLOCKED") {
      fixture.visualStatus = "NOT_COMPARABLE";
      fixture.issues.push(
        "No visual artifact for this fixture (advisory suite covers a subset).",
      );
    }
  }
}

writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
console.log(`Updated visual statuses in ${REPORT}`);
