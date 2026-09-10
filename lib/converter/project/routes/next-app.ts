/**
 * Next.js App Router static route discovery (Phase 13b).
 */

import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import { listTextPaths } from "../fs/paths";
import type { ProjectRoute } from "../manifest/types";

const PAGE_BASENAME_RE = /^page\.(tsx|jsx|js|mjs)$/;
const LAYOUT_BASENAME_RE = /^layout\.(tsx|jsx|js|mjs)$/;

type AppPageHit = {
  pageFile: string;
  appRoot: string;
  /** Directory containing the page file (POSIX, no trailing slash). */
  pageDir: string;
};

function isSkippedSegment(segment: string): boolean {
  // Route groups (marketing), private folders, parallel route slots
  if (segment.startsWith("(") && segment.endsWith(")")) return true;
  if (segment.startsWith("_")) return true;
  if (segment.startsWith("@")) return true;
  return false;
}

function parseDynamicSegment(
  segment: string,
): { urlPart: string; dynamicName: string | null } {
  // [[...slug]] optional catch-all
  let m = /^\[\[\.\.\.(.+)\]\]$/.exec(segment);
  if (m) {
    return { urlPart: `[[...${m[1]}]]`, dynamicName: `...${m[1]}` };
  }
  // [...slug] catch-all
  m = /^\[\.\.\.(.+)\]$/.exec(segment);
  if (m) {
    return { urlPart: `[...${m[1]}]`, dynamicName: `...${m[1]}` };
  }
  // [id]
  m = /^\[(.+)\]$/.exec(segment);
  if (m) {
    return { urlPart: `[${m[1]}]`, dynamicName: m[1]! };
  }
  return { urlPart: segment, dynamicName: null };
}

/**
 * Locate app roots + page files. Supports `app/` and `src/app/`.
 */
export function findAppRouterPages(vfs: ProjectVirtualFS): AppPageHit[] {
  const hits: AppPageHit[] = [];
  for (const path of listTextPaths(vfs)) {
    const parts = path.split("/");
    const base = parts[parts.length - 1]!;
    if (!PAGE_BASENAME_RE.test(base)) continue;

    const appIdx = parts.findIndex((p) => p === "app");
    if (appIdx < 0) continue;

    // Ensure this `app` segment is a routing root (app/page or app/.../page)
    const appRoot = parts.slice(0, appIdx + 1).join("/");
    const pageDir = parts.slice(0, -1).join("/");

    // Skip if any segment between app and page is a private/parallel folder that
    // Next would not treat as a normal page tree leaf — still allow groups.
    const between = parts.slice(appIdx + 1, -1);
    if (between.some((s) => s.startsWith("_") || s.startsWith("@"))) {
      continue;
    }

    hits.push({ pageFile: path, appRoot, pageDir });
  }
  return hits.sort((a, b) => a.pageFile.localeCompare(b.pageFile));
}

function routePathFromAppPage(hit: AppPageHit): {
  path: string;
  dynamicSegments: string[];
} {
  const parts = hit.pageDir.split("/");
  const appIdx = parts.findIndex((p) => p === "app");
  const between = parts.slice(appIdx + 1);
  const dynamicSegments: string[] = [];
  const urlParts: string[] = [];

  for (const segment of between) {
    if (isSkippedSegment(segment)) continue;
    const parsed = parseDynamicSegment(segment);
    urlParts.push(parsed.urlPart);
    if (parsed.dynamicName) dynamicSegments.push(parsed.dynamicName);
  }

  const path = urlParts.length === 0 ? "/" : `/${urlParts.join("/")}`;
  return { path, dynamicSegments };
}

function collectLayoutChain(
  vfs: ProjectVirtualFS,
  hit: AppPageHit,
): string[] {
  const parts = hit.pageDir.split("/");
  const appIdx = parts.findIndex((p) => p === "app");
  const chain: string[] = [];

  for (let i = appIdx; i < parts.length; i++) {
    const dir = parts.slice(0, i + 1).join("/");
    for (const ext of ["tsx", "jsx", "js", "mjs"]) {
      const candidate = `${dir}/layout.${ext}`;
      if (candidate in vfs.files) {
        chain.push(candidate);
        break;
      }
    }
  }
  return chain;
}

/**
 * Discover App Router visual pages. Ignores route.ts handlers entirely.
 */
export function discoverNextAppRoutes(
  vfs: ProjectVirtualFS,
): { routes: ProjectRoute[]; diagnostics: ProjectDiagnostic[] } {
  const diagnostics: ProjectDiagnostic[] = [];
  const routes: ProjectRoute[] = [];

  // Explicitly note ignored API route handlers when present.
  for (const path of listTextPaths(vfs)) {
    if (/(^|\/)app\/.*\/route\.(ts|js|tsx|jsx|mjs)$/.test(path) ||
        /(^|\/)app\/route\.(ts|js|tsx|jsx|mjs)$/.test(path)) {
      diagnostics.push({
        severity: "info",
        code: "app-route-handler-skipped",
        message: `Skipped App Router route handler (not visual UI): ${path}`,
        path,
      });
    }
  }

  for (const hit of findAppRouterPages(vfs)) {
    const { path, dynamicSegments } = routePathFromAppPage(hit);
    const layoutChain = collectLayoutChain(vfs, hit);
    const isDynamic = dynamicSegments.length > 0;
    routes.push({
      id: `app:${path}`,
      path,
      kind: "page",
      entryFile: hit.pageFile,
      layoutChain,
      dynamicSegments,
      isDynamic,
      confidence: isDynamic ? "low" : "high",
      source: "app-router",
    });
  }

  return { routes, diagnostics };
}

export { PAGE_BASENAME_RE, LAYOUT_BASENAME_RE };
