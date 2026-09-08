import { defineConfig } from "@playwright/test";

/**
 * Requires Phase 11 Docker harness + `npm run test:elementor:runtime` first.
 * Visual comparison is advisory — failures here should not redefine converter accuracy.
 */
export default defineConfig({
  testDir: __dirname,
  testMatch: /browser\.spec\.ts/,
  timeout: 90_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "off",
    screenshot: "off",
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: "npx --yes serve generated/source-html -l 9321 --no-request-logging",
    cwd: __dirname,
    port: 9321,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
