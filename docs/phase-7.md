# Phase 7 — Unsupported Handling + Conversion Report

Status: **complete for review**  
Code: `lib/converter/report/`, `lib/converter/convert.ts`  
Contracts: `lib/converter/types/decisions.ts`, `lib/converter/report/schema.ts`

## Goal

Make every conversion **fully explicit**: every IR node receives a final decision
(`native` | `custom` | `unsupported`), unsupported nodes are omitted from Elementor
JSON (never faked), and diagnostics from parse → styles → native → custom are
aggregated into a deterministic report.

## Decision order (unchanged)

```text
Accurate Elementor Free native
  → else node-scoped custom HTML
  → else unsupported (+ reason code + message)
```

Parents are never promoted to custom solely because a child is unsupported or custom.

## High-level API

```ts
import { convert } from "@/lib/converter";

const result = convert(styledIr, {
  catalogTarget: "4.2.4",
  title: "Hero",
});

// result.elementorJson — classic document or null when failed
// result.report       — per-node decisions + diagnostics + summary
// result.outcome      — complete | partial | failed
```

Lower-level APIs remain:

| API | Role |
|---|---|
| `convertToNativeElementor` | Phase 5 native only (`needs-fallback` still present) |
| `convertToElementor` | Phase 6 native + custom (no full report) |
| `convert` | Phase 7 JSON + report |

## Outcome status

| Status | Meaning |
|---|---|
| `complete` | Valid JSON; every node `native` or `custom`; no warning/error diagnostics |
| `partial` | Valid JSON; one or more unsupported nodes **or** accuracy warnings/errors |
| `failed` | No valid Free document (`elementorJson: null`) |

Deterministic: same IR + catalog ⇒ same outcome, JSON, and report.

## Report structure

```ts
ConversionResult {
  outcome: "complete" | "partial" | "failed"
  catalogVersion: string
  elementorTarget: string
  irVersion: string
  elementorJson: ElementorDocument | null
  report: {
    summary: {
      totalNodes, nativeCount, customCount, unsupportedCount,
      warningCount, errorCount, message
    }
    nodes: ReportNodeEntry[]   // one entry per IR node
    diagnostics: ReportDiagnostic[]
    freeCompliance: { passed, violations }
  }
}
```

### `ReportNodeEntry`

| Field | Notes |
|---|---|
| `nodeId`, `irKind` | From IR |
| `decision` | `native` \| `custom` \| `unsupported` |
| `widgetType` | When emitted |
| `reasonCode` | **Required** when unsupported |
| `message` | Human-readable |
| `provenance` | `sourcePath`, `loc`, `componentName`, `htmlTag` when known (never invented) |

Children serialized inside a parent custom HTML widget are still listed as
`decision: "custom"` with message `Included in parent custom HTML fallback (…)`.

### Diagnostics

```ts
{ severity: "info" | "warning" | "error", code, message, nodeId?, loc? }
```

Sources unified:

- Phase 3 parser/analyzer (`ir.diagnostics`)
- Phase 4 style resolver
- Phase 5/6 conversion (unsupported → error diagnostic)
- Native style-loss warnings (e.g. unmapped `transform`)
- Free compliance violations

## Reason codes (preferred)

| Code | Use |
|---|---|
| `unsupported-node-kind` | IR kind has no conversion path |
| `dynamic-content` | Runtime / non-static values |
| `dynamic-children` | Non-static children (`.map`, etc.) |
| `unknown-component` | Unknown React component |
| `unsupported-css` | CSS fact cannot be represented |
| `unresolved-style` | CSS variable / style token unresolved |
| `unsafe-html` | Rejected markup / event handlers |
| `unsafe-url` | Rejected URL protocol |
| `unsupported-interaction` | Interaction beyond MVP |
| `insufficient-source-information` | Missing coverage / incomplete IR |
| `native-mapping-unavailable` | No accurate Free native mapping |
| `custom-fallback-unavailable` | Custom HTML path also cannot preserve accurately |

Legacy codes (`semantic-ambiguous`, `unsafe-custom`, `unknown-css`, …) remain
accepted for IR compatibility; the report normalizes several to preferred codes.

## Unsupported in JSON

Unsupported nodes are **omitted** from Elementor JSON. Do not emit empty
containers, text, buttons, or generic HTML as stand-ins unless conversion rules
already prove that representation is accurate.

Siblings and valid ancestors remain.

## Accuracy guarantees

The system guarantees **deterministic behavior for supported constructs**, not
arbitrary React/Next.js visual equivalence.

If a node is emitted as native/custom but important style/behavior is lost,
a **warning** diagnostic is recorded and outcome becomes at best `partial`.

## What this phase does not do

- Visual regression testing
- AI conversion
- Repo-wide scanning
- Executing user code
- Elementor Pro support
- New conversion strategies beyond native → custom → unsupported

Phase 8 orchestrates this report through `convertSource()` — see [phase-8.md](./phase-8.md).
