/**
 * Phase 13f — project fixtures + end-to-end / regression validation.
 * Validation only: exercises ZIP → VFS → discovery → deps → convertSource → Free 4.2.4.
 */

import { describe, expect, it, vi } from "vitest";
import {
  analyzeProjectStructure,
  buildConversionUnit,
  convertProject,
  createProjectVirtualFSFromTextFiles,
  extractProjectZip,
  PROJECT_LIMITS,
  SECTION_INPUT_LIMITS,
} from "@/lib/converter";
import {
  assertIndependentDocuments,
  assertProjectLimitsSeparateFromSection,
  assertValidFreeDocument,
  buildRawZip,
  convertFixture,
  convertFixtureZip,
  routeByPath,
  strToU8,
  usableRouteCount,
  vfsFromFixture,
  zipFromFiles,
  zipFromFixture,
  zipSync,
} from "./fixtures/project/helpers";

describe("Phase 13f fixtures: framework projects", () => {
  it("A. Vite React project converts successfully", () => {
    const result = convertFixture("vite-basic");
    expect(result.manifest.framework).toBe("vite-react");
    expect(result.routes).toHaveLength(1);
    expect(result.outcome === "complete" || result.outcome === "partial").toBe(
      true,
    );
    assertValidFreeDocument(result.routes[0]!.conversion.elementorJson, expect);
  });

  it("B. Vite multi-route produces independent Elementor documents", () => {
    // Regression: Vite + src/pages must not be misclassified as next-pages.
    const result = convertFixture("vite-multi-route");
    expect(result.manifest.framework).toBe("vite-react");
    expect(result.routes.map((r) => r.route.path).sort()).toEqual([
      "/",
      "/about",
    ]);
    expect(usableRouteCount(result)).toBe(2);
    for (const r of result.routes) {
      assertValidFreeDocument(r.conversion.elementorJson, expect);
    }
    assertIndependentDocuments(result, expect);
  });

  it("C. Next App Router discovers nested routes and converts", () => {
    const result = convertFixture("next-app-basic");
    expect(result.manifest.framework).toBe("next-app");
    expect(result.routes.map((r) => r.route.path).sort()).toEqual([
      "/",
      "/pricing",
    ]);
    for (const r of result.routes) {
      assertValidFreeDocument(r.conversion.elementorJson, expect);
    }
  });

  it("D. Next App layouts compose without merging routes into one document", () => {
    const result = convertFixture("next-app-layouts");
    expect(result.routes.length).toBeGreaterThanOrEqual(2);
    const dash = routeByPath(result, "/dashboard")!;
    expect(dash.unit?.layoutMode).toBe("composed");
    expect(dash.unit?.layoutChain).toEqual([
      "app/layout.tsx",
      "app/dashboard/layout.tsx",
    ]);
    expect(
      dash.diagnostics.some((d) => d.code === "layout-composed"),
    ).toBe(true);
    assertValidFreeDocument(dash.conversion.elementorJson, expect);
    assertIndependentDocuments(result, expect);
  });

  it("E. Next Pages Router converts pages and ignores API routes", () => {
    const result = convertFixture("next-pages");
    expect(result.manifest.framework).toBe("next-pages");
    expect(result.routes.map((r) => r.route.path).sort()).toEqual([
      "/",
      "/about",
    ]);
    expect(result.routes.some((r) => r.route.path.includes("api"))).toBe(false);
    for (const r of result.routes) {
      assertValidFreeDocument(r.conversion.elementorJson, expect);
    }
  });

  it("F. Dynamic routes stay as patterns (no invented slugs)", () => {
    const result = convertFixture("next-dynamic");
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.route.path).toBe("/blog/[slug]");
    expect(result.routes[0]!.route.isDynamic).toBe(true);
    expect(result.routes.some((r) => /\/blog\/(?!\[)/.test(r.route.path))).toBe(
      false,
    );
    assertValidFreeDocument(result.routes[0]!.conversion.elementorJson, expect);
  });
});

describe("Phase 13f fixtures: local graph + styles", () => {
  it("G. Shared local component converts on both routes (not npm)", () => {
    const result = convertFixture("next-shared");
    expect(usableRouteCount(result)).toBe(2);
    for (const r of result.routes) {
      expect(r.unit?.knownComponentSources.Title).toContain("function Title");
      expect(
        (r.dependencies ?? []).every((d) => d.packageName !== "Title"),
      ).toBe(true);
      assertValidFreeDocument(r.conversion.elementorJson, expect);
    }
  });

  it("H. Same binding name from different files stays distinct per route", () => {
    const result = convertFixture("next-binding");
    const admin = routeByPath(result, "/admin")!;
    const site = routeByPath(result, "/site")!;
    expect(admin.unit?.knownComponentSources.Button).toContain("<button");
    expect(site.unit?.knownComponentSources.Button).toContain("<a href");
    expect(admin.unit?.knownComponentSources.Button).not.toBe(
      site.unit?.knownComponentSources.Button,
    );
    assertValidFreeDocument(admin.conversion.elementorJson, expect);
    assertValidFreeDocument(site.conversion.elementorJson, expect);
  });

  it("I. Static Array.map remains expandable", () => {
    const result = convertFixture("next-static-map");
    const route = result.routes[0]!;
    assertValidFreeDocument(route.conversion.elementorJson, expect);
    expect(
      route.conversion.report.diagnostics.some(
        (d) => d.code === "static-array-map",
      ) || route.conversion.report.summary.nativeCount >= 3,
    ).toBe(true);
  });

  it("J. Tailwind curated classes convert without a Tailwind compiler", () => {
    const result = convertFixture("next-tailwind");
    assertValidFreeDocument(result.routes[0]!.conversion.elementorJson, expect);
    expect(result.routes[0]!.conversion.elementorJson).not.toBeNull();
  });

  it("K. Route-scoped CSS excludes unrelated project CSS", () => {
    const vfs = vfsFromFixture("next-css");
    const analysis = analyzeProjectStructure(vfs);
    const home = analysis.routes.find((r) => r.path === "/")!;
    const about = analysis.routes.find((r) => r.path === "/about")!;
    const homeUnit = buildConversionUnit(vfs, home, {
      framework: analysis.manifest.framework,
    });
    const aboutUnit = buildConversionUnit(vfs, about, {
      framework: analysis.manifest.framework,
    });
    expect(homeUnit.cssPaths).toEqual(["app/home.css"]);
    expect(aboutUnit.cssPaths).toEqual(["app/about/about.css"]);
    expect(homeUnit.cssPaths).not.toContain("styles/global-unused.css");
    const result = convertProject(vfs, { analysis });
    assertValidFreeDocument(routeByPath(result, "/")!.conversion.elementorJson, expect);
    assertValidFreeDocument(
      routeByPath(result, "/about")!.conversion.elementorJson,
      expect,
    );
  });

  it("L. CSS modules / SCSS limitations are reported honestly", () => {
    const result = convertFixture("next-css-modules");
    const route = result.routes[0]!;
    const codes = route.diagnostics.map((d) => d.code);
    // Either limited CSS modules / preprocessor raw, or missing-dep for CSS module JS import.
    expect(
      codes.some((c) =>
        [
          "css-modules-limited",
          "preprocessor-css-raw",
          "missing-dependency",
          "external-import-skipped",
        ].includes(c),
      ) ||
        route.conversion.report.diagnostics.some((d) =>
          /module|scss|css/i.test(d.message + d.code),
        ),
    ).toBe(true);
    // Do not claim silent full CSS modules compilation.
    expect(route.diagnostics.every((d) => d.code !== "css-modules-compiled")).toBe(
      true,
    );
  });
});

describe("Phase 13f fixtures: dependencies", () => {
  it("M. Lucide named icons apply static adapter diagnostics", () => {
    const result = convertFixture("next-lucide");
    const route = result.routes[0]!;
    const lucide = route.dependencies?.find((d) => d.packageName === "lucide-react");
    expect(lucide?.adapter).toBe("lucide-react");
    expect(lucide?.status).toBe("supported");
    expect(
      route.diagnostics.some((d) => d.code === "dependency-adapter-applied"),
    ).toBe(true);
    assertValidFreeDocument(route.conversion.elementorJson, expect);
  });

  it("N. Framer Motion strips animation and does not claim preservation", () => {
    const result = convertFixture("next-framer");
    const route = result.routes[0]!;
    expect(
      route.diagnostics.some(
        (d) => d.code === "dependency-animation-not-preserved",
      ),
    ).toBe(true);
    expect(route.dependencies?.find((d) => d.packageName === "framer-motion")?.status).toBe(
      "partial",
    );
    expect(route.outcome).toBe("partial");
    assertValidFreeDocument(route.conversion.elementorJson, expect);
  });

  it("O. Carousel static vs dynamic classification", () => {
    const result = convertFixture("next-carousel");
    const staticRoute = routeByPath(result, "/static")!;
    const dynamicRoute = routeByPath(result, "/dynamic")!;
    const staticDep = staticRoute.dependencies?.find((d) =>
      d.packageName.startsWith("swiper"),
    );
    const dynamicDep = dynamicRoute.dependencies?.find((d) =>
      d.packageName.startsWith("swiper"),
    );
    expect(staticDep?.status === "partial" || staticDep?.status === "unsupported").toBe(
      true,
    );
    expect(dynamicDep?.status).toBe("unsupported");
    expect(
      dynamicRoute.diagnostics.some((d) => d.code === "dependency-dynamic-usage"),
    ).toBe(true);
  });

  it("P. Chart libs do not invent data; unsupported/partial explicit", () => {
    const result = convertFixture("next-chart");
    const route = result.routes[0]!;
    const chart = route.dependencies?.find((d) => d.packageName === "recharts");
    expect(chart?.status).toBe("unsupported");
    expect(chart?.diagnostics[0]?.message).toMatch(/never invented/i);
    expect(route.outcome).toBe("partial");
  });

  it("Q. Runtime axios/fetch never execute; static form still usable", () => {
    const evalSpy = vi.spyOn(globalThis, "eval");
    try {
      const result = convertFixture("next-runtime");
      const route = result.routes[0]!;
      expect(route.dependencies?.find((d) => d.packageName === "axios")?.category).toBe(
        "dynamic/runtime-dependent",
      );
      expect(
        route.diagnostics.some((d) => d.code === "dependency-runtime-only"),
      ).toBe(true);
      expect(route.conversion.elementorJson).not.toBeNull();
      assertValidFreeDocument(route.conversion.elementorJson, expect);
    } finally {
      expect(evalSpy).not.toHaveBeenCalled();
      evalSpy.mockRestore();
    }
  });

  it("R. Unknown dependency does not poison unrelated route", () => {
    const result = convertFixture("next-unknown");
    const home = routeByPath(result, "/")!;
    const about = routeByPath(result, "/about")!;
    expect(home.dependencies?.some((d) => d.packageName === "weird-visual-lib")).toBe(
      false,
    );
    expect(about.dependencies?.some((d) => d.packageName === "weird-visual-lib")).toBe(
      true,
    );
    expect(home.conversion.elementorJson).not.toBeNull();
    assertValidFreeDocument(home.conversion.elementorJson, expect);
    if (about.conversion.outcome === "complete") {
      expect(about.outcome).toBe("partial");
    }
  });
});

describe("Phase 13f fixtures: assets, aliases, cycles", () => {
  it("S. Static asset references convert without inventing WP media IDs", () => {
    const zip = zipFromFixture("next-assets");
    const extracted = extractProjectZip(zip);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.vfs.files["public/logo.png"]?.kind).toBe("binary");
    const result = convertProject(extracted.vfs);
    const route = result.routes[0]!;
    assertValidFreeDocument(route.conversion.elementorJson, expect);
    const json = JSON.stringify(route.conversion.elementorJson);
    expect(json).not.toMatch(/"id"\s*:\s*\d{5,}/); // no fabricated WP attachment IDs
    expect(json).toMatch(/logo\.png|\/logo\.png/);
  });

  it("T. Path aliases are not silently claimed as fully supported", () => {
    const result = convertFixture("next-alias");
    const route = result.routes[0]!;
    const codes = [
      ...route.diagnostics.map((d) => d.code),
      ...(route.dependencies ?? []).flatMap((d) => d.diagnostics.map((x) => x.code)),
    ];
    expect(
      codes.some((c) =>
        ["dependency-unknown", "missing-dependency", "external-import-skipped"].includes(
          c,
        ),
      ),
    ).toBe(true);
  });

  it("U. Circular local imports diagnose safely without hanging", () => {
    const started = Date.now();
    const result = convertFixture("next-circular");
    expect(Date.now() - started).toBeLessThan(5000);
    const route = result.routes[0]!;
    expect(
      route.diagnostics.some((d) => d.code === "circular-dependency") ||
        route.outcome === "failed" ||
        route.outcome === "partial",
    ).toBe(true);
  });
});

describe("Phase 13f: strong ZIP end-to-end kitchen sink", () => {
  it("ZIP → extract → discover → deps → convert → Free 4.2.4 validate", () => {
    const result = convertFixtureZip("e2e-kitchen");
    expect(result.manifest.framework).toBe("next-app");
    expect(result.routes.map((r) => r.route.path).sort()).toEqual([
      "/",
      "/blog/[slug]",
      "/pricing",
    ]);
    expect(result.routes.find((r) => r.route.path === "/blog/[slug]")?.route.isDynamic).toBe(
      true,
    );

    const home = routeByPath(result, "/")!;
    const pricing = routeByPath(result, "/pricing")!;
    const blog = routeByPath(result, "/blog/[slug]")!;

    expect(home.unit?.layoutMode).toBe("composed");
    expect(home.dependencies?.some((d) => d.packageName === "lucide-react")).toBe(true);
    expect(pricing.dependencies?.some((d) => d.packageName === "lucide-react")).toBe(
      false,
    );

    for (const r of [home, pricing, blog]) {
      expect(r.conversion.elementorJson).not.toBeNull();
      assertValidFreeDocument(r.conversion.elementorJson, expect);
    }

    assertIndependentDocuments(result, expect);
    expect(result.projectReport.usableDocuments).toBe(3);
    expect(result.outcome === "complete" || result.outcome === "partial").toBe(true);
  });
});

describe("Phase 13f: multi-route integrity + outcomes", () => {
  it("isolates route failure and keeps reports associated correctly", () => {
    const result = convertProject(
      createProjectVirtualFSFromTextFiles({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/page.tsx":
          "export default function Home(){return <h1>Home</h1>;}",
        "app/ok/page.tsx":
          "export default function Ok(){return <h1>Ok</h1>;}",
        "app/broken/page.tsx":
          "export default function Broken( { return <h1/> }",
      }),
    );
    expect(result.routes).toHaveLength(3);
    expect(result.outcome).toBe("partial");
    const home = routeByPath(result, "/")!;
    const broken = routeByPath(result, "/broken")!;
    expect(home.conversion.elementorJson).not.toBeNull();
    expect(broken.outcome).toBe("failed");
    expect(broken.conversion.elementorJson).toBeNull();
    expect(home.diagnostics.every((d) => !/Broken/.test(d.message))).toBe(true);
  });

  it("project complete when all routes succeed", () => {
    const result = convertFixture("next-app-basic");
    const allUsable = result.routes.every((r) => r.conversion.elementorJson != null);
    expect(allUsable).toBe(true);
    if (result.routes.every((r) => r.outcome === "complete")) {
      expect(result.outcome).toBe("complete");
    } else {
      expect(result.outcome).toBe("partial");
    }
  });

  it("project failed when zero routes", () => {
    const result = convertProject(
      createProjectVirtualFSFromTextFiles({
        "package.json": JSON.stringify({ name: "notes" }),
        "README.md": "# hi",
      }),
    );
    expect(result.outcome).toBe("failed");
    expect(result.routes).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === "no-routes-to-convert")).toBe(
      true,
    );
  });

  it("project failed when all routes fail", () => {
    const result = convertProject(
      createProjectVirtualFSFromTextFiles({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/a/page.tsx": "export default function A( { return null }",
        "app/b/page.tsx": "export default function B( { return null }",
      }),
    );
    expect(result.routes.length).toBe(2);
    expect(result.routes.every((r) => r.conversion.elementorJson == null)).toBe(true);
    expect(result.outcome).toBe("failed");
  });
});

describe("Phase 13f: malicious ZIP + limits + security", () => {
  it("V. rejects traversal, absolute path, symlink, encrypted", () => {
    const traversal = extractProjectZip(
      buildRawZip([{ name: "../escape.tsx", data: strToU8("x") }]),
    );
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) expect(traversal.error.code).toBe("path-traversal");

    const absolute = extractProjectZip(
      buildRawZip([{ name: "/etc/passwd", data: strToU8("x") }]),
    );
    expect(absolute.ok).toBe(false);
    if (!absolute.ok) expect(absolute.error.code).toBe("absolute-path");

    const symlink = extractProjectZip(
      buildRawZip([
        {
          name: "link",
          data: strToU8("../secret"),
          unixMode: 0o120755,
          versionMadeBy: 0x03ff,
        },
      ]),
    );
    expect(symlink.ok).toBe(false);
    if (!symlink.ok) expect(symlink.error.code).toBe("symlink-rejected");

    const encrypted = extractProjectZip(
      buildRawZip([
        {
          name: "secret.tsx",
          data: strToU8("export const X = 1"),
          generalPurposeBitFlag: 0x1,
        },
      ]),
    );
    expect(encrypted.ok).toBe(false);
    if (!encrypted.ok) expect(encrypted.error.code).toBe("encrypted-entry");
  });

  it("V. ignores malicious-looking node_modules without loading them", () => {
    const zip = zipFromFiles({
      "package.json": JSON.stringify({
        dependencies: { next: "14.0.0" },
        scripts: { preinstall: "node -e \"process.exit(1)\"" },
      }),
      "app/page.tsx":
        "export default function Home(){return <h1>Safe</h1>;}",
      "node_modules/evil/index.js":
        "throw new Error('should never load');",
    });
    const extracted = extractProjectZip(zip);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.vfs.files["node_modules/evil/index.js"]).toBeUndefined();
    expect(extracted.vfs.ignored.some((i) => i.path.includes("node_modules"))).toBe(
      true,
    );
    const result = convertProject(extracted.vfs);
    assertValidFreeDocument(result.routes[0]!.conversion.elementorJson, expect);
  });

  it("enforces project limits (files, bytes, ratio, archive entries)", () => {
    const tooManyFiles = extractProjectZip(
      zipFromFiles({
        "a.tsx": "1",
        "b.tsx": "2",
        "c.tsx": "3",
        "d.tsx": "4",
      }),
      { limits: { maxFiles: 3 } },
    );
    expect(tooManyFiles.ok).toBe(false);
    if (!tooManyFiles.ok) expect(tooManyFiles.error.code).toBe("file-count-limit");

    const tooBigUncompressed = extractProjectZip(
      zipFromFiles({ "big.txt": "a".repeat(5000) }),
      { limits: { maxUncompressedBytes: 1000, maxFileBytes: 10_000 } },
    );
    expect(tooBigUncompressed.ok).toBe(false);
    if (!tooBigUncompressed.ok) {
      expect(tooBigUncompressed.error.code).toBe("uncompressed-size-limit");
    }

    const tooBigFile = extractProjectZip(
      zipFromFiles({ "huge.tsx": "x".repeat(2000) }),
      { limits: { maxFileBytes: 500, maxUncompressedBytes: 50_000 } },
    );
    expect(tooBigFile.ok).toBe(false);
    if (!tooBigFile.ok) expect(tooBigFile.error.code).toBe("file-byte-limit");

    const zeros = new Uint8Array(200_000);
    const bomb = extractProjectZip(zipSync({ "bomb.txt": zeros }, { level: 9 }), {
      limits: {
        maxCompressionRatio: 5,
        maxUncompressedBytes: 5_000_000,
        maxFileBytes: 5_000_000,
        maxZipBytes: 5_000_000,
      },
    });
    expect(bomb.ok).toBe(false);
    if (!bomb.ok) expect(bomb.error.code).toBe("compression-ratio-limit");

    const many: Record<string, string> = {};
    for (let i = 0; i < 20; i++) many[`f${i}.txt`] = "x";
    const archive = extractProjectZip(zipFromFiles(many), {
      limits: { maxArchiveEntries: 10, maxFiles: 500 },
    });
    expect(archive.ok).toBe(false);
    if (!archive.ok) expect(archive.error.code).toBe("archive-entry-limit");
  });

  it("keeps PROJECT_LIMITS separate from SECTION_INPUT_LIMITS", () => {
    assertProjectLimitsSeparateFromSection(expect);
    expect(PROJECT_LIMITS.maxFiles).toBe(500);
    expect(SECTION_INPUT_LIMITS.maxFiles).toBe(50);
    expect(PROJECT_LIMITS.maxSourceFileBytes).toBe(1 * 1024 * 1024);
    expect(PROJECT_LIMITS.maxBinaryAssetBytes).toBe(5 * 1024 * 1024);
  });

  it("never runs package managers during fixture convert", () => {
    const childProcess =
      require("node:child_process") as typeof import("node:child_process");
    const spawnSync = vi.spyOn(childProcess, "spawnSync");
    const execSync = vi.spyOn(childProcess, "execSync");
    try {
      convertFixtureZip("e2e-kitchen");
      convertFixture("next-lucide");
      convertFixture("next-runtime");
    } finally {
      expect(spawnSync).not.toHaveBeenCalled();
      expect(execSync).not.toHaveBeenCalled();
      spawnSync.mockRestore();
      execSync.mockRestore();
    }
  });
});
