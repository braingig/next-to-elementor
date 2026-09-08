#!/usr/bin/env node
/**
 * Generate controlled static HTML for allowlisted real-world fixtures only.
 * Uses ReactDOMServer on fixture sources — never loads arbitrary user paths.
 * This harness script is outside the converter (converter remains static-analysis only).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "tests/converter/fixtures/real-world");
const OUT = join(ROOT, "tests/runtime/generated/source-html");

const REAL_WORLD_FIXTURES = [
  "01-hero",
  "02-features",
  "03-cta",
  "04-navbar",
  "05-pricing",
  "06-tailwind-heavy",
  "07-css-heavy",
  "08-mixed",
];

mkdirSync(OUT, { recursive: true });

function loadFixtureModule(id) {
  const sourcePath = join(FIXTURES, id, "source.tsx");
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing allowlisted fixture: ${sourcePath}`);
  }
  const source = readFileSync(sourcePath, "utf8");
  const transformed = transformSync(source, {
    loader: "tsx",
    format: "cjs",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "node20",
  });
  // Write under the repo so require("react") resolves via node_modules.
  const tmpDir = join(OUT, "_tmp");
  mkdirSync(tmpDir, { recursive: true });
  const file = join(tmpDir, `${id}.cjs`);
  writeFileSync(
    file,
    'const React = require("react");\n' + transformed.code,
  );
  delete require.cache[require.resolve(file)];
  return require(file);
}

function pickComponent(mod) {
  for (const key of Object.keys(mod)) {
    if (typeof mod[key] === "function") return mod[key];
  }
  throw new Error("No exported component found in fixture module");
}

for (const id of REAL_WORLD_FIXTURES) {
  const mod = loadFixtureModule(id);
  const Comp = pickComponent(mod);
  const markup = renderToStaticMarkup(React.createElement(Comp));
  const cssPath = join(FIXTURES, id, "styles.css");
  const extraCss = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Source fixture ${id}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #fff; }
    ${extraCss}
  </style>
</head>
<body>
  <main data-fixture="${id}" data-harness="source-controlled">
    ${markup}
  </main>
</body>
</html>
`;
  writeFileSync(join(OUT, `${id}.html`), html);
  console.log(`Wrote source HTML for ${id}`);
}
