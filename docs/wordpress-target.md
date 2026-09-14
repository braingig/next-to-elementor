# Target WordPress integration

The converter can upload project media and create a **new Elementor Library
template** on a **configured** WordPress site for each import. No site URL or
post ID is hardcoded. No target post ID is required.

## Credentials (server / CLI only)

**Sole source:** gitignored `.n2e-wp.local.json` at the project root (parents
are walked from `process.cwd()` so nested / restarted Next.js processes still
find it).

Never commit credentials. Never accept them from browser multipart. There is
no environment-variable path for WordPress target credentials.

Media-enabled Project ZIP convert (`mediaEnabled: true`, the UI default) uses
the **same** `resolveWordPressTargetConfig` resolver as `npm run import:wordpress`.

Example `.n2e-wp.local.json`:

```json
{
  "baseUrl": "http://wp.test",
  "username": "admin",
  "applicationPassword": "xxxx xxxx xxxx xxxx"
}
```

For local HTTP sites (e.g. `http://wp.test`), WordPress requires
`WP_ENVIRONMENT_TYPE=local` (or HTTPS) so Application Passwords work.

## Two consistent workflows

### 1. Elementor native UI

```text
Convert with media enabled (`.n2e-wp.local.json`)
  → Download route JSON (Image widgets + wp media URLs)
  → Elementor → Templates → Import
  → NEW elementor_library row
  → Edit with Elementor on that row
```

Media-off downloads store Custom HTML logos with empty `img` `src`. Elementor
Template Import faithfully keeps that JSON — so the logo looks broken even
though the editor loaded the correct new template. Always download after a
media-enabled convert when using Templates → Import.

### 2. Programmatic import (media-enabled)

```text
Project ZIP
  → convertProjectAsync({ media: { enabled: true, … } })
  → Upload assets via POST /wp-json/wp/v2/media
  → Rewrite asset URLs to the target Media Library
  → Emit Elementor JSON (Image widgets, backgrounds, …)
  → applyMediaAttachmentIds (fill library attachment ids)
  → importElementorDocument
       → POST /wp/v2/elementor_library  (always create NEW template)
  → print editUrl for that NEW template
  → Edit with Elementor on that same post ID
```

Both create a fresh `elementor_library` document. Open **that** row’s
“Edit with Elementor” (or the printed `editUrl`) to see the imported JSON.

## CLI

```bash
# Requires .n2e-wp.local.json at the project root
npm run import:wordpress -- /path/to/project.zip
```

Each run creates a **new** library template and prints:

- `postId` — the new template ID
- `editUrl` — `…/post.php?post={id}&action=elementor`

## Notes

- Never requires `targetPostId` or a fixed WordPress ID.
- Stored meta: `_elementor_edit_mode=builder`, `_elementor_template_type=page`,
  `_elementor_data` = exact imported content JSON string.
- Media URLs in the emitted document must match the target origin
  (no `example.test`, no obsolete local harness hosts).
- Phase 14 media pipeline remains the upload/rewrite implementation.
