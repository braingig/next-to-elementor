# Converter documentation

React/Next section → Elementor Free classic JSON (`version: "0.4"`).

## Pipeline

```text
React/TSX
  → Parse + Analyze (Phase 3)
  → IR (Phase 2)
  → CSS + Tailwind resolution (Phase 4)
  → Native Free widgets (Phase 5)
  → Node-scoped custom HTML (Phase 6)
  → Unsupported + report (Phase 7)
  → End-to-end API + final validation (Phase 8)
```

## Quick start

```ts
import { convertSource } from "@/lib/converter";

const result = convertSource({
  source: `export function Hero() { return <h1 className="text-xl">Hi</h1>; }`,
  language: "tsx",
  css: "",
});

if (result.outcome === "complete") {
  console.log(result.elementorJson);
} else {
  console.log(result.report.summary, result.report.diagnostics);
}
```

## Phase docs

| Doc | Topic |
|---|---|
| [phase-0.md](./phase-0.md) | Contracts |
| [phase-1.md](./phase-1.md) / [catalog.md](./catalog.md) | Free 4.2.4 catalog |
| [phase-2.md](./phase-2.md) / [ir.md](./ir.md) | IR schema |
| [phase-3.md](./phase-3.md) / [parse.md](./parse.md) | JSX → IR |
| [phase-4.md](./phase-4.md) / [styles.md](./styles.md) | Style resolution |
| [phase-5.md](./phase-5.md) | Native Free conversion |
| [phase-6.md](./phase-6.md) | Node-scoped custom fallback |
| [phase-7.md](./phase-7.md) / [report.md](./report.md) | Report + unsupported |
| [phase-8.md](./phase-8.md) | End-to-end `convertSource` |
| [phase-9.md](./phase-9.md) | Real-world fixtures + accuracy validation |
| [conversion-rules.md](./conversion-rules.md) | Decision order |
| [unsupported-policy.md](./unsupported-policy.md) | Reason codes |

## Outcomes

- Report APIs (`convert`, `convertSource`): `complete` \| `partial` \| `failed`
- Lower native APIs: `success` \| `partial` \| `failed`

## Guarantees

Deterministic conversion for **supported** constructs. Not arbitrary
React/Next visual equivalence. Unsupported nodes are reported, never silently approximated.
