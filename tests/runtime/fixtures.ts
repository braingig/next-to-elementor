/**
 * Allowlisted Phase 11 fixtures only — never load arbitrary user paths.
 */
export const REAL_WORLD_FIXTURES = [
  "01-hero",
  "02-features",
  "03-cta",
  "04-navbar",
  "05-pricing",
  "06-tailwind-heavy",
  "07-css-heavy",
  "08-mixed",
] as const;

export type RealWorldFixtureId = (typeof REAL_WORLD_FIXTURES)[number];

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
