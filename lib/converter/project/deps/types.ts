/**
 * Phase 13e — dependency capability model.
 * Classification only; adapters operate on static source/AST — never execute packages.
 */

import type { ProjectDiagnostic } from "../types";

export type DependencyCategory =
  | "local"
  | "utility-only"
  | "supported-adapter"
  | "visual-but-unsupported"
  | "dynamic/runtime-dependent"
  | "unknown";

export type DependencyCapabilityStatus =
  | "supported"
  | "partial"
  | "unsupported"
  | "informational"
  | "unknown";

export type DependencyCapability = {
  packageName: string;
  /** Declared version/range from package.json when available. */
  versionRange?: string;
  category: DependencyCategory;
  status: DependencyCapabilityStatus;
  /** Adapter id when a thin static adapter exists. */
  adapter?: string;
  /** True when the dependency can affect visible output fidelity. */
  affectsVisual: boolean;
  /** True when missing support should force route outcome ≤ partial. */
  forcesPartial: boolean;
  notes: string;
  /** Module paths in this route that import the package. */
  importedFrom: string[];
  /** Named bindings observed (static). */
  localNames: string[];
  diagnostics: ProjectDiagnostic[];
};

export type ExternalImportHit = {
  specifier: string;
  packageName: string;
  fromPath: string;
  localNames: string[];
  isNamespace: boolean;
  isDefault: boolean;
  isSideEffect: boolean;
};

export type RouteDependencyAnalysis = {
  dependencies: DependencyCapability[];
  diagnostics: ProjectDiagnostic[];
  /** Rewritten sources after safe adapters (path → source). */
  rewrittenModuleSources: Record<string, string>;
  /** Extra stubs for convertSource.knownComponentSources. */
  adapterKnownComponents: Record<string, string>;
  /** Entry source after adapter rewrites (when entry was rewritten). */
  rewrittenEntrySource?: string;
};
