# Phase 8 — End-to-End Pipeline + Final Validation

Status: **complete for review**  
Code: `lib/converter/convert-source.ts`, `lib/converter/emit/document.ts`

## Goal

Provide one public orchestrator that runs the full conversion pipeline without
adding new conversion capabilities:

```text
React/TSX
  → analyzeReactSource (Phase 3)
  → resolveStyles (Phase 4)
  → convert (Phase 5–7: native → custom → unsupported + report)
  → final Free validation / canonicalize
  → { elementorJson, report }
```

## Public API

```ts
import { convertSource } from "@/lib/converter";

const result = convertSource({
  source,
  language: "tsx",
  css,
});

if (result.outcome === "complete") {
  // result.elementorJson is valid classic Elementor Free JSON (version 0.4)
}
```

Folder / multi-file sections (engine-level only; UI/API not wired yet) use
`convertSectionInput` / `resolveSectionInput` — see [section-input.md](./section-input.md).

> Note: overall status lives on `result.outcome` (`complete` | `partial` | `failed`),
> not on `result.report`.

### Options

| Option | Meaning |
|---|---|
| `source` | JSX/TSX source string |
| `language` | `tsx` \| `jsx` \| `auto` |
| `css` | Explicit CSS string(s) — **not** a repo scan |
| `resolveTailwind` / `resolveInline` | Style resolution toggles (default true) |
| `knownComponentSources` | Same-analysis component sources (static only) |
| `componentName` / `sourcePath` / `sourceName` | Analyzer hints |
| `catalog` / `catalogTarget` | Free catalog (default `4.2.4`) |
| `title` | Document title |

### Preferred exports

- `convertSource` — end-to-end
- `convert` — styled IR → JSON + report
- `analyzeReactSource` — React → IR
- `resolveStyles` — style resolution

Lower-level APIs remain: `convertToNativeElementor`, `convertToElementor`, etc.

## Outcome vocabulary (intentional dual)

| API | Outcomes |
|---|---|
| `convertToNativeElementor` / `convertToElementor` | `success` \| `partial` \| `failed` |
| `convert` / `convertSource` (Phase 7+ report) | `complete` \| `partial` \| `failed` |

Do **not** rename lower-level `success` for consistency.

## Shared emit helpers

Duplicated document assembly was extracted to `lib/converter/emit/document.ts`:

- `flattenDecisions`
- `toElementorElement`

Native and custom converters both use these helpers (behavior unchanged).

## Final validation

Before returning non-null `elementorJson`, the pipeline re-checks:

- document `version: "0.4"`
- `elType` container/widget
- Free 4.2.4 widgets/controls only (`checkFreeCompliance`)
- no Pro IDs, no `__dynamic__`
- valid nested `elements`

Invalid documents are forced to `outcome: "failed"` with `elementorJson: null`.

## Failure handling

Parse errors, option errors, and conversion crashes return a structured
`ConversionResult` (`failed`, `elementorJson: null`, error diagnostic).
The process does not throw for ordinary bad inputs.

## Determinism

IDs use the existing SHA1-derived Elementor id strategy. No timestamps,
UUIDs, or environment-dependent fields. Equivalent inputs → identical
canonicalized JSON and reports.

## What this phase does not do

- Elementor Pro
- AI
- Executing user code
- Repository-wide scanning / filesystem imports
- Full Tailwind JIT
- Visual regression testing (later)
- Changing native → custom → unsupported decision order
