import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_ELEMENTOR_FREE_VERSION,
  resolveElementorFree424SourceRoot,
} from "../compat/environment";
import type { RuntimeValidationReport } from "./report";
import { emptyBlockedReport } from "./report";

export const RUNTIME_ROOT = join(process.cwd(), "tests/runtime");
export const GENERATED_DIR = join(RUNTIME_ROOT, "generated");
export const DOCKER_COMPOSE_DIR = join(process.cwd(), "docker/wordpress");
export const SETUP_SCRIPT = join(process.cwd(), "docker/scripts/setup.sh");

export type RuntimeEnvFile = {
  wordpress: string;
  php: string;
  elementor: string;
  /** Active WP theme — expected hello-elementor for Full Width visuals. */
  theme?: string;
  themeVersion?: string;
  docker: boolean;
  baseUrl: string;
  elementorSourcePath: string;
  helloElementorPath?: string;
  proActive: boolean;
  /** True when setup wrote tests/runtime/generated/wp-media.json. */
  mediaConfigured?: boolean;
  mediaConfigPath?: string;
};

export function dockerDaemonAvailable(): boolean {
  const r = spawnSync("docker", ["info"], { encoding: "utf8" });
  return r.status === 0;
}

export function runtimeEnvPath(): string {
  return join(GENERATED_DIR, "environment.json");
}

export function readRuntimeEnv(): RuntimeEnvFile | null {
  const p = runtimeEnvPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as RuntimeEnvFile;
  } catch {
    return null;
  }
}

export function ensureGeneratedDir(): void {
  mkdirSync(GENERATED_DIR, { recursive: true });
  mkdirSync(join(GENERATED_DIR, "docs"), { recursive: true });
  mkdirSync(join(GENERATED_DIR, "imports"), { recursive: true });
  mkdirSync(join(GENERATED_DIR, "screenshots"), { recursive: true });
  mkdirSync(join(GENERATED_DIR, "source-html"), { recursive: true });
}

/**
 * Probe whether the Phase 11 Docker harness can run (or is already running).
 */
export function probePhase11Runtime(): {
  status: "available" | "blocked";
  reasons: string[];
  env: RuntimeEnvFile | null;
} {
  const reasons: string[] = [];
  const source = resolveElementorFree424SourceRoot();
  if ("error" in source) {
    reasons.push(source.error);
  }

  if (!dockerDaemonAvailable()) {
    reasons.push("Docker daemon is not reachable.");
  }

  if (!existsSync(SETUP_SCRIPT)) {
    reasons.push(`Setup script missing: ${SETUP_SCRIPT}`);
  }

  if (!existsSync(join(DOCKER_COMPOSE_DIR, "docker-compose.yml"))) {
    reasons.push("docker/wordpress/docker-compose.yml missing.");
  }

  const env = readRuntimeEnv();
  if (env && env.elementor !== REQUIRED_ELEMENTOR_FREE_VERSION) {
    reasons.push(
      `environment.json Elementor version is ${env.elementor}, required ${REQUIRED_ELEMENTOR_FREE_VERSION}.`,
    );
  }
  if (env && env.theme && env.theme !== "hello-elementor") {
    reasons.push(
      `environment.json theme is "${env.theme}", required hello-elementor for Elementor Full Width visuals.`,
    );
  }

  if (reasons.length > 0) {
    return { status: "blocked", reasons, env };
  }

  return { status: "available", reasons: [], env };
}

export function runSetup(): RuntimeEnvFile {
  ensureGeneratedDir();
  const source = resolveElementorFree424SourceRoot();
  if ("error" in source) {
    throw new Error(source.error);
  }
  execFileSync("bash", [SETUP_SCRIPT], {
    stdio: "inherit",
    env: {
      ...process.env,
      ELEMENTOR_FREE_4_2_4_PATH: source.root,
    },
  });
  const env = readRuntimeEnv();
  if (!env) {
    throw new Error("Setup completed but environment.json was not written.");
  }
  if (env.elementor !== REQUIRED_ELEMENTOR_FREE_VERSION) {
    throw new Error(
      `Elementor version must be ${REQUIRED_ELEMENTOR_FREE_VERSION}, got ${env.elementor}`,
    );
  }
  if (env.theme && env.theme !== "hello-elementor") {
    throw new Error(
      `Runtime theme must be hello-elementor for Full Width visuals, got ${env.theme}`,
    );
  }
  return env;
}

export function compose(
  args: string[],
  opts?: { inherit?: boolean },
): { stdout: string; stderr: string; status: number | null } {
  const helloDefault = join(process.cwd(), "docker/themes/hello-elementor");
  const r = spawnSync("docker", ["compose", ...args], {
    cwd: DOCKER_COMPOSE_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      ELEMENTOR_FREE_4_2_4_PATH:
        process.env.ELEMENTOR_FREE_4_2_4_PATH ??
        (resolveElementorFree424SourceRoot() as { root: string }).root,
      HELLO_ELEMENTOR_PATH: process.env.HELLO_ELEMENTOR_PATH ?? helloDefault,
    },
  });
  if (opts?.inherit && r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || "");
  }
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    status: r.status,
  };
}

export function wpCli(args: string[]): string {
  const r = compose(["run", "--rm", "wpcli", "wp", "--user=admin", ...args]);
  if (r.status !== 0) {
    throw new Error(
      `wpcli failed (${args.join(" ")}): ${r.stderr || r.stdout}`,
    );
  }
  return r.stdout;
}

export function writeReport(report: RuntimeValidationReport): string {
  ensureGeneratedDir();
  const out = join(GENERATED_DIR, "runtime-report.json");
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  return out;
}

export function blockedReportOrThrow(): RuntimeValidationReport {
  const probe = probePhase11Runtime();
  if (probe.status === "blocked") {
    return emptyBlockedReport(probe.reasons);
  }
  throw new Error("Runtime is available; do not fabricate BLOCKED.");
}
