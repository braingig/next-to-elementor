/**
 * Phase 13c — ConversionUnit + project/route conversion result types.
 * Does not change ConversionResult from the section converter.
 */

import type { ConversionOutcome } from "../../types/decisions";
import type { ConversionResult } from "../../report/schema";
import type { DependencyGraph } from "../../section-input/types";
import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import type {
  ProjectFrameworkKind,
  ProjectManifest,
  ProjectRoute,
  ProjectStructureAnalysis,
} from "../manifest/types";

export type LayoutCompositionMode = "composed" | "page-only" | "none";

/**
 * Packaged input for one visual route → existing convertSource().
 * Project layer discovers/packages; converter converts.
 */
export type ConversionUnit = {
  route: ProjectRoute;
  framework: ProjectFrameworkKind;
  entryFile: string;
  /** Source string passed as convertSource.source (page or synthetic composed view). */
  entrySource: string;
  /** VFS path used as sourcePath (synthetic when layouts composed). */
  sourcePath: string;
  moduleSources: Record<string, string>;
  knownComponentSources: Record<string, string>;
  layoutChain: string[];
  layoutMode: LayoutCompositionMode;
  /** Route-scoped CSS file contents (not the whole project). */
  css: string[];
  /** CSS paths included in `css`. */
  cssPaths: string[];
  graph: DependencyGraph;
  diagnostics: ProjectDiagnostic[];
};

export type RouteConversionResult = {
  route: ProjectRoute;
  unit: ConversionUnit | null;
  /** Existing converter result — preserved as-is when conversion ran. */
  conversion: ConversionResult;
  outcome: ConversionOutcome;
  diagnostics: ProjectDiagnostic[];
};

export type ProjectReportSummary = {
  totalRoutes: number;
  completeRoutes: number;
  partialRoutes: number;
  failedRoutes: number;
  usableDocuments: number;
  message: string;
};

export type ProjectConversionResult = {
  outcome: ConversionOutcome;
  elementorTarget: string;
  catalogVersion: string;
  irVersion: string;
  manifest: ProjectManifest;
  routes: RouteConversionResult[];
  projectReport: ProjectReportSummary;
  diagnostics: ProjectDiagnostic[];
  /** Echo analysis diagnostics when convert ran discovery internally. */
  analysis?: ProjectStructureAnalysis;
};

export type ConvertProjectOptions = {
  /** Precomputed 13b analysis; if omitted, analyzeProjectStructure(vfs) runs. */
  analysis?: ProjectStructureAnalysis;
  catalogTarget?: string;
  titlePrefix?: string;
  /**
   * Override section-input-style graph limits for project routes
   * (defaults are larger than SECTION_INPUT_LIMITS).
   */
  maxDependencyDepth?: number;
  maxDependencyNodes?: number;
};

export type BuildConversionUnitOptions = {
  framework: ProjectFrameworkKind;
  maxDependencyDepth?: number;
  maxDependencyNodes?: number;
};

/** Default graph limits for a single project route (above section folder defaults). */
export const PROJECT_ROUTE_GRAPH_LIMITS = {
  maxDependencyDepth: 20,
  maxDependencyNodes: 200,
} as const;

export type { ProjectVirtualFS };
