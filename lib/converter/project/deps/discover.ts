/**
 * Discover external package imports from a route module graph (static only).
 */

import { collectStaticImports } from "../../section-input/resolve-imports";
import { packageNameFromSpecifier } from "./registry";
import type { ExternalImportHit } from "./types";

function isRelative(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

function isPathAlias(spec: string): boolean {
  return spec.startsWith("@/") || spec.startsWith("~/");
}

/**
 * Scan module sources for non-relative imports.
 * Never resolves node_modules. Never executes code.
 */
export function discoverExternalImports(
  moduleSources: Record<string, string>,
): ExternalImportHit[] {
  const hits: ExternalImportHit[] = [];

  for (const fromPath of Object.keys(moduleSources).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const source = moduleSources[fromPath]!;
    const { imports, parseError } = collectStaticImports(source, fromPath);
    if (parseError) continue;

    for (const imp of imports) {
      if (imp.isTypeOnly) continue;
      const spec = imp.specifier;
      if (isRelative(spec)) continue;

      // Path aliases are not npm packages; still record for classification.
      const packageName = isPathAlias(spec)
        ? spec
        : packageNameFromSpecifier(spec);

      hits.push({
        specifier: spec,
        packageName,
        fromPath,
        localNames: [...imp.localNames],
        isNamespace: imp.isNamespace,
        isDefault: imp.localNames.length === 0 && !imp.isNamespace && !imp.isSideEffect
          ? false
          : imp.localNames.length > 0 && !imp.isNamespace,
        isSideEffect: imp.isSideEffect,
      });
    }
  }

  return hits;
}

/** Group hits by package name. */
export function groupImportsByPackage(
  hits: ExternalImportHit[],
): Map<string, ExternalImportHit[]> {
  const map = new Map<string, ExternalImportHit[]>();
  for (const hit of hits) {
    const list = map.get(hit.packageName) ?? [];
    list.push(hit);
    map.set(hit.packageName, list);
  }
  return map;
}
