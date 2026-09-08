# Elementor Free Capability Catalog

Status: Phase 1 implemented for **Elementor Free 4.2.4** (classic JSON)  
Schema: `lib/converter/catalog/schema.ts`  
Data: `lib/converter/catalog/elementor-free/4.2.4/`  
Loader: `lib/converter/catalog/load.ts`  
Compliance: `lib/converter/catalog/compliance.ts`

## Goals

A **versioned** catalog describing what Elementor **Free** can represent accurately enough for native emission.

The converter must:

- Only emit widgets/controls listed as Free-allowed for the target catalog version.
- Reject Pro-only widgets/features (fail closed).
- Never invent Pro dependencies.
- Never silently fall back to another Elementor target version.

## MVP pins (4.2.4)

| Pin | Value |
|---|---|
| `elementorTarget` | `4.2.4` |
| `elementorDocumentVersion` | `0.4` |
| `emissionModel` | `classic-json` |
| `layoutPolicy` | `container-only` |

## Catalogued MVP widgets

`container`, `heading`, `text-editor`, `image`, `button`, `icon`, `divider`, `spacer`, `html`

## Loading

```ts
import { loadElementorFreeCatalog } from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");
```

Unknown targets throw.

## Pro denylist

See `elementor-free/4.2.4/pro-denylist.json` for widgets, controls (`custom_css`, `_attributes`, `__dynamic__`), and features (Theme Builder, dynamic tags, popups, legacy section/column, Atomic emission, etc.).

## Unverified / TODO

See `elementor-free/4.2.4/unverified.json`. Do not guess missing control keys.

## Non-goals (still)

- Conversion / JSX mapping
- Exhaustive control coverage for every Free widget
- Atomic Editor V4 emission
- Auto-scraping Elementor releases
