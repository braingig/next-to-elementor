# Conversion Report & Pipeline Result

Status: Phase 0 contract  
Schema: `lib/converter/report/schema.ts`

## Goals

Every conversion returns a **machine-readable report** explaining what happened per node and overall.

The report is a first-class deliverable alongside Elementor JSON.

## `ConversionResult`

```ts
ConversionResult {
  outcome: "success" | "partial" | "failed"
  catalogVersion: string          // catalog.version used
  elementorTarget: string         // catalog.elementorTarget used
  irVersion: string               // IR schema version
  elementorJson: unknown | null   // null when failed; shape fixed in Phase 9
  report: ConversionReport
}
```

### Outcome rules

| Outcome | `elementorJson` | Typical cause |
|---|---|---|
| `success` | present | All nodes native/custom; no unsupported gaps |
| `partial` | present | JSON usable, but unsupported nodes/gaps recorded |
| `failed` | `null` | Cannot produce valid Free JSON |

Exact thresholds for `success` vs `partial` (e.g. warnings-only) remain: **any `unsupported` decision ⇒ at best `partial`**.

## `ConversionReport`

| Field | Meaning |
|---|---|
| `summary` | Counts and short status |
| `nodes` | Per-node decision entries |
| `diagnostics` | Pipeline-wide warnings/errors (unknown classes, parse issues, …) |
| `freeCompliance` | Pro-scan / catalog gate results |
| `timings` | optional; omitted in Phase 0 usage |

### `summary`

- `totalNodes`
- `nativeCount`
- `customCount`
- `unsupportedCount`
- `warningCount`
- `errorCount`
- `message`: short human summary

### `nodes[]` (`ReportNodeEntry`)

| Field | Meaning |
|---|---|
| `nodeId` | IR node id |
| `irKind` | IR kind |
| `decision` | `native` \| `custom` \| `unsupported` |
| `widgetType` | Elementor widget/container type when native/custom emit chosen; optional |
| `reasonCode` | Required when `unsupported`; optional otherwise for fallback rationale |
| `message` | Human explanation |
| `provenance` | Optional shortened source info |

### `diagnostics[]`

Same spirit as IR diagnostics: `severity`, `code`, `message`, optional `nodeId` / `loc`.

### `freeCompliance`

| Field | Meaning |
|---|---|
| `passed` | boolean |
| `violations` | list of `{ id, kind, message }` denylist/catalog violations |

If `passed` is false, outcome must be `failed` (or emit must refuse JSON). This is a hard gate.

## Non-goals for Phase 0

- Generating reports from real conversions
- UI rendering of reports
- Persisting reports to a database
