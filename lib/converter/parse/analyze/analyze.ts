import { parse as parseKnownComponent } from "@babel/parser";
import type { File } from "@babel/types";
import {
  IR_SCHEMA_VERSION,
  normalizeIrDocument,
} from "../../ir";
import { parseReactSource } from "../parse";
import {
  AnalyzeReactOptionsSchema,
  type AnalyzeReactOptions,
  type AnalyzeReactResult,
} from "../types";
import { collectLocalComponents, findEntryComponent } from "./components";
import { addDiagnostic, type AnalyzerContext } from "./context";
import { convertJsxRoot } from "./jsx";
import {
  collectStaticArrayBindings,
  collectStaticObjectBindings,
  collectStaticPrimitiveBindings,
} from "./static-array-map";
import {
  buildImportBindingMap,
  buildModuleStaticRegistry,
  mapKnownComponentsToModulePaths,
} from "./static-module-exports";

function mergeKnownComponentSources(
  ctx: AnalyzerContext,
  known: Record<string, string>,
  moduleSources: Record<string, string>,
  pathAliases: AnalyzeReactOptions["pathAliases"],
  componentPaths: Map<string, string>,
): void {
  for (const [name, source] of Object.entries(known).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    try {
      const ast = parseKnownComponent(source, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
      const locals = collectLocalComponents(ast);
      const def = locals.get(name) ?? [...locals.values()][0];
      if (def) {
        ctx.localComponents.set(name, { ...def, name });
      } else {
        addDiagnostic(ctx, {
          severity: "warning",
          code: "unknown-component",
          message: `knownComponentSources[${name}] did not contain an analyzable JSX-returning component.`,
        });
      }
      // Per-component scope — never flatten into entry staticArrays/staticObjects.
      ctx.componentStaticObjects.set(name, collectStaticObjectBindings(ast));
      ctx.componentStaticArrays.set(name, collectStaticArrayBindings(ast));
      ctx.componentStaticPrimitives.set(
        name,
        collectStaticPrimitiveBindings(ast),
      );

      const fromPath = componentPaths.get(name);
      if (fromPath && Object.keys(moduleSources).length > 0) {
        ctx.componentImportBindings.set(
          name,
          buildImportBindingMap({
            ast,
            fromPath,
            moduleSources,
            pathAliases,
          }),
        );
      }
    } catch {
      addDiagnostic(ctx, {
        severity: "warning",
        code: "parse-error",
        message: `Failed to parse knownComponentSources[${name}] (static only; ignored).`,
      });
    }
  }
}

/**
 * Analyze a Babel AST and produce a normalized IR document.
 * Static analysis only — never executes user code.
 */
export function analyzeReactAst(
  ast: File,
  source: string,
  options: Partial<AnalyzeReactOptions> = {},
): AnalyzeReactResult {
  const opts = AnalyzeReactOptionsSchema.parse(options);
  const localComponents = collectLocalComponents(ast);
  const staticArrays = collectStaticArrayBindings(ast);
  const staticObjects = collectStaticObjectBindings(ast);
  const staticPrimitives = collectStaticPrimitiveBindings(ast);
  const moduleSources = opts.moduleSources ?? {};
  const pathAliases = opts.pathAliases;
  const moduleStaticRegistry = buildModuleStaticRegistry(moduleSources);
  const componentPaths = mapKnownComponentsToModulePaths(
    opts.knownComponentSources,
    moduleSources,
  );

  const entryPath = opts.sourcePath ?? "entry.tsx";
  const entryImportBindings =
    Object.keys(moduleSources).length > 0
      ? buildImportBindingMap({
          ast,
          fromPath: entryPath,
          moduleSources,
          pathAliases,
        })
      : new Map();

  const ctx: AnalyzerContext = {
    source,
    sourcePath: opts.sourcePath,
    sourceName: opts.sourceName,
    componentName: opts.componentName,
    localComponents,
    staticArrays,
    staticObjects,
    staticPrimitives,
    componentStaticArrays: new Map(),
    componentStaticObjects: new Map(),
    componentStaticPrimitives: new Map(),
    inlineComponentStack: [],
    moduleStaticRegistry,
    entryImportBindings,
    componentImportBindings: new Map(),
    diagnostics: [],
    idCounter: { value: 0 },
    inlineDepth: 0,
    passthroughDepth: 0,
    propScopes: [],
  };

  mergeKnownComponentSources(
    ctx,
    opts.knownComponentSources,
    moduleSources,
    pathAliases,
    componentPaths,
  );

  const entry = findEntryComponent(ast, opts.componentName);
  if (!entry) {
    addDiagnostic(ctx, {
      severity: "error",
      code: "parse-error",
      message:
        "No JSX-returning React component or top-level JSX was found in the source.",
    });
    const document = normalizeIrDocument({
      version: IR_SCHEMA_VERSION,
      meta: {
        sourceName: opts.sourceName ?? opts.sourcePath,
        sourceLanguage: opts.sourcePath?.endsWith(".jsx") ? "jsx" : "tsx",
      },
      root: {
        id: "root",
        kind: "unsupported",
        props: {
          reasonCode: "parse-error",
          message: "No analyzable JSX root found.",
        },
        children: [],
      },
      diagnostics: ctx.diagnostics,
    });
    return { document };
  }

  const root = convertJsxRoot(ctx, entry.jsxRoot);
  if (!root.provenance?.componentName) {
    root.provenance = {
      classNames: root.provenance?.classNames ?? [],
      attributes: root.provenance?.attributes ?? {},
      ...root.provenance,
      componentName: entry.name,
      sourcePath: opts.sourcePath ?? root.provenance?.sourcePath,
    };
  }

  const language =
    opts.sourcePath?.endsWith(".jsx") || opts.sourcePath?.endsWith(".js")
      ? "jsx"
      : "tsx";

  const document = normalizeIrDocument({
    version: IR_SCHEMA_VERSION,
    meta: {
      sourceName: opts.sourceName ?? opts.sourcePath ?? entry.name,
      sourceLanguage: language,
    },
    root,
    diagnostics: ctx.diagnostics,
  });

  return { document };
}

/**
 * Parse + analyze a React/JSX/TSX source string into IR.
 */
export function analyzeReactSource(
  source: string,
  options: Partial<AnalyzeReactOptions> & {
    language?: "tsx" | "jsx" | "auto";
  } = {},
): AnalyzeReactResult {
  const parsed = parseReactSource(source, {
    language: options.language ?? "auto",
    sourcePath: options.sourcePath,
  });
  return analyzeReactAst(parsed.ast, parsed.source, {
    sourcePath: options.sourcePath ?? parsed.sourcePath,
    sourceName: options.sourceName,
    componentName: options.componentName,
    knownComponentSources: options.knownComponentSources,
    moduleSources: options.moduleSources,
    pathAliases: options.pathAliases,
  });
}
