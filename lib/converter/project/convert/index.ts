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
export { collectRouteScopedCss, stripCssImportQuery } from "./collect-css";
export { listRootCssSourceModules } from "./root-css-modules";
export { convertRouteUnit, type ConvertRouteUnitOptions } from "./convert-route";
export { convertProject, convertProjectAsync } from "./convert-project";
export type { DocumentPageLayoutMode } from "./types";
