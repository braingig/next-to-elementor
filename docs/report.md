# Conversion Report & Pipeline Result

Status: Phase 7 (implemented)  
Schema: `lib/converter/report/schema.ts`  
Builder: `lib/converter/report/build.ts`  
API: `convert()` in `lib/converter/convert.ts`

See also: [phase-7.md](./phase-7.md), [unsupported-policy.md](./unsupported-policy.md).

## Goals

Every conversion returns a **machine-readable report** explaining what happened per node and overall.

The report is a first-class deliverable alongside Elementor JSON.

## `ConversionResult`

```ts
ConversionResult {
  outcome: "complete" | "partial" | "failed"
  catalogVersion: string          // catalog.version used
  elementorTarget: string         // catalog.elementorTarget used
  irVersion: string               // IR schema version
  elementorJson: unknown | null   // null when failed
  report: ConversionReport
}
```

### Outcome rules

| Outcome | `elementorJson` | Typical cause |
|---|---|---|
| `complete` | present | All nodes native/custom; no warning/error diagnostics |
| `partial` | present | Unsupported nodes and/or accuracy warnings/errors |
| `failed` | `null` | Cannot produce valid Free JSON |

**Any `unsupported` decision ⇒ at best `partial`.**  
**Any warning/error diagnostic ⇒ at best `partial`.**

## `ConversionReport`

| Field | Meaning |
|---|---|
| `summary` | Counts and short status |
| `nodes` | Per-node decision entries (**every IR node**) |
| `diagnostics` | Aggregated parse/style/conversion diagnostics |
| `freeCompliance` | Pro-scan / catalog gate results |

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
| `widgetType` | Elementor widget/container type when emitted |
| `reasonCode` | Required when `unsupported` |
| `message` | Human explanation |
| `provenance` | Optional shortened source info (never invented) |

### `diagnostics[]`

`severity`, `code`, `message`, optional `nodeId` / `loc`.

### `freeCompliance`

| Field | Meaning |
|---|---|
| `passed` | boolean |
| `violations` | list of `{ id, kind, message }` |

If `passed` is false, outcome must be `failed`.
