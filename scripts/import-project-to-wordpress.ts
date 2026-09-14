/**
 * Convert a project ZIP against a configured target WordPress site:
 * media upload → rewrite → Elementor JSON → create a NEW Elementor Library template.
 *
 * Credentials: gitignored `.n2e-wp.local.json` at the project root.
 *
 * Usage:
 *   npx tsx scripts/import-project-to-wordpress.ts [path-to.zip]
 *
 * Each run creates a NEW `elementor_library` template and prints its editUrl.
 * Open that URL (or Templates → that row → Edit with Elementor) to see this import.
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
  createWordPressMediaClient,
} from "../lib/converter/project/media";
import {
  applyMediaAttachmentIds,
  importElementorDocument,
  resolveWordPressTargetConfig,
} from "../lib/converter/wordpress";

function resolveZipPath(): string | null {
  const fromArg = process.argv[2]?.trim();
  if (fromArg) return resolve(fromArg);
  const fromEnv = process.env.N2E_PROJECT_ZIP?.trim();
  if (fromEnv) return resolve(fromEnv);
  return null;
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
  const zipPath = resolveZipPath();
  if (!zipPath) {
    console.error(
      "Provide a project ZIP path as the first argument, or set N2E_PROJECT_ZIP.",
    );
    process.exit(1);
  }
  if (!existsSync(zipPath)) {
    console.error(`ZIP not found: ${zipPath}`);
    process.exit(1);
  }

  const resolved = resolveWordPressTargetConfig();
  if (!resolved.ok) {
    console.error(`BLOCKED: ${resolved.message}`);
    process.exit(2);
  }

  const { config, source } = resolved;
  const targetOrigin = new URL(config.baseUrl).origin;
  console.log(
    `Target WordPress: ${config.baseUrl} (credentials from ${source}${resolved.path ? `: ${resolved.path}` : ""})`,
  );
  console.log(
    "Create mode: will create a NEW Elementor Library template (no target post ID).",
  );

  console.log(`Extracting ${basename(zipPath)}…`);
  const zip = new Uint8Array(readFileSync(zipPath));
  const extracted = extractProjectZip(zip);
  if (!extracted.ok) {
    console.error(
      "ZIP extract failed:",
      extracted.error.code,
      extracted.error.message,
    );
    process.exit(1);
  }

  const client = createWordPressMediaClient({ config });
  console.log(`Uploading media to ${config.baseUrl}…`);
  const result: ProjectConversionResult = await convertProjectAsync(
    extracted.vfs,
    {
      media: {
        enabled: true,
        client,
        wordpress: config,
        optimize: true,
      },
    },
  );

  const route = result.routes[0];
  let doc = route?.conversion.elementorJson as ElementorDocument | null;
  if (!doc) {
    console.error("Conversion produced no Elementor document.");
    console.error("outcome:", result.outcome);
    process.exit(1);
  }

  if (result.media?.uploads?.length) {
    doc = applyMediaAttachmentIds(doc, result.media.uploads);
  }

  const urls = collectUrls(doc);
  const badExample = urls.filter((u) => /example\.test/i.test(u));
  if (badExample.length > 0) {
    console.error("ERROR: example.test URLs remain:", badExample.slice(0, 5));
    process.exit(1);
  }
  const foreign = urls.filter((u) => {
    try {
      return new URL(u).origin !== targetOrigin;
    } catch {
      return true;
    }
  });
  if (foreign.length > 0) {
    console.error(
      "ERROR: non-target media URLs in document:",
      foreign.slice(0, 5),
    );
    process.exit(1);
  }
  const runtimeLeak = urls.filter((u) => /127\.0\.0\.1:9080/i.test(u));
  if (runtimeLeak.length > 0) {
    console.error("ERROR: 127.0.0.1:9080 URLs remain:", runtimeLeak.slice(0, 5));
    process.exit(1);
  }

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const docPath = join(outDir, "last-wordpress-import.json");
  writeFileSync(docPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(`Wrote ${docPath}`);
  console.log(
    `Media: uploaded=${result.media?.uploadedCount ?? 0} reused=${result.media?.reusedCount ?? 0} failed=${result.media?.failedCount ?? 0} skipped=${result.media?.skippedCount ?? 0}`,
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const templateTitle = `N2E Import ${stamp}`;
  console.log(`Creating NEW Elementor Library template “${templateTitle}”…`);
  const imported = await importElementorDocument({
    config,
    document: { ...doc, title: templateTitle },
    title: templateTitle,
  });

  if (!imported.ok) {
    console.error("Import failed:", imported.code, imported.message);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: imported.mode,
        postId: imported.postId,
        postType: imported.postType,
        permalink: imported.permalink,
        editUrl: imported.editUrl,
        title: imported.title,
        media: {
          uploaded: result.media?.uploadedCount ?? 0,
          reused: result.media?.reusedCount ?? 0,
          failed: result.media?.failedCount ?? 0,
          skipped: result.media?.skippedCount ?? 0,
        },
        sampleUrls: urls.slice(0, 8),
      },
      null,
      2,
    ),
  );
  console.log(
    `\nOpen Edit with Elementor for THIS import:\n  ${imported.editUrl}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
