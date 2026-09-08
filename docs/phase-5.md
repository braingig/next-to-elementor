# Phase 5 — Native Elementor Free Conversion

Status: **complete for review**  
Catalog: Elementor Free **4.2.4** (classic JSON `version: "0.4"`)  
Code: `lib/converter/rules/native/`, `lib/converter/emit/`

## Goal

Convert **styled IR** into **native Elementor Free** container/widget JSON.

```text
Styled IR
  → native conversion decision (catalog-gated)
  → Elementor node model
  → classic JSON emit + compliance validation
```

No Pro widgets/controls. No Atomic V4. Custom HTML fallback is Phase 6 (`convertToElementor`).

## API

```ts
import {
  convertToNativeElementor,
  validateElementorDocument,
  canonicalizeElementorJson,
} from "@/lib/converter";

const result = convertToNativeElementor(styledIr, {
  catalogTarget: "4.2.4",
  title: "Hero",
});

// result.document — classic Elementor JSON when compliance passes
// result.decisions — per-node native | needs-fallback | unsupported
// result.outcome — success | partial | failed
```

## Architecture

| Layer | Role |
|---|---|
| `rules/native/widgets/*` | IR kind → Free widget mapping |
| `rules/native/styles/*` | IrStyle → catalog control values |
| `rules/native/convert.ts` | Tree walk + document assembly |
| `emit/validate.ts` | `checkFreeCompliance` over emitted tree |

Capability truth comes **only** from `loadElementorFreeCatalog("4.2.4")` — converters call `canUseControl` / `canUseWidget` and never invent control IDs.

## Strategies

| Strategy | Meaning |
|---|---|
| `native` | Emitted as Free container/widget |
| `needs-fallback` | Accurate Free native mapping unavailable; reserved for Phase 6 custom |
| `unsupported` | Cannot represent accurately (report + omit from emit tree) |

## Native widgets (MVP)

| IR kind | Elementor |
|---|---|
| `container` / clear `group` | `elType: container` |
| `heading` | `heading` |
| `text` | `text-editor` |
| `image` | `image` (URL media; **no** fake attachment ids) |
| `button` | `button` |
| `icon` (named only) | `icon` |
| `divider` | `divider` |
| `spacer` | `spacer` |
| `html-embed` | `html` (explicit embeds only) |

**Not** silently mapped:

| IR kind | Phase 5 behavior |
|---|---|
| `link` | `needs-fallback` (Button would change semantics) |
| `icon` without `name` | `needs-fallback` (SVG → later) |
| `list` / `list-item` | `needs-fallback` |
| uncertain groups | `needs-fallback` |
| `unsupported` IR nodes | `unsupported` |

## Style mapping

Source-oriented `IrStyle` → Elementor settings **only** when the control exists in the catalog:

- Flex: `container_type`, `flex_direction`, `flex_justify_content`, `flex_align_items`, `flex_gap`, `flex_wrap`
- Spacing: `padding` / `margin` (container) or `_padding` / `_margin` (widgets)
- Background / border / radius (catalog ids)
- Typography group fields + widget colors (`title_color`, `text_color`, `button_text_color`, …)
- Lengths → `{ unit, size }` or DIMENSIONS / GAPS objects

Unknown CSS facts are skipped (not copied as raw CSS into settings).

## Responsive mapping

Using catalog `breakpoints.json`:

| IR | Elementor |
|---|---|
| base (+ `lg`/`xl`/`2xl` if present) | unsuffixed keys |
| `md` | `_*_tablet` |
| `sm` | `_*_mobile` |

Only controls marked `responsive: true` in the catalog receive suffixes.

## Validation

After emit, every element is checked with `checkFreeCompliance`:

- valid `elType` / `widgetType`
- no Pro denylist ids
- no unknown controls
- no `__dynamic__`
- document `version === "0.4"`

## Document shape

```json
{
  "version": "0.4",
  "title": "…",
  "type": "page",
  "content": [
    {
      "id": "…",
      "elType": "container",
      "settings": { "container_type": "flex", "…" },
      "elements": [
        {
          "id": "…",
          "elType": "widget",
          "widgetType": "heading",
          "settings": { "title": "…", "header_size": "h1" },
          "elements": []
        }
      ]
    }
  ]
}
```

## Known limitations

- Links are not forced into Button
- Named icons assume Font Awesome solid (`fas fa-{name}`) — imperfect but explicit; unnamed SVG deferred
- Image uses external/URL media object without WP attachment ids
- List widgets / nested Free modules not in MVP native set
- Hover/focus styles not mapped (IR does not model them as Elementor hover tabs yet)
- Custom HTML fallback is **not** implemented (Phase 6)

## Tests

`tests/converter/native.test.ts` — widgets, nesting, responsive, compliance, determinism, negative cases.
