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
| [phase-10.md](./phase-10.md) | Elementor Free 4.2.4 static compat |
| [phase-12.md](./phase-12.md) | Product converter UI + `/api/convert` |
| [phase-13.md](./phase-13.md) | Project ZIP layer (13a–13f) |
| [phase-14.md](./phase-14.md) | Project assets + opt-in WordPress media (14a–14d) |
| [wordpress-target.md](./wordpress-target.md) | Configurable target WordPress media + page import |
| [section-input.md](./section-input.md) | Virtual section folder map (engine; UI/API not yet) |
| [conversion-rules.md](./conversion-rules.md) | Decision order |
| [unsupported-policy.md](./unsupported-policy.md) | Reason codes |

## Outcomes

- Report APIs (`convert`, `convertSource`): `complete` \| `partial` \| `failed`
- Lower native APIs: `success` \| `partial` \| `failed`

## Guarantees

Deterministic conversion for **supported** constructs. Not arbitrary
React/Next visual equivalence. Unsupported nodes are reported, never silently approximated.
