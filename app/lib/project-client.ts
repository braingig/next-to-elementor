/**
 * Browser client for project ZIP analyze/convert APIs.
 * Does not import Node-only converter internals beyond shared response types.
 */

import type {
  ProjectAnalyzeResponse,
  ProjectConvertResponse,
} from "@/app/lib/project-api-types";

export type ProjectClientError = {
  ok: false;
  error: string;
  status?: number;
  code?: string;
  diagnostics?: unknown;
};

export type ProjectAnalyzeClientResult =
  | Extract<ProjectAnalyzeResponse, { ok: true }>
  | ProjectClientError;

export type ProjectConvertClientResult =
  | Extract<ProjectConvertResponse, { ok: true }>
  | ProjectClientError;

async function postZip(
  url: string,
  file: File,
): Promise<{ status: number; payload: ProjectAnalyzeResponse | ProjectConvertResponse | null }> {
  const body = new FormData();
  body.append("zip", file, file.name || "project.zip");

  const res = await fetch(url, {
    method: "POST",
    body,
  });

  let payload: ProjectAnalyzeResponse | ProjectConvertResponse | null = null;
  try {
    payload = (await res.json()) as ProjectAnalyzeResponse | ProjectConvertResponse;
  } catch {
    return { status: res.status, payload: null };
  }
  return { status: res.status, payload };
}

export async function requestProjectAnalyze(
  file: File,
): Promise<ProjectAnalyzeClientResult> {
  const { status, payload } = await postZip("/api/project/analyze", file);
  if (!payload) {
    return {
      ok: false,
      error: `Project analyze failed (${status}).`,
      status,
    };
  }
  if (!payload.ok) {
    return {
      ok: false,
      error: payload.error,
      status,
      code: payload.code,
      diagnostics: payload.diagnostics,
    };
  }
  return payload;
}

export async function requestProjectConvert(
  file: File,
): Promise<ProjectConvertClientResult> {
  const { status, payload } = await postZip("/api/project/convert", file);
  if (!payload) {
    return {
      ok: false,
      error: `Project convert failed (${status}).`,
      status,
    };
  }
  if (!payload.ok) {
    return {
      ok: false,
      error: payload.error,
      status,
      code: payload.code,
      diagnostics: payload.diagnostics,
    };
  }
  return payload;
}

export function routeDownloadFilename(routePath: string): string {
  const safe =
    (routePath === "/" ? "root" : routePath)
      .replace(/^\//, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "route";
  return `elementor-${safe}.json`;
}
