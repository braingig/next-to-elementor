# Phase 11 — Real WordPress + Elementor Free 4.2.4 Runtime Harness

Status: **implemented for review**  
Harness: `docker/wordpress/` + `docker/scripts/`  
Runtime code: `lib/converter/runtime/`  
Commands: `npm run test:elementor:runtime`, `npm run test:visual`

## Critical result labels

| Label | Meaning |
|---|---|
| **STATIC PASS** | Verified against Elementor Free **4.2.4** PHP source + Free catalog (Phase 10) |
| **RUNTIME_PASS** | Real WordPress + Elementor Free **4.2.4** import/render checks executed and passed |
| **RUNTIME_FAIL** | Runtime checks executed and failed |
| **BLOCKED** | Runtime/visual could not be executed (do **not** treat as PASS) |
| **VISUAL_*** | Advisory screenshot comparison only — never proof of semantic accuracy |

Do **not** claim pixel-perfect conversion.  
Do **not** convert BLOCKED into PASS.  
Runtime compatibility and visual similarity are **different** checks.

## Exact runtime versions (target)

| Item | Value |
|---|---|
| Elementor | **Free 4.2.4 only** (`ELEMENTOR_VERSION`) |
| Elementor source mount | `ELEMENTOR_FREE_4_2_4_PATH` (default `/Users/nusratnova/Downloads/elementor`) |
| In-repo `./elementor` | **4.2.1 — must NOT be used** |
| WordPress image | `wordpress:6.8.2-php8.2-apache` (WP ≥ 6.8 required by Elementor 4.2.4) |
| PHP | **8.2** (image); Elementor requires ≥ 7.4 |
| MySQL | `mysql:8.0` |
| Elementor Pro | **Not installed / not allowed** |
| Port | `http://127.0.0.1:9080` (`N2E_WP_PORT`) |

After setup, exact installed versions are written to  
`tests/runtime/generated/environment.json`.

## Docker setup

```bash
# Requires Docker Desktop (or equivalent) with a running daemon.
export ELEMENTOR_FREE_4_2_4_PATH=/Users/nusratnova/Downloads/elementor
npm run test:elementor:runtime:setup
```

What setup does:

1. Starts MySQL + WordPress via `docker/wordpress/docker-compose.yml`
2. Bind-mounts Elementor Free **4.2.4** from `ELEMENTOR_FREE_4_2_4_PATH` (read-only)
3. Installs WordPress, activates **elementor** only
4. **Fails** if plugin version ≠ `4.2.4`
5. **Fails** if Elementor Pro is active
6. Writes `environment.json`

Teardown:

```bash
npm run test:elementor:runtime:teardown
# or with volumes: bash docker/scripts/teardown.sh --volumes
```

### Blocker if Docker is unavailable

If the Docker daemon cannot be reached, setup exits non-zero and runtime/visual commands report **BLOCKED**. Host PHP/WP-CLI are not required; PHP runs inside the WordPress container.

## Import mechanism

Generated classic documents (`version: "0.4"`) are produced by the current converter from Phase 9 fixtures (no hand-edits).

Import uses Elementor's documents API inside the container:

`docker/scripts/import-document.php`

1. Verifies `ELEMENTOR_VERSION === 4.2.4`
2. Rejects Pro
3. `documents->create('wp-page', …)`
4. `$document->save([ 'elements' => content, 'settings' => … ])`
5. Reloads via `get_elements_raw_data()` for inspection

This path goes through Elementor's document save handling (not a raw SQL bypass of Elementor).

## Runtime validation

```bash
npm run test:elementor:runtime
```

Checks (when environment is up):

1. Elementor version === 4.2.4 (fail otherwise)
2. Import Phase 9 fixtures: hero, features, CTA, navbar, pricing, Tailwind-heavy, CSS-heavy, mixed
3. Nested containers / native widget types
4. Settings semantic checks (heading, button, image, flex, spacing, …)
5. Responsive `_tablet` / `_mobile` keys preserved in saved document
6. Custom HTML fallback sibling case (`custom-fallback-scoped`)
7. Unsupported node omitted + report retained (`unsupported-sibling`)
8. Pro/malformed probe (`reject-malformed.php`)
9. Writes `tests/runtime/generated/runtime-report.json`

## Browser validation

```bash
# Requires prior successful runtime import (page-*.json + environment.json)
npx playwright install chromium   # once
npm run test:visual
```

Playwright (`tests/runtime/browser.spec.ts`):

- Loads imported Elementor frontend pages
- Asserts `.elementor` widgets render
- Checks custom HTML fallback visibility
- Captures desktop / tablet / mobile screenshots
- Compares against controlled source fixture HTML (advisory pixelmatch)

### Source rendering (controlled fixtures only)

`npm run test:visual:source` SSR-renders **allowlisted** Phase 9 fixture `source.tsx` files via ReactDOMServer + Tailwind CDN wrapper.  
This is **test-harness only**. The converter does **not** execute user React/JS.

## Screenshot / visual methodology

| Step | Detail |
|---|---|
| Viewports | desktop 1280×800, tablet 768×1024, mobile 375×812 |
| Elementor shot | Full-page screenshot of imported canvas page |
| Source shot | Same viewport of controlled fixture HTML |
| Diff | `pixelmatch` + PNG diff artifact |
| Classification | `VISUAL_CLOSE` / `VISUAL_MINOR_DIFFERENCE` / `VISUAL_SIGNIFICANT_DIFFERENCE` / `NOT_COMPARABLE` / `BLOCKED` |

High screenshot similarity does **not** mean the fixture is “accurate.”  
Source of truth remains: semantic structure, Free compatibility, conversion decisions, diagnostics.

## Report schema

```json
{
  "environment": { "wordpress": "...", "php": "...", "elementor": "4.2.4" },
  "runtimeStatus": "RUNTIME_PASS | RUNTIME_FAIL | BLOCKED",
  "fixtures": [
    {
      "name": "01-hero",
      "importStatus": "RUNTIME_PASS",
      "renderStatus": "SKIPPED",
      "visualStatus": "BLOCKED",
      "issues": []
    }
  ]
}
```

Visual statuses are filled/updated by `test:visual` artifacts under `tests/runtime/generated/screenshots/`.

## Commands

| Command | Requires | Purpose |
|---|---|---|
| `npm run test:elementor` | Elementor 4.2.4 source tree | Static Free compatibility |
| `npm run test:elementor:runtime:setup` | Docker daemon | Start WP + Elementor 4.2.4 |
| `npm run test:elementor:runtime` | Running harness | Import + document checks |
| `npm run test:visual` | Harness + imports + Playwright | Browser + advisory visuals |
| `npm test` | — | Unit/integration (vitest) |

## Known differences / limitations

- Elementor Free frontend chrome/CSS ≠ Tailwind CDN fixture rendering → visual diffs are expected
- External fixture images (`cdn.example.com`) may 404 in browser (ignored as non-critical)
- Responsive **control presence** is verified in saved JSON; browser device-mode parity is inspected via viewport screenshots, not Elementor editor device switcher automation
- Malformed Pro widget probe documents Elementor’s acceptance behavior; converter must still never emit Pro types
- Host PHP/WP-CLI are optional; Docker supplies the runtime

## Bugs fixed in this phase

1. **Runtime import harness (not converter):** Elementor `document->save()` returned `false` under WP-CLI with no current user. Without `manage_options`, Elementor's content-sanitizer called `iterate_data` on the full save payload (including string settings), producing PHP warnings and a failed save. Fix: set administrator user in `import-document.php` / `reject-malformed.php` and pass `--user=admin` to WP-CLI. No converter output changes.

Visual-only screenshot tuning that would break Free semantics is disallowed.

## Executed results (this environment)

| Check | Result |
|---|---|
| WordPress | **6.8.2** |
| PHP | **8.2.29** |
| Elementor | **Free 4.2.4** (Downloads mount; not in-repo 4.2.1) |
| Docker | **Yes** |
| Static validation | **STATIC PASS** |
| Runtime import | **RUNTIME_PASS** (all Phase 9 fixtures + custom/unsupported cases) |
| Browser | **25 Playwright tests passed** |
| Visual (advisory) | hero/cta/navbar: CLOSE–MINOR; custom-fallback: NOT_COMPARABLE (no source HTML twin) |

Do **not** start Phase 12 until this phase is reviewed.
