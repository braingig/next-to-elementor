# Phase 6 — Node-Level Custom Fallback

Status: **complete for review**  
Catalog: Elementor Free **4.2.4** (classic JSON `version: "0.4"`)  
Code: `lib/converter/rules/custom/`

## Goal

For IR nodes that Phase 5 cannot map accurately to Free native widgets, attempt a
**node-scoped** Free `html` widget fallback. Never promote an entire section /
container to custom code because one child needs fallback.

```text
IR node
  → native converter
  → if needs-fallback
  → custom fallback (Free html widget)
  → if not safely/accurately possible
  → unsupported (clear reason)
```

## API

```ts
import { convertToElementor } from "@/lib/converter";

const result = convertToElementor(styledIr, {
  catalogTarget: "4.2.4",
  title: "Hero",
});

// result.decisions — per-node native | custom | unsupported
// (needs-fallback is an intermediate native-layer signal only)
```

Phase 5 `convertToNativeElementor` remains available and still stops at
`needs-fallback` (no custom upgrade) for isolated native-layer testing.

## Architecture

| Layer | Role |
|---|---|
| `rules/native/` | Unchanged Free native mappings |
| `rules/custom/html.ts` | Deterministic IR → HTML (no React execution) |
| `rules/custom/css.ts` | Scoped CSS from that node's `IrStyle` only |
| `rules/custom/safety.ts` | Reject `script`, `on*`, `javascript:` |
| `rules/custom/convert.ts` | Build Free `html` widget settings |
| `rules/custom/index.ts` | `convertIrNodeWithFallback` / `convertToElementor` |

Native container conversion accepts a child converter hook so Phase 6 can
re-enter the full decision order per child without duplicating native mapping
logic.

## Strategies (final)

| Strategy | Meaning |
|---|---|
| `native` | Accurate Free container/widget |
| `custom` | Accurate node-scoped Free HTML widget fallback |
| `unsupported` | Cannot represent accurately / safely |

## Node-scoped example

```text
container          → native
 ├── heading        → native
 ├── button         → native
 ├── link           → custom (html widget)
 └── unsafe node   → unsupported (omitted from emit tree)
```

The parent stays a Free Container; only the link becomes an `html` widget.

## HTML + CSS rules

- Serialize from analyzed IR only (no JSX/React runtime).
- Escape text and attribute values; deterministic attribute / class ordering.
- Scope class: `nte-fb-{elementorId}` on the fallback root only.
- Emit `<style>` with selectors under that scope (base + responsive overrides).
- Do **not** dump global source stylesheets into the widget.
- Reject unsafe patterns → `unsupported` with `unsafe-custom`.

Conceptual output:

```html
<a class="nte-fb-abc1234" href="/docs">Docs</a>
<style>
.nte-fb-abc1234{color:#112233}
</style>
```

## What this phase does not do

- Elementor Pro widgets/controls
- Executing user code / building a browser runtime
- Repo-wide processing or AI conversion
- Visual regression testing (later)
- Silent approximation of unsupported nodes

Phase 7 adds the structured conversion report via `convert()` — see [phase-7.md](./phase-7.md).  
Phase 8 adds the end-to-end orchestrator `convertSource()` — see [phase-8.md](./phase-8.md).
