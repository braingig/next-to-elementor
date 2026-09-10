/**
 * Relative import resolution + dependency graph for virtual section maps.
 * Parses import declarations statically (Babel). Never executes user code.
 */

import { parse } from "@babel/parser";
import type { File, ImportDeclaration } from "@babel/types";
import {
  normalizeVirtualPath,
  resolveRelativeVirtualPath,
} from "./normalize-paths";
import {
  SECTION_INPUT_LIMITS,
  type DependencyEdge,
  type DependencyGraph,
  type SectionDiagnostic,
  type SectionInputLimits,
} from "./types";

const RESOLVE_EXTENSIONS = [
  "", // as written
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  "/index.tsx",
  "/index.jsx",
  "/index.ts",
  "/index.js",
] as const;

const SKIP_ASSET_EXT =
  /\.(css|scss|sass|less|module\.css|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|mp4|webm|json)$/i;

export type StaticImport = {
  specifier: string;
  localNames: string[];
  isTypeOnly: boolean;
  isSideEffect: boolean;
  isNamespace: boolean;
};

function parseSourceAst(source: string, sourcePath: string): File {
  const isTs = /\.tsx?$/i.test(sourcePath) || !/\.jsx?$/i.test(sourcePath);
  return parse(source, {
    sourceType: "module",
    errorRecovery: false,
    plugins: ["jsx", ...(isTs ? (["typescript"] as const) : [])],
    sourceFilename: sourcePath,
  });
}

/**
 * Collect static `import` declarations from a module (no require / dynamic import).
 */
export function collectStaticImports(
  source: string,
  sourcePath: string,
): { imports: StaticImport[]; parseError?: string } {
  let ast: File;
  try {
    ast = parseSourceAst(source, sourcePath);
  } catch (error) {
    return {
      imports: [],
      parseError:
        error instanceof Error ? error.message : "Failed to parse module.",
    };
  }

  const imports: StaticImport[] = [];

  for (const stmt of ast.program.body) {
    if (stmt.type !== "ImportDeclaration") {
      continue;
    }
    imports.push(describeImport(stmt));
  }

  return { imports };
}

function describeImport(node: ImportDeclaration): StaticImport {
  const specifier = node.source.value;
  const isTypeOnly = node.importKind === "type";
  if (node.specifiers.length === 0) {
    return {
      specifier,
      localNames: [],
      isTypeOnly,
      isSideEffect: true,
      isNamespace: false,
    };
  }

  const localNames: string[] = [];
  let isNamespace = false;
  for (const spec of node.specifiers) {
    if (spec.type === "ImportNamespaceSpecifier") {
      isNamespace = true;
      continue;
    }
    if (spec.type === "ImportDefaultSpecifier") {
      localNames.push(spec.local.name);
      continue;
    }
    if (spec.type === "ImportSpecifier") {
      if (spec.importKind === "type") {
        continue;
      }
      localNames.push(spec.local.name);
    }
  }

  return {
    specifier,
    localNames,
    isTypeOnly,
    isSideEffect: false,
    isNamespace,
  };
}

/**
 * Try deterministic extensions against the virtual file map.
 */
export function resolveModulePath(
  files: Record<string, string>,
  fromFile: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return null;
  }

  const base = resolveRelativeVirtualPath(fromFile, specifier);
  if (!base) {
    return null;
  }

  // If specifier already included an extension / index path, `base` is the
  // candidate "as written" after normalizing .. segments.
  for (const suffix of RESOLVE_EXTENSIONS) {
    let candidate: string | null;
    if (suffix === "") {
      candidate = base;
    } else if (suffix.startsWith("/")) {
      // Avoid Foo.tsx/index.tsx when base already has an extension.
      if (/\.(tsx|ts|jsx|js)$/i.test(base)) {
        continue;
      }
      candidate = normalizeVirtualPath(base + suffix);
    } else {
      if (/\.(tsx|ts|jsx|js)$/i.test(base)) {
        continue;
      }
      candidate = normalizeVirtualPath(base + suffix);
    }
    if (candidate && candidate in files) {
      return candidate;
    }
  }

  return null;
}

export type ResolveImportsResult =
  | {
      ok: true;
      graph: DependencyGraph;
      /** binding name → module path */
      bindingPaths: Record<string, string>;
      /** module path → source */
      moduleSources: Record<string, string>;
      knownComponentSources: Record<string, string>;
      diagnostics: SectionDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: SectionDiagnostic[];
      graph?: DependencyGraph;
    };

/**
 * Walk relative imports from entry, build a deterministic dependency graph,
 * detect missing modules, cycles, depth/node limits, and binding collisions.
 */
export function resolveImportGraph(args: {
  files: Record<string, string>;
  entryPath: string;
  limits?: Partial<SectionInputLimits>;
}): ResolveImportsResult {
  const maxDepth =
    args.limits?.maxDependencyDepth ?? SECTION_INPUT_LIMITS.maxDependencyDepth;
  const maxNodes =
    args.limits?.maxDependencyNodes ?? SECTION_INPUT_LIMITS.maxDependencyNodes;

  const diagnostics: SectionDiagnostic[] = [];
  const files = args.files;
  const entryPath = args.entryPath;

  const moduleSources: Record<string, string> = {
    [entryPath]: files[entryPath]!,
  };
  const bindingPaths: Record<string, string> = {};
  const knownComponentSources: Record<string, string> = {};
  const edges: DependencyEdge[] = [];
  const nodes = new Set<string>([entryPath]);

  /** path → still-on-stack for cycle detection */
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function registerBindings(
    localNames: string[],
    toPath: string,
    fromPath: string,
  ): boolean {
    for (const name of localNames) {
      const existing = bindingPaths[name];
      if (existing && existing !== toPath) {
        diagnostics.push({
          severity: "error",
          code: "component-name-collision",
          message: `Component binding "${name}" resolves to both "${existing}" and "${toPath}" (via import in ${fromPath}). Provide distinct import aliases or split the section.`,
          path: fromPath,
          candidates: [existing, toPath],
        });
        return false;
      }
      bindingPaths[name] = toPath;
      // Do not register the entry under knownComponentSources — convertSource
      // uses entry `source` separately. Nested locals in the entry file are
      // collected by the analyzer from the entry AST.
      if (toPath !== entryPath) {
        knownComponentSources[name] = files[toPath]!;
      }
    }
    return true;
  }

  function walk(fromPath: string, depth: number): boolean {
    if (depth > maxDepth) {
      diagnostics.push({
        severity: "error",
        code: "dependency-depth-limit",
        message: `Dependency depth exceeded ${maxDepth} at ${fromPath}.`,
        path: fromPath,
      });
      return false;
    }

    if (visiting.has(fromPath)) {
      const cycleStart = stack.indexOf(fromPath);
      const cycle =
        cycleStart >= 0
          ? [...stack.slice(cycleStart), fromPath]
          : [...stack, fromPath];
      diagnostics.push({
        severity: "error",
        code: "circular-dependency",
        message: `Circular dependency detected: ${cycle.join(" → ")}`,
        path: fromPath,
        candidates: cycle,
      });
      return false;
    }

    if (visited.has(fromPath)) {
      return true;
    }

    visiting.add(fromPath);
    stack.push(fromPath);

    const source = files[fromPath];
    if (source === undefined) {
      diagnostics.push({
        severity: "error",
        code: "missing-dependency",
        message: `Module not found in virtual file map: ${fromPath}`,
        path: fromPath,
      });
      visiting.delete(fromPath);
      stack.pop();
      return false;
    }

    const { imports, parseError } = collectStaticImports(source, fromPath);
    if (parseError) {
      diagnostics.push({
        severity: "error",
        code: "parse-error",
        message: `Failed to parse ${fromPath}: ${parseError}`,
        path: fromPath,
      });
      visiting.delete(fromPath);
      stack.pop();
      return false;
    }

    // Deterministic order: source appearance order already; stable by specifier.
    const ordered = [...imports].sort((a, b) =>
      a.specifier.localeCompare(b.specifier),
    );

    for (const imp of ordered) {
      if (imp.isTypeOnly) {
        continue;
      }

      const spec = imp.specifier;

      if (!spec.startsWith("./") && !spec.startsWith("../")) {
        // npm / aliases / URLs — out of scope for this phase.
        if (!imp.isSideEffect) {
          diagnostics.push({
            severity: "warning",
            code: "external-import-skipped",
            message: `External/non-relative import skipped (not resolved): ${JSON.stringify(spec)} in ${fromPath}`,
            path: fromPath,
          });
        }
        continue;
      }

      if (SKIP_ASSET_EXT.test(spec) || (imp.isSideEffect && SKIP_ASSET_EXT.test(spec))) {
        diagnostics.push({
          severity: "info",
          code: "asset-or-css-import-skipped",
          message: `CSS/asset import not collected in this phase: ${JSON.stringify(spec)} in ${fromPath}`,
          path: fromPath,
        });
        continue;
      }

      if (imp.isNamespace) {
        diagnostics.push({
          severity: "warning",
          code: "namespace-import-skipped",
          message: `Namespace import is not supported for component inlining: ${JSON.stringify(spec)} in ${fromPath}`,
          path: fromPath,
        });
      }

      const resolved = resolveModulePath(files, fromPath, spec);
      if (!resolved) {
        diagnostics.push({
          severity: "error",
          code: "missing-dependency",
          message: `Missing local dependency ${JSON.stringify(spec)} imported from ${fromPath}`,
          path: fromPath,
        });
        visiting.delete(fromPath);
        stack.pop();
        return false;
      }

      if (!registerBindings(imp.localNames, resolved, fromPath)) {
        visiting.delete(fromPath);
        stack.pop();
        return false;
      }

      edges.push({
        from: fromPath,
        to: resolved,
        localNames: [...imp.localNames],
        specifier: spec,
      });

      if (!nodes.has(resolved)) {
        if (nodes.size >= maxNodes) {
          diagnostics.push({
            severity: "error",
            code: "dependency-node-limit",
            message: `Dependency graph exceeded ${maxNodes} modules while resolving ${resolved}.`,
            path: resolved,
          });
          visiting.delete(fromPath);
          stack.pop();
          return false;
        }
        nodes.add(resolved);
        moduleSources[resolved] = files[resolved]!;
      }

      if (!walk(resolved, depth + 1)) {
        visiting.delete(fromPath);
        stack.pop();
        return false;
      }
    }

    visiting.delete(fromPath);
    stack.pop();
    visited.add(fromPath);
    return true;
  }

  if (!walk(entryPath, 0)) {
    return {
      ok: false,
      diagnostics,
      graph: {
        nodes: [...nodes].sort((a, b) => a.localeCompare(b)),
        edges,
      },
    };
  }

  // Deterministic graph serialization
  const sortedNodes = [...nodes].sort((a, b) => a.localeCompare(b));
  const sortedEdges = [...edges].sort((a, b) => {
    const fromCmp = a.from.localeCompare(b.from);
    if (fromCmp !== 0) return fromCmp;
    const toCmp = a.to.localeCompare(b.to);
    if (toCmp !== 0) return toCmp;
    return a.specifier.localeCompare(b.specifier);
  });

  // Stable knownComponentSources key order is handled by consumers / Object insert order.
  const sortedKnown: Record<string, string> = {};
  for (const key of Object.keys(knownComponentSources).sort((a, b) =>
    a.localeCompare(b),
  )) {
    sortedKnown[key] = knownComponentSources[key]!;
  }

  return {
    ok: true,
    graph: { nodes: sortedNodes, edges: sortedEdges },
    bindingPaths,
    moduleSources,
    knownComponentSources: sortedKnown,
    diagnostics,
  };
}
