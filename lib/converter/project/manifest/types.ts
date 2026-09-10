/**
 * Phase 13b — framework / route discovery types.
 * Extends Phase 13a ProjectVirtualFS; no conversion.
 */

import type { ProjectDiagnostic } from "../types";

export type DetectionConfidence = "high" | "medium" | "low";

export type ProjectFrameworkKind =
  | "next-app"
  | "next-pages"
  | "next-hybrid"
  | "vite-react"
  | "cra"
  | "react-plain"
  | "unknown";

export type ProjectStyleSystem =
  | "css"
  | "css-modules"
  | "tailwind"
  | "scss"
  | "sass"
  | "less"
  | "unknown";

export type ProjectPackageJsonSummary = {
  name?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  /** True when package.json existed but JSON.parse failed. */
  parseError?: boolean;
};

/**
 * Static project identity derived from VFS text/metadata only.
 */
export type ProjectManifest = {
  framework: ProjectFrameworkKind;
  /** Evidence-based confidence for the framework classification. */
  frameworkConfidence: DetectionConfidence;
  /** Detected Next/Vite/etc. version string when present in package.json. */
  frameworkVersion?: string;
  typescript: boolean;
  styleSystems: ProjectStyleSystem[];
  packageJson?: ProjectPackageJsonSummary;
  /** Static tsconfig/jsconfig `paths` when present and parseable. */
  pathAliases: Record<string, string[]>;
  /** Config files found (next.config.*, vite.config.*, …). */
  configFiles: string[];
  /** Likely SPA entry candidates considered during detection (not all kept as routes). */
  entryCandidates: string[];
  diagnostics: ProjectDiagnostic[];
};

export type ProjectRouteSource =
  | "app-router"
  | "pages-router"
  | "spa-entry"
  | "react-router-static";

/**
 * One visual conversion unit candidate for Phase 13c.
 * `path` uses Next-style segment notation for dynamics — never invented values.
 */
export type ProjectRoute = {
  /** Stable id, e.g. `app:/about`, `pages:/blog/[slug]`, `spa:/`. */
  id: string;
  /**
   * URL pattern for the route:
   * `/`, `/about`, `/blog/[slug]`, `/docs/[...slug]`, `/docs/[[...slug]]`.
   */
  path: string;
  /** Visual page or SPA entry (API handlers are never emitted). */
  kind: "page" | "entry";
  /** VFS path to the page/entry module. */
  entryFile: string;
  /**
   * App Router layouts from root → leaf (outermost first).
   * Empty for Pages / SPA unless later phases add wrappers.
   */
  layoutChain: string[];
  /** Dynamic param names as written: `id`, `...slug`, `...slug` for optional catch-all too. */
  dynamicSegments: string[];
  isDynamic: boolean;
  confidence: DetectionConfidence;
  source: ProjectRouteSource;
};

export type DiscoverRoutesResult = {
  routes: ProjectRoute[];
  diagnostics: ProjectDiagnostic[];
};

export type ProjectStructureAnalysis = {
  manifest: ProjectManifest;
  routes: ProjectRoute[];
  diagnostics: ProjectDiagnostic[];
};
