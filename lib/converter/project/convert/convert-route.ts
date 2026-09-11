/**
 * Convert one ConversionUnit via existing convertSource + Free validation.
 */

import { convertSource } from "../../convert-source";
import { loadElementorFreeCatalog } from "../../catalog";
import { validateElementorDocument } from "../../emit";
import { CATALOG_SCHEMA_VERSION } from "../../catalog/schema";
import { IR_SCHEMA_VERSION } from "../../ir/schema";
import {
  ConversionResultSchema,
  type ConversionResult,
} from "../../report/schema";
import type { ElementorDocument } from "../../rules/native/types";
import type { ProjectDiagnostic } from "../types";
import type { ConversionUnit, RouteConversionResult } from "./types";

function failedConversion(
  message: string,
  code: string,
  catalogTarget: string,
): ConversionResult {
  return ConversionResultSchema.parse({
    outcome: "failed",
    catalogVersion: CATALOG_SCHEMA_VERSION,
    elementorTarget: catalogTarget,
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
        message,
      },
      nodes: [],
      diagnostics: [
        {
          severity: "error",
          code,
          message,
        },
      ],
      freeCompliance: { passed: true, violations: [] },
    },
  });
}

function languageForPath(path: string): "tsx" | "jsx" | "auto" {
  if (/\.tsx$/i.test(path) || /\.ts$/i.test(path)) return "tsx";
  if (/\.jsx$/i.test(path) || /\.js$/i.test(path)) return "jsx";
  return "auto";
}

export type ConvertRouteUnitOptions = {
  catalogTarget?: string;
  title?: string;
};

/**
 * Run existing convertSource for one packaged route unit.
 * Isolates failures to this route.
 */
export function convertRouteUnit(
  unit: ConversionUnit,
  options: ConvertRouteUnitOptions = {},
): RouteConversionResult {
  const catalogTarget = options.catalogTarget ?? "4.2.4";
  const diagnostics: ProjectDiagnostic[] = [...unit.diagnostics];

  if (!unit.entrySource.trim()) {
    const conversion = failedConversion(
      `Empty entry source for route ${unit.route.path}`,
      "route-entry-empty",
      catalogTarget,
    );
    return {
      route: unit.route,
      unit,
      conversion,
      outcome: "failed",
      diagnostics: [
        ...diagnostics,
        {
          severity: "error",
          code: "route-entry-empty",
          message: conversion.report.summary.message,
          path: unit.entryFile,
        },
      ],
      assets: unit.assets,
      assetReferences: unit.assetReferences,
    };
  }

  let conversion: ConversionResult;
  try {
    conversion = convertSource({
      source: unit.entrySource,
      sourcePath: unit.sourcePath,
      sourceName: unit.route.id,
      language: languageForPath(unit.route.entryFile),
      knownComponentSources: unit.knownComponentSources,
      moduleSources: unit.moduleSources,
      css: unit.css,
      catalogTarget,
      title: options.title ?? `route ${unit.route.path}`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected convertSource failure.";
    conversion = failedConversion(message, "route-convert-error", catalogTarget);
    diagnostics.push({
      severity: "error",
      code: "route-convert-error",
      message,
      path: unit.entryFile,
    });
  }

  if (conversion.elementorJson != null) {
    try {
      const catalog = loadElementorFreeCatalog(catalogTarget as "4.2.4");
      const validation = validateElementorDocument(
        conversion.elementorJson as ElementorDocument,
        catalog,
      );
      if (!validation.passed) {
        diagnostics.push({
          severity: "error",
          code: "route-elementor-invalid",
          message: `Elementor Free validation failed for route ${unit.route.path}.`,
          path: unit.entryFile,
        });
        conversion = {
          ...conversion,
          outcome: "failed",
          elementorJson: null,
          report: {
            ...conversion.report,
            summary: {
              ...conversion.report.summary,
              errorCount: conversion.report.summary.errorCount + 1,
              message: `Final Elementor JSON failed Free compliance validation for route ${unit.route.path}.`,
            },
            freeCompliance: {
              passed: false,
              violations: validation.violations.map((v) => ({
                id: v.id,
                kind: v.kind as "widget" | "control" | "feature",
                message: v.message,
              })),
            },
          },
        };
      }
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "catalog-load-error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load Elementor catalog for validation.",
      });
    }
  }

  if (unit.route.isDynamic) {
    diagnostics.push({
      severity: "info",
      code: "dynamic-route-pattern",
      message: `Converted dynamic route pattern ${unit.route.path} without inventing concrete URL values.`,
      path: unit.entryFile,
    });
  }

  return {
    route: unit.route,
    unit,
    conversion,
    outcome: conversion.outcome,
    diagnostics,
    assets: unit.assets,
    assetReferences: unit.assetReferences,
  };
}
