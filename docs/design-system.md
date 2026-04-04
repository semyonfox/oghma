# OghmaNotes Design System

A calm, study-focused glassmorphic aesthetic. Modern materials from the landing page, applied quietly so content stays in focus.

**North star:** A well-lit library with modern materials. Everything serves reading and focus.

---

## Surfaces

Four levels, from least to most elevated:

| Level       | Class           | Dark                            | Light                          | Use for                                  |
| ----------- | --------------- | ------------------------------- | ------------------------------ | ---------------------------------------- |
| Base        | `bg-background` | `#0f172a`                       | `#f8fafc`                      | Page backgrounds                         |
| App page    | `bg-app-page`   | slate-900 + faint indigo radial | slate-50 + faint indigo radial | Full-page layouts (chat, settings, auth) |
| Surface     | `bg-surface`    | `#1e293b`                       | `#ffffff`                      | Inputs, editor areas                     |
| Glass panel | `.glass-panel`  | white/3% + 1px white/6%         | black/2% + 1px black/6%        | Persistent panels, sidebars              |
| Glass card  | `.glass-card`   | white/5% + 1px white/10%        | black/3% + 1px black/8%        | Elevated cards, list items               |

### Glass card variants

```
.glass-card              — static card (no interaction)
.glass-card-interactive  — hoverable card (bg + ring brighten on hover)
.glass-card-active       — selected/active state (primary-500 tint)
```

### When to use what

- **`bg-background`**: editor content area, notes pane
- **`bg-app-page`**: full-page shells (chat, settings, auth, quiz)
- **`bg-surface`**: form inputs, textareas, code blocks
- **`.glass-panel`**: sidebars, inspector panels, persistent navigation
- **`.glass-card`**: conversation items, quiz cards, settings sections
- **`.glass-card-interactive`**: any card the user clicks or hovers
- **`.glass-card-active`**: currently selected card in a list

---

## Borders

**Hybrid system:**

- **Structural dividers** (sidebar edges, header/footer separators): `border border-border-subtle`
- **Cards and panels**: glass classes provide borders via `box-shadow` — no `border` class needed
- **Inputs**: `border border-border-subtle` (structural, not glass)

---

## Border Radius

Semantic tokens defined in `tailwind.config.js`:

| Token                | Value | Use for                           |
| -------------------- | ----- | --------------------------------- |
| `rounded-radius-sm`  | 4px   | Chips, tags, small badges         |
| `rounded-radius-md`  | 6px   | Buttons, inputs, dropdown items   |
| `rounded-radius-lg`  | 8px   | Cards, panels, dropdowns          |
| `rounded-radius-xl`  | 12px  | Modals, large cards, auth forms   |
| `rounded-radius-2xl` | 16px  | Hero elements (landing page only) |

**Exceptions:** File tree keeps `rounded-[3px]`. Chat bubbles keep their current radius values.

---

## Typography

| Size               | Font         | Use for                                   |
| ------------------ | ------------ | ----------------------------------------- |
| `text-xs` (12px)   | DM Sans      | Metadata, timestamps, captions            |
| `text-sm` (14px)   | DM Sans      | Body text, labels, sidebar items, buttons |
| `text-base` (16px) | DM Sans      | Primary content, form inputs              |
| `text-lg` (18px)   | DM Sans      | Section headings within pages             |
| `text-xl` (20px)   | DM Sans      | Page subtitles                            |
| `text-2xl` (24px)  | Source Serif | Page titles only                          |

**Rule:** `font-serif` (Source Serif) is only for page-level titles. Everything else is `font-sans` (DM Sans).

**Don't** use arbitrary text sizes (`text-[13px]`, `text-[11px]`) in new code. The file tree is an exception — its sizing is frozen.

---

## Spacing

Use Tailwind's standard spacing scale consistently:

| Context  | Classes | Value | Use for                       |
| -------- | ------- | ----- | ----------------------------- |
| Compact  | `p-1`   | 4px   | Dense UI: toolbar icons       |
| Snug     | `p-1.5` | 6px   | Compact buttons, small inputs |
| Default  | `p-2`   | 8px   | Standard buttons, list items  |
| Relaxed  | `p-3`   | 12px  | Card internal padding         |
| Spacious | `p-4`   | 16px  | Section padding in app pages  |
| Section  | `p-6`   | 24px  | Page-level section gaps       |
| Hero     | `py-24` | 96px  | Landing page sections only    |

---

## Container Sizes

Defined in `tailwind.config.js`:

| Token                     | Width  | Use for                            |
| ------------------------- | ------ | ---------------------------------- |
| `max-w-container-narrow`  | 480px  | Auth forms, single-column focus    |
| `max-w-container-content` | 768px  | Content pages, quiz, reading       |
| `max-w-container-wide`    | 1280px | Settings, landing page, dashboards |

---

## Buttons

Three sizes, consistent everywhere:

| Size | Classes                                             |
| ---- | --------------------------------------------------- |
| sm   | `px-2.5 py-1 text-xs font-medium rounded-radius-md` |
| md   | `px-3 py-1.5 text-sm font-medium rounded-radius-md` |
| lg   | `px-4 py-2 text-sm font-semibold rounded-radius-lg` |

**Variants:**

- Primary: `bg-primary-500 text-white hover:bg-primary-400`
- Secondary: `glass-card-interactive text-text-secondary`
- Danger: `text-error-400 hover:bg-error-500/10`

---

## Inputs

One pattern everywhere:

```
bg-surface border border-border-subtle rounded-radius-md px-3 py-1.5 text-sm text-text
focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50
placeholder:text-text-tertiary
```

**Exception:** Chat full-page composer keeps `rounded-2xl` for its larger textarea.

---

## Interactive States

| State           | Glass items                      | Structural items                |
| --------------- | -------------------------------- | ------------------------------- |
| Hover           | `.glass-card-interactive` (auto) | `hover:bg-subtle`               |
| Active/Selected | `.glass-card-active`             | `bg-subtle text-text-secondary` |
| Focus           | `ring-1 ring-primary-500/50`     | `ring-1 ring-primary-500/50`    |

---

## Colors

### Palette (defined in `globals.css` as CSS custom properties)

- **Primary** (blue): Focus, productivity, interactive elements
- **Secondary** (teal): Progress, learning, completion
- **AI** (amber): AI-powered features
- **Success** (green): Completion states
- **Error** (red): Warnings, destructive actions
- **Indigo accent**: Subtle background warmth via `bg-app-page`

### Text hierarchy

| Token                  | Dark      | Light     |
| ---------------------- | --------- | --------- |
| `text-text`            | slate-100 | slate-900 |
| `text-text-secondary`  | slate-300 | slate-600 |
| `text-text-tertiary`   | slate-400 | slate-500 |
| `text-text-on-primary` | white     | white     |

---

## Do's and Don'ts

**Do:**

- Use standard Tailwind text sizes in new code
- Use `glass-card` / `glass-card-interactive` for elevated interactive elements
- Use structural borders (`border border-border-subtle`) for layout dividers
- Use `bg-app-page` for full-page shells
- Use `bg-surface` for form inputs and text areas
- Use `font-serif` only on page-level titles

**Don't:**

- Add gradients to working pages (only landing page gets `bg-landing`)
- Use arbitrary text sizes (`text-[13px]`) in new code
- Use `outline`-based borders (use `border` or glass classes)
- Use `bg-white/5` for inputs (use `bg-surface` instead)
- Mix ring utilities with glass classes (glass classes use `box-shadow`)
- Modify the file tree styling (it's frozen)

---

## File Reference

| File                    | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `tailwind.config.js`    | Design tokens (colors, radius, containers)        |
| `src/app/globals.css`   | CSS custom properties, glass utilities, scrollbar |
| `src/app/page.js`       | Landing page (source of truth for aesthetic)      |
| `docs/design-system.md` | This document                                     |
