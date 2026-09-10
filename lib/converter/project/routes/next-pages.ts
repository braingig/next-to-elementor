/**
 * Next.js Pages Router static route discovery (Phase 13b).
 */

import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import { listTextPaths } from "../fs/paths";
import type { ProjectRoute } from "../manifest/types";

const PAGE_EXT_RE = /\.(tsx|jsx|js|mjs)$/;
const SPECIAL_FILES = new Set([
  "_app",
  "_document",
  "_error",
  "_middleware",
  "middleware",
]);

type PagesHit = {
  file: string;
  pagesRoot: string;
  /** Path relative to pages root without extension. */
  relNoExt: string;
};

function parseDynamicSegment(
  segment: string,
): { urlPart: string; dynamicName: string | null } {
  let m = /^\[\[\.\.\.(.+)\]\]$/.exec(segment);
  if (m) return { urlPart: `[[...${m[1]}]]`, dynamicName: `...${m[1]}` };
  m = /^\[\.\.\.(.+)\]$/.exec(segment);
  if (m) return { urlPart: `[...${m[1]}]`, dynamicName: `...${m[1]}` };
  m = /^\[(.+)\]$/.exec(segment);
  if (m) return { urlPart: `[${m[1]}]`, dynamicName: m[1]! };
  return { urlPart: segment, dynamicName: null };
}

export function findPagesRouterFiles(vfs: ProjectVirtualFS): PagesHit[] {
  const hits: PagesHit[] = [];
  for (const path of listTextPaths(vfs)) {
    const parts = path.split("/");
    const pagesIdx = parts.findIndex((p) => p === "pages");
    if (pagesIdx < 0) continue;

    // pages/api/**
    if (parts[pagesIdx + 1] === "api") continue;

    const base = parts[parts.length - 1]!;
    if (!PAGE_EXT_RE.test(base)) continue;

    const pagesRoot = parts.slice(0, pagesIdx + 1).join("/");
    const relParts = parts.slice(pagesIdx + 1);
    const fileBase = relParts[relParts.length - 1]!.replace(PAGE_EXT_RE, "");

    if (SPECIAL_FILES.has(fileBase)) continue;
    // Skip Next special error pages as conversion entries (not product UI).
    if (fileBase === "404" || fileBase === "500") continue;

    const relNoExt = [...relParts.slice(0, -1), fileBase].join("/");
    hits.push({ file: path, pagesRoot, relNoExt });
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file));
}

function routePathFromPagesRel(relNoExt: string): {
  path: string;
  dynamicSegments: string[];
} {
  const segments = relNoExt.split("/").filter(Boolean);
  // index → /
  if (segments.length === 1 && segments[0] === "index") {
    return { path: "/", dynamicSegments: [] };
  }

  const dynamicSegments: string[] = [];
  const urlParts: string[] = [];
  for (const segment of segments) {
    if (segment === "index" && urlParts.length > 0) {
      // trailing index omitted: blog/index → /blog
      continue;
    }
    if (segment === "index" && urlParts.length === 0) {
      continue;
    }
    const parsed = parseDynamicSegment(segment);
    urlParts.push(parsed.urlPart);
    if (parsed.dynamicName) dynamicSegments.push(parsed.dynamicName);
  }

  const path = urlParts.length === 0 ? "/" : `/${urlParts.join("/")}`;
  return { path, dynamicSegments };
}

/**
 * Discover Pages Router visual pages. Skips _app/_document/_error and pages/api.
 */
export function discoverNextPagesRoutes(
  vfs: ProjectVirtualFS,
): { routes: ProjectRoute[]; diagnostics: ProjectDiagnostic[] } {
  const diagnostics: ProjectDiagnostic[] = [];
  const routes: ProjectRoute[] = [];

  for (const path of listTextPaths(vfs)) {
    if (/(^|\/)pages\/api\//.test(path)) {
      diagnostics.push({
        severity: "info",
        code: "pages-api-skipped",
        message: `Skipped Pages Router API route: ${path}`,
        path,
      });
    }
  }

  const seenIds = new Set<string>();
  for (const hit of findPagesRouterFiles(vfs)) {
    const { path, dynamicSegments } = routePathFromPagesRel(hit.relNoExt);
    const isDynamic = dynamicSegments.length > 0;
    const id = `pages:${path}`;
    if (seenIds.has(id)) {
      diagnostics.push({
        severity: "warning",
        code: "pages-route-collision",
        message: `Multiple page files map to route ${path}; keeping the first discovery.`,
        path: hit.file,
      });
      continue;
    }
    seenIds.add(id);
    routes.push({
      id,
      path,
      kind: "page",
      entryFile: hit.file,
      layoutChain: [],
      dynamicSegments,
      isDynamic,
      confidence: isDynamic ? "low" : "high",
      source: "pages-router",
    });
  }

  return { routes, diagnostics };
}
