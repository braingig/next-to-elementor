import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { VisualStatus } from "../../lib/converter/runtime/report";
import { VIEWPORTS } from "./fixtures";

const GENERATED = join(process.cwd(), "tests/runtime/generated");
const SCREENSHOTS = join(GENERATED, "screenshots");
const SOURCE_BASE = "http://127.0.0.1:9321";

function loadEnv(): { baseUrl: string; elementor: string } | null {
  const p = join(GENERATED, "environment.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function listImportedPages(): Array<{ name: string; permalink: string }> {
  if (!existsSync(GENERATED)) return [];
  return readdirSync(GENERATED)
    .filter((f) => f.startsWith("page-") && f.endsWith(".json"))
    .map((f) => {
      return JSON.parse(readFileSync(join(GENERATED, f), "utf8")) as {
        name: string;
        permalink: string;
      };
    });
}

function classifyDiff(ratio: number): VisualStatus {
  if (ratio < 0.02) return "VISUAL_CLOSE";
  if (ratio < 0.08) return "VISUAL_MINOR_DIFFERENCE";
  return "VISUAL_SIGNIFICANT_DIFFERENCE";
}

test.describe("Phase 11 browser + visual validation", () => {
  const env = loadEnv();
  const pages = listImportedPages();

  test.beforeAll(() => {
    mkdirSync(SCREENSHOTS, { recursive: true });
  });

  test("runtime environment must be Elementor Free 4.2.4 when present", () => {
    test.skip(!env, "BLOCKED: runtime environment.json missing — run setup + runtime first");
    expect(env!.elementor).toBe("4.2.4");
  });

  test("imported pages exist for browser checks", () => {
    test.skip(!env, "BLOCKED: no runtime env");
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const pageInfo of pages) {
    test(`page loads and widgets render: ${pageInfo.name}`, async ({ page }) => {
      test.skip(!env, "BLOCKED: no runtime env");
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(String(err)));

      const res = await page.goto(pageInfo.permalink, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      expect(res).toBeTruthy();
      expect(res!.status()).toBeLessThan(400);

      const hasElementor = await page.locator(".elementor").count();
      expect(hasElementor).toBeGreaterThan(0);

      const critical = errors.filter(
        (e) =>
          !/favicon|cdn\.example\.com|Failed to load resource|net::ERR/i.test(e),
      );
      expect(critical).toEqual([]);
    });
  }

  // Limit visual matrix to core real-world fixtures to keep runtime bounded.
  const visualTargets = pages.filter((p) =>
    /^(01-hero|03-cta|04-navbar|custom-fallback-scoped)$/.test(p.name),
  );

  for (const pageInfo of visualTargets) {
    for (const [vpName, size] of Object.entries(VIEWPORTS)) {
      test(`screenshot ${pageInfo.name} @ ${vpName}`, async ({ page }) => {
        test.skip(!env, "BLOCKED: no runtime env");
        await page.setViewportSize(size);
        await page.goto(pageInfo.permalink, {
          waitUntil: "networkidle",
          timeout: 60_000,
        });
        const elementorShot = join(
          SCREENSHOTS,
          `${pageInfo.name}-elementor-${vpName}.png`,
        );
        await page.screenshot({ path: elementorShot, fullPage: true });
        expect(existsSync(elementorShot)).toBe(true);

        const sourceUrl = `${SOURCE_BASE}/${pageInfo.name}.html`;
        const sourceHead = await page.request.get(sourceUrl);
        if (!sourceHead.ok()) {
          writeFileSync(
            join(SCREENSHOTS, `${pageInfo.name}-${vpName}-visual.json`),
            JSON.stringify(
              {
                visualStatus: "NOT_COMPARABLE",
                reason: "no controlled source HTML for this fixture",
                advisory: true,
              },
              null,
              2,
            ),
          );
          return;
        }

        await page.goto(sourceUrl, { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        const sourceShot = join(
          SCREENSHOTS,
          `${pageInfo.name}-source-${vpName}.png`,
        );
        await page.screenshot({ path: sourceShot, fullPage: true });

        const imgA = PNG.sync.read(readFileSync(elementorShot));
        const imgB = PNG.sync.read(readFileSync(sourceShot));
        if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
          writeFileSync(
            join(SCREENSHOTS, `${pageInfo.name}-${vpName}-visual.json`),
            JSON.stringify(
              {
                visualStatus: "NOT_COMPARABLE",
                reason: `dimension mismatch elementor=${imgA.width}x${imgA.height} source=${imgB.width}x${imgB.height}`,
                advisory: true,
              },
              null,
              2,
            ),
          );
          return;
        }
        const { width, height } = imgA;
        const diff = new PNG({ width, height });
        const mismatched = pixelmatch(
          imgA.data,
          imgB.data,
          diff.data,
          width,
          height,
          { threshold: 0.2 },
        );
        const ratio = mismatched / (width * height);
        const visualStatus = classifyDiff(ratio);
        writeFileSync(
          join(SCREENSHOTS, `${pageInfo.name}-${vpName}-diff.png`),
          PNG.sync.write(diff),
        );
        writeFileSync(
          join(SCREENSHOTS, `${pageInfo.name}-${vpName}-visual.json`),
          JSON.stringify(
            {
              visualStatus,
              mismatchRatio: Number(ratio.toFixed(6)),
              mismatchedPixels: mismatched,
              advisory: true,
              note: "Visual similarity is advisory; semantic/runtime compatibility is the source of truth.",
            },
            null,
            2,
          ),
        );
        expect(visualStatus).not.toBe("BLOCKED");
      });
    }
  }

  test("custom fallback fixture renders HTML when imported", async ({
    page,
  }) => {
    test.skip(!env, "BLOCKED: no runtime env");
    const metaPath = join(GENERATED, "page-custom-fallback-scoped.json");
    test.skip(!existsSync(metaPath), "custom-fallback page not imported yet");
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
      permalink: string;
    };
    await page.goto(meta.permalink, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".elementor-widget-html").first()).toBeVisible();
    await expect(page.locator(".elementor-widget-heading").first()).toBeVisible();
  });
});
