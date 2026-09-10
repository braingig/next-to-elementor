/**
 * Map a ResolvedSection to existing ConvertSourceOptions.
 * Does not invent CSS or props — callers may still pass css/title explicitly.
 */

import type { ConvertSourceOptions } from "../convert-source";
import type { ResolvedSection } from "./types";

export type ToConvertOptionsInput = {
  resolved: ResolvedSection;
  /** Extra convertSource fields (css, title, catalog, …). Never overrides entry wiring. */
  convert?: Omit<
    ConvertSourceOptions,
    "source" | "knownComponentSources" | "sourcePath" | "componentName"
  > & {
    /** Optional override; defaults to resolved.entryComponentName */
    componentName?: string;
    sourceName?: string;
  };
};

function defaultSourceName(entryPath: string): string {
  const base = entryPath.includes("/")
    ? entryPath.slice(entryPath.lastIndexOf("/") + 1)
    : entryPath;
  return base.replace(/\.(tsx|jsx|ts|js)$/i, "") || base;
}

/**
 * Produce options for the existing convertSource pipeline.
 */
export function toConvertSourceOptions(
  input: ToConvertOptionsInput,
): ConvertSourceOptions {
  const { resolved, convert } = input;
  const {
    componentName: overrideName,
    sourceName,
    ...rest
  } = convert ?? {};

  return {
    ...rest,
    source: resolved.entrySource,
    sourcePath: resolved.entryPath,
    sourceName: sourceName ?? defaultSourceName(resolved.entryPath),
    componentName: overrideName ?? resolved.entryComponentName,
    knownComponentSources: { ...resolved.knownComponentSources },
  };
}
