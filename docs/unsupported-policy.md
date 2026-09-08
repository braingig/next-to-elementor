# Unsupported Policy

Status: Phase 7  
Reason codes: `lib/converter/types/decisions.ts` (`UnsupportedReasonCode`)

## Rule

If behavior cannot be reproduced accurately with Elementor Free **or** node-scoped custom HTML/CSS/JS, mark it **`unsupported`**.

Do **not**:

- Silently drop the node from the **report**
- Silently approximate (“close enough” visual guess)
- Promote the entire section to custom code to hide the gap
- Emit Elementor Pro widgets as a shortcut
- Emit fake Elementor widgets as stand-ins for unsupported nodes

Unsupported nodes are omitted from Elementor JSON and recorded in the report.

## Preferred reason codes (Phase 7)

| Code | When to use |
|---|---|
| `unsupported-node-kind` | IR kind has no converter path |
| `dynamic-content` | Values depend on runtime data, hooks, fetches, or non-static expressions |
| `dynamic-children` | Children produced by `.map`, conditionals that cannot be statically expanded |
| `unknown-component` | Third-party/local React component with no static HTML equivalent in MVP |
| `unsupported-css` | CSS cannot be interpreted or mapped accurately |
| `unresolved-style` | CSS custom property / style token could not be resolved |
| `unsafe-html` | Custom fallback would require rejected markup / event handlers |
| `unsafe-url` | Custom fallback would require rejected URL protocol |
| `unsupported-interaction` | Complex interaction beyond MVP custom policy |
| `insufficient-source-information` | Incomplete IR / missing conversion coverage |
| `native-mapping-unavailable` | No accurate Free native mapping |
| `custom-fallback-unavailable` | Custom HTML path also cannot preserve the node accurately |

## Retained / legacy codes

Still accepted on IR and reports (compatibility):

`unknown-tailwind-class`, `unknown-css`, `animation-unsupported`, `interaction-unsupported`,
`layout-unsupported`, `asset-unresolved`, `svg-complex`, `form-unsupported`, `pro-only-feature`,
`unsafe-custom`, `media-unsupported`, `responsive-unsupported`, `semantic-ambiguous`,
`parse-error`, `validation-error`, `other`

Report builders may normalize some legacy codes to preferred codes (e.g. `unsafe-custom` →
`unsafe-html` / `unsafe-url`).

## Severity guidance

| Situation | Typical handling |
|---|---|
| Unknown Tailwind class on non-critical decorative property | `warning` diagnostic; continue if remaining styles suffice |
| Unresolved CSS variable | `warning` (`unresolved-style`); outcome at best `partial` |
| Unmapped CSS on an emitted native node | `warning` (`unsupported-css`); do not claim full accuracy |
| Dynamic `{title}` text | `unsupported` (`dynamic-content`) |
| `items.map(...)` list | `unsupported` (`dynamic-children`) in MVP |
| Unsafe `javascript:` URL in custom path | `unsupported` (`unsafe-url`) |

## Reporting requirements

Every unsupported node must include:

- `reasonCode`
- Human `message`
- Related `nodeId`
- Optional source `loc` / provenance summary when available

## Approximation ban (examples)

Forbidden:

- Mapping a custom carousel to a static single image without reporting loss
- Replacing a computed gradient animation with a flat background silently
- Dropping absolute-positioned badges without report entries
- Emitting Pro widgets to gain fidelity
- Replacing unsupported nodes with empty containers / generic HTML silently

Allowed:

- Choosing `unsupported` and continuing sibling conversion
- Choosing `custom` when HTML/CSS can honestly reproduce the node
- Emitting native Free widgets when catalog says the feature set matches
