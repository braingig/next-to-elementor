# Project fixtures (Phase 13f)

On-disk React/Next project trees used by `tests/converter/project-fixtures-13f.test.ts`.

Each directory is a small deterministic project (no `node_modules`, no install).

Helpers: [`helpers.ts`](./helpers.ts) — load → VFS / ZIP → convert → Free 4.2.4 assert.

| Fixture | Validates |
|---------|-----------|
| `vite-basic` | Vite SPA entry conversion |
| `vite-multi-route` | Static React Router → multiple docs; Vite+`src/pages` ≠ Next |
| `next-app-basic` | App Router nested pages |
| `next-app-layouts` | Layout composition, no mega-doc |
| `next-pages` | Pages Router; API routes ignored |
| `next-dynamic` | `/blog/[slug]` pattern only |
| `next-shared` | Shared local component |
| `next-binding` | Same export name, distinct files |
| `next-static-map` | Static `Array.map` |
| `next-tailwind` | Curated Tailwind |
| `next-css` | Route-scoped CSS |
| `next-css-modules` | CSS modules / SCSS limitations |
| `next-lucide` | Lucide static adapter |
| `next-framer` | Motion strip + animation diagnostic |
| `next-carousel` | Carousel static vs dynamic |
| `next-chart` | Charts unsupported (no invented data) |
| `next-runtime` | axios/fetch never executed |
| `next-unknown` | Unknown dep isolation |
| `next-assets` | Binary assets + image URL (no WP IDs) |
| `next-alias` | Path alias deferred honesty |
| `next-circular` | Circular import safe failure |
| `e2e-kitchen` | Full ZIP → Free 4.2.4 E2E |
