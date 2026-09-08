# Converter

- **Phase 0:** IR / report / decision contracts (`ir/`, `report/`, `types/`).
- **Phase 1:** Elementor Free capability catalog (`catalog/`) — data + load + compliance only.
- **Phase 2:** IR schema `0.2.0`, normalization, fixture corpus.
- **Phase 3:** JSX/TSX parser + React AST → IR (`parse/`) — static analysis only.
- **Phase 4:** CSS + curated Tailwind style resolution (`styles/`) — styled IR only; no Elementor emission.

Do **not** add Elementor JSON emission or conversion rules until the corresponding phases.

Specs: `/docs` (`phase-0.md` … `phase-4.md`, `ir.md`, `parse.md`, `styles.md`, `catalog.md`, …).

Public exports: `./index.ts`
