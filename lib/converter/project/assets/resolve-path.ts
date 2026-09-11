/**
 * Resolve asset import / URL-like specifiers to VFS paths (static, no FS I/O).
 */

import {
  normalizeVirtualPath,
  resolveRelativeVirtualPath,
} from "../../section-input/normalize-paths";
import {
  matchPathAlias,
  normalizeAliasMappedPath,
  type PathAliases,
} from "../../section-input/resolve-aliases";
import { extensionOf } from "../fs/virtual";
import type { ProjectIgnoredEntry, ProjectVirtualFS } from "../types";
import { isImageAssetPath } from "./extensions";

export type AssetPathLookup = {
  /** Normalized candidate path (may or may not exist). */
  path: string | null;
  /** Why resolution failed before VFS lookup, when applicable. */
  reason?: "unsafe" | "external" | "not-asset" | "unmatched";
};

/**
 * Map an import specifier or relative url() argument to a normalized VFS path.
 * Does not invent extensions — asset imports normally include them.
 */
export function resolveAssetSpecifierToPath(args: {
  specifier: string;
  fromFile: string;
  pathAliases?: PathAliases;
}): AssetPathLookup {
  const spec = args.specifier.trim();
  if (!spec) return { path: null, reason: "unmatched" };

  // Reject remote / data / file protocols as local assets.
  if (/^(https?:|data:|file:|blob:)/i.test(spec)) {
    return { path: null, reason: "external" };
  }

  // Absolute host-like or protocol-like
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec)) {
    return { path: null, reason: "external" };
  }

  if (spec.startsWith("./") || spec.startsWith("../")) {
    if (!isImageAssetPath(spec) && !hasAnyAssetLikeExt(spec)) {
      // Still allow resolution for css url of images; if no ext, unmatched.
      if (!/\.[a-z0-9]+$/i.test(spec.split("?")[0]!.split("#")[0]!)) {
        return { path: null, reason: "not-asset" };
      }
    }
    const resolved = resolveRelativeVirtualPath(args.fromFile, stripQueryHash(spec));
    if (!resolved) return { path: null, reason: "unsafe" };
    return { path: resolved };
  }

  // Root-absolute web path: only accept when it normalizes inside VFS root.
  if (spec.startsWith("/")) {
    const stripped = stripQueryHash(spec).replace(/^\/+/, "");
    const normalized = normalizeVirtualPath(stripped);
    if (!normalized) return { path: null, reason: "unsafe" };
    return { path: normalized };
  }

  // Path alias (Phase 13g)
  const alias = matchPathAlias(spec, args.pathAliases);
  if (alias) {
    const mapped = normalizeAliasMappedPath(
      stripQueryHash(alias.mappedRaw),
    );
    if (!mapped) return { path: null, reason: "unsafe" };
    return { path: mapped };
  }

  return { path: null, reason: "unmatched" };
}

function stripQueryHash(spec: string): string {
  return spec.split("?")[0]!.split("#")[0]!;
}

function hasAnyAssetLikeExt(spec: string): boolean {
  return isImageAssetPath(spec);
}

export type VfsAssetPresence = {
  presence: "present" | "skipped" | "missing";
  size: number;
  extension: string;
  skipReason?: string;
};

export function lookupAssetInVfs(
  vfs: ProjectVirtualFS,
  path: string,
): VfsAssetPresence {
  const file = vfs.files[path];
  if (file) {
    return {
      presence: "present",
      size: file.byteLength,
      extension: extensionOf(path) || (file.kind === "binary" ? file.extension : ""),
    };
  }

  const ignored = findIgnoredAsset(vfs.ignored, path);
  if (ignored) {
    return {
      presence: "skipped",
      size: 0,
      extension: extensionOf(path),
      skipReason: ignored.reason,
    };
  }

  return {
    presence: "missing",
    size: 0,
    extension: extensionOf(path),
  };
}

function findIgnoredAsset(
  ignored: ProjectIgnoredEntry[],
  path: string,
): ProjectIgnoredEntry | undefined {
  return ignored.find(
    (e) =>
      e.path === path &&
      (e.reason === "asset-file-byte-limit" ||
        e.reason === "asset-total-byte-limit" ||
        e.reason.startsWith("asset-")),
  );
}

/**
 * Try common public/ prefixes when a root-absolute `/assets/...` path is not
 * found verbatim — only if an alternate candidate exists in the VFS.
 */
export function expandRootAbsoluteCandidates(
  path: string,
  vfs: ProjectVirtualFS,
): string[] {
  const out = [path];
  if (!path.startsWith("assets/") && !path.startsWith("public/")) {
    const withPublic = normalizeVirtualPath(`public/${path}`);
    if (withPublic) out.push(withPublic);
    const withSrc = normalizeVirtualPath(`src/${path}`);
    if (withSrc) out.push(withSrc);
  }
  return out.filter((p, i, arr) => arr.indexOf(p) === i);
}

export function firstExistingAssetPath(
  vfs: ProjectVirtualFS,
  candidates: string[],
): { path: string; lookup: VfsAssetPresence } | null {
  // Prefer present, then skipped (distinguishable), else missing.
  let skipped: { path: string; lookup: VfsAssetPresence } | null = null;
  for (const path of candidates) {
    const lookup = lookupAssetInVfs(vfs, path);
    if (lookup.presence === "present") return { path, lookup };
    if (lookup.presence === "skipped" && !skipped) {
      skipped = { path, lookup };
    }
  }
  if (skipped) return skipped;
  if (candidates[0]) {
    return {
      path: candidates[0],
      lookup: lookupAssetInVfs(vfs, candidates[0]),
    };
  }
  return null;
}
