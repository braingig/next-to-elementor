/**
 * Build a ProjectVirtualFS from an in-memory text map (tests / later analyze paths).
 * Does not touch the host filesystem.
 */

import { resolveProjectLimits } from "../limits";
import { utf8ByteLength } from "../../section-input/normalize-paths";
import type { ProjectVirtualFS, ProjectVfsFile } from "../types";

export function createProjectVirtualFSFromTextFiles(
  files: Record<string, string>,
): ProjectVirtualFS {
  const out: Record<string, ProjectVfsFile> = {};
  let total = 0;
  for (const path of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
    const content = files[path]!;
    const byteLength = utf8ByteLength(content);
    total += byteLength;
    out[path] = {
      path,
      kind: "text",
      content,
      byteLength,
    };
  }
  const fileCount = Object.keys(out).length;
  return {
    files: out,
    ignored: [],
    diagnostics: [],
    limitsApplied: resolveProjectLimits(),
    stats: {
      zipBytes: 0,
      uncompressedBytes: total,
      archiveEntryCount: fileCount,
      fileCount,
      textFileCount: fileCount,
      binaryFileCount: 0,
      ignoredCount: 0,
    },
  };
}
