/**
 * Route discovery orchestrator (Phase 13b).
 */

import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import { detectFramework } from "../manifest/detect";
import type {
  DiscoverRoutesResult,
  ProjectManifest,
  ProjectRoute,
  ProjectStructureAnalysis,
} from "../manifest/types";
import { discoverNextAppRoutes } from "./next-app";
import { discoverNextPagesRoutes } from "./next-pages";
import { discoverSpaRoutes } from "./spa";

function dedupeRoutes(routes: ProjectRoute[]): ProjectRoute[] {
  const seen = new Set<string>();
  const out: ProjectRoute[] = [];
  for (const route of routes) {
    // Allow same URL from app + pages in hybrid (different ids).
    if (seen.has(route.id)) continue;
    seen.add(route.id);
    out.push(route);
  }
  return out;
}

/**
 * Discover visual routes for a previously detected manifest.
 */
export function discoverProjectRoutes(
  vfs: ProjectVirtualFS,
  manifest: ProjectManifest,
): DiscoverRoutesResult {
  const diagnostics: ProjectDiagnostic[] = [];
  const routes: ProjectRoute[] = [];

  switch (manifest.framework) {
    case "next-app": {
      const app = discoverNextAppRoutes(vfs);
      routes.push(...app.routes);
      diagnostics.push(...app.diagnostics);
      break;
    }
    case "next-pages": {
      const pages = discoverNextPagesRoutes(vfs);
      routes.push(...pages.routes);
      diagnostics.push(...pages.diagnostics);
      break;
    }
    case "next-hybrid": {
      const app = discoverNextAppRoutes(vfs);
      const pages = discoverNextPagesRoutes(vfs);
      routes.push(...app.routes, ...pages.routes);
      diagnostics.push(...app.diagnostics, ...pages.diagnostics);
      diagnostics.push({
        severity: "info",
        code: "next-hybrid-routes",
        message:
          "Both App Router and Pages Router visual routes were discovered.",
      });
      break;
    }
    case "vite-react":
    case "cra":
    case "react-plain": {
      const spa = discoverSpaRoutes(vfs, manifest);
      routes.push(...spa.routes);
      diagnostics.push(...spa.diagnostics);
      break;
    }
    case "unknown": {
      // Best-effort: if app/pages trees exist despite unknown classification, surface them.
      const app = discoverNextAppRoutes(vfs);
      const pages = discoverNextPagesRoutes(vfs);
      if (app.routes.length > 0 || pages.routes.length > 0) {
        routes.push(...app.routes, ...pages.routes);
        diagnostics.push(...app.diagnostics, ...pages.diagnostics);
        diagnostics.push({
          severity: "warning",
          code: "unknown-framework-with-routes",
          message:
            "Framework classified as unknown, but Next-like page files were still discovered.",
        });
      } else {
        const spa = discoverSpaRoutes(vfs, manifest);
        routes.push(...spa.routes);
        diagnostics.push(...spa.diagnostics);
        if (routes.length === 0) {
          diagnostics.push({
            severity: "warning",
            code: "no-routes-discovered",
            message: "No visual routes or SPA entry could be discovered.",
          });
        }
      }
      break;
    }
    default: {
      diagnostics.push({
        severity: "warning",
        code: "no-routes-discovered",
        message: `No route discovery strategy for framework ${manifest.framework}.`,
      });
    }
  }

  return {
    routes: dedupeRoutes(routes).sort((a, b) =>
      a.path.localeCompare(b.path) || a.id.localeCompare(b.id),
    ),
    diagnostics,
  };
}

/**
 * detectFramework + discoverProjectRoutes in one pass (no conversion).
 */
export function analyzeProjectStructure(
  vfs: ProjectVirtualFS,
): ProjectStructureAnalysis {
  const manifest = detectFramework(vfs);
  const discovered = discoverProjectRoutes(vfs, manifest);
  const diagnostics = [...manifest.diagnostics, ...discovered.diagnostics];
  return {
    manifest,
    routes: discovered.routes,
    diagnostics,
  };
}
