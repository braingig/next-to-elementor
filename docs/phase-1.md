# Phase 1 — Elementor Free Capability Catalog

Status: **implemented for Elementor Free 4.2.4 (classic JSON)**  
Scope: versioned Free catalog data + loader + Free/Pro compliance gates. **No conversion engine.**

## Target (approved research)

| Pin | Value |
|---|---|
| Elementor Free | `4.2.4` |
| Document JSON | classic `version: "0.4"` |
| Layout | container-only (no section/column emission) |
| Emission model | `classic-json` (not Atomic V4) |

## Layout on disk

```text
lib/converter/catalog/
  schema.ts
  load.ts
  compliance.ts
  index.ts
  elementor-free/4.2.4/
    meta.json
    breakpoints.json
    global-controls.json
    pro-denylist.json
    unverified.json
    widgets/*.json
```

## Loading rules

- `loadElementorFreeCatalog("4.2.4")` is the only supported target today.
- Unknown versions **throw** — no silent fallback to another catalog.
- Assembled catalog is validated with `ElementorFreeCatalogSchema`.

## Compliance gates

`checkFreeCompliance` / `canUseWidget` / `canUseControl` reject:

- Pro denylisted widgetTypes / controls / features
- Unknown widgets (fail closed)
- Unknown controls for a widget (fail closed)
- Legacy `section` / `column`
- `__dynamic__` / dynamic-looking values
- Custom CSS / Custom Attributes keys

## Source of truth

Inspected Free sources from `elementor/elementor@4.2.4` (GitHub tag), plus official Pro vs Free / Advanced / Developers data-structure docs from the pre–Phase 1 research report.

## Explicitly unfinished

See `elementor-free/4.2.4/unverified.json` — do not invent missing control keys.

## Next phase

**Phase 2** — IR fixture corpus / IR schema exercises (still no conversion engine unless the roadmap says otherwise).
