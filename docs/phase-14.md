# Phase 14 — Project assets

Phase 14 improves how project ZIPs admit and map binary/static assets, and
optionally uploads present images to WordPress Media for public URLs.

## 14a — Source vs binary admission limits

Phase 13 used a single generic `maxFileBytes` (1 MiB) for every kept file.
That rejected legitimate images slightly over 1 MiB (e.g. `santa.png` ≈ 1.06 MiB)
even when the ZIP itself was under `maxZipBytes`.

Phase 14a separates limits:

| Limit | Default | Behavior |
|-------|---------|----------|
| `maxSourceFileBytes` (`maxFileBytes` alias) | 1 MiB | Source/text hard-fail |
| `maxBinaryAssetBytes` | 5 MiB | Per binary asset; soft-skip when exceeded |
| `maxBinaryAssetsTotalBytes` | 15 MiB | Aggregate binary budget; soft-skip further assets |
| Archive caps (`maxZipBytes`, uncompressed, ratio, entries, files) | unchanged | Still hard security gates |

Classification (path extension only — **no image decoding**):

- Source/text: TS/JS/CSS/JSON/Markdown/**SVG**/…
- Binary assets: png, jpg/jpeg, webp, gif, …
- Other binary: same binary size rules

Oversized binaries produce `asset-file-byte-limit` / `asset-total-byte-limit`
diagnostics and are omitted from `ProjectVirtualFS`. Original admitted bytes
are stored unchanged (`Uint8Array` + extension).

## 14b — Asset discovery & VFS mapping

Phase 14b statically discovers asset references on each route and maps them to
canonical `ProjectVirtualFS` paths. It reuses Phase 13g path aliases.

Supported patterns (static analysis only):

- `import hero from "@/assets/hero.jpg"` / relative imports
- `<img src={hero} />` when `hero` is a known import/const binding
- `<img src="./assets/hero.jpg" />` when the file exists in the VFS
- `new URL("./assets/hero.png", import.meta.url)` with a string literal
- CSS `url("./hero.jpg")` in route-scoped CSS

Diagnostics:

| Code | Meaning |
|------|---------|
| `asset-reference-resolved` | Specifier/binding mapped to a present VFS asset |
| `asset-reference-unresolved` | Could not map, or file missing from VFS |
| `asset-reference-dynamic` | Non-static expression (e.g. `new URL(path, import.meta.url)`, `url(var(--x))`) |
| `asset-reference-skipped` | Maps to a path soft-skipped by Phase 14a (distinct from missing) |

Route results expose `assets`, `assetReferences`, and `assetBindings` with VFS
identity only — **no WordPress URLs, attachment ids, or invented CDNs**.

## 14c — Opt-in WordPress media upload + pre-convert rewrite

Phase 14c uploads **present** VFS image assets to WordPress Media REST and
rewrites packaged `ConversionUnit` sources/CSS **before** `convertSource()`.

### Opt-in

- Default / Project ZIP without `media`: **disabled** — no WP calls; Phase 14b behavior unchanged.
- `POST /api/project/convert` with multipart field `media=1` or `media=true`: enabled.
- `POST /api/project/analyze` and `POST /api/convert` are unchanged.
- Single File / Section Folder modes are unchanged.

### Server configuration (Application Passwords)

Credentials are **server environment only** — never accepted from multipart, never
returned to the browser, never logged:

| Env | Purpose |
|-----|---------|
| `N2E_WP_BASE_URL` | WordPress site origin (http/https) |
| `N2E_WP_USER` | Username |
| `N2E_WP_APP_PASSWORD` | Application Password |
| `N2E_MEDIA_OPTIMIZE` | Kill-switch for Phase 14d (`0`/`false`/`off`/`no` disables). Default: enabled when media is on |

Missing/invalid config with media enabled → `media-config-missing` (or
`media-config-invalid`) and **project failed** — not a silent disable.

### Pipeline

1. Discover assets (14b) while packaging routes
2. (14d) Optimize eligible present images once per `assetPath` (derived bytes only)
3. Upload unique present allowlisted images (`POST /wp-json/wp/v2/media`)
4. Build `assetPath → public URL` map (session dedupe → `uploaded` / `reused`)
5. Rewrite packaged unit `entrySource` / `moduleSources` / `knownComponentSources` / CSS
6. Existing `convertRouteUnit()` → `convertSource()` emits Elementor `image.url`

Upload allowlist (default): **png, jpg, jpeg, webp, gif**.
**SVG is not uploaded** (`skipped` / `svg-upload-disabled`). Soft-skipped 14a assets
are never uploaded. Dynamic references never receive invented URLs.

Bytes come only from `ProjectVirtualFS` — no host FS reads, no external URL fetch.
The WordPress media client never decodes or transforms bytes.

### Phase 14d — safe optimization before upload

When media is enabled, present allowlisted raster images are optimized **once per
`assetPath`** before upload (pipeline preprocess; VFS untouched):

| Format | Optimize? |
|--------|-----------|
| JPEG / JPG / PNG / WebP | Yes (same container; no forced WebP conversion) |
| GIF | Upload original (`skipped` optimize / `format-gif`) |
| SVG | Still **not uploaded** (`svg-upload-disabled`) |

Policy:

- Optional soft dependency: **`sharp`** (if missing → upload original + fallback)
- JPEG quality ≈ 80; PNG preserves alpha; WebP stays WebP
- Downscale only when longest edge > **4096** or pixels > **~16MP**
- Use optimized bytes **only if strictly smaller** than original
- Soft-skipped 14a assets are never optimized or uploaded
- Kill-switch: `N2E_MEDIA_OPTIMIZE=0` (also `false` / `off` / `no`) — default **on** with media
- Observability on each upload: `optimization.{originalBytes,optimizedBytes,savingsBytes,savingsPercent,optimizer,optimizationStatus,fallbackReason}`

### Failure semantics

| Condition | Result |
|-----------|--------|
| Config missing / invalid | `media-config-missing` / `media-config-invalid` — project **failed** |
| Auth 401/403 | `media-auth-failed` — abort remaining uploads — project **failed** |
| Unreachable | `media-unreachable` — project **failed** |
| Invalid WP JSON / missing public URL | `media-upload-invalid-response` — that asset not rewritten |
| Single asset upload failure | continue others; route/project may be **partial** |
| Dynamic / soft-skipped | preserve diagnostics; no fake URL |

API responses include a compact `media` summary (`uploadedCount`, `reusedCount`,
`failedCount`, `skippedCount`, `uploads[]`) with sanitized messages only.

### Deferred (post-14d)

- Forced WebP conversion / format transcoding beyond same-container optimize
- Animated GIF / SVG minify or upload-by-default policy change
- Async job queues
- Cross-session content-hash dedupe / persistent media cache
- Full Project ZIP UI for media (credentials remain server-side)
- ImageMagick CLI or remote CDN optimization

## Related

- [phase-13.md](./phase-13.md) — Project ZIP layer (13a–13g)
