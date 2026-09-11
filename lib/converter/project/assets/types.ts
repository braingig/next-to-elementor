/**
 * Phase 14b — project asset identity + reference model.
 * VFS remains the source of truth for bytes. No WP URLs, no decoding.
 */

export type ProjectAssetKind = "image" | "other";

/**
 * Canonical asset identity keyed by VFS path.
 * Does not duplicate binary bytes — look up `ProjectVirtualFS.files[path]`.
 */
export type ProjectAsset = {
  path: string;
  kind: ProjectAssetKind;
  size: number;
  extension: string;
  /**
   * present — in ProjectVirtualFS.files
   * skipped — soft-skipped by Phase 14a (byte/total limits)
   * missing — referenced but not in VFS or ignored list
   */
  presence: "present" | "skipped" | "missing";
  /** When presence === "skipped", e.g. asset-file-byte-limit. */
  skipReason?: string;
};

export type ProjectAssetReferenceKind =
  | "import"
  | "jsx-src"
  | "css-url"
  | "new-url"
  | "const-binding";

export type ProjectAssetReferenceStatus =
  | "resolved"
  | "unresolved"
  | "dynamic"
  | "skipped";

/**
 * One static reference from source/CSS to a (possibly missing) asset.
 */
export type ProjectAssetReference = {
  source: string;
  kind: ProjectAssetReferenceKind;
  /** Specifier, identifier, or url() argument as written. */
  expression: string;
  /** Canonical VFS path when known (even if skipped/missing). */
  assetPath?: string;
  status: ProjectAssetReferenceStatus;
  message?: string;
};

export type RouteAssetDiscoveryResult = {
  assets: ProjectAsset[];
  references: ProjectAssetReference[];
  /** local binding name → asset path (resolved present assets only). */
  bindingToAssetPath: Record<string, string>;
};
