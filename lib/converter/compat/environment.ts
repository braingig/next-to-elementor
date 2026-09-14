import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveWordPressTargetConfig } from "../wordpress/config";

export const REQUIRED_ELEMENTOR_FREE_VERSION = "4.2.4" as const;

/**
 * Resolve the Elementor Free 4.2.4 source tree used for STATIC compatibility checks.
 *
 * Priority:
 * 1. ELEMENTOR_FREE_4_2_4_PATH
 * 2. ELEMENTOR_SOURCE_PATH (must still be 4.2.4)
 * 3. Common local paths (Downloads / sibling)
 *
 * Never silently accepts the in-repo `elementor/` tree when it is not 4.2.4
 * (the workspace copy is known to be 4.2.1 and must not be used).
 */
export function resolveElementorFree424SourceRoot(
  candidates: string[] = [],
): { root: string; version: string } | { error: string } {
  const envPaths = [
    process.env.ELEMENTOR_FREE_4_2_4_PATH,
    process.env.ELEMENTOR_SOURCE_PATH,
  ].filter((p): p is string => Boolean(p && p.trim()));

  const defaults = [
    "/Users/nusratnova/Downloads/elementor",
    join(process.cwd(), "..", "elementor"),
    join(process.cwd(), "vendor", "elementor-free-4.2.4"),
  ];

  const tried: string[] = [];
  for (const root of [...candidates, ...envPaths, ...defaults]) {
    tried.push(root);
    const php = join(root, "elementor.php");
    if (!existsSync(php)) continue;
    const version = readElementorVersion(php);
    if (version !== REQUIRED_ELEMENTOR_FREE_VERSION) {
      continue;
    }
    return { root, version };
  }

  return {
    error: [
      `Elementor Free ${REQUIRED_ELEMENTOR_FREE_VERSION} source tree not found.`,
      `Tried: ${tried.join(", ")}`,
      "Set ELEMENTOR_FREE_4_2_4_PATH to the Free 4.2.4 plugin root.",
      "Note: the in-repo ./elementor tree is 4.2.1 and must not be used for static compat.",
    ].join(" "),
  };
}

export function readElementorVersion(elementorPhpPath: string): string | null {
  const text = readFileSync(elementorPhpPath, "utf8");
  const match =
    text.match(/define\(\s*'ELEMENTOR_VERSION'\s*,\s*'([^']+)'\s*\)/) ??
    text.match(/\*\s*Version:\s*([0-9.]+)/);
  return match?.[1] ?? null;
}

export type RuntimeEnvironmentStatus = {
  status: "available" | "blocked";
  elementorVersionTarget: typeof REQUIRED_ELEMENTOR_FREE_VERSION;
  wordpress: "missing" | "unknown" | "available";
  php: "missing" | "available";
  reasons: string[];
};

/**
 * Probe whether a configured target WordPress + Elementor Free 4.2.4 source
 * are available for development workflows. Does not start services.
 */
export function probeRuntimeEnvironment(): RuntimeEnvironmentStatus {
  const reasons: string[] = [];
  let php: RuntimeEnvironmentStatus["php"] = "missing";
  let wordpress: RuntimeEnvironmentStatus["wordpress"] = "missing";

  const phpCheck = spawnSync("php", ["-v"], { encoding: "utf8" });
  if (phpCheck.status === 0) {
    php = "available";
  }

  const source = resolveElementorFree424SourceRoot();
  if ("error" in source) {
    reasons.push(source.error);
  }

  const wp = resolveWordPressTargetConfig();
  if (wp.ok) {
    wordpress = "available";
  } else {
    reasons.push(wp.message);
  }

  if (wordpress === "available" && !("error" in source)) {
    return {
      status: "available",
      elementorVersionTarget: REQUIRED_ELEMENTOR_FREE_VERSION,
      wordpress,
      php,
      reasons: [],
    };
  }

  if (reasons.length === 0) {
    reasons.push("Target WordPress / Elementor Free 4.2.4 source not ready.");
  }

  return {
    status: "blocked",
    elementorVersionTarget: REQUIRED_ELEMENTOR_FREE_VERSION,
    wordpress,
    php,
    reasons,
  };
}
