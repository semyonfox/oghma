# Design System

> **Status:** Active reference
>
> **Last reviewed:** 2026-11-08 (Atlas)
>
> **Source of truth:** [`src/app/globals.css`](../../src/app/globals.css), [`tailwind.config.js`](../../tailwind.config.js), and this usage guide

OghmaNotes uses **Atlas**: a light, reading-first interface with a neutral charcoal dark twin. Literata sets titles and reading text, Geist sets the interface, and one cobalt accent marks what you can act on. Separation comes from hairlines, never from coloured edges, gradients or glows. The browsable reference (tokens, components, logos) is the Atlas design-system artifact; this page is the engineering contract.

## Token ownership

- `src/app/globals.css` is the runtime source of truth for semantic colour variables, fonts, Markdown tokens, and shared utilities such as `.glass-panel` and `.glass-card*`.
- `tailwind.config.js` maps semantic variables into Tailwind names and defines the named radius and container scales.
- When a shared value appears in both places, update both in the same change. Do not introduce a third local value to work around a mismatch.

## Surfaces

| Surface | Class | Use |
|---|---|---|
| Base | `bg-background` | Reading/editor backgrounds and the default page canvas |
| App shell | `bg-app-page` | Full-page application shells such as chat, settings, auth, and quiz (plain ground, no tint) |
| Solid surface | `bg-surface` | Cards, inputs, editor and reading regions |
| Elevated | `bg-surface-elevated` | Code blocks, quotes, stat tiles, segmented-control tracks |
| Navigation | `bg-sidebar` / `.glass-panel` | The desktop rail, sidebars and inspectors (solid, hairline edge) |
| Card | `.glass-card` | Hairline-bordered groups |
| Interactive card | `.glass-card-interactive` | Clickable cards; hover darkens the hairline |
| Selected card | `.glass-card-active` | The selected card: 1.5px accent ring |
| Raised pill | `.atlas-raised` (`bg-selected shadow-raised`) | The one active state for nav items, tree rows, list rows and segments |

Use hairlines (`border-border`, `border-border-subtle`) for dividers and inputs. **Never mark selection or emphasis with a coloured left, top or side bar**, an inset stripe, a gradient or a glow. Tab underlines are the only accent line. The glass-* names are kept for compatibility; in Atlas they are solid.

## Shape and layout

| Token | Value | Typical use |
|---|---:|---|
| `rounded-radius-sm` | 6px | Chips, badges, kbd hints, tree rows |
| `rounded-radius-md` | 8px | Inputs and nav items |
| `rounded-radius-lg` | 10px | Buttons, source cards, code blocks |
| `rounded-radius-xl` | 14px | Cards, sheets and the chat composer |
| `rounded-radius-2xl` | 20px | Large feature cards and modals |
| `rounded-full` | pill | The mobile dock and its items, toggles, pill chips, avatars |

Named content widths are `max-w-container-narrow` (480px), `max-w-container-content` (768px), and `max-w-container-wide` (1280px). Prefer the standard Tailwind spacing scale; use compact spacing for controls and progressively larger spacing for cards, sections, and landing-page compositions.

The file tree retains its deliberately dense sizing and small radius. Treat it as an explicit exception, not a template for new UI.

## Typography and colour

- Geist (`font-sans`) is the interface face for every control, label and UI sentence.
- Literata (`font-serif`, also `font-display`) sets note titles, page titles, editorial headings and note reading text. Chat answers stay in Geist.
- Geist Mono (`font-mono`) sets module codes (`CT230`), page numbers, counts in tables, keyboard hints and code.
- All three load through `next/font/google` in `src/app/layout.tsx` and `@expo-google-fonts/*` in the Android app.
- Captions use 12px, compact controls use 14px, and reading text uses 16px. Phone inputs use at least 16px to prevent browser zoom.
- The shared Tailwind scale in `globals.css` pairs each `text-xs` through `text-7xl` size with an explicit line height. Prefer that scale; avoid new arbitrary pixel sizes and one-off line heights.
- Long-form paragraphs target a maximum measure of `72ch`. Full-width tables, code, media, and application UI are intentional exceptions.
- Headings use restrained negative tracking and balanced wrapping. Body copy uses normal tracking and at least 1.5 line-height where it may wrap across several lines.
- Do not put fixed heights on text containers. The interface must tolerate the WCAG text-spacing overrides without clipping or overlap.
- Public marketing pages use named roles: `type-display`, `type-section-title`, `type-eyebrow`, `type-lead`, `type-card-title`, and `type-body`. These roles keep hierarchy consistent across sections instead of repeating ad hoc size/weight combinations.
- `text-text`, `text-text-secondary`, and `text-text-tertiary` form the content hierarchy.
- Colour has strict meanings. **Cobalt** (`accent`, `primary-*`, `ai-*`) means interactive, selected, in progress or AI. **Green** (`success-*`, the logo green; `secondary-*` aliases it) means only correct, done, saved, connected, imported or mastered. **Red** (`error-*`) means error, destructive or incorrect. **Amber** (`warning-*`) means attention. Everything else is neutral; headings are ink, not coloured.
- Dark mode keeps the accent sparse: `action` (primary buttons) is ink and `accent-soft` chips are neutral. Light mode uses cobalt for both.
- Never use raw Tailwind palette classes (`blue-500`, `zinc-800`, `amber-400`, …), `text-white`, or hex colours in components. Use the semantic tokens.

## Controls

Use three button densities:

| Size | Classes |
|---|---|
| Small | `px-2.5 py-1 text-xs font-medium rounded-radius-md` |
| Medium | `px-3 py-1.5 text-sm font-medium rounded-radius-md` |
| Large | `px-4 py-2 text-sm font-semibold rounded-radius-lg` |

Primary actions use `bg-action hover:bg-action-hover text-on-action`. Secondary actions use `bg-surface border border-border text-text` (hover: `border-border-strong`). Ghost actions have no fill (`text-text-secondary hover:bg-subtle`). Destructive actions use the error colour without turning the whole page red. Switches: on = `bg-action`, off = `bg-border-strong`. Chat pill toggles: on = `bg-accent-soft` with an accent hairline.

Quiz answers: a picked-but-unchecked option is neutral (raised pill with a `border-strong` ring). Only a checked correct answer is green and only a checked wrong answer is red, and both carry a word as well as the colour.

The default input pattern is:

```text
bg-surface border border-border-subtle rounded-radius-md px-3 py-1.5
text-sm text-text placeholder:text-text-tertiary
focus:ring-1 focus:ring-accent/50 focus:border-accent
```

Large composers may intentionally use a softer radius. All controls still need visible keyboard focus, disabled state, and readable contrast in light and dark themes. Use `text-base md:text-sm` for inputs.

Shared compact icon controls use `.ui-icon-button`: 44px below 1024px and 32px on desktop, with consistent focus, hover and disabled states. Give icon-only actions an accessible label. Actions hidden on hover must remain available on touch devices.

## Application navigation

The main workspaces use a five-destination floating bottom dock below 1024px and in the Android app: Notes, AI Chat, Calendar, Quiz, and More. Desktop browsers use the navigation rail. The More sheet holds secondary destinations such as search, settings, focus, Trash, and the native offline reader when it is available. Give each scroll region end clearance so its last item remains reachable. On chat, the dock stays at the bottom and the composer reserves its height, so the composer sits directly above the navigation.

The navigation pill is 64px tall with labels, 52px with icons when scrolling down. Its ring is the `border` hairline with `shadow-float`; the selected destination is `bg-subtle-hover` with `text-accent-hover`. Its labels fade out as it shrinks and fade in after sustained upward scrolling, route changes, or keyboard focus. In the Android app's WebView, the pill uses a 70% opaque app surface over an 8.75px backdrop blur; the website uses a 90% opaque surface without blur. Both have a hairline ring and the floating shadow, and the selected destination uses the `subtle-hover` tint with the accent colour. Neither has a full-width backing bar. Keep 44px touch targets in both states, respect reduced motion, and hide the dock and its clearance while the keyboard is open. Single-line mobile headers start at 56px rather than 80px.

Below 1024px, Notes opens in a library-first view. Folder navigation drills into the selected folder and exposes a clear return path; opening a note moves to its compact editor. Do not render the desktop file tree on a phone. Editor actions sit below the filename, where they remain reachable without crowding the header. From 768px to 1023px, the inspector uses a drawer so it cannot squeeze the editor below its minimum width.

Mobile drawers dismiss toward their opening edge; bottom sheets dismiss downward. Only claim a single-finger outward gesture. Preserve form controls, text selection, multi-touch, and nested scrolling. Bottom-sheet content can start a dismissal only at the top of its scroll region. Keep close buttons and Escape/backdrop dismissal available.

Calendar is agenda-first on phones. A compact week strip selects the day and the month grid expands only when needed; the page header owns the month, Today, and period controls. This avoids duplicate mobile toolbars while retaining the full month view.

## Guardrails

- Reuse semantic tokens and shared surface utilities before adding one-off colour or shadow values.
- No gradients, glows, coloured shadows or decorative blobs anywhere, including the landing page.
- Use structural borders for layout; use glass utilities for elevation.
- Do not encode state with colour alone.
- Check both themes and keyboard focus before treating a component as complete.
- If a new pattern recurs, promote it into the token/utilities layer and document it here.
