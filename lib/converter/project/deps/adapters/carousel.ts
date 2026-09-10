/**
 * Carousel dependency adapter — classification / diagnostics only.
 * Does not execute carousel packages or invent slides.
 */

import type { DependencyAdapter, AdapterApplyResult } from "./types";

function hasDynamicSlides(source: string): boolean {
  if (/\.map\s*\(/.test(source) && /slide|Slide|SwiperSlide/i.test(source)) {
    return true;
  }
  if (/\bfetch\s*\(/.test(source)) return true;
  return false;
}

export const carouselAdapter: DependencyAdapter = {
  id: "carousel",
  apply(input): AdapterApplyResult {
    const diagnostics = [];
    let dynamic = false;

    for (const [path, source] of Object.entries(input.moduleSources)) {
      if (hasDynamicSlides(source)) {
        dynamic = true;
        diagnostics.push({
          severity: "warning" as const,
          code: "dependency-dynamic-usage",
          message: `Carousel package ${input.packageName}: dynamic/runtime slides detected in ${path}; slides are not invented.`,
          path,
        });
      }
    }

    diagnostics.push({
      severity: "warning" as const,
      code: "dependency-unsupported",
      message: `${input.packageName}: interactive carousel behavior is not preserved in Elementor Free. Static children may still convert if present in source.`,
    });

    return {
      status: dynamic ? "unsupported" : "partial",
      diagnostics,
    };
  },
};
