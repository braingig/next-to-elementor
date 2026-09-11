/**
 * Phase 14b — project asset discovery (VFS mapping only).
 */

export type {
  ProjectAsset,
  ProjectAssetKind,
  ProjectAssetReference,
  ProjectAssetReferenceKind,
  ProjectAssetReferenceStatus,
  RouteAssetDiscoveryResult,
} from "./types";

export {
  IMAGE_ASSET_EXTENSIONS,
  isImageAssetPath,
  assetKindForExtension,
} from "./extensions";

export {
  resolveAssetSpecifierToPath,
  lookupAssetInVfs,
  expandRootAbsoluteCandidates,
  firstExistingAssetPath,
  type AssetPathLookup,
  type VfsAssetPresence,
} from "./resolve-path";

export { discoverRouteAssets } from "./discover";
