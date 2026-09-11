# Phase 13 — Project ZIP conversion layer

Incremental project layer on top of the existing section converter.
**`convertSource()` remains the conversion engine.** The project layer discovers,
packages, classifies dependencies, and orchestrates per-route conversion.

## Pipeline

```text
Project ZIP
  → secure extract (13a) → ProjectVirtualFS
  → framework + route discovery (13b)
  → per-route ConversionUnit → convertSource() (13c)
  → Project ZIP API / UI (13d)
  → dependency capability registry + static adapters (13e)
  → fixtures + integration/regression tests (13f)
```

## Guarantees

- **One route → one Elementor document** (never merge routes into a mega-document)
- **Elementor Free 4.2.4** classic JSON (`version: "0.4"`), container-only
- **Static-analysis-only**: no `npm install`, no `node_modules` loading, no
  execution of uploaded source or third-party packages, no `eval` / `vm`
- **Dynamic routes** stay as patterns (e.g. `/blog/[slug]`) — no invented URLs
- **No fake WordPress media IDs**
- Unsupported / unknown dependencies produce **explicit diagnostics**; unknown
  deps on one route do not poison unrelated routes
- Existing **`/api/convert`** and section-input behavior remain unchanged

## Supported discovery (static)

| Framework | Notes |
|-----------|--------|
| Next App Router | `app/**/page.*` + layouts |
| Next Pages Router | `pages/**` (API routes ignored) |
| Vite / CRA / plain React | SPA entry; optional static React Router paths |

## Dependency classification (13e)

Central registry classifies packages (`utility-only`, `supported-adapter`,
`visual-but-unsupported`, `dynamic/runtime-dependent`, `unknown`). Thin static
adapters exist for lucide-react and framer-motion; carousels/charts are
classified without engines.

## Deferred (Phase 14+)

- **14a (done in tree):** separate source vs binary ZIP admission limits — see [phase-14.md](./phase-14.md)
- Full path-alias resolution, CSS modules / SCSS compilation
- Chart/carousel/animation engines
- WordPress media upload, Elementor import, async jobs
- Automatic image compression (deferred until a real asset/media pipeline)
- Playwright project visual testing

## APIs

- `POST /api/project/analyze` — ZIP → framework + routes
- `POST /api/project/convert` — ZIP → `ProjectConversionResult` (per-route docs)

## Tests / fixtures

See `tests/converter/fixtures/project/` and:

- `project-zip-13a.test.ts`
- `project-structure-13b.test.ts`
- `project-convert-13c.test.ts`
- `tests/ui/project-api.test.ts` (13d)
- `project-deps-13e.test.ts`
- `project-fixtures-13f.test.ts`
