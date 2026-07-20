# Design System

> **Status:** Active reference
>
> **Last reviewed:** 2026-07-11
>
> **Source of truth:** [`src/app/globals.css`](../../src/app/globals.css), [`tailwind.config.js`](../../tailwind.config.js), and this usage guide

OghmaNotes uses a calm, study-focused interface: quiet surfaces, an indigo focus colour, and restrained glass effects that keep reading and writing primary.

## Token ownership

- `src/app/globals.css` is the runtime source of truth for semantic colour variables, fonts, Markdown tokens, and shared utilities such as `.glass-panel` and `.glass-card*`.
- `tailwind.config.js` maps semantic variables into Tailwind names and defines the named radius and container scales.
- When a shared value appears in both places, update both in the same change. Do not introduce a third local value to work around a mismatch.

## Surfaces

| Surface | Class | Use |
|---|---|---|
| Base | `bg-background` | Reading/editor backgrounds and the default page canvas |
| App shell | `bg-app-page` | Full-page application shells such as chat, settings, auth, and quiz |
| Solid surface | `bg-surface` | Inputs, text areas, editor regions, and code-adjacent UI |
| Glass panel | `.glass-panel` | Persistent navigation, sidebars, and inspectors |
| Glass card | `.glass-card` | Elevated, non-interactive groups |
| Interactive card | `.glass-card-interactive` | Clickable or hoverable cards |
| Selected card | `.glass-card-active` | The selected item in a card collection |

Use structural borders (`border-border-subtle`) for dividers and inputs. Glass utilities supply their own border-like shadow; do not stack a normal border or ring on top without a deliberate visual review.

## Shape and layout

| Token | Value | Typical use |
|---|---:|---|
| `rounded-radius-sm` | 4px | Chips and badges |
| `rounded-radius-md` | 6px | Buttons and inputs |
| `rounded-radius-lg` | 8px | Cards and panels |
| `rounded-radius-xl` | 12px | Modals and large cards |
| `rounded-radius-2xl` | 16px | Hero or deliberately soft focal elements |

Named content widths are `max-w-container-narrow` (480px), `max-w-container-content` (768px), and `max-w-container-wide` (1280px). Prefer the standard Tailwind spacing scale; use compact spacing for controls and progressively larger spacing for cards, sections, and landing-page compositions.

The file tree retains its deliberately dense sizing and small radius. Treat it as an explicit exception, not a template for new UI.

## Typography and colour

- Variable DM Sans (`font-sans`) is the interface and body face. Its open shapes and restrained weight range keep dense controls legible.
- Variable Source Serif 4 (`font-serif`) is reserved for page-level titles, long-form note headings, and intentional editorial display. Chat headings stay in DM Sans because chat is compact interface content.
- The shared Tailwind scale in `globals.css` pairs each `text-xs` through `text-7xl` size with an explicit line height. Prefer that scale; avoid new arbitrary pixel sizes and one-off line heights.
- Long-form paragraphs target a maximum measure of `72ch`. Full-width tables, code, media, and application UI are intentional exceptions.
- Headings use restrained negative tracking and balanced wrapping. Body copy uses normal tracking and at least 1.5 line-height where it may wrap across several lines.
- Do not put fixed heights on text containers. The interface must tolerate the WCAG text-spacing overrides without clipping or overlap.
- Public marketing pages use named roles: `type-display`, `type-section-title`, `type-eyebrow`, `type-lead`, `type-card-title`, and `type-body`. These roles keep hierarchy consistent across sections instead of repeating ad hoc size/weight combinations.
- `text-text`, `text-text-secondary`, and `text-text-tertiary` form the content hierarchy.
- Primary is **indigo** for focus and interaction; secondary teal represents learning/progress; amber identifies AI features; green and red retain success/error meaning.

## Controls

Use three button densities:

| Size | Classes |
|---|---|
| Small | `px-2.5 py-1 text-xs font-medium rounded-radius-md` |
| Medium | `px-3 py-1.5 text-sm font-medium rounded-radius-md` |
| Large | `px-4 py-2 text-sm font-semibold rounded-radius-lg` |

Primary actions use the primary scale, secondary actions use the interactive glass treatment, and destructive actions use the error scale without turning the whole page red.

The default input pattern is:

```text
bg-surface border border-border-subtle rounded-radius-md px-3 py-1.5
text-sm text-text placeholder:text-text-tertiary
focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50
```

Large composers may intentionally use a softer radius. All controls still need visible keyboard focus, disabled state, and readable contrast in light and dark themes.

## Guardrails

- Reuse semantic tokens and shared surface utilities before adding one-off colour or shadow values.
- Keep gradients and decorative effects concentrated in landing or deliberate hero surfaces.
- Use structural borders for layout; use glass utilities for elevation.
- Do not encode state with colour alone.
- Check both themes and keyboard focus before treating a component as complete.
- If a new pattern recurs, promote it into the token/utilities layer and document it here.
