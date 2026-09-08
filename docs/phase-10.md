# Phase 10 — Real Elementor Free 4.2.4 Import / Compatibility Validation

Status: **complete for review**  
Code: `lib/converter/compat/`  
Tests: `tests/converter/compat-elementor.test.ts`  
Command: `npm run test:elementor`

## Critical result labels

| Label | Meaning |
|---|---|
| **PASS** | Real Elementor Free **4.2.4** runtime accepted and preserved the structure |
| **STATIC PASS** | Verified against Elementor Free **4.2.4** PHP source + Free catalog only |
| **BLOCKED** | Runtime import could not be executed in this environment |

**Runtime import validation: BLOCKED**  
**Static compatibility validation: STATIC PASS** (see test suite)

Do **not** treat STATIC PASS as runtime PASS.

## Exact versions / environment

| Item | Value |
|---|---|
| Target Elementor | **Free 4.2.4 only** (`ELEMENTOR_VERSION` / plugin header) |
| Source tree used for static checks | `/Users/nusratnova/Downloads/elementor` (or `ELEMENTOR_FREE_4_2_4_PATH`) |
| In-repo `./elementor` | **4.2.1 — must not be used** for Phase 10 |
| WordPress | **Not available** in this environment |
| PHP CLI | **Missing** |
| Docker | Client present; **daemon not running** |
| Elementor Pro | **Not installed / not used** |

### How to prepare a future runtime environment

When unblocking runtime import, prepare **exactly**:

1. WordPress (supported by Elementor Free 4.2.4; plugin requires WP ≥ 6.8 per Free 4.2.4 header)
2. Elementor Free **4.2.4** only (confirm `ELEMENTOR_VERSION` === `4.2.4`)
3. **No** Elementor Pro
4. A repeatable import path for classic JSON (`version: "0.4"`) into Elementor document data
5. Ability to re-read saved document data for round-trip semantic checks

Then replace `getRuntimeImportStatus()` with a real harness and change the status only when imports actually execute.

## What was tested (static)

Against Free **4.2.4** PHP source + converter catalog:

1. Free widget `get_name()` inventory includes MVP types:  
   `heading`, `text-editor`, `image`, `button`, `icon`, `divider`, `spacer`, `html`
2. Container element name is `container`
3. Breakpoint keys `tablet` / `mobile` exist in `core/breakpoints/manager.php`
4. HTML widget declares control `html`
5. Heading declares `title` / `header_size`
6. Phase 9 real-world generated documents:
   - catalog `validateElementorDocument` passes
   - `validateStaticElementorCompatibility` → **STATIC PASS**
   - no Pro widget types / no `__dynamic__` in converter output
7. Custom fallback: parent container + native siblings + HTML widget with scoped CSS
8. Unsupported nodes omitted from JSON, retained in report
9. Invalid Pro widget documents → **STATIC FAIL** / catalog reject

### Fixtures covered

| Case | Focus |
|---|---|
| `01-hero` | heading/text/button/image + custom link + responsive |
| `02-features` | icons + nested containers |
| `03-cta` | background + button + responsive |
| `04-navbar` | native + custom links (node-scoped) |
| `05-pricing` | divider/spacer + nested cards + responsive |
| `06-tailwind-heavy` | Tailwind-heavy result |
| `07-css-heavy` | CSS-heavy result |
| `08-mixed` | mixed styles |

Compatibility contracts live under `tests/converter/fixtures/compatibility/*/contract.json`  
(regenerate with `UPDATE_COMPAT_FIXTURES=1 npm run test:elementor`).

## Runtime tests (BLOCKED)

Not executed (do not claim PASS):

- Import into live Elementor editor/DB
- Widget recognition after editor load
- Post-import settings inspection in WP
- Live responsive preview devices
- Import → save → export round-trip
- Elementor’s own rejection UX for malformed JSON

## Round-trip

**BLOCKED** — no runtime. When available, require semantic preservation (types, hierarchy, important settings, fallback HTML, no Pro), not byte-identical JSON.

## Pro contamination

Static scan of converter output: **clean** (no Pro MVP denylist widgets, no `__dynamic__`).  
If a future runtime injects WP/Elementor metadata, distinguish runtime-injected fields from converter output.

## Bugs fixed

None required for compatibility — static validation against Free 4.2.4 source passed for generated fixtures.  
No silent output changes were made to “make a test pass.”

## Remaining limitations

- Runtime import/round-trip not available here
- Static control extraction from PHP is heuristic (`add_control` / `add_responsive_control`); group-control expanded IDs still rely on the curated Free catalog
- Visual/pixel comparison is explicitly out of scope (later phase)

## Commands

```bash
npm test
npx tsc --noEmit
npm run lint
npm run test:elementor   # static compat + explicit runtime BLOCKED assertion
```
