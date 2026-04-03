# Unified Design System Spec

**Goal:** Unify all app pages to share the landing page's glassmorphic aesthetic — dark slate surfaces, subtle indigo tint, ring-based cards — while keeping everything calm, focused, and study-first. Extend Tailwind config with standardized tokens and document conventions.

**North star:** A well-lit library with modern materials. Everything serves reading and focus.

---

## Constraints

- **File tree is FROZEN.** Do not modify `sidebar-list.tsx`, `file-tree-panel.tsx`, `favorites.tsx`, or tree-related CSS overrides in `globals.css` (lines 260-380). The tree's `text-[13px]`, `h-[26px]`, `rounded-[3px]` values are intentional and stay as-is.
- **No new component abstractions.** We extend Tailwind config and add CSS utility classes. No new `<Card>`, `<Container>` React components.
- **Study-focused.** Glassmorphism is subtle — it creates depth, not distraction. No heavy blurs, no animated gradients, no glow effects on working pages.
- **Indigo accent preserved.** The subtle indigo/purple tint (`#6366f1` / indigo-500) is part of the brand. It appears as a very subtle background hint and in accent treatments, never overpowering.
- **Dark theme is primary.** Light theme tokens exist but this spec focuses on dark theme values. Light theme should follow the same structural patterns.

---

## 1. Design Token System (Tailwind Config)

### 1.1 Spacing Scale

No new custom spacing — use Tailwind's existing scale consistently:

| Context  | Tailwind           | Value | Use for                              |
| -------- | ------------------ | ----- | ------------------------------------ |
| Compact  | `p-1` / `py-1`     | 4px   | Dense UI: toolbar icons              |
| Snug     | `p-1.5` / `py-1.5` | 6px   | Compact buttons, small inputs        |
| Default  | `p-2` / `py-2`     | 8px   | Standard buttons, list items         |
| Relaxed  | `p-3` / `py-3`     | 12px  | Card internal padding, larger inputs |
| Spacious | `p-4` / `py-4`     | 16px  | Section padding in app pages         |
| Section  | `p-6` / `py-6`     | 24px  | Page-level section gaps              |
| Hero     | `py-24`            | 96px  | Landing page sections only           |

### 1.2 Border Radius Scale

Add semantic radius tokens to Tailwind config `theme.extend.borderRadius`:

```
radius-sm: 4px   — chips, tags, small badges
radius-md: 6px   — buttons, inputs, dropdown items
radius-lg: 8px   — cards, panels, dropdowns
radius-xl: 12px  — modals, large cards, chat input (full)
radius-2xl: 16px — hero elements (landing page only)
```

**Exceptions:** File tree keeps `rounded-[3px]`. Chat bubbles keep their current radius values.

### 1.3 Typography Scale

Use only standard Tailwind text sizes. Kill all arbitrary values **except** in frozen file tree.

| Token       | Size | Weight  | Font         | Use for                                   |
| ----------- | ---- | ------- | ------------ | ----------------------------------------- |
| `text-xs`   | 12px | 400     | DM Sans      | Metadata, timestamps, captions            |
| `text-sm`   | 14px | 400-500 | DM Sans      | Body text, labels, sidebar items, buttons |
| `text-base` | 16px | 400     | DM Sans      | Primary content, form inputs              |
| `text-lg`   | 18px | 500     | DM Sans      | Section headings within pages             |
| `text-xl`   | 20px | 500     | DM Sans      | Page subtitles                            |
| `text-2xl`  | 24px | 600     | Source Serif | Page titles only                          |

**Rule:** `font-serif` is only used on page-level titles (the main heading on each page). Everything else is `font-sans` (DM Sans).

### 1.4 Container Sizes

Add to Tailwind config `theme.extend.maxWidth`:

```
container-narrow: 480px  — auth forms, single-column focus
container-content: 768px — content pages, quiz, reading
container-wide: 1280px   — settings, landing page, dashboards
```

---

## 2. Surface & Background System

### 2.1 Background Strategy

**All app working pages use flat `bg-background`** — no gradients in areas where users read or interact.

**Landing page only** keeps `bg-landing` radial gradient.

**Remove these gradient classes:**

- `.bg-chat-page` — already simplified to `bg-background`, remove the class entirely and switch references to `bg-background`
- `.bg-editor` — replace with `bg-background`, remove the class

### 2.2 Indigo Accent

Add a new subtle utility class in `globals.css`:

```css
.bg-app-page {
  background: var(--color-background);
  /* subtle indigo warmth — barely visible, adds depth */
  background-image: radial-gradient(
    ellipse at top,
    rgb(99 102 241 / 0.04),
    transparent 60%
  );
}

html.light .bg-app-page {
  background-image: radial-gradient(
    ellipse at top,
    rgb(99 102 241 / 0.03),
    transparent 60%
  );
}
```

This replaces `bg-chat-page` and `bg-editor` for pages that want the faintest indigo hint without a visible gradient. The 0.03-0.04 opacity is intentionally near-invisible — it warms the background without creating a visible glow.

### 2.3 Surface Hierarchy

Four levels, from least to most elevated:

| Level       | Class                | Value (dark)                               | Use for                                           |
| ----------- | -------------------- | ------------------------------------------ | ------------------------------------------------- |
| Base        | `bg-background`      | `#0f172a` (slate-900)                      | Page backgrounds                                  |
| Surface     | `bg-surface`         | `#1e293b` (slate-800)                      | Inputs, editor areas, sidebars                    |
| Glass panel | `.glass-panel` (new) | `bg-white/[0.03] ring-1 ring-white/[0.06]` | Persistent panels, sidebar sections               |
| Glass card  | `.glass-card` (new)  | `bg-white/5 ring-1 ring-white/10`          | Elevated cards, conversation items, feature cards |

**Glass card hover:** `hover:bg-white/[0.07] hover:ring-white/20`
**Glass card active/selected:** `ring-1 ring-primary-500/25 bg-primary-500/10`

### 2.4 CSS Utility Classes (globals.css)

```css
/* glass surfaces — dark theme (default) */
.glass-panel {
  background: rgb(255 255 255 / 0.03);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06);
}

.glass-card {
  background: rgb(255 255 255 / 0.05);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.1);
}

/* glass surfaces — light theme */
html.light .glass-panel {
  background: rgb(0 0 0 / 0.02);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06);
}

html.light .glass-card {
  background: rgb(0 0 0 / 0.03);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08);
}
```

Uses plain `box-shadow` instead of Tailwind's internal ring variables for resilience. Equivalent Tailwind inline: `bg-white/5 ring-1 ring-white/10` (dark) or `bg-black/[0.03] ring-1 ring-black/[0.08]` (light).

---

## 3. Component Patterns

### 3.1 Buttons

Three sizes, one system. Existing Catalyst button component stays. This defines the raw Tailwind conventions for non-Catalyst buttons:

| Size | Classes                                             | Use for                                   |
| ---- | --------------------------------------------------- | ----------------------------------------- |
| sm   | `px-2.5 py-1 text-xs font-medium rounded-radius-md` | Toolbar actions, compact UI, calendar nav |
| md   | `px-3 py-1.5 text-sm font-medium rounded-radius-md` | Standard actions, settings forms, dialogs |
| lg   | `px-4 py-2 text-sm font-semibold rounded-radius-lg` | Primary CTAs, landing page                |

**Primary:** `bg-primary-500 text-white hover:bg-primary-400`
**Secondary/Ghost:** `bg-white/5 text-text-secondary hover:bg-white/10 ring-1 ring-white/10`
**Danger:** `text-error-400 hover:bg-error-500/10`

### 3.2 Inputs

One pattern everywhere:

```
bg-surface border border-border-subtle rounded-radius-md px-3 py-1.5 text-sm text-text
focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50
placeholder:text-text-tertiary
```

**Kills:**

- Settings `bg-white/5 outline-1 -outline-offset-1 outline-border` pattern
- Chat compact `bg-subtle border border-border-subtle rounded` pattern
- Auth `bg-white/5` pattern

**Exception:** Chat full-page input keeps `rounded-xl` for its larger composer textarea.

### 3.3 Cards

Glass card pattern from section 2.3:

```
glass-card rounded-radius-lg p-3
hover:bg-white/[0.07] hover:ring-white/20 transition-colors
```

**Applies to:** Conversation list items, quiz cards, settings section cards, calendar event cards.

**Selected/active card:** Add `ring-primary-500/25 bg-primary-500/10 text-text` — replaces the current `bg-primary-500/15 border border-primary-500/25` on chat items.

### 3.4 Chat Bubbles

Keep current calm treatment from the earlier chat UI work. Only change:

- Assistant bubbles in full mode: add `ring-1 ring-white/10` to create subtle glass edge instead of plain `bg-surface`
- Everything else stays as-is from the Task 4 work

### 3.5 Interactive States

One system everywhere:

| State           | Glass items                          | Structural items                |
| --------------- | ------------------------------------ | ------------------------------- |
| Hover           | `hover:bg-white/[0.07]`              | `hover:bg-subtle`               |
| Active/Selected | `bg-primary-500/10 text-primary-400` | `bg-subtle text-text-secondary` |
| Focus           | `ring-1 ring-primary-500/50`         | `ring-1 ring-primary-500/50`    |

**Kills:** `hover:opacity-70`, `hover:bg-subtle-hover` inconsistencies.

---

## 4. Page-by-Page Changes

### 4.1 Notes Page (`/notes`)

- Remove `.bg-editor` gradient from editor pane — use `bg-background`
- Right inspector panel: add `glass-panel` treatment
- **File tree: NO CHANGES** (frozen)
- Icon nav: already correct from earlier work

### 4.2 Chat Page (`/chat`)

- Replace `bg-chat-page` with `bg-app-page` (subtle indigo hint)
- Conversation sidebar: replace `bg-surface/95 backdrop-blur` with `glass-panel`
- Conversation list items: apply glass-card pattern with active state
- Assistant bubbles (full mode): add `ring-1 ring-white/10`
- New conversation button: apply secondary button md pattern
- Chat input (compact): apply standard input pattern
- Chat input (full): keep `rounded-xl` but apply standard bg/border

### 4.3 Settings Page (`/settings`)

- Page background: `bg-app-page`
- Settings sidebar (navigation): apply `glass-panel`
- Section containers: apply `glass-card` with `p-4`
- All inputs: apply standard input pattern (kill outline-based styling)
- Buttons: match md button size consistently
- Page title: `font-serif text-2xl`

### 4.4 Auth Pages (Login/Register)

- Page background: `bg-app-page`
- Form container: apply `glass-card` with `rounded-radius-xl p-6`
- Social auth buttons: apply secondary button md pattern with `ring-1 ring-white/10`
- All inputs: standard input pattern
- Remove `outline -outline-offset-1` treatments

### 4.5 Calendar Page

- Navigation buttons: match sm button size
- View switcher: match sm button size
- Event cards: apply glass-card
- Right sidebar: apply glass-panel

### 4.6 Quiz Dashboard

- Container: use `container-content` max-width
- Quiz cards: apply glass-card
- Action buttons: match button size scale (md for actions, lg for primary CTA)
- Page title: `font-serif text-2xl`

### 4.7 Landing Page

- **No changes.** Already the source of truth.

---

## 5. Tailwind Config Changes

File: `tailwind.config.js`

```js
theme: {
  extend: {
    borderRadius: {
      'radius-sm': '4px',
      'radius-md': '6px',
      'radius-lg': '8px',
      'radius-xl': '12px',
      'radius-2xl': '16px',
    },
    maxWidth: {
      'container-narrow': '480px',
      'container-content': '768px',
      'container-wide': '1280px',
    },
  }
}
```

---

## 6. globals.css Changes

- Add `.glass-panel` and `.glass-card` utility classes
- Add `.bg-app-page` with subtle indigo radial (0.04 opacity)
- Remove `.bg-chat-page` class (replaced by `.bg-app-page`)
- Remove `.bg-editor` class (replaced by `bg-background`)
- Keep all existing CSS custom properties unchanged
- Keep all file tree CSS overrides unchanged (lines 260-380)

---

## 7. Design Doc

Create `docs/design-system.md` documenting:

- Token scales (spacing, radius, typography, containers)
- Surface hierarchy with examples
- Component patterns with exact Tailwind classes
- Page conventions
- Do's and don'ts:
  - DO use standard Tailwind text sizes (except frozen file tree)
  - DO use glass-card for elevated interactive elements
  - DO use structural borders for layout dividers
  - DON'T add gradients to working pages
  - DON'T use arbitrary text sizes in new code
  - DON'T use outline-based borders (use border or ring)
  - DON'T modify the file tree styling

---

## 8. Testing & Verification

- `npm run lint` must pass
- `npm run test:ci` must pass (450 tests)
- Visual verification at 1200px, 800px viewports
- File tree must look identical before and after
- No regressions in dark/light theme switching
