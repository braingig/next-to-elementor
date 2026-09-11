/**
 * Cross-file static const array/object export resolution (Phase E).
 * AST-only — never executes modules. Never flattens unrelated module bindings.
 */

import { parse } from "@babel/parser";
import type { File } from "@babel/types";
import {
  resolveAliasToVirtualModule,
  type PathAliases,
} from "../../section-input/resolve-aliases";
import {
  resolveExistingVirtualModule,
  resolveModulePath,
} from "../../section-input/resolve-imports";
import {
  collectStaticArrayBindings,
  collectStaticObjectBindings,
  type StaticArrayElement,
  type StaticObjectFields,
} from "./static-array-map";

export type StaticNamedImport = {
  /** Local binding name in the importing file. */
  localName: string;
  /** Exported name in the target module. */
  importedName: string;
  /** Module specifier as written (./brand, @/…). */
  specifier: string;
};

export type ModuleStaticBindings = {
  /** Local const name → static array elements. */
  arrays: Map<string, StaticArrayElement[]>;
  /** Local const name → static object fields. */
  objects: Map<string, StaticObjectFields>;
  /**
   * Exported name → local binding name in this module.
   * Only names present here may be imported from outside.
   */
  exportToLocal: Map<string, string>;
};

export type ResolvedImportBinding = {
  fromPath: string;
  exportName: string;
};

const MAX_MODULE_REGISTRY = 500;

function parseModuleAst(source: string, sourcePath: string): File | null {
  try {
    const isTs = /\.tsx?$/i.test(sourcePath) || !/\.jsx?$/i.test(sourcePath);
    return parse(source, {
      sourceType: "module",
      errorRecovery: false,
      plugins: ["jsx", ...(isTs ? (["typescript"] as const) : [])],
      sourceFilename: sourcePath,
    });
  } catch {
    return null;
  }
}

/**
 * Collect named value imports (not type-only, not namespace, not default).
 */
export function collectNamedStaticImports(
  ast: File,
): StaticNamedImport[] {
  const out: StaticNamedImport[] = [];
  for (const stmt of ast.program.body) {
    if (stmt.type !== "ImportDeclaration") continue;
    if (stmt.importKind === "type") continue;
    const specifier = stmt.source.value;
    if (typeof specifier !== "string" || !specifier) continue;

    for (const spec of stmt.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      if (spec.importKind === "type") continue;
      const localName = spec.local.name;
      let importedName: string;
      if (spec.imported.type === "Identifier") {
        importedName = spec.imported.name;
      } else {
        importedName = spec.imported.value;
      }
      out.push({ localName, importedName, specifier });
    }
  }
  return out;
}

/**
 * Map export name → local binding name for named exports of values.
 * Supports `export const X` and `export { X }` / `export { X as Y }`.
 * Does not follow `export … from` re-export chains (unsupported in this phase).
 */
export function collectExportNameToLocal(ast: File): Map<string, string> {
  const map = new Map<string, string>();

  for (const stmt of ast.program.body) {
    if (stmt.type !== "ExportNamedDeclaration") continue;
    // Re-export from another module — out of scope for this phase.
    if (stmt.source) continue;

    if (stmt.declaration) {
      const decl = stmt.declaration;
      if (decl.type === "VariableDeclaration") {
        for (const d of decl.declarations) {
          if (d.id.type === "Identifier") {
            map.set(d.id.name, d.id.name);
          }
        }
      }
      continue;
    }

    for (const spec of stmt.specifiers) {
      if (spec.type !== "ExportSpecifier") continue;
      if (spec.exportKind === "type") continue;
      const local =
        spec.local.type === "Identifier" ? spec.local.name : null;
      if (!local) continue;
      const exported =
        spec.exported.type === "Identifier"
          ? spec.exported.name
          : spec.exported.value;
      map.set(exported, local);
    }
  }

  return map;
}

/**
 * Build per-module static array/object tables + export map from moduleSources.
 */
export function buildModuleStaticRegistry(
  moduleSources: Record<string, string>,
): Map<string, ModuleStaticBindings> {
  const registry = new Map<string, ModuleStaticBindings>();
  const paths = Object.keys(moduleSources).sort((a, b) => a.localeCompare(b));
  let count = 0;
  for (const path of paths) {
    if (count >= MAX_MODULE_REGISTRY) break;
    const source = moduleSources[path];
    if (source == null) continue;
    const ast = parseModuleAst(source, path);
    if (!ast) continue;
    registry.set(path, {
      arrays: collectStaticArrayBindings(ast),
      objects: collectStaticObjectBindings(ast),
      exportToLocal: collectExportNameToLocal(ast),
    });
    count += 1;
  }
  return registry;
}

/**
 * Resolve a module specifier from an importing file against moduleSources only.
 * External/npm specifiers without a path-alias hit return null.
 */
export function resolveStaticModuleSpecifier(args: {
  fromPath: string;
  specifier: string;
  moduleSources: Record<string, string>;
  pathAliases?: PathAliases;
}): string | null {
  const { fromPath, specifier, moduleSources, pathAliases } = args;
  if (!specifier || specifier.startsWith("node:")) return null;

  const files = moduleSources;
  const isRelative =
    specifier.startsWith("./") || specifier.startsWith("../");

  if (isRelative) {
    return resolveModulePath(files, fromPath, specifier);
  }

  const alias = resolveAliasToVirtualModule({
    specifier,
    pathAliases,
    files,
    resolveExisting: (base) => resolveExistingVirtualModule(files, base),
  });
  if (alias.matched) {
    return alias.resolved;
  }
  return null;
}

/**
 * Map local import bindings for a module to resolved { fromPath, exportName }.
 */
export function buildImportBindingMap(args: {
  ast: File;
  fromPath: string;
  moduleSources: Record<string, string>;
  pathAliases?: PathAliases;
}): Map<string, ResolvedImportBinding> {
  const map = new Map<string, ResolvedImportBinding>();
  for (const imp of collectNamedStaticImports(args.ast)) {
    const fromPath = resolveStaticModuleSpecifier({
      fromPath: args.fromPath,
      specifier: imp.specifier,
      moduleSources: args.moduleSources,
      pathAliases: args.pathAliases,
    });
    if (!fromPath) continue;
    if (!(fromPath in args.moduleSources)) continue;
    map.set(imp.localName, {
      fromPath,
      exportName: imp.importedName,
    });
  }
  return map;
}

/**
 * Infer known-component name → module path by exact source string match.
 */
export function mapKnownComponentsToModulePaths(
  knownComponentSources: Record<string, string>,
  moduleSources: Record<string, string>,
): Map<string, string> {
  const byContent = new Map<string, string[]>();
  for (const [path, source] of Object.entries(moduleSources)) {
    const list = byContent.get(source) ?? [];
    list.push(path);
    byContent.set(source, list);
  }
  const out = new Map<string, string>();
  for (const [name, source] of Object.entries(knownComponentSources)) {
    const paths = byContent.get(source);
    if (!paths || paths.length === 0) continue;
    // Prefer a stable path: sort and take first.
    const path = [...paths].sort((a, b) => a.localeCompare(b))[0]!;
    out.set(name, path);
  }
  return out;
}

/**
 * Look up a static array via import binding → module export → local const.
 */
export function lookupImportedStaticArray(args: {
  localName: string;
  importBindings: Map<string, ResolvedImportBinding> | undefined;
  moduleRegistry: Map<string, ModuleStaticBindings>;
}): StaticArrayElement[] | undefined {
  if (!args.importBindings) return undefined;
  const binding = args.importBindings.get(args.localName);
  if (!binding) return undefined;
  const mod = args.moduleRegistry.get(binding.fromPath);
  if (!mod) return undefined;
  const local = mod.exportToLocal.get(binding.exportName);
  if (!local) return undefined;
  return mod.arrays.get(local);
}

export function lookupImportedStaticObject(args: {
  localName: string;
  importBindings: Map<string, ResolvedImportBinding> | undefined;
  moduleRegistry: Map<string, ModuleStaticBindings>;
}): StaticObjectFields | undefined {
  if (!args.importBindings) return undefined;
  const binding = args.importBindings.get(args.localName);
  if (!binding) return undefined;
  const mod = args.moduleRegistry.get(binding.fromPath);
  if (!mod) return undefined;
  const local = mod.exportToLocal.get(binding.exportName);
  if (!local) return undefined;
  return mod.objects.get(local);
}
