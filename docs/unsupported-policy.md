# Unsupported Policy

Status: Phase 0 contract  
Reason codes: `lib/converter/types/decisions.ts` (`UnsupportedReasonCode`)

## Rule

If behavior cannot be reproduced accurately with Elementor Free **or** node-scoped custom HTML/CSS/JS, mark it **`unsupported`**.

Do **not**:

- Silently drop the node
- Silently approximate (“close enough” visual guess)
- Promote the entire section to custom code to hide the gap
- Emit Elementor Pro widgets as a shortcut

## Reason codes

Stable machine codes for reports and IR `unsupported` nodes:

| Code | When to use |
|---|---|
| `dynamic-content` | Values depend on runtime data, hooks, fetches, or non-static expressions |
| `dynamic-children` | Children produced by `.map`, conditionals that cannot be statically expanded |
| `unknown-component` | Third-party/local React component with no static HTML equivalent in MVP |
| `unknown-tailwind-class` | Tailwind class not in curated map and not otherwise resolved (may be warning if node still convertible; upgrade to unsupported when class is load-bearing for accuracy) |
| `unknown-css` | Critical CSS cannot be interpreted |
| `animation-unsupported` | Animation/interaction cannot be faithfully reproduced in Free or safe custom JS |
| `interaction-unsupported` | Complex interaction (drag, parallax, custom JS behavior) beyond MVP custom policy |
| `layout-unsupported` | Layout model cannot be expressed accurately (e.g. exotic grid/absolute compositions) |
| `asset-unresolved` | Required image/font/asset cannot be resolved to a usable URL/path |
| `svg-complex` | SVG/graphic too complex for icon/image/html policy |
| `form-unsupported` | Form controls/validation not representable under Free-first MVP rules |
| `pro-only-feature` | Accurate native path would require Elementor Pro; custom also cannot reproduce |
| `unsafe-custom` | Custom fallback would require rejected script/pattern |
| `media-unsupported` | Video/audio/iframe/media behavior beyond MVP emitters |
| `responsive-unsupported` | Required responsive behavior cannot be mapped faithfully |
| `semantic-ambiguous` | Cannot determine accurate semantic role without guessing |
| `parse-error` | Source region failed to parse/analyze |
| `validation-error` | IR/JSON validation failed for this node |
| `other` | Escapes; must still include human `message` |

## Severity guidance

| Situation | Typical handling |
|---|---|
| Unknown Tailwind class on non-critical decorative property | `warning` diagnostic; continue if remaining styles suffice |
| Unknown Tailwind class that defines primary layout/visibility | `unsupported` or `custom` only if custom can encode the real CSS meaning |
| Dynamic `{title}` text | `unsupported` (`dynamic-content`) unless a static literal exists |
| `items.map(...)` list | `unsupported` (`dynamic-children`) in MVP |
| Pro-only widget desire | Never emit Pro; `custom` if accurate, else `unsupported` (`pro-only-feature`) |

## Reporting requirements

Every unsupported node/gap must include:

- `reasonCode`
- Human `message`
- Related `nodeId` when available
- Optional source `loc` / provenance summary

## Approximation ban (examples)

Forbidden:

- Mapping a custom carousel to a static single image without reporting loss
- Replacing a computed gradient animation with a flat background silently
- Dropping absolute-positioned badges to “simplify” layout without report entries
- Emitting Pro `forms` / `slides` / `nav-menu` etc. to gain fidelity

Allowed:

- Choosing `unsupported` and continuing sibling conversion
- Choosing `custom` when HTML/CSS can honestly reproduce the node
- Emitting native Free widgets when catalog says the feature set matches

## Extending the taxonomy

New codes may be added in later phases with a schema version bump note in `docs/phase-0.md` / changelog. Prefer adding a specific code over overloading `other`.
