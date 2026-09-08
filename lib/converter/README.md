# Converter

End-to-end React/TSX section → Elementor Free classic JSON (`0.4`) + report.

## Preferred API

```ts
import { convertSource, convert, analyzeReactSource, resolveStyles } from "@/lib/converter";

const result = convertSource({
  source,
  language: "tsx",
  css,
});

if (result.outcome === "complete") {
  // valid Elementor JSON
}
```

## Pipeline stages

| Phase | Module | Responsibility |
|---|---|---|
| 0 | `types/`, `report/schema` | Contracts |
| 1 | `catalog/` | Free 4.2.4 capability catalog |
| 2 | `ir/` | IR schema + normalize |
| 3 | `parse/` | JSX/TSX → IR (static only) |
| 4 | `styles/` | CSS + curated Tailwind |
| 5 | `rules/native/` | Native Free widgets |
| 6 | `rules/custom/` | Node-scoped HTML fallback |
| 7 | `report/`, `convert.ts` | Report + `convert(ir)` |
| 8 | `convert-source.ts`, `emit/` | `convertSource` + shared emit helpers |
| 9 | `tests/converter/fixtures/real-world/` | Real-world section fixtures + goldens |
| 10 | `compat/` | Elementor Free 4.2.4 static compat (runtime BLOCKED here) |

## Lower-level APIs (still supported)

- `analyzeReactSource` / `resolveStyles`
- `convertToNativeElementor` — outcomes: `success` \| `partial` \| `failed`
- `convertToElementor` — native + custom; same lower-level outcomes
- `convert` — styled IR → Phase 7 `ConversionResult` (`complete` \| `partial` \| `failed`)

## Rules

- Elementor Free **4.2.4** only (classic JSON)
- Decision order: native → custom → unsupported
- No Pro, no AI, no user-code execution, no repo scanning

Specs: `/docs` (`phase-0.md` … `phase-10.md`).
