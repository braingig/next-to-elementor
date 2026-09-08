# Phase 12 — Product Converter UI

Status: **implemented for review**  
Route: `http://localhost:3000/`  
API: `POST /api/convert`

## Flow

```text
Source TSX/JSX (+ optional CSS)
  → Convert
  → POST /api/convert
  → convertSource (existing engine)
  → ConversionResult
  → outcome / report / JSON preview / download
```

## What was added

| Piece | Location |
|---|---|
| Convert API | `app/api/convert/route.ts` |
| Shared server handler | `app/lib/server-convert.ts` |
| Browser client | `app/lib/convert-client.ts` |
| UI workspace | `app/components/converter-workspace.tsx` |
| Home page | `app/page.tsx` (replaces Next.js starter) |
| Tests | `tests/ui/convert-api.test.ts`, `tests/ui/ui-helpers.test.ts` |

## Guarantees

- Reuses `convertSource` only — no duplicated conversion rules
- Node-only catalog/`fs`/`crypto` stay server-side
- No `eval` / user-code execution
- Body size capped at **512 KiB**
- Phase 11 runtime / Docker / converter engine tests unchanged

## Outcomes

| Outcome | UI behavior |
|---|---|
| `complete` | JSON preview + download |
| `partial` | JSON preview + download + unsupported/custom report |
| `failed` | Diagnostics; no JSON download |

## Limitations

- Source language is TSX/JSX only (engine constraint)
- Plain `<textarea>` editors (no Monaco)
- UI does not import documents into WordPress (Phase 11 harness is separate)
