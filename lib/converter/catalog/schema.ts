import { z } from "zod";
import { IrNodeKindSchema } from "../ir/schema";

/** Catalog contract version (schema shape). Independent of Elementor plugin version. */
export const CATALOG_SCHEMA_VERSION = "0.1.0" as const;

/** Classic Elementor document JSON version for MVP emission. */
export const ELEMENTOR_DOCUMENT_VERSION = "0.4" as const;

/** Emission model for this catalog track. */
export const CatalogEmissionModelSchema = z.enum(["classic-json"]);
export type CatalogEmissionModel = z.infer<typeof CatalogEmissionModelSchema>;

export const CatalogTierSchema = z.enum(["free", "pro"]);
export type CatalogTier = z.infer<typeof CatalogTierSchema>;

export const CatalogWidgetStatusSchema = z.enum([
  "supported",
  "partial",
  "unavailable",
]);
export type CatalogWidgetStatus = z.infer<typeof CatalogWidgetStatusSchema>;

export const CatalogControlValueTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "enum",
  "object",
  "array",
  "unknown",
]);
export type CatalogControlValueType = z.infer<
  typeof CatalogControlValueTypeSchema
>;

/** How confidently this control was verified from Free 4.2.4 source. */
export const CatalogVerificationStatusSchema = z.enum([
  "verified",
  "partial",
  "unverified",
]);
export type CatalogVerificationStatus = z.infer<
  typeof CatalogVerificationStatusSchema
>;

export const CatalogControlSchema = z
  .object({
    id: z.string().min(1),
    valueTypes: z.array(CatalogControlValueTypeSchema).min(1),
    enumValues: z.array(z.string()).optional(),
    responsive: z.boolean().default(false),
    tier: CatalogTierSchema.default("free"),
    /** Elementor Controls_Manager type name when known (e.g. TEXTAREA, SELECT). */
    controlType: z.string().optional(),
    /** Useful static default when verified from Free source. */
    defaultValue: z.unknown().optional(),
    verificationStatus: CatalogVerificationStatusSchema.default("verified"),
    /** Path in elementor/elementor @ tag, when applicable. */
    sourceRef: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type CatalogControl = z.infer<typeof CatalogControlSchema>;

export const CatalogWidgetSchema = z
  .object({
    id: z.string().min(1),
    elType: z.enum(["widget", "container", "section", "column"]),
    title: z.string().min(1),
    tier: z.literal("free"),
    supportsChildren: z.boolean().default(false),
    controls: z.array(CatalogControlSchema).default([]),
    responsiveControls: z.array(z.string()).default([]),
    irKinds: z.array(IrNodeKindSchema).default([]),
    status: CatalogWidgetStatusSchema,
    limitations: z.array(z.string()).default([]),
    notes: z.string().optional(),
    sourceRef: z.string().optional(),
    /** Whether this entry inherits `globalControls` from the catalog. */
    inheritsGlobalControls: z.boolean().default(true),
  })
  .strict();
export type CatalogWidget = z.infer<typeof CatalogWidgetSchema>;

export const CatalogBreakpointSchema = z
  .object({
    id: z.string().min(1),
    maxWidth: z.number().positive().optional(),
    mapsFromIr: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .strict();
export type CatalogBreakpoint = z.infer<typeof CatalogBreakpointSchema>;

export const ProDenylistKindSchema = z.enum(["widget", "control", "feature"]);
export type ProDenylistKind = z.infer<typeof ProDenylistKindSchema>;

export const ProDenylistEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: ProDenylistKindSchema,
    reason: z.string().min(1),
    elementorDocRef: z.string().optional(),
  })
  .strict();
export type ProDenylistEntry = z.infer<typeof ProDenylistEntrySchema>;

export const CatalogSourceSchema = z
  .object({
    repo: z.string().min(1),
    tag: z.string().min(1),
    inspectedAt: z.string().min(1),
  })
  .strict();
export type CatalogSource = z.infer<typeof CatalogSourceSchema>;

export const CatalogUnverifiedItemSchema = z
  .object({
    id: z.string().min(1),
    scope: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();
export type CatalogUnverifiedItem = z.infer<typeof CatalogUnverifiedItemSchema>;

/** Free Page Layout option (document settings.template → _wp_page_template). */
export const CatalogDocumentPageTemplateSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();
export type CatalogDocumentPageTemplate = z.infer<
  typeof CatalogDocumentPageTemplateSchema
>;

/**
 * Document-level Free settings verified for classic 0.4 emission.
 * Distinct from the Pro Template *widget* in pro-denylist.
 */
export const CatalogDocumentSettingsSchema = z
  .object({
    notes: z.string().optional(),
    sourceRef: z.string().optional(),
    controlId: z.literal("template"),
    templates: z.array(CatalogDocumentPageTemplateSchema).min(1),
  })
  .strict();
export type CatalogDocumentSettings = z.infer<
  typeof CatalogDocumentSettingsSchema
>;

/**
 * Versioned Elementor Free capability catalog.
 */
export const ElementorFreeCatalogSchema = z
  .object({
    /** Catalog document / schema contract version. */
    version: z.literal(CATALOG_SCHEMA_VERSION),
    /** Elementor Free release this catalog describes. */
    elementorTarget: z.string().min(1),
    /** Classic document JSON version used for MVP emission. */
    elementorDocumentVersion: z.literal(ELEMENTOR_DOCUMENT_VERSION).optional(),
    emissionModel: CatalogEmissionModelSchema.optional(),
    layoutPolicy: z.enum(["container-only"]).optional(),
    source: CatalogSourceSchema.optional(),
    widgets: z.array(CatalogWidgetSchema).default([]),
    globalControls: z.array(CatalogControlSchema).default([]),
    breakpoints: z.array(CatalogBreakpointSchema).default([]),
    proDenylist: z.array(ProDenylistEntrySchema).default([]),
    unverified: z.array(CatalogUnverifiedItemSchema).default([]),
    /** Free document Page Layout templates (settings.template). */
    documentSettings: CatalogDocumentSettingsSchema.optional(),
    notes: z.string().optional(),
  })
  .strict();
export type ElementorFreeCatalog = z.infer<typeof ElementorFreeCatalogSchema>;

/**
 * Empty catalog stub valid against the schema.
 * Not a real Free capability set — do not use for conversion.
 */
export const EMPTY_ELEMENTOR_FREE_CATALOG_STUB: ElementorFreeCatalog = {
  version: CATALOG_SCHEMA_VERSION,
  elementorTarget: "unspecified",
  widgets: [],
  globalControls: [],
  breakpoints: [],
  proDenylist: [],
  unverified: [],
  notes:
    "Phase 0 stub only. Do not use for conversion. Load a versioned catalog via loadElementorFreeCatalog(target).",
};
