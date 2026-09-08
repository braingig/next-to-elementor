/**
 * Runtime Elementor import validation.
 *
 * In the current project environment this is BLOCKED: there is no runnable
 * WordPress + Elementor Free 4.2.4 harness (no PHP, no WP-CLI, Docker daemon
 * unavailable, no wp-env/Playground import pipeline wired for this repo).
 *
 * Do not fabricate a runtime PASS.
 */

export type RuntimeImportStatus = {
  /** Explicit Phase 10 vocabulary. */
  status: "PASS" | "BLOCKED";
  elementorVersion: "4.2.4";
  executed: false;
  reasons: string[];
  requiredToUnblock: string[];
};

export function getRuntimeImportStatus(): RuntimeImportStatus {
  return {
    status: "BLOCKED",
    elementorVersion: "4.2.4",
    executed: false,
    reasons: [
      "WordPress runtime is not available in this environment.",
      "PHP CLI is not installed/available.",
      "Docker daemon is not running (cannot start a WP container).",
      "This repository does not yet ship a wired wp-env / Playground import harness for generated classic JSON.",
    ],
    requiredToUnblock: [
      "A WordPress site with Elementor Free exactly 4.2.4 (no Pro).",
      "A repeatable import path for classic document JSON (version 0.4) into _elementor_data (or equivalent REST/CLI).",
      "Ability to re-read the saved document for round-trip semantic checks.",
    ],
  };
}
