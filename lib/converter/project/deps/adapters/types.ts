/**
 * Static dependency adapter contract (Phase 13e).
 * Adapters MUST NOT import/execute the real npm package.
 */

import type { ProjectDiagnostic } from "../../types";
import type { ExternalImportHit } from "../types";

export type AdapterApplyInput = {
  packageName: string;
  hits: ExternalImportHit[];
  /** Route module path → source text. */
  moduleSources: Record<string, string>;
  entryFile: string;
  entrySource: string;
};

export type AdapterApplyResult = {
  status: "supported" | "partial" | "unsupported";
  diagnostics: ProjectDiagnostic[];
  rewrittenModuleSources?: Record<string, string>;
  rewrittenEntrySource?: string;
  knownComponentSources?: Record<string, string>;
};

export type DependencyAdapter = {
  id: string;
  apply: (input: AdapterApplyInput) => AdapterApplyResult;
};
