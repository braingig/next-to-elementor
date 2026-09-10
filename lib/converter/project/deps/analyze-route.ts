/**
 * Route-scoped dependency analysis + safe static adapter application (Phase 13e).
 * Never installs packages, never loads node_modules, never executes source.
 */

import type { ProjectDiagnostic } from "../types";
import type { ConversionUnit } from "../convert/types";
import {
  discoverExternalImports,
  groupImportsByPackage,
} from "./discover";
import {
  lookupDependencyRegistry,
  packageNameFromSpecifier,
} from "./registry";
import { getAdapter } from "./adapters";
import type {
  DependencyCapability,
  DependencyCapabilityStatus,
  RouteDependencyAnalysis,
} from "./types";

function isPathAlias(name: string): boolean {
  return name.startsWith("@/") || name.startsWith("~/");
}

function statusForCategory(
  category: DependencyCapability["category"],
  adapterStatus?: DependencyCapabilityStatus,
): DependencyCapabilityStatus {
  if (adapterStatus) return adapterStatus;
  switch (category) {
    case "utility-only":
    case "local":
      return "informational";
    case "supported-adapter":
      return "supported";
    case "visual-but-unsupported":
      return "unsupported";
    case "dynamic/runtime-dependent":
      return "informational";
    default:
      return "unknown";
  }
}

function codeForCapability(dep: DependencyCapability): string {
  switch (dep.category) {
    case "utility-only":
      return "dependency-utility-only";
    case "local":
      return "dependency-known";
    case "supported-adapter":
      return dep.status === "supported"
        ? "dependency-adapter-applied"
        : dep.status === "partial"
          ? "dependency-adapter-applied"
          : "dependency-unsupported";
    case "visual-but-unsupported":
      return "dependency-unsupported";
    case "dynamic/runtime-dependent":
      return "dependency-runtime-only";
    default:
      return "dependency-unknown";
  }
}

/**
 * Analyze external deps for one ConversionUnit and apply thin static adapters.
 */
export function analyzeRouteDependencies(
  unit: ConversionUnit,
  packageVersions: Record<string, string> = {},
): RouteDependencyAnalysis {
  const diagnostics: ProjectDiagnostic[] = [];
  const dependencies: DependencyCapability[] = [];

  // Include entry source in the scan map under sourcePath / entryFile.
  const scanSources: Record<string, string> = {
    ...unit.moduleSources,
  };
  if (unit.entrySource.trim()) {
    scanSources[unit.sourcePath] = unit.entrySource;
  }

  const hits = discoverExternalImports(scanSources);
  const grouped = groupImportsByPackage(hits);

  let rewrittenModuleSources = { ...unit.moduleSources };
  let rewrittenEntrySource: string | undefined;
  const adapterKnownComponents: Record<string, string> = {};

  for (const packageName of [...grouped.keys()].sort((a, b) =>
    a.localeCompare(b),
  )) {
    const pkgHits = grouped.get(packageName)!;
    const importedFrom = [
      ...new Set(pkgHits.map((h) => h.fromPath)),
    ].sort((a, b) => a.localeCompare(b));
    const localNames = [
      ...new Set(pkgHits.flatMap((h) => h.localNames)),
    ].sort((a, b) => a.localeCompare(b));

    if (isPathAlias(packageName)) {
      const dep: DependencyCapability = {
        packageName,
        category: "unknown",
        status: "unknown",
        affectsVisual: true,
        forcesPartial: false,
        notes:
          "Path alias import is not resolved as an npm package in Phase 13e.",
        importedFrom,
        localNames,
        diagnostics: [
          {
            severity: "warning",
            code: "dependency-unknown",
            message: `Path alias ${JSON.stringify(packageName)} is not resolved for dependency analysis (no node_modules / no execution).`,
          },
        ],
      };
      dependencies.push(dep);
      diagnostics.push(...dep.diagnostics);
      continue;
    }

    const entry = lookupDependencyRegistry(packageName);
    const versionRange =
      packageVersions[packageName] ??
      packageVersions[packageNameFromSpecifier(packageName)];

    if (!entry) {
      const dep: DependencyCapability = {
        packageName,
        ...(versionRange ? { versionRange } : {}),
        category: "unknown",
        status: "unknown",
        affectsVisual: true,
        forcesPartial: true,
        notes: "Package is not in the capability registry.",
        importedFrom,
        localNames,
        diagnostics: [
          {
            severity: "warning",
            code: "dependency-unknown",
            message: `Unknown dependency ${JSON.stringify(packageName)} — classified without execution; visual fidelity not claimed.`,
          },
        ],
      };
      dependencies.push(dep);
      diagnostics.push(...dep.diagnostics);
      continue;
    }

    let status = statusForCategory(entry.category);
    const depDiagnostics: ProjectDiagnostic[] = [];

    if (entry.adapter) {
      const adapter = getAdapter(entry.adapter);
      if (adapter) {
        const applied = adapter.apply({
          packageName,
          hits: pkgHits,
          moduleSources: rewrittenModuleSources,
          entryFile: unit.entryFile,
          entrySource: rewrittenEntrySource ?? unit.entrySource,
        });
        status = applied.status;
        depDiagnostics.push(...applied.diagnostics);
        if (applied.rewrittenModuleSources) {
          rewrittenModuleSources = {
            ...rewrittenModuleSources,
            ...applied.rewrittenModuleSources,
          };
        }
        if (applied.rewrittenEntrySource) {
          rewrittenEntrySource = applied.rewrittenEntrySource;
        }
        if (applied.knownComponentSources) {
          Object.assign(adapterKnownComponents, applied.knownComponentSources);
        }
      } else {
        depDiagnostics.push({
          severity: "warning",
          code: "dependency-unsupported",
          message: `Registry lists adapter ${entry.adapter} for ${packageName}, but it is not implemented.`,
        });
        status = "unsupported";
      }
    } else {
      depDiagnostics.push({
        severity:
          entry.category === "utility-only" ||
          entry.category === "dynamic/runtime-dependent"
            ? "info"
            : "warning",
        code: codeForCapability({
          packageName,
          category: entry.category,
          status,
          affectsVisual: entry.affectsVisual,
          forcesPartial: entry.forcesPartial,
          notes: entry.notes,
          importedFrom,
          localNames,
          diagnostics: [],
        }),
        message: `${packageName}: ${entry.notes}`,
      });
    }

    const dep: DependencyCapability = {
      packageName,
      ...(versionRange ? { versionRange } : {}),
      category: entry.category,
      status,
      ...(entry.adapter ? { adapter: entry.adapter } : {}),
      affectsVisual: entry.affectsVisual,
      forcesPartial: entry.forcesPartial,
      notes: entry.notes,
      importedFrom,
      localNames,
      diagnostics: depDiagnostics,
    };
    dependencies.push(dep);
    diagnostics.push(...depDiagnostics);
  }

  // Also flag bare fetch() as runtime (not a package) when present.
  for (const [path, source] of Object.entries(scanSources)) {
    if (/\bfetch\s*\(/.test(source)) {
      diagnostics.push({
        severity: "info",
        code: "dependency-runtime-only",
        message: `fetch() observed in ${path}; runtime network calls are never executed or reproduced.`,
        path,
      });
    }
  }

  return {
    dependencies,
    diagnostics,
    rewrittenModuleSources,
    adapterKnownComponents,
    ...(rewrittenEntrySource ? { rewrittenEntrySource } : {}),
  };
}

/**
 * Apply dependency analysis rewrites onto a ConversionUnit (immutable-style copy).
 */
export function applyDependencyAnalysisToUnit(
  unit: ConversionUnit,
  analysis: RouteDependencyAnalysis,
): ConversionUnit {
  const knownComponentSources = {
    ...unit.knownComponentSources,
    ...analysis.adapterKnownComponents,
  };

  // When module sources were rewritten, refresh knownComponentSources that
  // pointed at those module path contents by binding name is already by binding;
  // update any known entry whose value matched an old module source.
  for (const [path, next] of Object.entries(analysis.rewrittenModuleSources)) {
    const prev = unit.moduleSources[path];
    if (prev === undefined || prev === next) continue;
    for (const [name, source] of Object.entries(knownComponentSources)) {
      if (source === prev) {
        knownComponentSources[name] = next;
      }
    }
  }

  return {
    ...unit,
    entrySource: analysis.rewrittenEntrySource ?? unit.entrySource,
    moduleSources: analysis.rewrittenModuleSources,
    knownComponentSources,
    diagnostics: [...unit.diagnostics, ...analysis.diagnostics],
  };
}

export function dependencyForcesRoutePartial(
  dependencies: DependencyCapability[],
): boolean {
  return dependencies.some((d) => {
    if (!d.forcesPartial) return false;
    return (
      d.status === "partial" ||
      d.status === "unsupported" ||
      d.status === "unknown"
    );
  });
}
