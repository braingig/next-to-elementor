# Conversion Decision Policy

Status: Phase 0 contract  
Enums: `lib/converter/types/decisions.ts`

## Highest priorities

1. Accuracy  
2. Deterministic conversion  
3. Elementor Free compatibility  
4. Granular custom fallback  

Silent approximation is forbidden.

## Decision enum

Per IR node (after capability matching):

| Decision | Meaning |
|---|---|
| `native` | Emitted as Elementor Free native widget/container |
| `custom` | Emitted as node-scoped Free HTML (or equivalent) custom fallback |
| `unsupported` | Not emitted as a faithful construct; recorded in report with reason |

Pipeline-level outcomes (entire conversion):

| Outcome | Meaning |
|---|---|
| `complete` | All nodes are `native` or `custom`; JSON produced; no warning/error accuracy gaps |
| `partial` | JSON produced, but one or more nodes are `unsupported` and/or accuracy warnings/errors |
| `failed` | No usable JSON (parse failure, validation failure, empty input, hard Free violation during emit, etc.) |

## Ordered decision procedure (mandatory)

For each IR node, independently:

```
1. Can Elementor Free represent this node accurately
   using catalog-allowed widgets/controls?
      → decision = native

2. Else, can custom HTML/CSS/JS reproduce this node accurately
   in a node-scoped fallback (without requiring Pro)?
      → decision = custom

3. Else
      → decision = unsupported (+ reasonCode)
```

### Granularity rule

Evaluate **per node**, not per section.

Valid:

```
container (native)
  ├─ heading (native)
  ├─ image (native)
  ├─ button (native)
  └─ animated-widget (custom OR unsupported)
```

Invalid product behavior:

```
entire section → custom HTML
```

…merely because one descendant needed a fallback.

### Parent/child interaction

- A `custom` child does **not** force the parent to `custom`.
- An `unsupported` child does **not** delete the parent; parent may still emit with a gap recorded in the report (MVP: keep parent structure, omit or replace unsupported child per emit rules in later phases—report must list the gap).
- A parent that only exists to wrap unsupported content may itself become `unsupported` if emitting an empty native shell would be misleading; that determination belongs to later emit rules but must remain explicit.

## Accuracy bar

“Accurately” means:

- Same semantic role (heading vs text vs button, etc.)
- Faithful static content (text, alt, href, src)
- Layout/spacing/typography/colors within the resolved IR style facts that Free (or custom HTML) can express
- Responsive overrides only where we can map them without inventing behavior

If the team cannot honestly claim parity, choose `unsupported` rather than a lookalike.

## Determinism requirements

- Same IR + same catalog version → same decisions and same emitted settings (aside from documented non-deterministic environments, which MVP avoids).
- No LLM/AI in the decision path.
- Rule order and catalog data are versioned.

## Free compatibility requirements

- Never emit Pro widgets/controls/features.
- Catalog + Pro denylist are the hard gate.
- If a native mapping would require Pro, it is **not** eligible for step 1; evaluate step 2/3 instead.

## Custom fallback constraints (contract)

Custom fallback must:

- Be scoped to the node (or minimal subtree required for that node’s accuracy)
- Use Free-allowed embed mechanisms (typically HTML widget)
- Avoid executing untrusted patterns (inline script / unsafe URLs → `unsupported` with `unsafe-html` / `unsafe-url`)

## Mapping ownership

| Phase | Responsibility |
|---|---|
| 5 | Native Free rule tables |
| 6 | Custom fallback emitters |
| 7 | Unsupported handling + conversion report (`convert`) |

Phase 0 freezes the policy; Phase 7 implements the report.
