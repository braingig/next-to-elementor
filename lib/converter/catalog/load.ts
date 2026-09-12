import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_SCHEMA_VERSION,
  ELEMENTOR_DOCUMENT_VERSION,
  ElementorFreeCatalogSchema,
  type ElementorFreeCatalog,
} from "./schema";

/** Explicitly supported Elementor Free targets. No silent fallback. */
export const SUPPORTED_ELEMENTOR_FREE_TARGETS = ["4.2.4"] as const;
export type SupportedElementorFreeTarget =
  (typeof SUPPORTED_ELEMENTOR_FREE_TARGETS)[number];

export const DEFAULT_ELEMENTOR_FREE_TARGET: SupportedElementorFreeTarget =
  "4.2.4";

const CATALOG_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "elementor-free",
);

function assertSupportedTarget(
  target: string,
): asserts target is SupportedElementorFreeTarget {
  if (
    !(SUPPORTED_ELEMENTOR_FREE_TARGETS as readonly string[]).includes(target)
  ) {
    throw new Error(
      `Unsupported Elementor Free catalog target "${target}". Supported: ${SUPPORTED_ELEMENTOR_FREE_TARGETS.join(", ")}. No fallback is applied.`,
    );
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Load and validate the Free capability catalog for an exact Elementor version.
 * Throws if the target is unknown — never falls back to another version.
 */
export function loadElementorFreeCatalog(
  elementorTarget: string = DEFAULT_ELEMENTOR_FREE_TARGET,
): ElementorFreeCatalog {
  assertSupportedTarget(elementorTarget);

  const versionDir = join(CATALOG_ROOT, elementorTarget);
  const meta = readJson<{
    elementorTarget: string;
    elementorDocumentVersion: string;
    emissionModel: "classic-json";
    layoutPolicy: "container-only";
    catalogSchemaVersion: string;
    source: ElementorFreeCatalog["source"];
    notes?: string;
  }>(join(versionDir, "meta.json"));

  if (meta.elementorTarget !== elementorTarget) {
    throw new Error(
      `Catalog meta.elementorTarget "${meta.elementorTarget}" does not match requested target "${elementorTarget}".`,
    );
  }
  if (meta.elementorDocumentVersion !== ELEMENTOR_DOCUMENT_VERSION) {
    throw new Error(
      `Catalog meta.elementorDocumentVersion "${meta.elementorDocumentVersion}" must be "${ELEMENTOR_DOCUMENT_VERSION}" for classic MVP emission.`,
    );
  }
  if (meta.catalogSchemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new Error(
      `Catalog meta.catalogSchemaVersion "${meta.catalogSchemaVersion}" does not match CATALOG_SCHEMA_VERSION "${CATALOG_SCHEMA_VERSION}".`,
    );
  }

  const widgetsDir = join(versionDir, "widgets");
  const widgetFiles = readdirSync(widgetsDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const documentSettingsPath = join(versionDir, "document-settings.json");
  const documentSettings = existsSync(documentSettingsPath)
    ? readJson(documentSettingsPath)
    : undefined;

  const catalogInput = {
    version: CATALOG_SCHEMA_VERSION,
    elementorTarget,
    elementorDocumentVersion: ELEMENTOR_DOCUMENT_VERSION,
    emissionModel: meta.emissionModel,
    layoutPolicy: meta.layoutPolicy,
    source: meta.source,
    notes: meta.notes,
    widgets: widgetFiles.map((file) =>
      readJson(join(widgetsDir, file)),
    ),
    globalControls: readJson(join(versionDir, "global-controls.json")),
    breakpoints: readJson(join(versionDir, "breakpoints.json")),
    proDenylist: readJson(join(versionDir, "pro-denylist.json")),
    unverified: readJson(join(versionDir, "unverified.json")),
    ...(documentSettings !== undefined ? { documentSettings } : {}),
  };

  return ElementorFreeCatalogSchema.parse(catalogInput);
}

export function listAvailableElementorFreeCatalogTargets(): SupportedElementorFreeTarget[] {
  return [...SUPPORTED_ELEMENTOR_FREE_TARGETS];
}
