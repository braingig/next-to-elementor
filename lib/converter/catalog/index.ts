/**
 * Elementor Free capability catalog (Phase 1).
 * Data-driven Free 4.2.4 catalog + loaders + Free compliance gates.
 * No conversion / emission logic.
 */

export {
  CATALOG_SCHEMA_VERSION,
  ELEMENTOR_DOCUMENT_VERSION,
  EMPTY_ELEMENTOR_FREE_CATALOG_STUB,
  ElementorFreeCatalogSchema,
  CatalogControlSchema,
  CatalogWidgetSchema,
  ProDenylistEntrySchema,
  type ElementorFreeCatalog,
  type CatalogControl,
  type CatalogWidget,
  type ProDenylistEntry,
  type CatalogVerificationStatus,
} from "./schema";

export {
  DEFAULT_ELEMENTOR_FREE_TARGET,
  SUPPORTED_ELEMENTOR_FREE_TARGETS,
  loadElementorFreeCatalog,
  listAvailableElementorFreeCatalogTargets,
  type SupportedElementorFreeTarget,
} from "./load";

export {
  canUseControl,
  canUseWidget,
  checkFreeCompliance,
  getCatalogWidget,
  isProDenylisted,
  type FreeComplianceResult,
  type FreeComplianceViolation,
} from "./compliance";
