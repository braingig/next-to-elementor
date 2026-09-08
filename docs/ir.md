# Intermediate Representation (IR)

Status: Phase 0 contract  
Schema: `lib/converter/ir/schema.ts`

## Goals

The IR is an **Elementor-agnostic** semantic tree.

- Captures structure, content, and resolved style facts from React/JSX + CSS/Tailwind analysis.
- Does **not** encode Elementor widget types or settings.
- Is the only input to Free capability matching and conversion decisions (later phases).
- Must be deterministic and fully validatable with Zod.

## Design principles

1. **Semantic over presentational HTML** — prefer `heading` / `button` / `image` over raw `div` when role is clear; otherwise use `container` or `text`.
2. **Provenance required** — every node records enough source info to explain decisions in the report.
3. **No silent loss** — unresolved/dynamic/unknown inputs become diagnostics or `unsupported` nodes, never omitted facts.
4. **Decisions are not IR concerns** — conversion decision (`native` | `custom` | `unsupported`) is attached during conversion and reported separately; IR itself stays Elementor-agnostic. Optional `pendingDecision` is not stored on IR in MVP.

## Document shape

```ts
IrDocument {
  version: "0.1.0"           // IR schema version (semver string)
  meta: IrMeta
  root: IrNode               // single section/component root
  diagnostics: IrDiagnostic[] // parse/style issues discovered while building IR
}
```

### `IrMeta`

| Field | Type | Meaning |
|---|---|---|
| `sourceName` | string \| optional | Original file or section name |
| `sourceLanguage` | `"tsx" \| "jsx" \| "unknown"` | Input dialect |
| `createdAt` | ISO string \| optional | Set by pipeline later; optional in hand-authored fixtures |

## Node kinds (`IrNodeKind`)

| Kind | Purpose |
|---|---|
| `container` | Layout wrapper (flex/block/grid intent) |
| `heading` | Heading content (`h1`–`h6` or role-equivalent) |
| `text` | Paragraph / rich text / inline text block |
| `image` | Image asset reference |
| `button` | Button-like control (submit or styled CTA) |
| `link` | Hyperlink that is not classified as `button` |
| `list` | Ordered/unordered list |
| `list-item` | Single list item |
| `spacer` | Intentional empty vertical/horizontal space |
| `divider` | Visual separator rule |
| `icon` | Icon graphic (SVG/font/image icon) |
| `html-embed` | Explicit raw HTML island already present in source |
| `group` | Logical grouping without strong layout semantics |
| `unsupported` | Node that cannot be represented accurately even later |

Every node has:

| Field | Meaning |
|---|---|
| `id` | Stable string id within the document |
| `kind` | One of `IrNodeKind` |
| `children` | Child nodes (empty for leaves) |
| `props` | Kind-specific props (see below) |
| `style` | Resolved style object (may be empty) |
| `provenance` | Source mapping |
| `notes` | Optional human/machine notes |

## Kind-specific props (summary)

### `container` / `group`

- `as`: optional original tag (`div`, `section`, `main`, …)
- `role`: optional ARIA role if statically known

### `heading`

- `level`: 1–6
- `text`: plain text (static)
- `html`: optional static rich HTML if required (mutually documented with text policy later)

### `text`

- `text`: plain text
- `html`: optional static HTML fragment when formatting requires it

### `image`

- `src`: string URL or project-relative path
- `alt`: string
- `width` / `height`: optional numbers
- `decorative`: optional boolean

### `button`

- `text`: label
- `href`: optional (link-styled button)
- `type`: `"button" \| "submit" \| "reset" \| "link"` when known
- `target`: optional (`_blank`, …)
- `rel`: optional

### `link`

- `text` or children for complex labels
- `href`
- `target` / `rel`

### `list`

- `listType`: `"ul" \| "ol"`

### `list-item`

- `text` optional if children carry content

### `spacer`

- `axis`: `"y" \| "x"`
- `size`: optional resolved length hint

### `divider`

- no required props beyond style

### `icon`

- `name` or `svg` or `src` (exactly one representation preferred; schema allows optional fields with later validation rules)

### `html-embed`

- `html`: static HTML string

### `unsupported`

- `reasonCode`: from unsupported taxonomy
- `message`: human-readable explanation
- `originalSummary`: short description of what was found (tag/component name, etc.)

## Style model (`IrStyle`)

Resolved, Elementor-agnostic style facts. Values are normalized CSS-ish strings or structured enums—not Tailwind class names.

Top-level groups:

- `box`: width, height, min/max, margin, padding
- `layout`: display, flex direction/wrap/gap/align/justify, grid (subset), overflow
- `typography`: font family/size/weight/style, line-height, letter-spacing, text-align, text-decoration, text-transform, color
- `background`: color, image, size, position, repeat
- `border`: widths, styles, colors, radii
- `position`: position mode, offsets, z-index
- `effects`: opacity, box-shadow (subset), transform (subset), transition/animation **flags only** in MVP
- `responsive`: map of breakpoint id → partial `IrStyle` overrides (`sm`, `md`, `lg`, `xl`, `2xl`)

### Unknown / unresolved styles

Do not invent values. Record diagnostics:

- `unknown-tailwind-class`
- `unknown-css-property`
- `dynamic-style`
- `unsupported-selector`

## Provenance (`IrProvenance`)

| Field | Meaning |
|---|---|
| `sourcePath` | optional file path |
| `loc` | optional `{ line, column, endLine?, endColumn? }` |
| `componentName` | optional React component name |
| `htmlTag` | optional original tag |
| `classNames` | original class list as observed |
| `inlineStyleRaw` | optional raw inline style string |

## Diagnostics (`IrDiagnostic`)

| Field | Meaning |
|---|---|
| `severity` | `error` \| `warning` \| `info` |
| `code` | stable machine code |
| `message` | human-readable |
| `nodeId` | optional related IR node |
| `loc` | optional source location |

## Non-goals for IR (MVP)

- Runtime React state, hooks, context
- Executing user code to discover rendered output
- Elementor widget IDs or settings
- Pixel-perfect animation timelines
- Full CSS cascade fidelity for arbitrary stylesheets
