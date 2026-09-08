# Phase 9 — Real-World Fixture & Accuracy Validation

Status: **complete for review**  
Fixtures: `tests/converter/fixtures/real-world/`  
Tests: `tests/converter/phase9-real-world.test.ts`

## Goal

Validate the existing converter against realistic **single-section** React examples
before adding more conversion features.

This is **source-level validation**, not pixel-perfect browser / visual regression testing.

## Methodology

1. Author representative section fixtures (source + optional CSS + meta).
2. Run `convertSource` three times; require identical JSON + report.
3. Compare against checked-in `golden.json` contracts (outcome, decisions, diagnostic codes, element tree keys).
4. Classify results as `complete` / `partial` / `failed`.
5. For every `partial`, decide whether the gap is honest unsupported behavior or an implementation bug.
6. Fix **only** small isolated bugs exposed by fixtures; add regression coverage.

Regenerate goldens (when intentionally changing contracts):

```bash
UPDATE_GOLDENS=1 npm test -- --run tests/converter/phase9-real-world.test.ts
```

## Fixture corpus

| ID | Section | Typical outcome | Why |
|---|---|---|---|
| `01-hero` | Hero | **complete** | Heading, text, CTA button, image, responsive flex; docs link → custom |
| `02-features` | Feature cards | **partial** | Named SVG icons emit `semantic-ambiguous` (SVG payload still provisional) |
| `03-cta` | CTA band | **complete** | Background, typography, button, responsive padding |
| `04-navbar` | Header/nav | **complete** | Image + button native; nav links node-scoped custom |
| `05-pricing` | Pricing cards | **partial** | `shadow-*` → IrStyle `boxShadow` not mapped to Free native controls → `unsupported-css` |
| `06-tailwind-heavy` | Tailwind utilities | **partial** | Deliberate `unknown-utility-xyz` → `unknown-tailwind-class` |
| `07-css-heavy` | External CSS | **complete** | Class/descendant selectors + media queries; CSS class names not mislabeled as Tailwind |
| `08-mixed` | TW + CSS + inline | **partial** | Inline `letterSpacing` not mapped natively → `unsupported-css` |

### Counts (current goldens)

- **complete:** 4
- **partial:** 4
- **failed:** 0

Partial is **not** treated as a product failure when the source genuinely includes unsupported or provisional behavior — honesty and determinism are the bar.

## Native mappings validated

Exercised via fixtures/audits:

| Mapping | Status |
|---|---|
| container layout (flex/gap/align/responsive) | validated |
| heading | validated |
| text-editor | validated |
| image | validated |
| button (`role="button"` anchors) | validated |
| icon (named via `data-icon`) | validated (with provisional SVG warning) |
| divider (`hr`) | validated |
| spacer (`data-spacer`) | validated |
| HTML custom (`link`) | validated node-scoped |

Controls remain catalog-gated (Free 4.2.4 only).

## Custom fallback validated

- Navbar/hero links → Free `html` widget only for those nodes
- Parent stays `container`
- Native siblings remain native
- No parent promotion

## Style / Tailwind validated

- Margin/padding/flex/gap/alignment/typography/color/background/border/radius/responsive
- Shadow and letter-spacing: **reported**, not silently dropped
- Known utilities resolve (including `w-1/2`, `border-b`)
- Unknown utilities → `unknown-tailwind-class`
- Stylesheet class hooks are **not** falsely reported as unknown Tailwind

## Bugs fixed in Phase 9

1. **False `unknown-tailwind-class` for CSS classes** — class tokens present in provided CSS selectors no longer warn as missing Tailwind utilities.
2. **Missing common width fractions** — curated map now resolves `w-1/2`, `w-1/3`, …
3. **Missing side border utilities** — curated map now resolves `border-b` / `border-t` / `border-r` / `border-l` (and numeric variants).

Each fix is covered by Phase 9 / styles regression expectations.

## Deliberately unsupported / limited (not expanded)

- Full SVG markup capture for icons (provisional placeholder; named icons use FA-style native path)
- Mapping CSS `box-shadow` strings into Elementor `box_shadow` controls
- Mapping `letter-spacing` / `text-decoration` into Free native typography controls
- Interactive navbar behavior (menus, click handlers)
- Full Tailwind JIT / arbitrary plugin ecosystem
- Pixel-level browser visual regression

## Guarantees restated

The system guarantees **deterministic behavior for supported constructs**, not arbitrary React/Next visual equivalence.

Do not weaken unsupported handling to force every fixture to `complete`.
