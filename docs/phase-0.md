# Phase 0 — Product Contracts

Status: **frozen for MVP design review**  
Scope: schemas, taxonomies, and decision policy only. **No conversion logic.**

## Purpose

Lock the contracts that every later phase must implement against:

1. Intermediate Representation (IR)
2. Elementor Free capability catalog shape
3. Conversion decision policy (native → custom → unsupported)
4. Unsupported reason taxonomy
5. Conversion report shape
6. Pipeline result / success semantics

## Documents in this phase

| Doc | Covers |
|---|---|
| [ir.md](./ir.md) | IR node kinds, style model, provenance |
| [catalog.md](./catalog.md) | Versioned Free capability catalog + Pro denylist |
| [conversion-rules.md](./conversion-rules.md) | Deterministic decision order and Free-first policy |
| [unsupported-policy.md](./unsupported-policy.md) | Reason codes and when approximation is forbidden |
| [report.md](./report.md) | Conversion report + pipeline result contracts |

## Schema source of truth

TypeScript Zod schemas under `lib/converter/` are the machine-readable source of truth:

- `lib/converter/ir/schema.ts`
- `lib/converter/catalog/schema.ts`
- `lib/converter/report/schema.ts`
- `lib/converter/types/decisions.ts`

Docs describe intent; schemas enforce shape. If docs and schemas diverge, **update docs to match schemas** after an explicit contract change.

## Explicitly out of Phase 0

- JSX/TSX parsing
- CSS / Tailwind resolution
- IR builders
- Elementor JSON emission
- Conversion rule implementations
- API routes / UI changes
- Fixtures with expected Elementor output
- Package installs beyond contract dependencies (Zod)

## Exit criteria

- [x] IR node kinds and style model documented + Zod-defined
- [x] Catalog schema + Pro denylist shape defined
- [x] Decision enum and ordered policy documented
- [x] Unsupported reason codes defined
- [x] Report + `ConversionResult` schemas defined
- [x] No conversion/pipeline implementation present

## Next phase

**Phase 1** — Populate a versioned Elementor Free capability catalog instance (data), still without conversion logic. See [phase-1.md](./phase-1.md).
