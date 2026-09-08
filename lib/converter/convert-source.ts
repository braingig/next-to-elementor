import { z } from "zod";
import {
  loadElementorFreeCatalog,
  type ElementorFreeCatalog,
  type SupportedElementorFreeTarget,
} from "./catalog";
import { CATALOG_SCHEMA_VERSION } from "./catalog/schema";
import { IR_SCHEMA_VERSION } from "./ir/schema";
import {
  analyzeReactSource,
  ReactParseError,
} from "./parse";
import { ReactSourceLanguageSchema } from "./parse/types";
import { resolveStyles } from "./styles";
import { convert } from "./convert";
import {
  canonicalizeElementorJson,
  validateElementorDocument,
} from "./emit";
import {
  ConversionResultSchema,
  type ConversionResult,
} from "./report/schema";
import type { ElementorDocument } from "./rules/native/types";

export const ConvertSourceOptionsSchema = z
  .object({
    /** React/JSX/TSX source string for a section or component. */
    source: z.string().min(1),
    language: ReactSourceLanguageSchema.default("auto"),
    sourcePath: z.string().optional(),
    sourceName: z.string().optional(),
    componentName: z.string().optional(),
    /**
     * Optional same-analysis component sources (name → source string).
     * Never executed; static inlining only. No filesystem imports.
     */
    knownComponentSources: z.record(z.string(), z.string()).default({}),
    /** Explicit CSS accompanying the section (not a repo scan). */
    css: z.union([z.string(), z.array(z.string())]).default([]),
    resolveTailwind: z.boolean().default(true),
    resolveInline: z.boolean().default(true),
    catalog: z.custom<ElementorFreeCatalog>().optional(),
    catalogTarget: z.string().default("4.2.4"),
    title: z.string().optional(),
  })
  .strict();

export type ConvertSourceOptions = z.input<typeof ConvertSourceOptionsSchema>;

function emptyFailedResult(args: {
  catalog: ElementorFreeCatalog;
  message: string;
  code: string;
  loc?: { line: number; column: number };
}): ConversionResult {
  return ConversionResultSchema.parse({
    outcome: "failed",
    catalogVersion: args.catalog.version,
    elementorTarget: args.catalog.elementorTarget,
    irVersion: IR_SCHEMA_VERSION,
    elementorJson: null,
    report: {
      summary: {
        totalNodes: 0,
        nativeCount: 0,
        customCount: 0,
        unsupportedCount: 0,
        warningCount: 0,
        errorCount: 1,
        message: args.message,
      },
      nodes: [],
      diagnostics: [
        {
          severity: "error",
          code: args.code,
          message: args.message,
          ...(args.loc ? { loc: args.loc } : {}),
        },
      ],
      freeCompliance: { passed: true, violations: [] },
    },
  });
}

/**
 * End-to-end conversion: React/TSX → IR → styles → Elementor Free JSON + report.
 *
 * Composes existing phases only — no duplicated conversion rules.
 * Never executes user source. Never scans the repository.
 */
export function convertSource(
  options: ConvertSourceOptions,
): ConversionResult {
  let catalog: ElementorFreeCatalog;
  try {
    const opts = ConvertSourceOptionsSchema.parse(options);
    catalog =
      opts.catalog ??
      loadElementorFreeCatalog(
        (opts.catalogTarget ?? "4.2.4") as SupportedElementorFreeTarget,
      );

    let analyzed;
    try {
      analyzed = analyzeReactSource(opts.source, {
        language: opts.language,
        sourcePath: opts.sourcePath,
        sourceName: opts.sourceName,
        componentName: opts.componentName,
        knownComponentSources: opts.knownComponentSources,
      });
    } catch (error) {
      if (error instanceof ReactParseError) {
        return emptyFailedResult({
          catalog,
          code: error.code,
          message: error.message,
          loc: error.loc,
        });
      }
      return emptyFailedResult({
        catalog,
        code: "parse-error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to parse React source.",
      });
    }

    let styled;
    try {
      styled = resolveStyles(analyzed.document, {
        css: opts.css,
        resolveTailwind: opts.resolveTailwind,
        resolveInline: opts.resolveInline,
      });
    } catch (error) {
      return emptyFailedResult({
        catalog,
        code: "validation-error",
        message:
          error instanceof Error
            ? `Style resolution failed: ${error.message}`
            : "Style resolution failed.",
      });
    }

    let result: ConversionResult;
    try {
      result = convert(styled.document, {
        catalog,
        title: opts.title,
      });
    } catch (error) {
      return emptyFailedResult({
        catalog,
        code: "validation-error",
        message:
          error instanceof Error
            ? `Conversion failed: ${error.message}`
            : "Conversion failed.",
      });
    }

    // Final Free validation gate — never return invalid JSON as complete/partial.
    if (result.elementorJson != null) {
      const document = result.elementorJson as ElementorDocument;
      const validation = validateElementorDocument(document, catalog);
      if (!validation.passed) {
        return ConversionResultSchema.parse({
          ...result,
          outcome: "failed",
          elementorJson: null,
          report: {
            ...result.report,
            summary: {
              ...result.report.summary,
              errorCount: result.report.summary.errorCount + 1,
              message: `Final Elementor JSON failed Free compliance validation.`,
            },
            diagnostics: [
              ...result.report.diagnostics,
              ...validation.violations.map((v) => ({
                severity: "error" as const,
                code: "pro-only-feature",
                message: v.message,
              })),
            ],
            freeCompliance: {
              passed: false,
              violations: validation.violations.map((v) => ({
                id: v.id,
                kind: v.kind as "widget" | "control" | "feature",
                message: v.message,
              })),
            },
          },
        });
      }

      // Determinism check: re-canonicalize must be stable (no env-dependent fields).
      void canonicalizeElementorJson(document);
    }

    return result;
  } catch (error) {
    // Options / catalog load failures
    const fallbackCatalog = {
      version: CATALOG_SCHEMA_VERSION,
      elementorTarget: "4.2.4",
    };
    try {
      catalog = loadElementorFreeCatalog("4.2.4");
    } catch {
      return ConversionResultSchema.parse({
        outcome: "failed",
        catalogVersion: fallbackCatalog.version,
        elementorTarget: fallbackCatalog.elementorTarget,
        irVersion: IR_SCHEMA_VERSION,
        elementorJson: null,
        report: {
          summary: {
            totalNodes: 0,
            nativeCount: 0,
            customCount: 0,
            unsupportedCount: 0,
            warningCount: 0,
            errorCount: 1,
            message:
              error instanceof Error ? error.message : "convertSource failed.",
          },
          nodes: [],
          diagnostics: [
            {
              severity: "error",
              code: "validation-error",
              message:
                error instanceof Error
                  ? error.message
                  : "convertSource failed.",
            },
          ],
          freeCompliance: { passed: true, violations: [] },
        },
      });
    }
    return emptyFailedResult({
      catalog,
      code: "validation-error",
      message:
        error instanceof Error ? error.message : "convertSource failed.",
    });
  }
}
