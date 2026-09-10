/**
 * Section input resolver: virtual file map → ConvertSourceOptions.
 *
 * Single-file callers should keep using convertSource({ source }) unchanged.
 * Folder / multi-file sections use resolveSectionInput / convertSectionInput.
 */

import { convertSource, type ConvertSourceOptions } from "../convert-source";
import { CATALOG_SCHEMA_VERSION } from "../catalog/schema";
import { IR_SCHEMA_VERSION } from "../ir/schema";
import {
  ConversionResultSchema,
  type ConversionResult,
} from "../report/schema";
import { loadElementorFreeCatalog } from "../catalog";
import { normalizeVirtualFiles } from "./normalize-paths";
import { resolveEntryPath } from "./resolve-entry";
import { resolveImportGraph } from "./resolve-imports";
import { toConvertSourceOptions } from "./to-convert-options";
import {
  SECTION_INPUT_LIMITS,
  SectionInputError,
  type ResolveSectionInputOptions,
  type ResolvedSection,
  type SectionDiagnostic,
} from "./types";

export type ResolveSectionSuccess = {
  ok: true;
  resolved: ResolvedSection;
  convertOptions: ConvertSourceOptions;
};

export type ResolveSectionFailure = {
  ok: false;
  diagnostics: SectionDiagnostic[];
  error: SectionInputError;
};

export type ResolveSectionResult = ResolveSectionSuccess | ResolveSectionFailure;

/**
 * Resolve a virtual section (one file or a folder map) into convertSource options.
 * Does not convert. Does not read the real filesystem.
 */
export function resolveSectionInput(
  options: ResolveSectionInputOptions & {
    convert?: Parameters<typeof toConvertSourceOptions>[0]["convert"];
  },
): ResolveSectionResult {
  const limits = { ...SECTION_INPUT_LIMITS, ...options.limits };
  const normalized = normalizeVirtualFiles(options.files, limits);
  if (normalized.diagnostics.some((d) => d.severity === "error")) {
    const primary =
      normalized.diagnostics.find((d) => d.severity === "error") ??
      normalized.diagnostics[0]!;
    const error = new SectionInputError(primary.message, {
      code: primary.code,
      diagnostics: normalized.diagnostics,
      candidates: primary.candidates,
    });
    return { ok: false, diagnostics: normalized.diagnostics, error };
  }

  const entry = resolveEntryPath({
    files: normalized.files,
    entryPath: options.entryPath,
    sectionName: options.sectionName,
  });

  if (!entry.ok) {
    const primary = entry.diagnostics[0]!;
    const error = new SectionInputError(primary.message, {
      code: primary.code,
      diagnostics: entry.diagnostics,
      candidates: entry.candidates ?? primary.candidates,
    });
    return { ok: false, diagnostics: entry.diagnostics, error };
  }

  const entryPath = entry.entryPath;

  const graph = resolveImportGraph({
    files: normalized.files,
    entryPath,
    limits,
  });

  if (!graph.ok) {
    const primary = graph.diagnostics.find((d) => d.severity === "error")!;
    const error = new SectionInputError(primary.message, {
      code: primary.code,
      diagnostics: graph.diagnostics,
      candidates: primary.candidates,
    });
    return { ok: false, diagnostics: graph.diagnostics, error };
  }

  const resolved: ResolvedSection = {
    entryPath,
    entrySource: normalized.files[entryPath]!,
    entryComponentName: options.componentName,
    knownComponentSources: graph.knownComponentSources,
    moduleSources: graph.moduleSources,
    bindingPaths: graph.bindingPaths,
    graph: graph.graph,
    diagnostics: [
      ...normalized.diagnostics,
      ...graph.diagnostics,
    ],
  };

  const convertOptions = toConvertSourceOptions({
    resolved,
    convert: options.convert,
  });

  return { ok: true, resolved, convertOptions };
}

function failedSectionResult(
  message: string,
  code: string,
  diagnostics: SectionDiagnostic[],
): ConversionResult {
  let catalogVersion = CATALOG_SCHEMA_VERSION;
  let elementorTarget = "4.2.4";
  try {
    const catalog = loadElementorFreeCatalog("4.2.4");
    catalogVersion = catalog.version;
    elementorTarget = catalog.elementorTarget;
  } catch {
    // keep fallbacks
  }

  return ConversionResultSchema.parse({
    outcome: "failed",
    catalogVersion,
    elementorTarget,
    irVersion: IR_SCHEMA_VERSION,
    elementorJson: null,
    report: {
      summary: {
        totalNodes: 0,
        nativeCount: 0,
        customCount: 0,
        unsupportedCount: 0,
        warningCount: diagnostics.filter((d) => d.severity === "warning").length,
        errorCount: Math.max(
          1,
          diagnostics.filter((d) => d.severity === "error").length,
        ),
        message,
      },
      nodes: [],
      diagnostics: diagnostics.map((d) => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
      })),
      freeCompliance: { passed: true, violations: [] },
    },
  });
}

export type ConvertSectionInputOptions = ResolveSectionInputOptions & {
  convert?: Parameters<typeof toConvertSourceOptions>[0]["convert"];
};

/**
 * Resolve a virtual section folder/file map and run the existing convertSource
 * pipeline. Prefer convertSource({ source }) for plain single-string input.
 *
 * Limitations (this phase):
 * - No static/dynamic prop substitution
 * - No CSS import collection
 * - No npm / @/ / remote resolution
 */
export function convertSectionInput(
  options: ConvertSectionInputOptions,
): ConversionResult {
  const resolved = resolveSectionInput(options);
  if (!resolved.ok) {
    return failedSectionResult(
      resolved.error.message,
      resolved.error.code,
      resolved.diagnostics,
    );
  }
  return convertSource(resolved.convertOptions);
}

export {
  normalizeVirtualPath,
  normalizeVirtualFiles,
  resolveRelativeVirtualPath,
} from "./normalize-paths";
export { resolveEntryPath } from "./resolve-entry";
export {
  collectStaticImports,
  resolveModulePath,
  resolveImportGraph,
} from "./resolve-imports";
export { toConvertSourceOptions } from "./to-convert-options";
export {
  SECTION_INPUT_LIMITS,
  SectionInputError,
  type VirtualFiles,
  type ResolvedSection,
  type ResolveSectionInputOptions,
  type SectionDiagnostic,
  type DependencyGraph,
  type DependencyEdge,
} from "./types";
