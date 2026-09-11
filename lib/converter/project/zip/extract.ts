/**
 * Safe project ZIP → ProjectVirtualFS (Phase 13a + 14a admission).
 *
 * Never executes project code, never reads host paths from ZIP names,
 * never installs dependencies. Inflates only after central-directory checks.
 * Phase 14a: separate source vs binary limits; soft-skip oversized binaries.
 * No image decoding / compression.
 */

import { unzipSync } from "fflate";
import { normalizeVirtualPath } from "../../section-input/normalize-paths";
import { matchIgnoredPath } from "../ignore";
import { resolveProjectLimits, type ProjectLimits } from "../limits";
import {
  classifyProjectFileBytes,
  classifyProjectPathAdmission,
  detectSingleRootPrefix,
  isBinaryAdmissionKind,
  stripRootPrefix,
} from "../fs/virtual";
import {
  isZipEncrypted,
  isZipSymlinkEntry,
  parseZipCentralDirectory,
  type ZipCdEntry,
} from "./central-directory";
import {
  ProjectZipError,
  type ExtractProjectZipOptions,
  type ExtractProjectZipResult,
  type ProjectDiagnostic,
  type ProjectIgnoredEntry,
  type ProjectVirtualFS,
  type ProjectVfsFile,
} from "../types";

function asUint8Array(input: Uint8Array | ArrayBuffer | Buffer): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

function fail(
  code: string,
  message: string,
  diagnostics: ProjectDiagnostic[] = [],
): ExtractProjectZipResult {
  const merged =
    diagnostics.length > 0
      ? diagnostics
      : [{ severity: "error" as const, code, message }];
  return {
    ok: false,
    error: new ProjectZipError(message, { code, diagnostics: merged }),
    diagnostics: merged,
  };
}

function pushError(
  diagnostics: ProjectDiagnostic[],
  code: string,
  message: string,
  path?: string,
): void {
  diagnostics.push({
    severity: "error",
    code,
    message,
    ...(path ? { path } : {}),
  });
}

function pushWarning(
  diagnostics: ProjectDiagnostic[],
  code: string,
  message: string,
  path?: string,
): void {
  diagnostics.push({
    severity: "warning",
    code,
    message,
    ...(path ? { path } : {}),
  });
}

/**
 * Normalize a ZIP entry name into a virtual root-relative POSIX path.
 * Returns null when absolute / traversal / empty after normalize.
 */
export function normalizeZipEntryPath(raw: string): string | null {
  let path = raw.replace(/\\/g, "/");
  // ZIP may store "./foo" — strip leading ./ segments before shared normalizer.
  while (path.startsWith("./")) {
    path = path.slice(2);
  }
  // Directory markers are handled by caller; empty after slash strip → null.
  if (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (!path) {
    return null;
  }
  return normalizeVirtualPath(path);
}

type PlannedEntry = {
  rawName: string;
  normalized: string;
  cd: ZipCdEntry;
  ignored: boolean;
  ignoreReason?: string;
};

function planEntries(
  cdEntries: ZipCdEntry[],
  limits: ProjectLimits,
  diagnostics: ProjectDiagnostic[],
): {
  planned: PlannedEntry[];
  ignored: ProjectIgnoredEntry[];
  skippedBinaryAssetCount: number;
} | null {
  if (cdEntries.length > limits.maxArchiveEntries) {
    pushError(
      diagnostics,
      "archive-entry-limit",
      `ZIP has ${cdEntries.length} central-directory entries; maximum is ${limits.maxArchiveEntries}.`,
    );
    return null;
  }

  let totalUncompressed = 0;
  let totalCompressed = 0;
  const planned: PlannedEntry[] = [];
  const ignored: ProjectIgnoredEntry[] = [];
  let admittedBinaryBytes = 0;
  let skippedBinaryAssetCount = 0;
  let emittedTotalBudgetWarning = false;

  for (const cd of cdEntries) {
    totalUncompressed += cd.uncompressedSize;
    totalCompressed += cd.compressedSize;

    if (isZipEncrypted(cd)) {
      pushError(
        diagnostics,
        "encrypted-entry",
        `Encrypted ZIP entries are not allowed: ${JSON.stringify(cd.fileName)}`,
        cd.fileName,
      );
      return null;
    }

    if (isZipSymlinkEntry(cd)) {
      pushError(
        diagnostics,
        "symlink-rejected",
        `Symlink ZIP entries are not allowed: ${JSON.stringify(cd.fileName)}`,
        cd.fileName,
      );
      return null;
    }

    if (cd.isDirectory) {
      const dirNorm = normalizeZipEntryPath(cd.fileName);
      if (dirNorm) {
        const ignoreReason = matchIgnoredPath(dirNorm);
        ignored.push({
          path: dirNorm,
          reason: ignoreReason ?? "directory-entry",
        });
      }
      continue;
    }

    // Absolute / UNC / drive paths rejected before normalize helpers.
    const raw = cd.fileName.replace(/\\/g, "/");
    if (
      raw.startsWith("/") ||
      raw.startsWith("//") ||
      /^[a-zA-Z]:/.test(raw) ||
      raw.includes("\0")
    ) {
      pushError(
        diagnostics,
        "absolute-path",
        `Absolute or drive ZIP path rejected: ${JSON.stringify(cd.fileName)}`,
        cd.fileName,
      );
      return null;
    }

    if (raw.split("/").includes("..")) {
      pushError(
        diagnostics,
        "path-traversal",
        `Path traversal in ZIP entry rejected: ${JSON.stringify(cd.fileName)}`,
        cd.fileName,
      );
      return null;
    }

    const normalized = normalizeZipEntryPath(cd.fileName);
    if (!normalized) {
      pushError(
        diagnostics,
        "path-traversal",
        `Unsafe ZIP entry path rejected: ${JSON.stringify(cd.fileName)}`,
        cd.fileName,
      );
      return null;
    }

    const ignoreReason = matchIgnoredPath(normalized);
    if (ignoreReason) {
      ignored.push({ path: normalized, reason: ignoreReason });
      planned.push({
        rawName: cd.fileName,
        normalized,
        cd,
        ignored: true,
        ignoreReason,
      });
      continue;
    }

    const admission = classifyProjectPathAdmission(normalized);
    const size = cd.uncompressedSize;

    if (!isBinaryAdmissionKind(admission)) {
      // Source/text — hard fail when over source limit.
      if (size > limits.maxSourceFileBytes) {
        pushError(
          diagnostics,
          "file-byte-limit",
          `Source/text file exceeds ${limits.maxSourceFileBytes} byte limit: ${normalized} (${size} bytes)`,
          normalized,
        );
        return null;
      }
      planned.push({
        rawName: cd.fileName,
        normalized,
        cd,
        ignored: false,
      });
      continue;
    }

    // Binary asset / other binary — soft-skip when over per-asset or total budget.
    if (size > limits.maxBinaryAssetBytes) {
      skippedBinaryAssetCount += 1;
      ignored.push({ path: normalized, reason: "asset-file-byte-limit" });
      pushWarning(
        diagnostics,
        "asset-file-byte-limit",
        `Binary asset exceeds ${limits.maxBinaryAssetBytes} byte limit and was skipped: ${normalized} (${size} bytes)`,
        normalized,
      );
      planned.push({
        rawName: cd.fileName,
        normalized,
        cd,
        ignored: true,
        ignoreReason: "asset-file-byte-limit",
      });
      continue;
    }

    if (admittedBinaryBytes + size > limits.maxBinaryAssetsTotalBytes) {
      skippedBinaryAssetCount += 1;
      ignored.push({ path: normalized, reason: "asset-total-byte-limit" });
      if (!emittedTotalBudgetWarning) {
        emittedTotalBudgetWarning = true;
        pushWarning(
          diagnostics,
          "asset-total-byte-limit",
          `Binary asset total budget of ${limits.maxBinaryAssetsTotalBytes} bytes exceeded; further binary assets are skipped (first skipped: ${normalized}, ${size} bytes).`,
          normalized,
        );
      } else {
        pushWarning(
          diagnostics,
          "asset-total-byte-limit",
          `Binary asset skipped after total budget exceeded: ${normalized} (${size} bytes)`,
          normalized,
        );
      }
      planned.push({
        rawName: cd.fileName,
        normalized,
        cd,
        ignored: true,
        ignoreReason: "asset-total-byte-limit",
      });
      continue;
    }

    admittedBinaryBytes += size;
    planned.push({
      rawName: cd.fileName,
      normalized,
      cd,
      ignored: false,
    });
  }

  if (totalUncompressed > limits.maxUncompressedBytes) {
    pushError(
      diagnostics,
      "uncompressed-size-limit",
      `ZIP uncompressed size ${totalUncompressed} bytes exceeds limit of ${limits.maxUncompressedBytes}.`,
    );
    return null;
  }

  // Compression ratio: prefer CD compressed sum; fall back handled by caller with zipBytes.
  if (totalCompressed > 0) {
    const ratio = totalUncompressed / totalCompressed;
    if (ratio > limits.maxCompressionRatio) {
      pushError(
        diagnostics,
        "compression-ratio-limit",
        `ZIP compression ratio ${ratio.toFixed(1)} exceeds limit of ${limits.maxCompressionRatio}.`,
      );
      return null;
    }
  }

  const keptCount = planned.filter((p) => !p.ignored).length;
  if (keptCount > limits.maxFiles) {
    pushError(
      diagnostics,
      "file-count-limit",
      `ZIP would keep ${keptCount} files; maximum is ${limits.maxFiles}.`,
    );
    return null;
  }

  if (keptCount === 0) {
    pushError(
      diagnostics,
      "empty-project",
      "ZIP contains no keepable project files after security and ignore filters.",
    );
    return null;
  }

  return { planned, ignored, skippedBinaryAssetCount };
}

function applyRootStrip(
  planned: PlannedEntry[],
  ignored: ProjectIgnoredEntry[],
  stripSingleRoot: boolean,
): {
  planned: PlannedEntry[];
  ignored: ProjectIgnoredEntry[];
  rootPrefixStripped?: string;
} {
  if (!stripSingleRoot) {
    return { planned, ignored };
  }

  const keepPaths = planned.filter((p) => !p.ignored).map((p) => p.normalized);
  const prefix = detectSingleRootPrefix(keepPaths);
  if (!prefix) {
    return { planned, ignored };
  }

  const nextPlanned = planned.map((p) => ({
    ...p,
    normalized: stripRootPrefix(p.normalized, prefix),
  }));

  // After strip, re-check ignore (e.g. root/node_modules/… already ignored).
  // Also drop empty paths (should not happen for files).
  for (const p of nextPlanned) {
    if (!p.ignored && !p.normalized) {
      // Stripping produced empty — treat as error at call site by filter.
    }
  }

  const nextIgnored = ignored.map((e) => ({
    ...e,
    path: e.path.startsWith(prefix) ? stripRootPrefix(e.path, prefix) : e.path,
  }));

  return {
    planned: nextPlanned.filter((p) => p.normalized.length > 0),
    ignored: nextIgnored.filter((e) => e.path.length > 0),
    rootPrefixStripped: prefix.slice(0, -1),
  };
}

/**
 * Extract an untrusted project ZIP into a ProjectVirtualFS.
 * Sync API (matches section-input style). Does not touch the host filesystem.
 * Does not decode or recompress images (Phase 14a).
 */
export function extractProjectZip(
  input: Uint8Array | ArrayBuffer | Buffer,
  options: ExtractProjectZipOptions = {},
): ExtractProjectZipResult {
  const limits = resolveProjectLimits(options.limits);
  const stripSingleRoot = options.stripSingleRoot !== false;
  const diagnostics: ProjectDiagnostic[] = [];
  const zipBytes = asUint8Array(input);

  if (zipBytes.byteLength === 0) {
    return fail("empty-zip", "ZIP buffer is empty.");
  }

  if (zipBytes.byteLength > limits.maxZipBytes) {
    return fail(
      "zip-size-limit",
      `ZIP size ${zipBytes.byteLength} bytes exceeds limit of ${limits.maxZipBytes}.`,
    );
  }

  let cdEntries: ZipCdEntry[];
  try {
    cdEntries = parseZipCentralDirectory(zipBytes);
  } catch (error) {
    return fail(
      "malformed-zip",
      error instanceof Error ? error.message : "Malformed ZIP archive.",
    );
  }

  const plannedResult = planEntries(cdEntries, limits, diagnostics);
  if (!plannedResult) {
    const primary = diagnostics.find((d) => d.severity === "error")!;
    return fail(primary.code, primary.message, diagnostics);
  }

  // Also guard ratio using raw zip size (deflate bombs with tiny CD compressed sums).
  const totalUncompressed = cdEntries.reduce(
    (sum, e) => sum + e.uncompressedSize,
    0,
  );
  if (zipBytes.byteLength > 0) {
    const zipRatio = totalUncompressed / zipBytes.byteLength;
    if (zipRatio > limits.maxCompressionRatio) {
      return fail(
        "compression-ratio-limit",
        `ZIP compression ratio ${zipRatio.toFixed(1)} (uncompressed/zip bytes) exceeds limit of ${limits.maxCompressionRatio}.`,
      );
    }
  }

  const stripped = applyRootStrip(
    plannedResult.planned,
    plannedResult.ignored,
    stripSingleRoot,
  );

  // Build allowlist of raw ZIP names to inflate (skipped ignored — still counted in CD limits).
  const inflateNames = new Set(
    stripped.planned.filter((p) => !p.ignored).map((p) => p.rawName),
  );

  // Map raw → normalized for collisions after strip.
  const rawToNormalized = new Map<string, string>();
  for (const p of stripped.planned) {
    if (!p.ignored) {
      rawToNormalized.set(p.rawName, p.normalized);
    }
  }

  let inflated: Record<string, Uint8Array>;
  try {
    inflated = unzipSync(zipBytes, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        return inflateNames.has(file.name);
      },
    });
  } catch (error) {
    return fail(
      "malformed-zip",
      error instanceof Error
        ? `ZIP inflate failed: ${error.message}`
        : "ZIP inflate failed.",
    );
  }

  const files: Record<string, ProjectVfsFile> = {};
  let textFileCount = 0;
  let binaryFileCount = 0;
  let keptBytes = 0;
  let admittedBinaryBytes = 0;
  let skippedBinaryAssetCount = plannedResult.skippedBinaryAssetCount;
  const postIgnored: ProjectIgnoredEntry[] = [...stripped.ignored];

  // Deterministic inflate processing order.
  const inflatedEntries = Object.entries(inflated).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [rawName, bytes] of inflatedEntries) {
    const normalized = rawToNormalized.get(rawName);
    if (!normalized) {
      continue;
    }

    if (normalized in files) {
      return fail(
        "path-collision",
        `Multiple ZIP entries map to the same virtual path: ${normalized}`,
        [
          {
            severity: "error",
            code: "path-collision",
            message: `Multiple ZIP entries map to the same virtual path: ${normalized}`,
            path: normalized,
          },
        ],
      );
    }

    const admission = classifyProjectPathAdmission(normalized);
    const size = bytes.byteLength;

    if (!isBinaryAdmissionKind(admission)) {
      if (size > limits.maxSourceFileBytes) {
        return fail(
          "file-byte-limit",
          `Inflated source/text file exceeds ${limits.maxSourceFileBytes} byte limit: ${normalized} (${size} bytes)`,
          [
            {
              severity: "error",
              code: "file-byte-limit",
              message: `Inflated source/text file exceeds ${limits.maxSourceFileBytes} byte limit: ${normalized} (${size} bytes)`,
              path: normalized,
            },
          ],
        );
      }
    } else {
      if (size > limits.maxBinaryAssetBytes) {
        skippedBinaryAssetCount += 1;
        postIgnored.push({ path: normalized, reason: "asset-file-byte-limit" });
        pushWarning(
          diagnostics,
          "asset-file-byte-limit",
          `Inflated binary asset exceeds ${limits.maxBinaryAssetBytes} byte limit and was skipped: ${normalized} (${size} bytes)`,
          normalized,
        );
        continue;
      }
      if (admittedBinaryBytes + size > limits.maxBinaryAssetsTotalBytes) {
        skippedBinaryAssetCount += 1;
        postIgnored.push({
          path: normalized,
          reason: "asset-total-byte-limit",
        });
        pushWarning(
          diagnostics,
          "asset-total-byte-limit",
          `Inflated binary asset skipped after total budget exceeded: ${normalized} (${size} bytes)`,
          normalized,
        );
        continue;
      }
      admittedBinaryBytes += size;
    }

    const file = classifyProjectFileBytes(normalized, bytes);
    files[normalized] = file;
    keptBytes += file.byteLength;
    if (file.kind === "text") textFileCount += 1;
    else binaryFileCount += 1;
  }

  const fileCount = Object.keys(files).length;
  if (fileCount === 0) {
    return fail(
      "empty-project",
      "ZIP inflate produced no keepable project files.",
    );
  }

  if (fileCount > limits.maxFiles) {
    return fail(
      "file-count-limit",
      `ZIP kept ${fileCount} files; maximum is ${limits.maxFiles}.`,
    );
  }

  const vfs: ProjectVirtualFS = {
    files,
    ignored: postIgnored,
    diagnostics,
    limitsApplied: limits,
    stats: {
      zipBytes: zipBytes.byteLength,
      uncompressedBytes: totalUncompressed,
      archiveEntryCount: cdEntries.length,
      fileCount,
      textFileCount,
      binaryFileCount,
      ignoredCount: postIgnored.length,
      ...(skippedBinaryAssetCount > 0
        ? { skippedBinaryAssetCount }
        : {}),
      ...(stripped.rootPrefixStripped
        ? { rootPrefixStripped: stripped.rootPrefixStripped }
        : {}),
    },
  };

  // keptBytes is informational; bomb limits already applied via CD totals.
  void keptBytes;

  return { ok: true, vfs };
}
