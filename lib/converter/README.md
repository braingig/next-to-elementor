# Converter

- **Phase 0:** IR / report / decision contracts (`ir/`, `report/`, `types/`).
- **Phase 1:** Elementor Free capability catalog (`catalog/`) — data + load + compliance only.
- **Phase 2:** IR schema `0.2.0`, normalization, fixture corpus — no JSX parsing, no Elementor conversion.
- **Phase 3:** JSX/TSX parser + React AST → IR (`parse/`) — static analysis only; no Elementor emission.

Do **not** add Elementor JSON emission, CSS/Tailwind resolution, or conversion rules until the corresponding phases.

Specs: `/docs` (`phase-0.md` … `phase-3.md`, `ir.md`, `parse.md`, `catalog.md`, …).

Public exports: `./index.ts`
