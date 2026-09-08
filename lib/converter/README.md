# Converter

- **Phase 0:** IR / report / decision contracts (`ir/`, `report/`, `types/`).
- **Phase 1:** Elementor Free capability catalog (`catalog/`).
- **Phase 2:** IR schema `0.2.0`, normalization, fixtures.
- **Phase 3:** JSX/TSX parser + React AST → IR (`parse/`).
- **Phase 4:** CSS + curated Tailwind style resolution (`styles/`).
- **Phase 5:** Native Elementor Free conversion (`rules/native/`, `emit/`) — classic JSON `0.4` only.

Do **not** add custom HTML fallback (Phase 6) or Pro emission.

Specs: `/docs` (`phase-0.md` … `phase-5.md`, …).

Public exports: `./index.ts`
