import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Elementor Free source used for capability verification only.
    "elementor/**",
    // Converter fixtures are data inputs (may be intentionally invalid).
    "tests/converter/fixtures/**",
    // Browser manual folder pick fixture (not Next app source).
    "manual-validation/**",
    // Phase 11 generated runtime artifacts (HTML/CJS screenshots/reports).
  ]),
]);

export default eslintConfig;
