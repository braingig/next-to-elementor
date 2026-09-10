/**
 * lucide-react static adapter — NEVER imports lucide-react from node_modules.
 * Named icons → knownComponentSources stubs with data-icon for existing icon path.
 */

import type { DependencyAdapter, AdapterApplyResult } from "./types";

function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function iconStubSource(exportName: string, iconName: string): string {
  return `export function ${exportName}(props) {
  const size = props && props.size != null ? props.size : 24;
  const className = props && props.className != null ? props.className : undefined;
  return (
    <svg
      data-icon="${iconName}"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      viewBox="0 0 24 24"
    />
  );
}
`;
}

function hasDynamicIconUsage(source: string, localNames: string[]): boolean {
  // icons[name], Lucide[name], {[Icon]: ...} patterns — conservative.
  if (/\bicons\s*\[/.test(source)) return true;
  if (localNames.some((n) => new RegExp(`\\b${n}\\s*\\[`).test(source))) {
    return true;
  }
  // const Icon = Something; <Icon /> where Something is not a known lucide binding
  if (/const\s+\w+\s*=\s*\w+\s*\[/.test(source)) return true;
  return false;
}

export const lucideReactAdapter: DependencyAdapter = {
  id: "lucide-react",
  apply(input): AdapterApplyResult {
    const diagnostics = [];
    const named = new Set<string>();
    let namespace = false;

    for (const hit of input.hits) {
      if (hit.isNamespace) {
        namespace = true;
      }
      for (const n of hit.localNames) named.add(n);
    }

    if (namespace) {
      diagnostics.push({
        severity: "warning" as const,
        code: "dependency-dynamic-usage",
        message:
          "lucide-react namespace import cannot be statically adapted; icon usage may be unsupported.",
      });
      return { status: "unsupported", diagnostics };
    }

    if (named.size === 0) {
      diagnostics.push({
        severity: "info" as const,
        code: "dependency-adapter-applied",
        message: "lucide-react imported without named icons; nothing to adapt.",
      });
      return { status: "partial", diagnostics };
    }

    // Scan all modules for dynamic usage of these names.
    for (const [path, source] of Object.entries(input.moduleSources)) {
      if (hasDynamicIconUsage(source, [...named])) {
        diagnostics.push({
          severity: "warning" as const,
          code: "dependency-dynamic-usage",
          message: `Dynamic lucide-react icon usage detected in ${path}; dynamic icons are not statically adapted.`,
          path,
        });
        return { status: "unsupported", diagnostics };
      }
    }

    const knownComponentSources: Record<string, string> = {};
    for (const name of [...named].sort((a, b) => a.localeCompare(b))) {
      const iconName = pascalToKebab(name);
      knownComponentSources[name] = iconStubSource(name, iconName);
    }

    diagnostics.push({
      severity: "info" as const,
      code: "dependency-adapter-applied",
      message: `lucide-react: statically stubbed ${named.size} named icon(s) via data-icon (package not executed).`,
    });

    return {
      status: "supported",
      diagnostics,
      knownComponentSources,
    };
  },
};
