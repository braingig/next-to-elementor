/**
 * Project conversion orchestrator (Phase 13c + 14c media opt-in).
 * Discovers/packages routes, then calls existing convertSource per route.
 * Never executes project code.
 */

import { loadElementorFreeCatalog } from "../../catalog";
import { CATALOG_SCHEMA_VERSION } from "../../catalog/schema";
import { IR_SCHEMA_VERSION } from "../../ir/schema";
import type { ConversionOutcome } from "../../types/decisions";
import {
  ConversionResultSchema,
  type ConversionResult,
} from "../../report/schema";
import { analyzeProjectStructure } from "../routes/discover";
import type { ProjectAsset } from "../assets/types";
import { discoverRouteAssets } from "../assets";
import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import type { ProjectStructureAnalysis } from "../manifest/types";
import {
  runProjectMediaPipeline,
  rewriteConversionUnitMediaUrls,
} from "../media";
import type { ProjectMediaSummary } from "../media/types";
import { buildConversionUnit } from "./build-unit";
import { convertRouteUnit } from "./convert-route";
import {
  analyzeRouteDependencies,
  applyDependencyAnalysisToUnit,
  dependencyForcesRoutePartial,
} from "../deps/analyze-route";
import type {
  ConversionUnit,
  ConvertProjectOptions,
  ProjectConversionResult,
  ProjectReportSummary,
  RouteConversionResult,
} from "./types";

function packageVersionsFromAnalysis(
  analysis: ProjectStructureAnalysis,
): Record<string, string> {
  const pkg = analysis.manifest.packageJson;
  if (!pkg) return {};
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

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

function emptyMediaSummary(enabled: boolean): ProjectMediaSummary {
  return {
    enabled,
    uploadedCount: 0,
    reusedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    uploads: [],
  };
}

type PackagedRoute = {
  unit: ConversionUnit;
  depAnalysis: ReturnType<typeof analyzeRouteDependencies>;
};

function packageAllRoutes(
  vfs: ProjectVirtualFS,
  analysis: ProjectStructureAnalysis,
  options: ConvertProjectOptions,
): { packaged: PackagedRoute[]; allAssets: ProjectAsset[] } {
  const packageVersions = packageVersionsFromAnalysis(analysis);
  const packaged: PackagedRoute[] = [];
  const assetByPath = new Map<string, ProjectAsset>();

  for (const route of analysis.routes) {
    let unit = buildConversionUnit(vfs, route, {
      framework: analysis.manifest.framework,
      maxDependencyDepth: options.maxDependencyDepth,
      maxDependencyNodes: options.maxDependencyNodes,
      pathAliases: analysis.manifest.pathAliases,
    });

    const assetDiscovery = discoverRouteAssets({
      vfs,
      unit,
      pathAliases: analysis.manifest.pathAliases,
    });
    unit = {
      ...unit,
      assets: assetDiscovery.assets,
      assetReferences: assetDiscovery.references,
      assetBindings: assetDiscovery.bindingToAssetPath,
      diagnostics: [...unit.diagnostics, ...assetDiscovery.diagnostics],
    };

    for (const asset of assetDiscovery.assets) {
      const prev = assetByPath.get(asset.path);
      if (!prev || (prev.presence !== "present" && asset.presence === "present")) {
        assetByPath.set(asset.path, asset);
      }
    }

    const depAnalysis = analyzeRouteDependencies(unit, packageVersions);
    unit = applyDependencyAnalysisToUnit(unit, depAnalysis);
    packaged.push({ unit, depAnalysis });
  }

  return {
    packaged,
    allAssets: [...assetByPath.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
  };
}

function convertPackagedRoutes(args: {
  packaged: PackagedRoute[];
  catalogTarget: string;
  titlePrefix?: string;
  urlByAssetPath: Record<string, string>;
  mediaFailedAssets: Set<string>;
}): RouteConversionResult[] {
  const routeResults: RouteConversionResult[] = [];

  for (const { unit: rawUnit, depAnalysis } of args.packaged) {
    const route = rawUnit.route;
    try {
      let unit = rawUnit;

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
            args.catalogTarget,
          ),
          outcome: "failed",
          diagnostics: unit.diagnostics,
          dependencies: depAnalysis.dependencies,
          assets: unit.assets,
          assetReferences: unit.assetReferences,
        });
        continue;
      }

      if (Object.keys(args.urlByAssetPath).length > 0) {
        const rewritten = rewriteConversionUnitMediaUrls(
          unit,
          args.urlByAssetPath,
        );
        unit = rewritten.unit;
      }

      const result = convertRouteUnit(unit, {
        catalogTarget: args.catalogTarget,
        title: `${args.titlePrefix ?? "route"} ${route.path}`,
      });

      let outcome = result.outcome;
      if (
        outcome === "complete" &&
        dependencyForcesRoutePartial(depAnalysis.dependencies)
      ) {
        outcome = "partial";
      }

      // Media upload failure for an asset used by this route → at most partial.
      const routeAssetPaths = new Set(
        (unit.assets ?? [])
          .filter((a) => a.presence === "present")
          .map((a) => a.path),
      );
      const hitFailedMedia = [...routeAssetPaths].some((p) =>
        args.mediaFailedAssets.has(p),
      );
      const hitMissingUrl = [...routeAssetPaths].some(
        (p) =>
          !args.urlByAssetPath[p] &&
          (unit.assetReferences ?? []).some(
            (r) =>
              r.assetPath === p &&
              r.status === "resolved" &&
              (r.kind === "jsx-src" || r.kind === "import"),
          ),
      );
      if (
        (hitFailedMedia || (hitMissingUrl && args.mediaFailedAssets.size > 0)) &&
        outcome === "complete"
      ) {
        outcome = "partial";
      }

      routeResults.push({
        ...result,
        outcome,
        dependencies: depAnalysis.dependencies,
        unit,
        assets: unit.assets,
        assetReferences: unit.assetReferences,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Unexpected failure converting route ${route.path}`;
      routeResults.push({
        route,
        unit: null,
        conversion: emptyFailedConversion(message, args.catalogTarget),
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

  return routeResults;
}

function finalizeProjectResult(args: {
  catalogTarget: string;
  catalogVersion: string;
  analysis: ProjectStructureAnalysis;
  diagnostics: ProjectDiagnostic[];
  routeResults: RouteConversionResult[];
  media?: ProjectMediaSummary;
}): ProjectConversionResult {
  const projectReport = summarizeRoutes(args.routeResults);
  let outcome = deriveProjectOutcome(args.routeResults);

  const assetSkipped = args.diagnostics.some(
    (d) =>
      d.code === "asset-file-byte-limit" || d.code === "asset-total-byte-limit",
  );
  if (outcome === "complete" && assetSkipped) {
    outcome = "partial";
  }

  if (
    outcome === "complete" &&
    args.media &&
    args.media.enabled &&
    args.media.failedCount > 0
  ) {
    outcome = "partial";
  }

  return {
    outcome,
    elementorTarget: args.catalogTarget,
    catalogVersion: args.catalogVersion,
    irVersion: IR_SCHEMA_VERSION,
    manifest: args.analysis.manifest,
    routes: args.routeResults,
    projectReport,
    diagnostics: args.diagnostics,
    analysis: args.analysis,
    ...(args.media ? { media: args.media } : {}),
  };
}

function prepareConversion(
  vfs: ProjectVirtualFS,
  options: ConvertProjectOptions,
): {
  catalogTarget: string;
  catalogVersion: string;
  diagnostics: ProjectDiagnostic[];
  analysis: ProjectStructureAnalysis;
  packaged: PackagedRoute[];
  allAssets: ProjectAsset[];
} | ProjectConversionResult {
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

  diagnostics.push(...vfs.diagnostics);

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

  const { packaged, allAssets } = packageAllRoutes(vfs, analysis, options);
  return {
    catalogTarget,
    catalogVersion,
    diagnostics,
    analysis,
    packaged,
    allAssets,
  };
}

function isPrepared(
  value: ReturnType<typeof prepareConversion>,
): value is {
  catalogTarget: string;
  catalogVersion: string;
  diagnostics: ProjectDiagnostic[];
  analysis: ProjectStructureAnalysis;
  packaged: PackagedRoute[];
  allAssets: ProjectAsset[];
} {
  return "packaged" in value;
}

/**
 * Synchronous project conversion (media disabled).
 * When `options.media.enabled` is true, throws — use convertProjectAsync().
 */
export function convertProject(
  vfs: ProjectVirtualFS,
  options: ConvertProjectOptions = {},
): ProjectConversionResult {
  if (options.media?.enabled) {
    throw new Error(
      "Media-enabled project conversion requires convertProjectAsync().",
    );
  }

  const prepared = prepareConversion(vfs, options);
  if (!isPrepared(prepared)) return prepared;

  const routeResults = convertPackagedRoutes({
    packaged: prepared.packaged,
    catalogTarget: prepared.catalogTarget,
    titlePrefix: options.titlePrefix,
    urlByAssetPath: {},
    mediaFailedAssets: new Set(),
  });

  return finalizeProjectResult({
    catalogTarget: prepared.catalogTarget,
    catalogVersion: prepared.catalogVersion,
    analysis: prepared.analysis,
    diagnostics: prepared.diagnostics,
    routeResults,
  });
}

/**
 * Async project conversion with optional WordPress media upload + URL rewrite.
 */
export async function convertProjectAsync(
  vfs: ProjectVirtualFS,
  options: ConvertProjectOptions = {},
): Promise<ProjectConversionResult> {
  const prepared = prepareConversion(vfs, options);
  if (!isPrepared(prepared)) return prepared;

  let urlByAssetPath: Record<string, string> = {};
  let mediaSummary: ProjectMediaSummary | undefined;
  const mediaFailedAssets = new Set<string>();
  const diagnostics = [...prepared.diagnostics];

  if (options.media?.enabled) {
    // Flatten per-route assets (duplicates allowed) so session dedupe can emit "reused".
    const assetsForMedia = prepared.packaged.flatMap(
      (p) => p.unit.assets ?? [],
    );
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: assetsForMedia.length > 0 ? assetsForMedia : prepared.allAssets,
      options: options.media,
    });
    diagnostics.push(...pipeline.diagnostics);
    mediaSummary = pipeline.summary;

    if (pipeline.fatal) {
      return {
        outcome: "failed",
        elementorTarget: prepared.catalogTarget,
        catalogVersion: prepared.catalogVersion,
        irVersion: IR_SCHEMA_VERSION,
        manifest: prepared.analysis.manifest,
        routes: [],
        projectReport: summarizeRoutes([]),
        diagnostics,
        analysis: prepared.analysis,
        media: mediaSummary ?? emptyMediaSummary(true),
      };
    }

    urlByAssetPath = pipeline.urlByAssetPath;
    for (const upload of pipeline.summary.uploads) {
      if (upload.status === "failed") {
        mediaFailedAssets.add(upload.assetPath);
      }
    }
  }

  const routeResults = convertPackagedRoutes({
    packaged: prepared.packaged,
    catalogTarget: prepared.catalogTarget,
    titlePrefix: options.titlePrefix,
    urlByAssetPath,
    mediaFailedAssets,
  });

  return finalizeProjectResult({
    catalogTarget: prepared.catalogTarget,
    catalogVersion: prepared.catalogVersion,
    analysis: prepared.analysis,
    diagnostics,
    routeResults,
    media: mediaSummary,
  });
}
