/**
 * Phase 11 runtime ↔ Phase 14c/14d media bridge.
 *
 * Reads Application Password credentials written by docker/scripts/setup.sh
 * into tests/runtime/generated/wp-media.json (gitignored). Falls back to
 * N2E_WP_* process env — same vars as createWordPressMediaClient.
 *
 * Never logs credentials.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createWordPressMediaClient,
  readWordPressMediaConfigFromEnv,
  validateWordPressMediaConfig,
  type ProjectMediaClient,
  type ProjectWordPressMediaConfig,
} from "../project/media";
import { GENERATED_DIR } from "./env";

export type HarnessWordPressMediaFile = {
  baseUrl: string;
  username: string;
  applicationPassword: string;
  /** Informational only. */
  createdAt?: string;
};

export function harnessWordPressMediaPath(): string {
  return join(GENERATED_DIR, "wp-media.json");
}

/**
 * Resolve media config for the visual harness WordPress instance.
 * Preference: process.env N2E_WP_* → generated wp-media.json.
 */
export function readHarnessWordPressMediaConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProjectWordPressMediaConfig | null {
  const fromEnv = readWordPressMediaConfigFromEnv(env);
  if (fromEnv) {
    const valid = validateWordPressMediaConfig(fromEnv);
    if (valid.ok) return fromEnv;
  }

  const path = harnessWordPressMediaPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<HarnessWordPressMediaFile>;
    if (
      typeof raw.baseUrl !== "string" ||
      typeof raw.username !== "string" ||
      typeof raw.applicationPassword !== "string"
    ) {
      return null;
    }
    const config: ProjectWordPressMediaConfig = {
      baseUrl: raw.baseUrl,
      username: raw.username,
      applicationPassword: raw.applicationPassword,
    };
    const valid = validateWordPressMediaConfig(config);
    return valid.ok ? config : null;
  } catch {
    return null;
  }
}

export function createHarnessWordPressMediaClient(
  env: NodeJS.ProcessEnv = process.env,
):
  | { ok: true; client: ProjectMediaClient; config: ProjectWordPressMediaConfig }
  | { ok: false; reason: string } {
  const config = readHarnessWordPressMediaConfig(env);
  if (!config) {
    return {
      ok: false,
      reason:
        "WordPress media credentials missing. Run npm run test:elementor:runtime:setup (writes tests/runtime/generated/wp-media.json) or set N2E_WP_BASE_URL / N2E_WP_USER / N2E_WP_APP_PASSWORD to the same instance as the visual harness (e.g. http://127.0.0.1:9080).",
    };
  }
  return {
    ok: true,
    config,
    client: createWordPressMediaClient({ config }),
  };
}
