/**
 * Convert a project ZIP with Phase 14c/14d media against the Phase 11 WP harness,
 * then import the primary route document via Elementor.
 *
 * Usage:
 *   npx tsx scripts/import-project-with-runtime-media.ts [path-to.zip]
 *
 * Defaults to Festive Lights Pro.zip in Downloads when no path is given.
 * Requires: npm run test:elementor:runtime:setup (Hello Elementor + wp-media.json).
 *
 * Does not change converter mapping — only wires real WP REST media to 9080.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  convertProjectAsync,
  extractProjectZip,
  type ElementorDocument,
  type ProjectConversionResult,
} from "../lib/converter/index";
import {
  ensureGeneratedDir,
  GENERATED_DIR,
  importDocumentJson,
  probePhase11Runtime,
  readRuntimeEnv,
} from "../lib/converter/runtime";
import { createHarnessWordPressMediaClient } from "../lib/converter/runtime/wp-media";

function defaultZipPath(): string {
  return (
    process.env.N2E_PROJECT_ZIP?.trim() ||
    "/Users/nusratnova/Downloads/Festive Lights Pro.zip"
  );
}

function collectUrls(doc: ElementorDocument): string[] {
  const urls: string[] = [];
  const walk = (els: ElementorDocument["content"] | undefined) => {
    for (const el of els ?? []) {
      const s = el.settings ?? {};
      const bi = s.background_image as { url?: string } | undefined;
      if (typeof bi?.url === "string") urls.push(bi.url);
      const img = s.image as { url?: string } | undefined;
      if (typeof img?.url === "string") urls.push(img.url);
      const html = typeof s.html === "string" ? s.html : "";
      for (const m of html.matchAll(/src=["']([^"']+)["']/g)) {
        urls.push(m[1]!);
      }
      walk(el.elements);
    }
  };
  walk(doc.content);
  return urls;
}

async function main(): Promise<void> {
  const zipPath = resolve(process.argv[2] ?? defaultZipPath());
  if (!existsSync(zipPath)) {
    console.error(`ZIP not found: ${zipPath}`);
    process.exit(1);
  }

  const probe = probePhase11Runtime();
  if (probe.status === "blocked") {
    console.error("BLOCKED: runtime harness unavailable:");
    for (const r of probe.reasons) console.error(`  - ${r}`);
    process.exit(2);
  }

  const env = readRuntimeEnv();
  if (!env?.baseUrl) {
    console.error("BLOCKED: environment.json missing — run test:elementor:runtime:setup");
    process.exit(2);
  }

  const media = createHarnessWordPressMediaClient();
  if (!media.ok) {
    console.error(`BLOCKED: ${media.reason}`);
    process.exit(2);
  }

  // Guard: media must target the same origin as the visual harness.
  const harnessOrigin = new URL(env.baseUrl).origin;
  const mediaOrigin = new URL(media.config.baseUrl).origin;
  if (harnessOrigin !== mediaOrigin) {
    console.error(
      `BLOCKED: media baseUrl (${mediaOrigin}) must match harness baseUrl (${harnessOrigin}).`,
    );
    process.exit(2);
  }

  console.log(`Extracting ${basename(zipPath)}…`);
  const zip = new Uint8Array(readFileSync(zipPath));
  const extracted = extractProjectZip(zip);
  if (!extracted.ok) {
    console.error("ZIP extract failed:", extracted.error.code, extracted.error.message);
    process.exit(1);
  }

  console.log(`Uploading media to ${media.config.baseUrl} (optimize on)…`);
  const result: ProjectConversionResult = await convertProjectAsync(
    extracted.vfs,
    {
      media: {
        enabled: true,
        client: media.client,
        wordpress: media.config,
        optimize: true,
      },
    },
  );

  const route = result.routes[0];
  const doc = route?.conversion.elementorJson as ElementorDocument | null;
  if (!doc) {
    console.error("Conversion produced no Elementor document.");
    console.error("outcome:", result.outcome);
    console.error(
      "media:",
      result.media
        ? {
            uploaded: result.media.uploadedCount,
            failed: result.media.failedCount,
            skipped: result.media.skippedCount,
          }
        : null,
    );
    process.exit(1);
  }

  const urls = collectUrls(doc);
  const bad = urls.filter((u) => /example\.test/i.test(u));
  if (bad.length > 0) {
    console.error("ERROR: example.test URLs remain in document:", bad.slice(0, 5));
    process.exit(1);
  }
  const foreign = urls.filter((u) => {
    try {
      return new URL(u).origin !== harnessOrigin;
    } catch {
      return true;
    }
  });
  if (foreign.length > 0) {
    console.error(
      "ERROR: non-harness media URLs in document:",
      foreign.slice(0, 5),
    );
    process.exit(1);
  }

  ensureGeneratedDir();
  mkdirSync(join(GENERATED_DIR, "docs"), { recursive: true });
  const docPath = join(GENERATED_DIR, "docs", "festive-runtime-media.json");
  writeFileSync(docPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(`Wrote ${docPath}`);
  console.log(
    `Media summary: uploaded=${result.media?.uploadedCount ?? 0} reused=${result.media?.reusedCount ?? 0} failed=${result.media?.failedCount ?? 0} skipped=${result.media?.skippedCount ?? 0}`,
  );

  console.log("Importing into Elementor…");
  const imported = importDocumentJson(docPath);
  console.log(
    JSON.stringify(
      {
        ok: imported.ok,
        postId: imported.postId,
        permalink: imported.permalink,
        template: doc.settings?.template ?? null,
        sampleUrls: urls.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
