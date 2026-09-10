# Section-folder input (engine-level)

Status: **Phases A–C implemented** (core only)

Converts either:

- a single React/TSX/JSX source via existing `convertSource`, or
- a **virtual section file map** via `resolveSectionInput` / `convertSectionInput`

Both paths use the **same** Elementor Free 4.2.4 pipeline.

## Product UI / API

Folder mode is available in the product UI (`Section Folder`) and
`POST /api/convert` with a `files` map. See [phase-12.md](./phase-12.md).

## Not implemented yet

- Static or dynamic prop substitution
- CSS `import` graph collection (folder `.css` files are concatenated only)
- npm / `node_modules` / `@/` aliases / remote imports
- Whole-project conversion
- WordPress media upload / attachment IDs
- Elementor/WordPress version detection
- Phase 13

## Engine usage

```ts
import { convertSectionInput, convertSource } from "@/lib/converter";

// Unchanged single-file path:
convertSource({ source: entryTsx });

// Folder / multi-file section (virtual map only — no real FS reads):
convertSectionInput({
  files: {
    "HeroSection.tsx": "...",
    "HeroContent.tsx": "...",
    "components/Button.tsx": "...",
  },
  entryPath: "HeroSection.tsx", // or sectionName: "HeroSection"
});
```

Relative imports only (`./`, `../`). Cycles and missing locals fail loudly.
Props are still structural-inline only (same as single-file today).
