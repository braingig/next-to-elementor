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

function mergeKnownComponentSources(
  ctx: AnalyzerContext,
  known: Record<string, string>,
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

  const ctx: AnalyzerContext = {
    source,
    sourcePath: opts.sourcePath,
    sourceName: opts.sourceName,
    componentName: opts.componentName,
    localComponents,
    diagnostics: [],
    idCounter: { value: 0 },
    inlineDepth: 0,
  };

  mergeKnownComponentSources(ctx, opts.knownComponentSources);

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
  });
}
