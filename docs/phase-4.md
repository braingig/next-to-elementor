# Phase 4 — CSS + Tailwind Style Resolution

Status: **complete for review**  
Code: `lib/converter/styles/`  
IR target: Phase 2 schema `0.2.0` (styled in place)

## Goal

Resolve source-oriented style facts on IR nodes:

```text
React/TSX → IR (Phase 3)
              ↓
     CSS / Tailwind / inline resolution
              ↓
          Styled IR
              ↓
     Later: Elementor conversion (Phase 5+)
```

This phase does **not** emit Elementor JSON or map styles to Elementor controls.

## API

```ts
import { resolveStyles, analyzeReactSource } from "@/lib/converter";

const { document: ir } = analyzeReactSource(tsx, { sourcePath: "Hero.tsx" });
const { document: styled } = resolveStyles(ir, {
  css: [
    `.hero { display: flex; gap: 16px; }`,
    `@media (max-width: 767px) { .hero { flex-direction: column; } }`,
  ],
});
```

| Option | Default | Meaning |
|---|---|---|
| `css` | `[]` | One or more CSS strings (caller-supplied; no repo scan) |
| `resolveTailwind` | `true` | Resolve curated Tailwind utilities from `classNames` |
| `resolveInline` | `true` | Parse `provenance.inlineStyleRaw` |

## Merge precedence

Later sources win for the same property:

1. **Tailwind** (lowest)
2. **CSS rules** (cascade / specificity / source order)
3. **Inline styles** (highest)

Existing `node.style` (if any) is treated as a base below Tailwind.

## CSS support (PostCSS)

Applied when matching is reliable:

- Class / type / ID selectors
- Compound selectors (`.a.b`, `h1.title`)
- Grouped selectors (`h1, .title`)
- Descendant (` `) and child (`>`) combinators
- `@media` → `style.responsive.<sm|md|lg|xl|2xl>` when mappable
- Custom properties `var(--x)` when defined (or fallback)

Not applied (diagnostic instead of guessing):

- `:hover` / `:focus` / other interaction pseudos
- `::before` / `::after`
- `:has()` / `:is()` / `:where()` / `:not()`
- Sibling combinators `+` / `~`
- `@supports` / `@layer` / `@container`
- Unmapped media queries
- Full browser cascade / inheritance engine

## Tailwind support (curated map)

Deterministic dictionary — **not** full Tailwind JIT / v4 token pipeline.

Includes common utilities for:

- display / flex / grid / gap / justify / items
- spacing (`p-*`, `m-*`, `gap-*`, …)
- sizing (`w-*`, `h-*`, `max-w-*`, …)
- typography (`text-*`, `font-*`, align, decoration)
- colors (`bg-*`, `text-*`, `border-*`) for a curated palette
- radius / border / position / opacity / basic shadows
- responsive variants `sm|md|lg|xl|2xl:`

Unknown classes → `unknown-tailwind-class` warning; values are **not** invented.

## Inline styles

`provenance.inlineStyleRaw` (from Phase 3) is parsed into `IrStyle` using the same CSS property map.

## Diagnostics

| Code | When |
|---|---|
| `unknown-tailwind-class` | Class not in curated map |
| `unknown-css` | Unmapped property, bad CSS parse, skipped selector, unresolved `var()` |
| `responsive-unsupported` | `@media` not mapped to an IR breakpoint |

## Out of scope

- Elementor control mapping / JSON emission
- CSS Modules deep composition
- styled-components / emotion
- Repository-wide stylesheet discovery
- Full Tailwind plugin / arbitrary-value explosion beyond a small subset

## Tests

`tests/converter/styles.test.ts` covers class CSS, selectors, media queries, custom properties, Tailwind, inline, precedence, Phase 3 integration, determinism.
