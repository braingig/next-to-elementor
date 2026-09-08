# Intermediate Representation (IR)

Status: **Phase 2** (schema + fixture corpus)  
Schema: `lib/converter/ir/schema.ts`  
Version: `0.2.0`  
Fixtures: `tests/converter/fixtures/ir/`

## What the IR is

The Intermediate Representation is an **Elementor-agnostic semantic tree**.

It sits between source analysis and Elementor emission:

```text
React / JSX / TSX  →  IR  →  Elementor Free JSON
```

Phase 2 defines and validates the IR only. It does **not** parse JSX or emit Elementor JSON.

## Why it exists

1. **Decouple source from target** — React structure/styles are captured once; Elementor mapping happens later against the Free catalog.
2. **Deterministic decisions** — conversion rules operate on a validated tree, not ad-hoc AST fragments.
3. **No silent loss** — unsupported or uncertain facts are explicit nodes/diagnostics, never dropped.
4. **Testable corpus** — fixtures exercise IR shape without needing Elementor output yet.

## Document shape

```ts
IrDocument {
  version: "0.2.0"
  meta: IrMeta
  root: IrNode
  diagnostics: IrDiagnostic[]
}
```

| Field | Meaning |
|---|---|
| `version` | IR schema version (`0.2.0` for Phase 2) |
| `meta.sourceName` | Optional file / section name |
| `meta.sourceLanguage` | `tsx` \| `jsx` \| `unknown` |
| `meta.createdAt` | Optional ISO timestamp |
| `root` | Single section/component root node |
| `diagnostics` | Parse/style/ambiguity issues found while building IR |

## Supported node kinds

| Kind | Purpose |
|---|---|
| `container` | Layout wrapper (flex/block/grid intent) |
| `heading` | Heading content (`h1`–`h6` or role-equivalent) |
| `text` | Paragraph / rich text / inline text block |
| `image` | Image asset reference |
| `button` | Button-like control (submit or styled CTA) |
| `link` | Hyperlink not classified as `button` |
| `list` / `list-item` | Lists (available; not required in every MVP fixture) |
| `spacer` | Intentional empty space |
| `divider` | Visual separator |
| `icon` | Icon graphic (`name` / `svg` / `src`) |
| `html-embed` | Explicit static HTML island |
| `group` | Logical grouping without strong layout semantics |
| `unsupported` | Cannot be represented accurately without guessing |

Every node shares:

| Field | Meaning |
|---|---|
| `id` | Stable id within the document |
| `kind` | One of the kinds above |
| `status` | `ok` (default) or `uncertain` |
| `uncertainty` | Required message when `status` is `uncertain` |
| `props` | Kind-specific props |
| `style` | Source-oriented style facts (may be empty) |
| `provenance` | Source mapping / classes / attributes |
| `notes` | Optional free-form notes |
| `children` | Nested nodes (order is layout-significant) |

### Kind-specific props (summary)

- **container / group** — `as?`, `role?`
- **heading** — `level` (1–6), `text`, `html?`
- **text** — `text`, `html?`
- **image** — `src`, `alt`, `width?`, `height?`, `decorative?`
- **button** — `text`, `href?`, `type?`, `target?`, `rel?`
- **link** — `href`, `text?`, `target?`, `rel?`
- **list** — `listType`: `ul` \| `ol`
- **list-item** — `text?`
- **spacer** — `axis`: `y` \| `x`, `size?`
- **divider** — no required props
- **icon** — `name?`, `svg?`, `src?`
- **html-embed** — `html`
- **unsupported** — `reasonCode`, `message`, `originalSummary?`

## Structure and nesting

Nodes form a tree. Containers may nest arbitrarily:

```text
container
  └─ container
       ├─ heading
       ├─ text
       └─ button
```

Child **order is significant** and is preserved by normalization.

## Styles

`IrStyle` stores **source-oriented** CSS-ish facts. Values are plain strings (e.g. `"16px"`, `"flex"`, `"#0f766e"`).

They are **not**:

- Elementor control values
- Elementor settings objects
- Guaranteed fully resolved CSS cascade

Groups:

| Group | Examples |
|---|---|
| `box` | width/height/min/max, margin, padding |
| `layout` | display, flex\*, gap, grid templates, overflow |
| `typography` | font\*, line-height, text-align, color |
| `background` | color, image, size, position, repeat |
| `border` | width, style, color, radii |
| `position` | position mode, offsets, z-index |
| `effects` | opacity, box-shadow, transform; transition/animation **flags only** |

Unresolved classes or CSS should become **diagnostics**, not invented style values.

## Responsive styles

- **Base / desktop** styles live on the node `style` object itself.
- Overrides live under `style.responsive[<breakpoint>]` as partial `IrStyle` objects.
- Recommended keys: `sm`, `md`, `lg`, `xl`, `2xl` (Tailwind-aligned).
- The schema accepts **any non-empty string key** so additional breakpoints can be added later without a hard break.

Typical mapping for later Elementor work (not stored in IR):

| IR | Intent |
|---|---|
| base `style` | desktop |
| `responsive.md` | tablet-ish |
| `responsive.sm` | mobile-ish |

## Provenance / metadata

| Field | Meaning |
|---|---|
| `sourcePath` | Optional file path |
| `loc` | Optional `{ line, column, endLine?, endColumn? }` |
| `componentName` | Optional React component name |
| `htmlTag` | Optional original tag |
| `classNames` | Observed class tokens (CSS and/or Tailwind), **source-oriented** |
| `inlineStyleRaw` | Raw inline `style` attribute string when present |
| `attributes` | Static string HTML attributes (`id`, `loading`, `data-*`, …) |

## Unsupported and uncertain states

| Mechanism | When |
|---|---|
| `kind: "unsupported"` | Node cannot be represented accurately; includes `reasonCode` + `message` |
| `status: "uncertain"` | Node kind is provisional; must include `uncertainty.message` |
| `diagnostics[]` | Property-level / document-level issues (unknown Tailwind, unresolved CSS, etc.) |

Reason codes come from `UnsupportedReasonCode` in `lib/converter/types/decisions.ts` (see [unsupported-policy.md](./unsupported-policy.md)).

**Never** silently approximate missing semantics in the IR.

## Normalization

`normalizeIrDocument()` / `canonicalizeIrJson()` in `lib/converter/ir/normalize.ts`:

- Apply Zod defaults via parse
- Preserve child order
- Sort unordered facts: `classNames`, `notes`, `diagnostics`, attribute keys, responsive keys
- Drop empty style groups / empty responsive overrides
- Produce a stable JSON form for equality checks

## Examples

Minimal heading:

```json
{
  "version": "0.2.0",
  "root": {
    "id": "heading-1",
    "kind": "heading",
    "props": { "level": 1, "text": "Welcome" },
    "children": []
  }
}
```

Uncertain + unsupported siblings:

```json
{
  "version": "0.2.0",
  "root": {
    "id": "section-root",
    "kind": "container",
    "props": { "as": "section" },
    "children": [
      {
        "id": "uncertain-widget",
        "kind": "group",
        "status": "uncertain",
        "uncertainty": {
          "reasonCode": "semantic-ambiguous",
          "message": "Role is ambiguous without guessing."
        },
        "props": { "as": "div" },
        "children": []
      },
      {
        "id": "unsupported-carousel",
        "kind": "unsupported",
        "props": {
          "reasonCode": "interaction-unsupported",
          "message": "Interactive carousel cannot be represented accurately in MVP."
        },
        "children": []
      }
    ]
  }
}
```

See `tests/converter/fixtures/ir/` for the full corpus.

## What must NOT be stored in the IR

- `elType`, `widgetType`, Elementor control IDs, or Elementor `settings` shapes
- Conversion decisions (`native` / `custom` / `unsupported` as emit decisions)
- Catalog references or Pro/Free capability claims
- Runtime React state, hooks, context, or executed user code
- Pixel-perfect animation timelines
- Guarantees of full CSS cascade fidelity

## Phase 2 fixture corpus

| Fixture | Covers |
|---|---|
| `simple-heading.json` | Heading |
| `paragraph.json` | Text |
| `image.json` | Image + attributes |
| `button.json` | Button/link CTA |
| `icon.json` | Icon |
| `divider.json` | Divider |
| `spacer.json` | Spacer |
| `nested-containers.json` | Nested containers + children |
| `flex-layout.json` | Flex layout styles |
| `responsive-styles.json` | Base + `sm`/`md` overrides |
| `inline-styles.json` | `inlineStyleRaw` + resolved style subset |
| `css-classes.json` | CSS class provenance |
| `tailwind-classes.json` | Tailwind classes + unknown-class diagnostic |
| `unsupported-ambiguous.json` | Uncertain, unsupported, html-embed |

## API surface

```ts
import {
  IrDocumentSchema,
  parseIrDocument,
  normalizeIrDocument,
  canonicalizeIrJson,
  IR_SCHEMA_VERSION,
} from "@/lib/converter";
```

## Out of scope (later phases)

- JSX/TSX parsing → IR builders
- Tailwind/CSS resolution engines
- IR → Elementor Free conversion
- Elementor JSON emission / custom HTML fallbacks
