/**
 * Centralized dependency capability registry (Phase 13e).
 * package.json / import names are metadata only — never installs or loads packages.
 */

import type { DependencyCategory } from "./types";

export type RegistryEntry = {
  category: DependencyCategory;
  adapter?: string;
  affectsVisual: boolean;
  /** When true, unsupported/partial visual gaps force route ≤ partial. */
  forcesPartial: boolean;
  notes: string;
};

/**
 * Explicit registry. Unlisted packages → unknown.
 * Keep small; extend deliberately.
 */
export const DEPENDENCY_REGISTRY: Record<string, RegistryEntry> = {
  // --- Framework builtins (informational) ---
  react: {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "React runtime is assumed; not executed during conversion.",
  },
  "react-dom": {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "React DOM runtime is assumed; not executed during conversion.",
  },
  next: {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Next.js framework import; static route conversion only.",
  },

  // --- Thin visual adapters ---
  "lucide-react": {
    category: "supported-adapter",
    adapter: "lucide-react",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Named icons mapped via static stubs (no package execution).",
  },
  "framer-motion": {
    category: "supported-adapter",
    adapter: "framer-motion",
    affectsVisual: true,
    forcesPartial: true,
    notes: "motion.* wrappers stripped to static elements; animation not preserved.",
  },
  motion: {
    category: "supported-adapter",
    adapter: "framer-motion",
    affectsVisual: true,
    forcesPartial: true,
    notes: "motion package treated like framer-motion (static strip).",
  },

  // --- Carousels (classify + static-structure note; no interactive engine) ---
  swiper: {
    category: "visual-but-unsupported",
    adapter: "carousel",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Carousel interactivity unsupported; static slide children may convert separately.",
  },
  "swiper/react": {
    category: "visual-but-unsupported",
    adapter: "carousel",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Swiper React carousel; interactive behavior not preserved.",
  },
  "embla-carousel-react": {
    category: "visual-but-unsupported",
    adapter: "carousel",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Embla carousel; interactive behavior not preserved.",
  },
  "react-slick": {
    category: "visual-but-unsupported",
    adapter: "carousel",
    affectsVisual: true,
    forcesPartial: true,
    notes: "react-slick carousel; interactive behavior not preserved.",
  },
  "pure-react-carousel": {
    category: "visual-but-unsupported",
    adapter: "carousel",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Carousel package; interactive behavior not preserved.",
  },

  // --- Charts (classify only) ---
  recharts: {
    category: "visual-but-unsupported",
    adapter: "charts",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Chart library; no full chart conversion in Phase 13e.",
  },
  "chart.js": {
    category: "visual-but-unsupported",
    adapter: "charts",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Chart.js; no full chart conversion in Phase 13e.",
  },
  "react-chartjs-2": {
    category: "visual-but-unsupported",
    adapter: "charts",
    affectsVisual: true,
    forcesPartial: true,
    notes: "react-chartjs-2; no full chart conversion in Phase 13e.",
  },
  "victory": {
    category: "visual-but-unsupported",
    adapter: "charts",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Victory charts; no full chart conversion in Phase 13e.",
  },
  "@nivo/core": {
    category: "visual-but-unsupported",
    adapter: "charts",
    affectsVisual: true,
    forcesPartial: true,
    notes: "Nivo charts; no full chart conversion in Phase 13e.",
  },

  // --- Utility-only ---
  clsx: {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Classname utility; no direct Elementor representation.",
  },
  classnames: {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Classname utility; no direct Elementor representation.",
  },
  "class-variance-authority": {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Variant classname utility.",
  },
  zod: {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Schema validation utility; not visual.",
  },
  lodash: {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Utility library; not visual.",
  },
  "lodash-es": {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Utility library; not visual.",
  },
  "date-fns": {
    category: "utility-only",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Date utility; not visual.",
  },

  // --- Runtime / data ---
  axios: {
    category: "dynamic/runtime-dependent",
    affectsVisual: false,
    forcesPartial: false,
    notes: "HTTP client; runtime data fetching is not executed or reproduced.",
  },
  swr: {
    category: "dynamic/runtime-dependent",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Data fetching library; runtime behavior not preserved.",
  },
  "@tanstack/react-query": {
    category: "dynamic/runtime-dependent",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Data fetching library; runtime behavior not preserved.",
  },
  "react-hook-form": {
    category: "dynamic/runtime-dependent",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Form state/validation runtime; static markup may still convert.",
  },
  formik: {
    category: "dynamic/runtime-dependent",
    affectsVisual: false,
    forcesPartial: false,
    notes: "Form runtime library.",
  },
};

/** Normalize import specifier to a registry package key. */
export function packageNameFromSpecifier(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  const slash = specifier.indexOf("/");
  // Nested path like lodash/get or swiper/react
  if (slash === -1) return specifier;
  const root = specifier.slice(0, slash);
  // Prefer exact nested keys when registered (swiper/react).
  if (DEPENDENCY_REGISTRY[specifier]) return specifier;
  return root;
}

export function lookupDependencyRegistry(
  packageName: string,
): RegistryEntry | undefined {
  return DEPENDENCY_REGISTRY[packageName];
}

export function listRegisteredPackages(): string[] {
  return Object.keys(DEPENDENCY_REGISTRY).sort((a, b) => a.localeCompare(b));
}
