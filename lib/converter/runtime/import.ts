import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { convertSource } from "../convert-source";
import type { ConversionResult } from "../report/schema";
import type { ElementorDocument } from "../rules/native/types";
import { GENERATED_DIR, ensureGeneratedDir, wpCli } from "./env";

export type ImportResult = {
  ok: boolean;
  postId: number;
  permalink: string;
  elementorVersion: string;
  editMode: string;
  hasElementorData: boolean;
  elements: unknown[];
  raw: string;
};

export function generateDocumentFromFixture(
  name: string,
  source: string,
  css?: string,
): { result: ConversionResult; path: string; document: ElementorDocument } {
  ensureGeneratedDir();
  const result = convertSource({
    source,
    ...(css ? { css } : {}),
    title: name,
  });
  if (!result.elementorJson) {
    throw new Error(`Converter produced no Elementor JSON for ${name}`);
  }
  const document = result.elementorJson as ElementorDocument;
  const path = join(GENERATED_DIR, "docs", `${name}.json`);
  writeFileSync(path, JSON.stringify(document, null, 2) + "\n");
  return { result, path, document };
}

export function importDocumentJson(hostPath: string): ImportResult {
  // Host path is under tests/runtime/generated → mounted at /opt/n2e-generated
  const rel = hostPath.split("tests/runtime/generated/").pop();
  if (!rel) {
    throw new Error(`Document path must be under tests/runtime/generated: ${hostPath}`);
  }
  const containerPath = `/opt/n2e-generated/${rel}`;
  const stdout = wpCli([
    "eval-file",
    "/opt/n2e-scripts/import-document.php",
    containerPath,
  ]);
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(`Import produced no JSON: ${stdout}`);
  }
  const parsed = JSON.parse(stdout.slice(jsonStart)) as ImportResult;
  if (!parsed.ok) {
    throw new Error(`Import failed: ${stdout}`);
  }
  const out = join(GENERATED_DIR, "imports", `${parsed.postId}.json`);
  writeFileSync(out, JSON.stringify(parsed, null, 2) + "\n");
  return { ...parsed, raw: stdout };
}

export type CollectedWidget = {
  elType: string;
  widgetType?: string;
  settings: Record<string, unknown>;
  children: CollectedWidget[];
};

export function collectWidgets(elements: unknown[]): CollectedWidget[] {
  const mapNode = (n: unknown): CollectedWidget | null => {
    if (!n || typeof n !== "object") return null;
    const el = n as Record<string, unknown>;
    const kids = Array.isArray(el.elements) ? (el.elements as unknown[]) : [];
    return {
      elType: String(el.elType ?? ""),
      ...(typeof el.widgetType === "string" ? { widgetType: el.widgetType } : {}),
      settings:
        el.settings && typeof el.settings === "object"
          ? (el.settings as Record<string, unknown>)
          : {},
      children: kids
        .map(mapNode)
        .filter((x): x is CollectedWidget => Boolean(x)),
    };
  };
  return elements
    .map(mapNode)
    .filter((x): x is CollectedWidget => Boolean(x));
}

export function flattenWidgetTypes(tree: CollectedWidget[]): string[] {
  const types = new Set<string>();
  const walk = (nodes: CollectedWidget[]) => {
    for (const n of nodes) {
      if (n.elType === "container") types.add("container");
      if (n.widgetType) types.add(n.widgetType);
      walk(n.children);
    }
  };
  walk(tree);
  return [...types].sort();
}

export function collectResponsiveKeys(tree: CollectedWidget[]): string[] {
  const keys = new Set<string>();
  const walk = (nodes: CollectedWidget[]) => {
    for (const n of nodes) {
      for (const k of Object.keys(n.settings)) {
        if (k.endsWith("_tablet") || k.endsWith("_mobile")) keys.add(k);
      }
      walk(n.children);
    }
  };
  walk(tree);
  return [...keys].sort();
}

export function findFirstWidget(
  tree: CollectedWidget[],
  widgetType: string,
): CollectedWidget | null {
  for (const n of tree) {
    if (n.widgetType === widgetType) return n;
    const nested = findFirstWidget(n.children, widgetType);
    if (nested) return nested;
  }
  return null;
}

export const EXPECTED_NATIVE_TYPES = [
  "container",
  "heading",
  "text-editor",
  "image",
  "button",
  "icon",
  "divider",
  "spacer",
  "html",
] as const;
