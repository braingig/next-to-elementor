/**
 * Project dependency capability layer (Phase 13e).
 * Static classification + thin adapters. Never installs or executes packages.
 */

export type {
  DependencyCategory,
  DependencyCapabilityStatus,
  DependencyCapability,
  ExternalImportHit,
  RouteDependencyAnalysis,
} from "./types";

export {
  DEPENDENCY_REGISTRY,
  lookupDependencyRegistry,
  packageNameFromSpecifier,
  listRegisteredPackages,
  type RegistryEntry,
} from "./registry";

export {
  discoverExternalImports,
  groupImportsByPackage,
} from "./discover";

export {
  analyzeRouteDependencies,
  applyDependencyAnalysisToUnit,
  dependencyForcesRoutePartial,
} from "./analyze-route";

export {
  getAdapter,
  lucideReactAdapter,
  framerMotionAdapter,
  carouselAdapter,
  chartsAdapter,
} from "./adapters";
