/**
 * Optional Docker integration: Phase 14c/14d media → same WP as Phase 11 harness.
 * Marks BLOCKED (skip) when Docker / credentials / Festive ZIP are unavailable —
 * never fabricates PASS.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  convertProjectAsync,
  extractProjectZip,
  type ElementorDocument,
} from "@/lib/converter";
import {
  dockerDaemonAvailable,
  probePhase11Runtime,
  readRuntimeEnv,
} from "@/lib/converter/runtime";
import {
  createHarnessWordPressMediaClient,
  harnessWordPressMediaPath,
} from "@/lib/converter/runtime/wp-media";

const FESTIVE_ZIP =
  process.env.N2E_PROJECT_ZIP?.trim() ||
  "/Users/nusratnova/Downloads/Festive Lights Pro.zip";

function collectHttpUrls(doc: ElementorDocument): string[] {
  const urls: string[] = [];
  const walk = (els: ElementorDocument["content"] | undefined) => {
    for (const el of els ?? []) {
      const s = el.settings ?? {};
      const bi = s.background_image as { url?: string } | undefined;
      if (typeof bi?.url === "string") urls.push(bi.url);
      const img = s.image as { url?: string } | undefined;
      if (typeof img?.url === "string") urls.push(img.url);
      const html = typeof s.html === "string" ? s.html : "";
      for (const m of html.matchAll(/src=["'](https?:\/\/[^"']+)["']/g)) {
        urls.push(m[1]!);
      }
      walk(el.elements);
    }
  };
  walk(doc.content);
  return [...new Set(urls)];
}

const probe = probePhase11Runtime();
const env = readRuntimeEnv();
const media = createHarnessWordPressMediaClient();
const zipOk = existsSync(FESTIVE_ZIP);
const ready =
  dockerDaemonAvailable() &&
  probe.status === "available" &&
  Boolean(env?.baseUrl) &&
  media.ok &&
  zipOk &&
  existsSync(harnessWordPressMediaPath());

if (!ready) {
  console.warn(
    "BLOCKED: runtime media integration unavailable — run test:elementor:runtime:setup and ensure Festive ZIP exists.",
  );
}

describe.skipIf(!ready)(
  "Runtime WordPress media integration (Phase 14c/14d ↔ harness)",
  () => {
    it("credentials target the same origin as the visual harness", () => {
      expect(media.ok).toBe(true);
      if (!media.ok || !env?.baseUrl) return;
      expect(new URL(media.config.baseUrl).origin).toBe(
        new URL(env.baseUrl).origin,
      );
    });

    it(
      "uploads Festive VFS images to harness WP and rewrites document URLs",
      async () => {
        expect(media.ok).toBe(true);
        if (!media.ok || !env?.baseUrl) return;

        const zip = new Uint8Array(readFileSync(FESTIVE_ZIP));
        const extracted = extractProjectZip(zip);
        expect(extracted.ok).toBe(true);
        if (!extracted.ok) return;

        const result = await convertProjectAsync(extracted.vfs, {
          media: {
            enabled: true,
            client: media.client,
            wordpress: media.config,
            optimize: true,
          },
        });

        expect(result.media?.enabled).toBe(true);
        expect(
          result.media!.uploadedCount + result.media!.reusedCount,
        ).toBeGreaterThan(0);
        expect(result.media!.failedCount).toBe(0);

        const doc = result.routes[0]?.conversion
          .elementorJson as ElementorDocument | null;
        expect(doc).not.toBeNull();
        const urls = collectHttpUrls(doc!);
        expect(urls.length).toBeGreaterThan(0);
        expect(urls.every((u) => !/example\.test/i.test(u))).toBe(true);

        const origin = new URL(env.baseUrl).origin;
        const harnessUrls = urls.filter((u) => {
          try {
            return new URL(u).origin === origin;
          } catch {
            return false;
          }
        });
        expect(harnessUrls.length).toBeGreaterThan(0);

        const sample = harnessUrls.slice(0, 5);
        for (const url of sample) {
          const res = await fetch(url, { method: "GET" });
          expect(res.status, url).toBe(200);
          const ct = res.headers.get("content-type") ?? "";
          expect(ct.startsWith("image/"), `${url} content-type=${ct}`).toBe(
            true,
          );
        }

        let heroBg: string | undefined;
        const walk = (els: ElementorDocument["content"] | undefined) => {
          for (const el of els ?? []) {
            const s = el.settings ?? {};
            const bi = s.background_image as { url?: string } | undefined;
            if (
              bi?.url &&
              s.content_width === "full" &&
              s.background_size === "cover"
            ) {
              heroBg = bi.url;
              return;
            }
            walk(el.elements);
            if (heroBg) return;
          }
        };
        walk(doc!.content);
        if (heroBg) {
          expect(heroBg.startsWith(origin)).toBe(true);
          expect(heroBg).not.toMatch(/example\.test/i);
          const res = await fetch(heroBg);
          expect(res.status).toBe(200);
        }
      },
      120_000,
    );
  },
);
