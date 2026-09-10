# Phase 12 — Product Converter UI

Status: **implemented for review** (folder mode added)  
Route: `http://localhost:3000/`  
API: `POST /api/convert`

## Flow

```text
Single file:
  Source TSX/JSX (+ optional CSS)
    → Convert → POST /api/convert { source }
    → convertSource → ConversionResult

Section folder:
  Browser folder picker → virtual file map
    → Convert → POST /api/convert { files, entryPath? }
    → resolveSectionInput → convertSource → ConversionResult
```

## What was added

| Piece | Location |
|---|---|
| Convert API | `app/api/convert/route.ts` |
| Shared server handler | `app/lib/server-convert.ts` |
| Browser client | `app/lib/convert-client.ts` |
| Folder file helpers | `app/lib/folder-files.ts` |
| UI workspace | `app/components/converter-workspace.tsx` |
| Home page | `app/page.tsx` |
| Tests | `tests/ui/convert-api.test.ts`, `tests/ui/ui-helpers.test.ts` |
| Manual folder fixture | `manual-validation/RealWorldSection/` |

## API modes (mutually exclusive)

**Single file** (unchanged):

```json
{ "source": "...", "css": "...", "language": "auto", "title": "..." }
```

**Section folder:**

```json
{
  "files": { "Hero.tsx": "...", "Child.tsx": "..." },
  "entryPath": "Hero.tsx",
  "sectionName": "Hero",
  "css": "...",
  "title": "Hero"
}
```

Do **not** send `knownComponentSources` — the server builds them via the section resolver.

Resolver failures (missing entry, ambiguous entry, missing/circular imports, limits) return **HTTP 400** with `code` + diagnostics.

## Guarantees

- Reuses `convertSource` / section-input only — no duplicated Elementor rules
- Node-only catalog/`fs`/`crypto` stay server-side for conversion
- No `eval` / user-code execution
- Body size capped at **512 KiB**
- Folder assets are listed in the UI but not uploaded as binary / WP media

## Outcomes

| Outcome | UI behavior |
|---|---|
| `complete` | JSON preview + download |
| `partial` | JSON preview + download + unsupported/custom report |
| `failed` | Diagnostics; no JSON download |

## Limitations

- Props not substituted yet
- CSS `import` graph collection not implemented (`.css` files concatenated client/API-side)
- Assets not packaged / no WordPress media IDs
- No Elementor/WordPress version detection
- Plain editors (no Monaco)
- UI does not import documents into WordPress (Phase 11 harness is separate)
