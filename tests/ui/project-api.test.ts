/**
 * Phase 13d — project ZIP API handlers (analyze / convert).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  MAX_PROJECT_UPLOAD_BYTES,
  runProjectAnalyze,
  runProjectConvert,
  toApiProjectResult,
} from "@/app/lib/server-project";
import { runConvertRequest } from "@/app/lib/server-convert";
import { PROJECT_LIMITS, convertProject, extractProjectZip } from "@/lib/converter";
import { routeDownloadFilename } from "@/app/lib/project-client";
import { zipFromFixture } from "../converter/fixtures/project/helpers";

function zipFromFiles(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    encoded[path] = typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(encoded, { level: 6 });
}

describe("Phase 13d project API handlers", () => {
  it("analyzes a valid Next App Router ZIP", () => {
    const zip = zipFromFiles({
      "package.json": JSON.stringify({
        dependencies: { next: "14.0.0", react: "18.0.0" },
      }),
      "app/page.tsx":
        "export default function Home(){return <h1>Home</h1>;}",
      "app/about/page.tsx":
        "export default function About(){return <h1>About</h1>;}",
    });

    const { status, payload } = runProjectAnalyze(zip);
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.analysis.manifest.framework).toBe("next-app");
    expect(payload.analysis.routes.map((r) => r.path).sort()).toEqual([
      "/",
      "/about",
    ]);
    expect(payload.vfsStats.fileCount).toBeGreaterThan(0);
  });

  it("converts a valid multi-route ZIP", () => {
    const zip = zipFromFiles({
      "package.json": JSON.stringify({
        dependencies: { next: "14.0.0", react: "18.0.0" },
      }),
      "app/page.tsx":
        "export default function Home(){return <h1>Home</h1>;}",
      "app/about/page.tsx":
        "export default function About(){return <h1>About</h1>;}",
    });

    const { status, payload } = runProjectConvert(zip);
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.routes).toHaveLength(2);
    for (const route of payload.result.routes) {
      expect(route.conversion.elementorJson).not.toBeNull();
      expect(route.unit).not.toBeNull();
      expect(route.unit?.moduleCount).toBeGreaterThan(0);
      // Slim unit — no full sources
      expect(route.unit && "moduleSources" in route.unit).toBe(false);
    }
    expect(payload.result.projectReport.usableDocuments).toBe(2);
  });

  it("rejects missing ZIP bytes as empty", () => {
    const { status, payload } = runProjectAnalyze(new Uint8Array());
    expect(status).toBe(400);
    expect(payload.ok).toBe(false);
    if (payload.ok) return;
    expect(payload.code).toBe("empty-zip");
  });

  it("rejects invalid / malformed ZIP", () => {
    const { status, payload } = runProjectAnalyze(strToU8("not-a-zip"));
    expect(status).toBe(400);
    expect(payload.ok).toBe(false);
    if (payload.ok) return;
    expect(payload.code).toBe("malformed-zip");
  });

  it("rejects oversized ZIP", () => {
    const zip = zipFromFiles({
      "package.json": "{}",
      "app/page.tsx": "export default function Home(){return <h1/>;}",
    });
    // Force size check via extract limits by wrapping run with huge declared size —
    // use PROJECT_LIMITS by creating bytes larger than maxZipBytes.
    const huge = new Uint8Array(PROJECT_LIMITS.maxZipBytes + 10);
    huge.set(zip.subarray(0, Math.min(zip.length, 100)), 0);
    const { status, payload } = runProjectAnalyze(huge);
    expect(status).toBe(413);
    expect(payload.ok).toBe(false);
    if (payload.ok) return;
    expect(payload.code).toBe("zip-size-limit");
  });

  it("returns convert result with failed outcome when no routes", () => {
    const zip = zipFromFiles({
      "package.json": JSON.stringify({ name: "notes" }),
      "README.md": "# hi",
    });
    const { status, payload } = runProjectConvert(zip);
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.outcome).toBe("failed");
    expect(payload.result.routes).toHaveLength(0);
  });

  it("returns partial multi-route response when one route fails", () => {
    const zip = zipFromFiles({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/page.tsx":
        "export default function Home(){return <h1>Home</h1>;}",
      "app/broken/page.tsx":
        "export default function Broken( { return <h1/> }",
    });
    const { status, payload } = runProjectConvert(zip);
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.outcome).toBe("partial");
    const home = payload.result.routes.find((r) => r.route.path === "/");
    const broken = payload.result.routes.find((r) => r.route.path === "/broken");
    expect(home?.conversion.elementorJson).not.toBeNull();
    expect(broken?.outcome).toBe("failed");
    expect(broken?.conversion.elementorJson).toBeNull();
  });

  it("keeps existing /api/convert behavior unchanged", () => {
    const { status, payload } = runConvertRequest({
      source: `export function Hero(){ return <h1 className="text-xl">Hi</h1>; }`,
      language: "tsx",
      title: "regression",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.elementorJson).not.toBeNull();
  });

  it("exposes MAX_PROJECT_UPLOAD_BYTES above ZIP limit", () => {
    expect(MAX_PROJECT_UPLOAD_BYTES).toBeGreaterThan(PROJECT_LIMITS.maxZipBytes);
  });

  it("toApiProjectResult strips heavy unit fields", () => {
    const zip = zipFromFiles({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/page.tsx":
        "export default function Home(){return <h1>Home</h1>;}",
    });
    const extracted = extractProjectZip(zip);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const full = convertProject(extracted.vfs);
    const api = toApiProjectResult(full);
    expect(api.routes[0]?.unit).toMatchObject({
      entryFile: "app/page.tsx",
      layoutMode: expect.any(String),
    });
    expect(api.routes[0]?.unit && "knownComponentSources" in api.routes[0]!.unit!).toBe(
      false,
    );
  });
});

describe("Phase 13d project UI helpers", () => {
  it("builds safe per-route download filenames", () => {
    expect(routeDownloadFilename("/")).toBe("elementor-root.json");
    expect(routeDownloadFilename("/about")).toBe("elementor-about.json");
    expect(routeDownloadFilename("/blog/[slug]")).toBe(
      "elementor-blog-slug.json",
    );
  });

  it("documents project mode availability in the workspace module", async () => {
    const mod = await import("@/app/components/converter-workspace");
    expect(typeof mod.ConverterWorkspace).toBe("function");
    const panel = await import("@/app/components/project-zip-panel");
    expect(typeof panel.ProjectZipPanel).toBe("function");
  });
});

describe("Phase 13f fixture-backed project API", () => {
  it("analyzes e2e-kitchen ZIP with expected framework and routes", () => {
    const zip = zipFromFixture("e2e-kitchen");
    const { status, payload } = runProjectAnalyze(zip);
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.analysis.manifest.framework).toBe("next-app");
    expect(payload.analysis.routes.map((r) => r.path).sort()).toEqual([
      "/",
      "/blog/[slug]",
      "/pricing",
    ]);
    expect(
      payload.analysis.routes.find((r) => r.path === "/blog/[slug]")?.isDynamic,
    ).toBe(true);
  });

  it("converts multi-route fixture ZIP with per-route Free documents", () => {
    const zip = zipFromFixture("next-app-basic");
    const { status, payload } = runProjectConvert(zip);
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.routes).toHaveLength(2);
    for (const route of payload.result.routes) {
      expect(route.conversion.elementorJson).not.toBeNull();
      expect((route.conversion.elementorJson as { version?: string })?.version).toBe(
        "0.4",
      );
      expect(route.dependencies === undefined || Array.isArray(route.dependencies)).toBe(
        true,
      );
    }
    expect(JSON.stringify(payload)).not.toMatch(/\/Users\//);
  });

  it("sanitizes error payloads for malicious ZIP without host paths", () => {
    const { status, payload } = runProjectAnalyze(strToU8("not-a-zip"));
    expect(status).toBe(400);
    expect(payload.ok).toBe(false);
    if (payload.ok) return;
    expect(JSON.stringify(payload)).not.toMatch(/\/Users\/|\/home\/|\\\\Users\\\\/);
  });
});

describe("Phase 13f Project ZIP UI contracts", () => {
  it("exposes analyze/convert client helpers and outcome labels", async () => {
    const client = await import("@/app/lib/project-client");
    expect(typeof client.requestProjectAnalyze).toBe("function");
    expect(typeof client.requestProjectConvert).toBe("function");
    expect(client.routeDownloadFilename("/blog/[slug]")).toBe(
      "elementor-blog-slug.json",
    );

    const panelSrc = readFileSync(
      join(process.cwd(), "app/components/project-zip-panel.tsx"),
      "utf8",
    );
    expect(panelSrc).toContain("Complete");
    expect(panelSrc).toContain("Partial");
    expect(panelSrc).toContain("Failed");
    expect(panelSrc).toContain("requestProjectAnalyze");
    expect(panelSrc).toContain("requestProjectConvert");
    expect(panelSrc).toContain("isDynamic");
  });
});
