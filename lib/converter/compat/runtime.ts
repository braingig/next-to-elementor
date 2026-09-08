/**
 * Runtime Elementor import validation status for Phase 10/11.
 *
 * When the Docker harness has been set up and environment.json reports
 * Elementor Free exactly 4.2.4, status becomes available for executed tests.
 * Do not fabricate PASS without running import/browser checks.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { dockerDaemonAvailable, readRuntimeEnv } from "../runtime/env";
import { REQUIRED_ELEMENTOR_FREE_VERSION } from "./environment";

export type RuntimeImportStatus = {
  status: "PASS" | "BLOCKED" | "READY";
  elementorVersion: "4.2.4";
  executed: boolean;
  reasons: string[];
  requiredToUnblock: string[];
};

export function getRuntimeImportStatus(): RuntimeImportStatus {
  const requiredToUnblock = [
    "A WordPress site with Elementor Free exactly 4.2.4 (no Pro).",
    "Docker daemon running and `npm run test:elementor:runtime:setup` completed.",
    "A repeatable import path for classic document JSON (version 0.4).",
    "Ability to re-read the saved document for semantic checks.",
  ];

  if (!dockerDaemonAvailable()) {
    return {
      status: "BLOCKED",
      elementorVersion: REQUIRED_ELEMENTOR_FREE_VERSION,
      executed: false,
      reasons: [
        "Docker daemon is not reachable.",
        "Cannot start the Phase 11 WordPress + Elementor Free 4.2.4 harness.",
      ],
      requiredToUnblock,
    };
  }

  const env = readRuntimeEnv();
  const setupScript = join(process.cwd(), "docker/scripts/setup.sh");
  if (!env) {
    return {
      status: "BLOCKED",
      elementorVersion: REQUIRED_ELEMENTOR_FREE_VERSION,
      executed: false,
      reasons: [
        "Docker is available, but the runtime harness has not been set up yet.",
        existsSync(setupScript)
          ? "Run: npm run test:elementor:runtime:setup"
          : "docker/scripts/setup.sh is missing.",
      ],
      requiredToUnblock,
    };
  }

  if (env.elementor !== REQUIRED_ELEMENTOR_FREE_VERSION) {
    return {
      status: "BLOCKED",
      elementorVersion: REQUIRED_ELEMENTOR_FREE_VERSION,
      executed: false,
      reasons: [
        `Harness Elementor version is ${env.elementor}, required ${REQUIRED_ELEMENTOR_FREE_VERSION}.`,
        "Refusing to treat a different version as 4.2.4.",
      ],
      requiredToUnblock,
    };
  }

  if (env.proActive) {
    return {
      status: "BLOCKED",
      elementorVersion: REQUIRED_ELEMENTOR_FREE_VERSION,
      executed: false,
      reasons: ["Elementor Pro must not be active in the runtime harness."],
      requiredToUnblock,
    };
  }

  return {
    status: "READY",
    elementorVersion: REQUIRED_ELEMENTOR_FREE_VERSION,
    executed: false,
    reasons: [
      "WordPress + Elementor Free 4.2.4 harness environment.json is present.",
      "Import/browser execution is performed by npm run test:elementor:runtime / test:visual.",
    ],
    requiredToUnblock: [],
  };
}
