/**
 * Build a ConversionUnit for one ProjectRoute using section-input graph resolution.
 * Does not call convertSource.
 */

import { resolveImportGraph } from "../../section-input/resolve-imports";
import type { DependencyGraph } from "../../section-input/types";
import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import type { ProjectRoute } from "../manifest/types";
import { collectRouteScopedCss } from "./collect-css";
import { listRootCssSourceModules } from "./root-css-modules";
import {
  PROJECT_ROUTE_GRAPH_LIMITS,
  type BuildConversionUnitOptions,
  type ConversionUnit,
  type LayoutCompositionMode,
} from "./types";

const COMPONENT_FILE_RE = /\.(tsx|jsx|ts|js)$/i;

function extractComponentFiles(
  vfs: ProjectVirtualFS,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, file] of Object.entries(vfs.files)) {
    if (
      file.kind === "text" &&
      COMPONENT_FILE_RE.test(path) &&
      !/\.d\.ts$/i.test(path)
    ) {
      out[path] = file.content;
    }
  }
  return out;
}

function extractTextFiles(vfs: ProjectVirtualFS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, file] of Object.entries(vfs.files)) {
    if (file.kind === "text") {
      out[path] = file.content;
    }
  }
  return out;
}

function emptyGraph(): DependencyGraph {
  return { nodes: [], edges: [] };
}

function layoutLooksComposable(source: string): boolean {
  // Require an explicit children usage so we do not drop the page silently.
  return /\bchildren\b/.test(source);
}

function mergeGraphs(
  base: DependencyGraph,
  extra: DependencyGraph,
): DependencyGraph {
  const nodes = new Set([...base.nodes, ...extra.nodes]);
  const edgeKey = (e: { from: string; to: string; specifier: string }) =>
    `${e.from}|${e.to}|${e.specifier}`;
  const edges = [...base.edges];
  const seen = new Set(base.edges.map(edgeKey));
  for (const e of extra.edges) {
    const k = edgeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push(e);
  }
  return {
    nodes: [...nodes].sort((a, b) => a.localeCompare(b)),
    edges: edges.sort((a, b) => {
      const c = a.from.localeCompare(b.from);
      if (c !== 0) return c;
      const d = a.to.localeCompare(b.to);
      if (d !== 0) return d;
      return a.specifier.localeCompare(b.specifier);
    }),
  };
}

type ResolvedGraph = {
  ok: true;
  knownComponentSources: Record<string, string>;
  moduleSources: Record<string, string>;
  bindingPaths: Record<string, string>;
  graph: DependencyGraph;
  diagnostics: ProjectDiagnostic[];
} | {
  ok: false;
  diagnostics: ProjectDiagnostic[];
  graph: DependencyGraph;
};

function resolveRouteGraph(
  files: Record<string, string>,
  entryPath: string,
  limits: { maxDependencyDepth: number; maxDependencyNodes: number },
  pathAliases?: Record<string, string[]>,
): ResolvedGraph {
  const result = resolveImportGraph({
    files,
    entryPath,
    limits: {
      maxDependencyDepth: limits.maxDependencyDepth,
      maxDependencyNodes: limits.maxDependencyNodes,
    },
    pathAliases,
  });

  if (!result.ok) {
    return {
      ok: false,
      diagnostics: result.diagnostics.map((d) => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
        path: d.path,
      })),
      graph: result.graph ?? emptyGraph(),
    };
  }

  return {
    ok: true,
    knownComponentSources: result.knownComponentSources,
    moduleSources: result.moduleSources,
    bindingPaths: result.bindingPaths,
    graph: result.graph,
    diagnostics: result.diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
      message: d.message,
      path: d.path,
    })),
  };
}

/**
 * Try to merge layout graphs into the page knownComponentSources without
 * collapsing distinct files that share a binding name.
 */
function tryMergeLayoutBindings(args: {
  pageBindings: Record<string, string>;
  pageKnown: Record<string, string>;
  pageModules: Record<string, string>;
  layoutPath: string;
  layoutIndex: number;
  layoutGraph: Extract<ResolvedGraph, { ok: true }>;
}): {
  ok: true;
  known: Record<string, string>;
  modules: Record<string, string>;
  bindings: Record<string, string>;
  layoutKey: string;
} | {
  ok: false;
  reason: string;
} {
  const layoutKey = `__ProjectLayout${args.layoutIndex}`;
  const known = { ...args.pageKnown };
  const modules = { ...args.pageModules };
  const bindings = { ...args.pageBindings };

  for (const [path, source] of Object.entries(args.layoutGraph.moduleSources)) {
    modules[path] = source;
  }

  // Register layout entry under a unique key (never the colliding local name).
  known[layoutKey] = args.layoutGraph.moduleSources[args.layoutPath]!;

  for (const [name, path] of Object.entries(args.layoutGraph.bindingPaths)) {
    const existing = bindings[name];
    if (existing && existing !== path) {
      return {
        ok: false,
        reason: `Layout binding "${name}" collides between "${existing}" and "${path}".`,
      };
    }
    bindings[name] = path;
    if (path !== args.layoutPath) {
      const source = args.layoutGraph.moduleSources[path];
      if (source !== undefined) {
        // Same path already mapped from page under this name is fine.
        if (known[name] !== undefined && args.pageBindings[name] === path) {
          continue;
        }
        if (known[name] !== undefined && args.pageBindings[name] !== path) {
          return {
            ok: false,
            reason: `Component binding "${name}" maps to different modules across page/layout graphs.`,
          };
        }
        known[name] = source;
      }
    }
  }

  return { ok: true, known, modules, bindings, layoutKey };
}

function buildComposedSource(layoutKeys: string[]): string {
  let inner = "<__ProjectPage />";
  for (let i = layoutKeys.length - 1; i >= 0; i--) {
    const key = layoutKeys[i]!;
    inner = `<${key}>\n      ${inner}\n    </${key}>`;
  }
  return `export default function __ProjectRouteView() {\n  return (\n    ${inner}\n  );\n}\n`;
}

/**
 * Package one route into a ConversionUnit for convertSource.
 */
export function buildConversionUnit(
  vfs: ProjectVirtualFS,
  route: ProjectRoute,
  options: BuildConversionUnitOptions,
): ConversionUnit {
  const diagnostics: ProjectDiagnostic[] = [];
  const componentFiles = extractComponentFiles(vfs);
  const textFiles = extractTextFiles(vfs);
  const limits = {
    maxDependencyDepth:
      options.maxDependencyDepth ?? PROJECT_ROUTE_GRAPH_LIMITS.maxDependencyDepth,
    maxDependencyNodes:
      options.maxDependencyNodes ?? PROJECT_ROUTE_GRAPH_LIMITS.maxDependencyNodes,
  };

  if (!(route.entryFile in componentFiles)) {
    diagnostics.push({
      severity: "error",
      code: "route-entry-missing",
      message: `Route entry file not found in project VFS: ${route.entryFile}`,
      path: route.entryFile,
    });
    return {
      route,
      framework: options.framework,
      entryFile: route.entryFile,
      entrySource: "",
      sourcePath: route.entryFile,
      moduleSources: {},
      knownComponentSources: {},
      layoutChain: [...route.layoutChain],
      layoutMode: route.layoutChain.length > 0 ? "page-only" : "none",
      css: [],
      cssPaths: [],
      graph: emptyGraph(),
      diagnostics,
    };
  }

  const pageGraph = resolveRouteGraph(
    componentFiles,
    route.entryFile,
    limits,
    options.pathAliases,
  );

  if (!pageGraph.ok) {
    diagnostics.push(...pageGraph.diagnostics);
    const entrySource = componentFiles[route.entryFile] ?? "";
    return {
      route,
      framework: options.framework,
      entryFile: route.entryFile,
      entrySource,
      sourcePath: route.entryFile,
      moduleSources: { [route.entryFile]: entrySource },
      knownComponentSources: {},
      layoutChain: [...route.layoutChain],
      layoutMode: route.layoutChain.length > 0 ? "page-only" : "none",
      css: [],
      cssPaths: [],
      graph: pageGraph.graph,
      diagnostics,
    };
  }

  diagnostics.push(...pageGraph.diagnostics);

  let knownComponentSources = { ...pageGraph.knownComponentSources };
  let moduleSources = { ...pageGraph.moduleSources };
  let bindingPaths = { ...pageGraph.bindingPaths };
  let graph = pageGraph.graph;
  let layoutMode: LayoutCompositionMode =
    route.layoutChain.length > 0 ? "page-only" : "none";
  let entrySource = componentFiles[route.entryFile]!;
  let sourcePath = route.entryFile;
  const layoutKeys: string[] = [];

  if (route.layoutChain.length > 0) {
    let canCompose = true;
    let workingKnown = { ...knownComponentSources };
    let workingModules = { ...moduleSources };
    let workingBindings = { ...bindingPaths };
    let workingGraph = graph;

    for (let i = 0; i < route.layoutChain.length; i++) {
      const layoutPath = route.layoutChain[i]!;
      if (!(layoutPath in componentFiles)) {
        diagnostics.push({
          severity: "warning",
          code: "layout-missing",
          message: `Layout file missing from VFS; converting page only: ${layoutPath}`,
          path: layoutPath,
        });
        canCompose = false;
        break;
      }

      const layoutSource = componentFiles[layoutPath]!;
      if (!layoutLooksComposable(layoutSource)) {
        diagnostics.push({
          severity: "warning",
          code: "layout-composition-deferred",
          message: `Layout does not clearly accept children; converting page only: ${layoutPath}`,
          path: layoutPath,
        });
        canCompose = false;
        break;
      }

      const layoutGraph = resolveRouteGraph(
        componentFiles,
        layoutPath,
        limits,
        options.pathAliases,
      );
      if (!layoutGraph.ok) {
        diagnostics.push(...layoutGraph.diagnostics);
        diagnostics.push({
          severity: "warning",
          code: "layout-composition-deferred",
          message: `Layout dependency graph failed; converting page only: ${layoutPath}`,
          path: layoutPath,
        });
        canCompose = false;
        break;
      }

      diagnostics.push(...layoutGraph.diagnostics);
      const merged = tryMergeLayoutBindings({
        pageBindings: workingBindings,
        pageKnown: workingKnown,
        pageModules: workingModules,
        layoutPath,
        layoutIndex: i,
        layoutGraph,
      });

      if (!merged.ok) {
        diagnostics.push({
          severity: "warning",
          code: "layout-composition-deferred",
          message: `${merged.reason} Converting page only; layoutChain is preserved on the unit.`,
          path: layoutPath,
        });
        canCompose = false;
        break;
      }

      workingKnown = merged.known;
      workingModules = merged.modules;
      workingBindings = merged.bindings;
      workingGraph = mergeGraphs(workingGraph, layoutGraph.graph);
      layoutKeys.push(merged.layoutKey);
    }

    if (canCompose && layoutKeys.length === route.layoutChain.length) {
      // Page under a unique key so layouts can wrap it via children.
      workingKnown.__ProjectPage = componentFiles[route.entryFile]!;
      knownComponentSources = workingKnown;
      moduleSources = workingModules;
      bindingPaths = workingBindings;
      graph = workingGraph;
      entrySource = buildComposedSource(layoutKeys);
      sourcePath = `${route.entryFile}#composed`;
      layoutMode = "composed";
      diagnostics.push({
        severity: "info",
        code: "layout-composed",
        message:
          "App Router layoutChain composed into a single route document (shared layouts may duplicate across routes).",
        path: route.entryFile,
      });
    }
  }

  const rootCssModules = listRootCssSourceModules(textFiles);
  const cssModuleSources: Record<string, string> = { ...moduleSources };
  for (const rootPath of rootCssModules) {
    if (cssModuleSources[rootPath] === undefined && textFiles[rootPath]) {
      cssModuleSources[rootPath] = textFiles[rootPath]!;
    }
  }
  const cssModulePaths = [
    ...new Set([
      ...(graph.nodes.length > 0 ? graph.nodes : [route.entryFile]),
      ...rootCssModules,
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const cssResult = collectRouteScopedCss({
    modulePaths: cssModulePaths,
    moduleSources: cssModuleSources,
    textFiles,
  });
  diagnostics.push(...cssResult.diagnostics);
  const rootImportedCss = cssResult.cssPaths.filter((p) =>
    rootCssModules.includes(cssResult.cssImporters[p] ?? ""),
  );
  if (rootImportedCss.length > 0) {
    diagnostics.push({
      severity: "info",
      code: "root-css-included",
      message: `Included root/global CSS: ${rootImportedCss.join(", ")}`,
      path: route.entryFile,
    });
  }

  return {
    route,
    framework: options.framework,
    entryFile: route.entryFile,
    entrySource,
    sourcePath,
    moduleSources,
    knownComponentSources,
    layoutChain: [...route.layoutChain],
    layoutMode,
    css: cssResult.css,
    cssPaths: cssResult.cssPaths,
    graph,
    diagnostics,
  };
}
