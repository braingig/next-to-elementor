/**
 * Target WordPress credentials (server / CLI only).
 *
 * Sole source: gitignored `.n2e-wp.local.json` at the project root (or a parent
 * of `cwd`). Never accepts credentials from browser multipart. Never logs secrets.
 * Never requires a WordPress post/template ID — each import creates a new
 * Elementor Library template.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  validateWordPressMediaConfig,
  type ProjectWordPressMediaConfig,
} from "../project/media";

export type WordPressTargetConfig = ProjectWordPressMediaConfig;

export type WordPressConfigSource = "local-file" | "explicit";

export type ResolveWordPressConfigResult =
  | {
      ok: true;
      config: WordPressTargetConfig;
      source: WordPressConfigSource;
      path?: string;
    }
  | { ok: false; message: string };

/** Gitignored local developer credentials file (project root). */
export const WP_LOCAL_CONFIG_FILE_NAME = ".n2e-wp.local.json";

type LocalFileShape = Partial<ProjectWordPressMediaConfig>;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeConfig(
  raw: ProjectWordPressMediaConfig,
): ProjectWordPressMediaConfig {
  return {
    baseUrl: stripTrailingSlash(raw.baseUrl.trim()),
    username: raw.username.trim(),
    applicationPassword: raw.applicationPassword.trim(),
  };
}

/**
 * Directories to search for `.n2e-wp.local.json`, starting at `startDir`
 * and walking toward the filesystem root.
 */
export function candidateConfigDirectories(
  startDir: string = process.cwd(),
): string[] {
  const dirs: string[] = [];
  let current = startDir;
  for (;;) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

function readLocalFileAt(path: string): ProjectWordPressMediaConfig | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as LocalFileShape;
    if (
      typeof parsed.baseUrl !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.applicationPassword !== "string"
    ) {
      return null;
    }
    return normalizeConfig({
      baseUrl: parsed.baseUrl,
      username: parsed.username,
      applicationPassword: parsed.applicationPassword,
    });
  } catch {
    return null;
  }
}

function readLocalFile(
  cwd: string = process.cwd(),
): { config: ProjectWordPressMediaConfig; path: string } | null {
  for (const dir of candidateConfigDirectories(cwd)) {
    const path = join(dir, WP_LOCAL_CONFIG_FILE_NAME);
    const config = readLocalFileAt(path);
    if (config) return { config, path };
  }
  return null;
}

/**
 * Resolve target WordPress Application Password config from `.n2e-wp.local.json`
 * (or an explicit override for tests / callers). Shared by CLI import and
 * media-enabled project convert.
 */
export function resolveWordPressTargetConfig(
  options?: {
    cwd?: string;
    /** Explicit config wins over the local file (tests / callers). */
    explicit?: ProjectWordPressMediaConfig | null;
  },
): ResolveWordPressConfigResult {
  if (options?.explicit) {
    const config = normalizeConfig(options.explicit);
    const v = validateWordPressMediaConfig(config);
    if (!v.ok) return { ok: false, message: v.message };
    return { ok: true, config, source: "explicit" };
  }

  const local = readLocalFile(options?.cwd ?? process.cwd());
  if (local) {
    const v = validateWordPressMediaConfig(local.config);
    if (!v.ok) return { ok: false, message: v.message };
    return {
      ok: true,
      config: local.config,
      source: "local-file",
      path: local.path,
    };
  }

  return {
    ok: false,
    message:
      "WordPress target not configured. Create a gitignored .n2e-wp.local.json at the project root with baseUrl, username, and applicationPassword.",
  };
}

export function basicAuthHeader(config: WordPressTargetConfig): string {
  const token = Buffer.from(
    `${config.username}:${config.applicationPassword}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
}

export function wordpressRestUrl(
  config: WordPressTargetConfig,
  path: string,
): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${config.baseUrl}/wp-json${p}`;
}
