/**
 * Project conversion orchestrator (Phase 13c).
 * Discovers/packages routes, then calls existing convertSource per route.
 */

import { loadElementorFreeCatalog } from "../../catalog";
import { CATALOG_SCHEMA_VERSION } from "../../catalog/schema";
import { IR_SCHEMA_VERSION } from "../../ir/schema";
import {
  ConversionResultSchema,
  type ConversionResult,
} from "../../report/schema";
import type { ConversionOutcome } from "../../types/decisions";
import { analyzeProjectStructure } from "../routes/discover";
import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import { buildConversionUnit } from "./build-unit";
import { convertRouteUnit } from "./convert-route";
import type {
  ConvertProjectOptions,
  ProjectConversionResult,
  ProjectReportSummary,
  RouteConversionResult,
} from "./types";

function emptyFailedConversion(
  message: string,
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
          code: "project-failed",
          message,
        },
      ],
      freeCompliance: { passed: true, violations: [] },
    },
  });
}

function summarizeRoutes(
  routes: RouteConversionResult[],
): ProjectReportSummary {
  const completeRoutes = routes.filter((r) => r.outcome === "complete").length;
  const partialRoutes = routes.filter((r) => r.outcome === "partial").length;
  const failedRoutes = routes.filter((r) => r.outcome === "failed").length;
  const usableDocuments = routes.filter(
    (r) => r.conversion.elementorJson != null,
  ).length;

  let message: string;
  if (routes.length === 0) {
    message = "No visual routes to convert.";
  } else {
    message = `${routes.length} routes: ${completeRoutes} complete, ${partialRoutes} partial, ${failedRoutes} failed, ${usableDocuments} usable Elementor document(s).`;
  }

  return {
    totalRoutes: routes.length,
    completeRoutes,
    partialRoutes,
    failedRoutes,
    usableDocuments,
    message,
  };
}

function deriveProjectOutcome(
  routes: RouteConversionResult[],
): ConversionOutcome {
  if (routes.length === 0) return "failed";
  const usable = routes.filter((r) => r.conversion.elementorJson != null);
  if (usable.length === 0) return "failed";
  if (routes.every((r) => r.outcome === "complete")) return "complete";
  return "partial";
}

function isEmptyVfs(vfs: ProjectVirtualFS): boolean {
  return Object.keys(vfs.files).length === 0;
}

/**
 * Convert all discovered visual routes into independent Elementor documents.
 * Never merges routes into one document. Never executes project code.
 */
export function convertProject(
  vfs: ProjectVirtualFS,
  options: ConvertProjectOptions = {},
): ProjectConversionResult {
  const catalogTarget = options.catalogTarget ?? "4.2.4";
  const diagnostics: ProjectDiagnostic[] = [];

  let catalogVersion = CATALOG_SCHEMA_VERSION;
  try {
    catalogVersion = loadElementorFreeCatalog(
      catalogTarget as "4.2.4",
    ).version;
  } catch {
    // keep schema default
  }

  if (isEmptyVfs(vfs)) {
    diagnostics.push({
      severity: "error",
      code: "empty-project-vfs",
      message: "ProjectVirtualFS has no files; cannot convert.",
    });
    return {
      outcome: "failed",
      elementorTarget: catalogTarget,
      catalogVersion,
      irVersion: IR_SCHEMA_VERSION,
      manifest: {
        framework: "unknown",
        frameworkConfidence: "low",
        typescript: false,
        styleSystems: ["unknown"],
        pathAliases: {},
        configFiles: [],
        entryCandidates: [],
        diagnostics: [],
      },
      routes: [],
      projectReport: summarizeRoutes([]),
      diagnostics,
    };
  }

  const analysis = options.analysis ?? analyzeProjectStructure(vfs);
  diagnostics.push(...analysis.diagnostics);

  if (analysis.routes.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "no-routes-to-convert",
      message: "No visual routes discovered; project conversion failed.",
    });
    return {
      outcome: "failed",
      elementorTarget: catalogTarget,
      catalogVersion,
      irVersion: IR_SCHEMA_VERSION,
      manifest: analysis.manifest,
      routes: [],
      projectReport: summarizeRoutes([]),
      diagnostics,
      analysis,
    };
  }

  const routeResults: RouteConversionResult[] = [];

  for (const route of analysis.routes) {
    try {
      const unit = buildConversionUnit(vfs, route, {
        framework: analysis.manifest.framework,
        maxDependencyDepth: options.maxDependencyDepth,
        maxDependencyNodes: options.maxDependencyNodes,
      });

      // If unit failed to resolve a usable source and graph had hard errors,
      // still attempt convertSource when entrySource exists; else mark failed.
      const hardUnitError = unit.diagnostics.some(
        (d) =>
          d.severity === "error" &&
          (d.code === "route-entry-missing" ||
            d.code === "circular-dependency" ||
            d.code === "missing-dependency" ||
            d.code === "component-name-collision" ||
            d.code === "dependency-depth-limit" ||
            d.code === "dependency-node-limit" ||
            d.code === "parse-error"),
      );

      if (hardUnitError && !unit.entrySource.trim()) {
        routeResults.push({
          route,
          unit,
          conversion: emptyFailedConversion(
            unit.diagnostics.find((d) => d.severity === "error")?.message ??
              `Failed to package route ${route.path}`,
            catalogTarget,
          ),
          outcome: "failed",
          diagnostics: unit.diagnostics,
        });
        continue;
      }

      if (hardUnitError) {
        // Still try conversion with whatever was packaged; route stays isolated.
        // Surface packaging errors alongside converter result.
      }

      const result = convertRouteUnit(unit, {
        catalogTarget,
        title: `${options.titlePrefix ?? "route"} ${route.path}`,
      });
      routeResults.push(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Unexpected failure converting route ${route.path}`;
      routeResults.push({
        route,
        unit: null,
        conversion: emptyFailedConversion(message, catalogTarget),
        outcome: "failed",
        diagnostics: [
          {
            severity: "error",
            code: "route-unexpected-error",
            message,
            path: route.entryFile,
          },
        ],
      });
    }
  }

  const projectReport = summarizeRoutes(routeResults);
  const outcome = deriveProjectOutcome(routeResults);

  return {
    outcome,
    elementorTarget: catalogTarget,
    catalogVersion,
    irVersion: IR_SCHEMA_VERSION,
    manifest: analysis.manifest,
    routes: routeResults,
    projectReport,
    diagnostics,
    analysis,
  };
}
