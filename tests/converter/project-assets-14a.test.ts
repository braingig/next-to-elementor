/**
 * Phase 14a — separate source/text vs binary-asset ZIP admission limits.
 * No image decoding, compression, or WP media upload.
 */

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  classifyProjectPathAdmission,
  convertProject,
  extractProjectZip,
  PROJECT_LIMITS,
  resolveProjectLimits,
  SECTION_INPUT_LIMITS,
} from "@/lib/converter";

function zipFromFiles(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    encoded[path] =
      typeof content === "string" ? strToU8(content) : content;
  }
  // Store (level 0) so high-entropy fixture binaries do not trip the
  // compression-ratio bomb guard the way patterned/deflated payloads would.
  return zipSync(encoded, { level: 0 });
}

/**
 * High-entropy PNG-shaped bytes for admission tests.
 * Not a valid PNG image — Phase 14a never decodes image payloads.
 */
function fakePng(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  bytes[4] = 0x0d;
  bytes[5] = 0x0a;
  bytes[6] = 0x1a;
  bytes[7] = 0x0a;
  let x = 0x9e3779b9;
  for (let i = 8; i < byteLength; i++) {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
    bytes[i] = x & 0xff;
  }
  return bytes;
}

describe("Phase 14a: limit model", () => {
  it("exposes separate source and binary limits with Phase 13 archive caps", () => {
    expect(PROJECT_LIMITS.maxSourceFileBytes).toBe(1 * 1024 * 1024);
    expect(PROJECT_LIMITS.maxFileBytes).toBe(PROJECT_LIMITS.maxSourceFileBytes);
    expect(PROJECT_LIMITS.maxBinaryAssetBytes).toBe(5 * 1024 * 1024);
    expect(PROJECT_LIMITS.maxBinaryAssetsTotalBytes).toBe(15 * 1024 * 1024);
    expect(PROJECT_LIMITS.maxZipBytes).toBe(5 * 1024 * 1024);
    expect(PROJECT_LIMITS.maxUncompressedBytes).toBe(20 * 1024 * 1024);
    expect(PROJECT_LIMITS.maxSourceFileBytes).toBeGreaterThan(
      SECTION_INPUT_LIMITS.maxFileBytes,
    );
  });

  it("resolves deprecated maxFileBytes override into maxSourceFileBytes", () => {
    const limits = resolveProjectLimits({ maxFileBytes: 12345 });
    expect(limits.maxSourceFileBytes).toBe(12345);
    expect(limits.maxFileBytes).toBe(12345);
    expect(limits.maxBinaryAssetBytes).toBe(PROJECT_LIMITS.maxBinaryAssetBytes);
  });

  it("classifies paths without decoding", () => {
    expect(classifyProjectPathAdmission("src/assets/santa.png")).toBe(
      "binary-asset",
    );
    expect(classifyProjectPathAdmission("a.jpg")).toBe("binary-asset");
    expect(classifyProjectPathAdmission("a.jpeg")).toBe("binary-asset");
    expect(classifyProjectPathAdmission("a.webp")).toBe("binary-asset");
    expect(classifyProjectPathAdmission("a.gif")).toBe("binary-asset");
    expect(classifyProjectPathAdmission("icon.svg")).toBe("source-text");
    expect(classifyProjectPathAdmission("app/page.tsx")).toBe("source-text");
    expect(classifyProjectPathAdmission("font.woff2")).toBe("other-binary");
  });
});

describe("Phase 14a: binary admission", () => {
  it("accepts PNG slightly above 1 MiB but below 5 MiB (santa regression)", () => {
    const santaSize = 1_109_933;
    const zip = zipFromFiles({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/page.tsx":
        'export default function Home(){return <img src="/assets/santa.png" alt="Santa" />;}',
      "src/assets/santa.png": fakePng(santaSize),
    });
    const result = extractProjectZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const santa = result.vfs.files["src/assets/santa.png"];
    expect(santa?.kind).toBe("binary");
    if (santa?.kind === "binary") {
      expect(santa.byteLength).toBe(santaSize);
      expect(santa.bytes.byteLength).toBe(santaSize);
      // Original bytes unchanged — no recompression/transcode.
      expect(santa.bytes[0]).toBe(0x89);
      expect(santa.extension).toBe(".png");
    }
    expect(
      result.vfs.diagnostics.every((d) => d.code !== "asset-file-byte-limit"),
    ).toBe(true);
  });

  it("admits JPEG/WebP/GIF within binary limit", () => {
    const result = extractProjectZip(
      zipFromFiles({
        "package.json": "{}",
        "src/main.tsx": "export default function App(){return <h1/>;}",
        "photo.jpg": fakePng(800_000),
        "shot.webp": fakePng(900_000),
        "anim.gif": fakePng(700_000),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vfs.files["photo.jpg"]?.kind).toBe("binary");
    expect(result.vfs.files["shot.webp"]?.kind).toBe("binary");
    expect(result.vfs.files["anim.gif"]?.kind).toBe("binary");
  });

  it("keeps SVG under source/text limit (hard-fail when oversized)", () => {
    const zip = zipFromFiles({
      "package.json": "{}",
      "src/main.tsx": "export default function App(){return <h1/>;}",
      "icon.svg": "x".repeat(PROJECT_LIMITS.maxSourceFileBytes + 10),
    });
    const result = extractProjectZip(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("file-byte-limit");
  });

  it("hard-fails source files slightly above 1 MiB", () => {
    const zip = zipFromFiles({
      "package.json": "{}",
      "src/main.tsx": "x".repeat(PROJECT_LIMITS.maxSourceFileBytes + 50),
    });
    const result = extractProjectZip(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("file-byte-limit");
  });

  it("soft-skips binary assets above 5 MiB and continues the project", () => {
    const huge = fakePng(PROJECT_LIMITS.maxBinaryAssetBytes + 1000);
    const zip = zipFromFiles({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/page.tsx":
        "export default function Home(){return <h1>Home</h1>;}",
      "app/about/page.tsx":
        "export default function About(){return <h1>About</h1>;}",
      "public/huge.png": huge,
    });
    // Store-level ~5 MiB asset exceeds default maxZipBytes; raise archive caps only.
    const extracted = extractProjectZip(zip, {
      limits: {
        maxZipBytes: 12 * 1024 * 1024,
        maxUncompressedBytes: 20 * 1024 * 1024,
      },
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.vfs.files["public/huge.png"]).toBeUndefined();
    expect(extracted.vfs.files["app/page.tsx"]).toBeDefined();
    expect(
      extracted.vfs.diagnostics.some((d) => d.code === "asset-file-byte-limit"),
    ).toBe(true);
    expect(extracted.vfs.stats.skippedBinaryAssetCount).toBeGreaterThan(0);
    expect(JSON.stringify(extracted.vfs.diagnostics)).not.toMatch(/\/Users\//);

    const converted = convertProject(extracted.vfs);
    expect(converted.routes.length).toBe(2);
    expect(
      converted.diagnostics.some((d) => d.code === "asset-file-byte-limit"),
    ).toBe(true);
    // Unrelated routes still convert; project is not complete while assets skipped.
    expect(
      converted.routes.every((r) => r.conversion.elementorJson != null),
    ).toBe(true);
    expect(converted.outcome).toBe("partial");
  });

  it("soft-skips additional binaries when total binary budget is exceeded", () => {
    // Use reduced budget so the ZIP stays under archive size limits.
    const chunk = 800;
    const zip = zipFromFiles({
      "package.json": "{}",
      "src/main.tsx": "export default function App(){return <h1>App</h1>;}",
      "a.png": fakePng(chunk),
      "b.png": fakePng(chunk),
      "c.png": fakePng(chunk),
      "d.png": fakePng(chunk),
    });
    const result = extractProjectZip(zip, {
      limits: {
        maxBinaryAssetBytes: 1000,
        maxBinaryAssetsTotalBytes: 2000,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const admitted = ["a.png", "b.png", "c.png", "d.png"].filter(
      (p) => result.vfs.files[p],
    );
    expect(admitted.length).toBe(2);
    expect(
      result.vfs.diagnostics.some((d) => d.code === "asset-total-byte-limit"),
    ).toBe(true);
    expect(result.vfs.files["src/main.tsx"]).toBeDefined();
  });

  it("does not decode or optimize images during admission", () => {
    const png = fakePng(1_200_000);
    const signature = Array.from(png.subarray(0, 8));
    const mid = png[600_000];
    const end = png[png.length - 1];
    const result = extractProjectZip(
      zipFromFiles({
        "package.json": "{}",
        "src/main.tsx": "export default function App(){return <h1/>;}",
        "img.png": png,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = result.vfs.files["img.png"];
    expect(stored?.kind).toBe("binary");
    if (stored?.kind === "binary") {
      // Bytes preserved as-is (no recompress/transcode); avoid deep-equal on 1.2MB.
      expect(stored.byteLength).toBe(1_200_000);
      expect(Array.from(stored.bytes.subarray(0, 8))).toEqual(signature);
      expect(stored.bytes[600_000]).toBe(mid);
      expect(stored.bytes[stored.bytes.length - 1]).toBe(end);
      expect(stored.extension).toBe(".png");
    }
  });
});

describe("Phase 14a: archive security unchanged", () => {
  it("still hard-fails ZIP over maxZipBytes", () => {
    const zip = zipFromFiles({
      "package.json": "{}",
      "src/main.tsx": "export default function App(){return <h1/>;}",
    });
    const huge = new Uint8Array(PROJECT_LIMITS.maxZipBytes + 10);
    huge.set(zip.subarray(0, Math.min(zip.length, 100)), 0);
    const result = extractProjectZip(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("zip-size-limit");
  });

  it("still hard-fails total uncompressed over limit", () => {
    const zip = zipFromFiles({
      "big.txt": "a".repeat(5000),
    });
    const result = extractProjectZip(zip, {
      limits: {
        maxUncompressedBytes: 1000,
        maxSourceFileBytes: 10_000,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("uncompressed-size-limit");
  });

  it("still enforces compression ratio, archive entries, and file count", () => {
    const zeros = new Uint8Array(200_000);
    const bomb = extractProjectZip(zipSync({ "bomb.txt": zeros }, { level: 9 }), {
      limits: {
        maxCompressionRatio: 5,
        maxUncompressedBytes: 5_000_000,
        maxSourceFileBytes: 5_000_000,
        maxBinaryAssetBytes: 5_000_000,
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

    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i++) files[`f${i}.tsx`] = `export const F${i}=1;`;
    const count = extractProjectZip(zipFromFiles(files), {
      limits: { maxFiles: 3 },
    });
    expect(count.ok).toBe(false);
    if (!count.ok) expect(count.error.code).toBe("file-count-limit");
  });
});

describe("Phase 14a: conversion with admitted large image", () => {
  it("proceeds to conversion when a >1 MiB image is admitted", () => {
    const zip = zipFromFiles({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/page.tsx": `
        export default function Home() {
          return (
            <section>
              <h1>Holiday</h1>
              <img src="/assets/santa.png" alt="Santa" width={200} height={200} />
            </section>
          );
        }
      `,
      "src/assets/santa.png": fakePng(1_109_933),
    });
    const extracted = extractProjectZip(zip);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const result = convertProject(extracted.vfs);
    expect(result.routes[0]?.conversion.elementorJson).not.toBeNull();
    // URL-only Elementor image behavior unchanged (no WP media id invented).
    const json = JSON.stringify(result.routes[0]?.conversion.elementorJson);
    expect(json).toMatch(/santa\.png/);
    expect(json).not.toMatch(/"id"\s*:\s*\d{5,}/);
  });
});
