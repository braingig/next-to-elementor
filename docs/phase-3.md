# Phase 3 — JSX/TSX Parser + React AST Analysis

Status: **complete for review**  
IR target: Phase 2 schema `0.2.0`  
Code: `lib/converter/parse/`

## Goal

Convert a single React/Next.js component or section into the existing Elementor-agnostic IR:

```text
React/TSX source
  → @babel/parser
  → AST
  → static React analysis
  → IrDocument
```

No Elementor JSON. No CSS/Tailwind resolution. No user code execution.

## API

```ts
import {
  parseReactSource,
  analyzeReactAst,
  analyzeReactSource,
  ReactParseError,
} from "@/lib/converter";

const parsed = parseReactSource(source, { language: "tsx", sourcePath: "Hero.tsx" });
const { document } = analyzeReactSource(source, { sourcePath: "Hero.tsx" });
```

| Function | Role |
|---|---|
| `parseReactSource` | Babel parse → AST; throws `ReactParseError` on syntax errors |
| `analyzeReactAst` | AST → normalized `IrDocument` |
| `analyzeReactSource` | parse + analyze convenience |

## Supported syntax

- JSX and TSX (TypeScript plugin when language is `tsx` / auto-detected)
- Function and arrow components
- Default / named exports
- Nested JSX, fragments (`<>...</>` / `React.Fragment`)
- Static JSX text and static expression values (string/number/boolean/null, static templates)
- Static `className` / `class` string (and static string arrays)
- Static `style={{ ... }}` object → `provenance.inlineStyleRaw` only
- Normal HTML attributes + boolean attributes
- Static conditionals (`true && …`, `false && …`, `true ? … : …`)
- Arrays of static JSX elements
- Same-file custom components that return JSX (structural inline)

## HTML/JSX → IR mapping

| Source | IR |
|---|---|
| `div` / `section` / `main` / `header` / `footer` / `article` / … | `container` |
| `span` / inline phrasing tags | `group` (often with text child) |
| `h1`–`h6` | `heading` |
| `p` | `text` |
| `img` | `image` |
| `button` | `button` |
| `a` | `link` (`button` if `role="button"`) |
| `hr` | `divider` |
| empty `div` with `aria-hidden` / `data-spacer` | `spacer` (only when intent is clear) |
| `svg` | provisional `icon` (**uncertain**) |
| `ul` / `ol` / `li` | `list` / `list-item` |
| unknown intrinsic tags | `html-embed` (**uncertain**) |
| unknown custom components | `unsupported` (`unknown-component`) |

Mapping is semantic and conservative — not an Elementor widget table.

## Dynamic expressions

Static analysis only. The analyzer **never**:

- executes uploaded React code
- imports user modules
- uses `eval` / `new Function`
- runs hooks, effects, or arbitrary calls

Unresolved dynamics become `unsupported` / diagnostics (`dynamic-content`, `dynamic-children`, …) with provenance preserved.

## Custom components

1. **Same-file JSX-returning component** → structurally inline the returned JSX (depth-limited).
2. **Optional `knownComponentSources`** map → parse additional static sources the same way.
3. **Otherwise** → `unsupported` with `unknown-component`.

Props are **not** executed or deeply substituted in MVP (structural inline only).

## Diagnostics

Examples:

- `parse-error`
- `dynamic-content`
- `dynamic-children`
- `unknown-component`
- `semantic-ambiguous`
- `inlined-local-component` (info)
- non-static attribute warnings

## Security / no-execution policy

This layer is intentionally incapable of running user code. Function calls, member calls (except recognizing `.map` as unsupported), hooks, and imports of user components are never evaluated.

## Known limitations

- No CSS file or Tailwind class resolution (Phase 4+)
- No full prop binding into inlined components
- No repository-wide import graph
- SVG → icon is provisional/uncertain
- Spacer detection is intentionally narrow
- Spread props / spread children unsupported
- Dynamic `className={cn(...)}` helpers unsupported unless statically reducible

## Fixtures

`tests/converter/fixtures/parse/` — 16+ TSX cases covering the Phase 3 checklist.

## Out of scope

Elementor emission, catalog mapping, style resolution, AI conversion, browser rendering.
