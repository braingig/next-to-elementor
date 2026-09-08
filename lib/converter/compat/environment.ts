import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const REQUIRED_ELEMENTOR_FREE_VERSION = "4.2.4" as const;

/**
 * Resolve the Elementor Free 4.2.4 source tree used for STATIC compatibility checks
 * and for mounting into the Phase 11 Docker harness.
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
      "Note: the in-repo ./elementor tree is 4.2.1 and must not be used for Phase 10/11.",
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
  docker: "missing" | "daemon-unavailable" | "available";
  reasons: string[];
};

function dockerDaemonAvailable(): boolean {
  const r = spawnSync("docker", ["info"], { encoding: "utf8" });
  return r.status === 0;
}

/**
 * Probe whether a real WordPress + Elementor Free 4.2.4 runtime can be used.
 * Does not start containers — reports Docker + harness readiness only.
 */
export function probeRuntimeEnvironment(): RuntimeEnvironmentStatus {
  const reasons: string[] = [];
  let docker: RuntimeEnvironmentStatus["docker"] = "available";
  let php: RuntimeEnvironmentStatus["php"] = "missing";
  let wordpress: RuntimeEnvironmentStatus["wordpress"] = "missing";

  if (!dockerDaemonAvailable()) {
    docker = "daemon-unavailable";
    reasons.push("Docker daemon is not reachable.");
  }

  const phpCheck = spawnSync("php", ["-v"], { encoding: "utf8" });
  if (phpCheck.status === 0) {
    php = "available";
  } else {
    reasons.push(
      "Host PHP CLI is missing (Docker WordPress image supplies PHP inside containers).",
    );
  }

  const source = resolveElementorFree424SourceRoot();
  if ("error" in source) {
    reasons.push(source.error);
  }

  const envPath = join(
    process.cwd(),
    "tests/runtime/generated/environment.json",
  );
  if (existsSync(envPath)) {
    try {
      const env = JSON.parse(readFileSync(envPath, "utf8")) as {
        elementor?: string;
      };
      if (env.elementor === REQUIRED_ELEMENTOR_FREE_VERSION) {
        wordpress = "available";
      } else {
        reasons.push(
          `Harness environment.json Elementor is ${env.elementor ?? "missing"}, required ${REQUIRED_ELEMENTOR_FREE_VERSION}.`,
        );
      }
    } catch {
      reasons.push("environment.json exists but could not be parsed.");
    }
  } else if (docker === "available") {
    reasons.push(
      "Docker is available but Phase 11 harness is not set up yet (npm run test:elementor:runtime:setup).",
    );
  }

  if (
    docker === "available" &&
    wordpress === "available" &&
    !("error" in source)
  ) {
    return {
      status: "available",
      elementorVersionTarget: REQUIRED_ELEMENTOR_FREE_VERSION,
      wordpress,
      php,
      docker,
      reasons: [],
    };
  }

  if (reasons.length === 0) {
    reasons.push(
      "WordPress + Elementor Free 4.2.4 runtime harness is not ready.",
    );
  }

  return {
    status: "blocked",
    elementorVersionTarget: REQUIRED_ELEMENTOR_FREE_VERSION,
    wordpress,
    php,
    docker,
    reasons,
  };
}
