/**
 * Project conversion barrel (Phase 13c).
 */

export {
  PROJECT_ROUTE_GRAPH_LIMITS,
  type ConversionUnit,
  type LayoutCompositionMode,
  type RouteConversionResult,
  type ProjectReportSummary,
  type ProjectConversionResult,
  type ConvertProjectOptions,
  type BuildConversionUnitOptions,
} from "./types";

export { buildConversionUnit } from "./build-unit";
export { collectRouteScopedCss } from "./collect-css";
export { convertRouteUnit, type ConvertRouteUnitOptions } from "./convert-route";
export { convertProject, convertProjectAsync } from "./convert-project";
