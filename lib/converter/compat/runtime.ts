/**
 * Runtime Elementor import status for Phase 10 static compat.
 *
 * Live WordPress import is opt-in via `.n2e-wp.local.json` and
 * `scripts/import-project-to-wordpress.ts`.
 * This helper never fabricates PASS without an executed live import.
 */

import { resolveWordPressTargetConfig } from "../wordpress/config";
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
    "A configured target WordPress site (.n2e-wp.local.json at the project root).",
    "Elementor available on the target site for classic document import.",
    "Run scripts/import-project-to-wordpress.ts (or equivalent) to execute a live import.",
  ];

  const resolved = resolveWordPressTargetConfig();
  if (!resolved.ok) {
    return {
      status: "BLOCKED",
      elementorVersion: REQUIRED_ELEMENTOR_FREE_VERSION,
      executed: false,
      reasons: [resolved.message],
      requiredToUnblock,
    };
  }

  return {
    status: "READY",
    elementorVersion: REQUIRED_ELEMENTOR_FREE_VERSION,
    executed: false,
    reasons: [
      `Target WordPress credentials resolved from ${resolved.source} (${resolved.config.baseUrl}).`,
      "Live import is performed by scripts/import-project-to-wordpress.ts — not fabricated here.",
    ],
    requiredToUnblock: [],
  };
}
