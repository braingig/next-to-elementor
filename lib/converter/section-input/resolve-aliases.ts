/**
 * tsconfig/jsconfig path-alias → virtual module path (static, VFS-only).
 * Never touches the host filesystem. Never executes code.
 */

import { normalizeVirtualPath } from "./normalize-paths";

export type PathAliases = Record<string, string[]>;

type AliasCandidate = {
  pattern: string;
  /** Specificity: longer matched prefix wins. */
  specificity: number;
  /** Raw mapped target before normalization (may include ./). */
  mappedRaw: string;
};

/**
 * Match a non-relative import specifier against configured path aliases.
 * Prefers the most specific (longest prefix) matching pattern.
 * Does not check whether the target exists in the VFS.
 */
export function matchPathAlias(
  specifier: string,
  pathAliases: PathAliases | undefined,
): AliasCandidate | null {
  if (!pathAliases || Object.keys(pathAliases).length === 0) {
    return null;
  }
  if (
    !specifier ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  ) {
    return null;
  }

  const candidates: AliasCandidate[] = [];

  for (const [pattern, targets] of Object.entries(pathAliases)) {
    if (!Array.isArray(targets) || targets.length === 0) continue;

    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1); // "@/*" → "@/"
      if (!specifier.startsWith(prefix)) continue;
      const star = specifier.slice(prefix.length);
      // Reject empty star for wildcard patterns ("@/" alone).
      if (!star) continue;

      for (const target of targets) {
        if (typeof target !== "string" || !target) continue;
        let mappedRaw: string;
        if (target.endsWith("/*")) {
          mappedRaw = target.slice(0, -1) + star; // "./src/" + "components/..."
        } else {
          // Non-wildcard target with wildcard pattern — uncommon; append star.
          mappedRaw = `${target.replace(/\/$/, "")}/${star}`;
        }
        candidates.push({
          pattern,
          specificity: prefix.length,
          mappedRaw,
        });
      }
      continue;
    }

    // Exact alias (no wildcard), e.g. "@lib": ["./src/lib/index.ts"]
    if (specifier === pattern) {
      for (const target of targets) {
        if (typeof target !== "string" || !target) continue;
        candidates.push({
          pattern,
          specificity: pattern.length,
          mappedRaw: target,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) =>
      b.specificity - a.specificity ||
      a.pattern.localeCompare(b.pattern) ||
      a.mappedRaw.localeCompare(b.mappedRaw),
  );
  return candidates[0]!;
}

/**
 * Normalize an alias-mapped path into a virtual-root-relative path.
 * Rejects traversal, absolute/host paths, and protocol-like segments.
 */
export function normalizeAliasMappedPath(mappedRaw: string): string | null {
  let raw = mappedRaw.replace(/\\/g, "/").trim();
  if (!raw) return null;

  // Strip a single leading "./" so normalizeVirtualPath can accept it.
  while (raw.startsWith("./")) {
    raw = raw.slice(2);
  }

  // Bare ".." / absolute / protocol rejected by normalizeVirtualPath.
  return normalizeVirtualPath(raw);
}

/**
 * Try each alias target candidate (already sorted by specificity) against
 * the VFS via the provided extension resolver. Returns the first hit.
 */
export function resolveAliasToVirtualModule(args: {
  specifier: string;
  pathAliases: PathAliases | undefined;
  files: Record<string, string>;
  resolveExisting: (basePath: string) => string | null;
}): {
  /** Alias pattern matched (even if file missing). */
  matched: boolean;
  pattern?: string;
  /** Resolved VFS module path when the file exists. */
  resolved: string | null;
  /** Normalized mapped base path (no extension probe success required). */
  mappedBase?: string | null;
} {
  const match = matchPathAlias(args.specifier, args.pathAliases);
  if (!match) {
    return { matched: false, resolved: null };
  }

  const mappedBase = normalizeAliasMappedPath(match.mappedRaw);
  if (!mappedBase) {
    return {
      matched: true,
      pattern: match.pattern,
      resolved: null,
      mappedBase: null,
    };
  }

  const resolved = args.resolveExisting(mappedBase);
  return {
    matched: true,
    pattern: match.pattern,
    resolved,
    mappedBase,
  };
}
