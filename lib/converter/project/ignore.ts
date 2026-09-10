/**
 * Directory / path ignore policy for project ZIP ingestion.
 * Ignored paths are recorded, not silently dropped from the audit trail.
 */

/** Path segment names that cause the entry (and descendants) to be ignored. */
export const PROJECT_IGNORE_SEGMENT_NAMES = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  ".vercel",
  ".output",
  ".nuxt",
  ".svelte-kit",
  "out", // Next static export output
] as const;

const IGNORE_SEGMENT_SET = new Set<string>(
  PROJECT_IGNORE_SEGMENT_NAMES.map((s) => s.toLowerCase()),
);

/**
 * Returns an ignore reason when any path segment matches the policy.
 * Does not treat ordinary source directories (app, src, pages) as ignorable.
 */
export function matchIgnoredPath(normalizedPath: string): string | null {
  const parts = normalizedPath.split("/").filter(Boolean);
  for (const part of parts) {
    if (IGNORE_SEGMENT_SET.has(part.toLowerCase())) {
      return `ignored-directory:${part}`;
    }
  }
  return null;
}
