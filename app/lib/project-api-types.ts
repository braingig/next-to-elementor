/**
 * Shared project API response types (safe for client type-only imports).
 * Runtime handlers live in server-project.ts.
 */

import type {
  ConversionResult,
  ProjectDiagnostic,
  ProjectManifest,
  ProjectRoute,
  ProjectVirtualFsStats,
  ConversionOutcome,
} from "@/lib/converter";

export type ProjectApiError = {
  ok: false;
  error: string;
  code?: string;
  diagnostics?: ProjectDiagnostic[];
};

export type ProjectAnalyzeSuccess = {
  ok: true;
  analysis: {
    manifest: ProjectManifest;
    routes: ProjectRoute[];
    diagnostics: ProjectDiagnostic[];
  };
  vfsStats: ProjectVirtualFsStats;
};

export type ProjectUnitSummary = {
  entryFile: string;
  sourcePath: string;
  layoutChain: string[];
  layoutMode: "composed" | "page-only" | "none";
  cssPaths: string[];
  moduleCount: number;
};

export type ProjectRouteApiResult = {
  route: ProjectRoute;
  outcome: ConversionOutcome;
  conversion: ConversionResult;
  diagnostics: ProjectDiagnostic[];
  unit: ProjectUnitSummary | null;
};

export type ProjectConvertSuccess = {
  ok: true;
  result: {
    outcome: ConversionOutcome;
    elementorTarget: string;
    catalogVersion: string;
    irVersion: string;
    manifest: ProjectManifest;
    routes: ProjectRouteApiResult[];
    projectReport: {
      totalRoutes: number;
      completeRoutes: number;
      partialRoutes: number;
      failedRoutes: number;
      usableDocuments: number;
      message: string;
    };
    diagnostics: ProjectDiagnostic[];
  };
};

export type ProjectAnalyzeResponse = ProjectAnalyzeSuccess | ProjectApiError;
export type ProjectConvertResponse = ProjectConvertSuccess | ProjectApiError;
