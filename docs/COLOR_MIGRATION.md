# Color System Migration Guide

quick reference for migrating old colors to the new research-backed system

## ✅ Already Migrated

- **Login page** (`src/app/login/page.js`)
- **Register page** (`src/app/register/page.js`)  
- **Landing page** (`src/pages/LandingPage.jsx`)

## Color Replacements

### Primary Colors (Blue)

| Old | New | Context |
|-----|-----|---------|
| `indigo-400` | `primary-400` | Links, interactive text |
| `indigo-500` | `primary-500` | Primary buttons, main brand |
| `indigo-600` | `primary-600` | Button hover states |
| `focus:outline-indigo-500` | `focus:outline-primary-500` | Focus rings |

### Neutral Colors (Warm Gray)

| Old | New | Context |
|-----|-----|---------|
| `gray-50` | `neutral-50` | Light backgrounds |
| `gray-100` | `neutral-100` | Subtle backgrounds |
| `gray-200` | `neutral-200` | Borders |
| `gray-300` | `neutral-300` | Secondary text (light) |
| `gray-400` | `neutral-400` | Tertiary text, placeholders |
| `gray-500` | `neutral-500` | Muted text |
| `gray-600` | `neutral-600` | Secondary text |
| `gray-700` | `neutral-700` | Elevated surfaces (dark) |
| `gray-800` | `neutral-800` | Cards/panels (dark) |
| `gray-900` | `neutral-900` | Page backgrounds (dark) |

### Success Colors (Green)

| Old | New | Context |
|-----|-----|---------|
| `green-500` | `success-500` | Success states |
| `bg-green-500/10` | `bg-success-500/10` | Success notification backgrounds |

### Error Colors (Red)

| Old | New | Context |
|-----|-----|---------|
| `red-400` | `error-400` | Error text |
| `red-500` | `error-500` | Error backgrounds |
| `bg-red-500/10` | `bg-error-500/10` | Error notification backgrounds |

## New Colors to Use

### Secondary (Teal) - For Progress States

```jsx
// "In Progress" badge
<span className="bg-secondary-100 text-secondary-700 px-3 py-1 rounded-full">
  In Progress
</span>

// Progress button
<button className="bg-secondary-500 hover:bg-secondary-600 text-white">
  Continue Session
</button>
```

### AI (Amber) - For AI Features

```jsx
// AI suggestion badge
<span className="bg-ai-100 text-ai-700 px-3 py-1 rounded-full">
  AI Suggested
</span>

// AI feature button
<button className="bg-ai-500 hover:bg-ai-600 text-white">
  Ask AI Assistant
</button>

// AI content border
<div className="border-l-4 border-ai-500">
  AI-generated content here
</div>
```

## Component-Specific Patterns

### Auth Pages (Login/Register)

```jsx
// Background
className="bg-neutral-900"

// Card container
className="bg-neutral-800/50 outline outline-1 -outline-offset-1 outline-white/10"

// Input fields
className="bg-white/5 text-white outline-white/10 placeholder:text-neutral-500 focus:outline-primary-500"

// Success message
className="bg-success-500/10 text-white outline-success-500/20"

// Error message
className="bg-error-500/10 text-error-400 outline-error-500/20"

// Primary button (login)
className="bg-primary-500 hover:bg-primary-600"

// Secondary button (register - using teal for progression)
className="bg-secondary-500 hover:bg-secondary-600"
```

### Landing Page

```jsx
// Page background
className="bg-neutral-900"

// Accent text
className="text-primary-400"

// Body text
className="text-neutral-400"

// Featured pricing tier
className="bg-neutral-800"
```

## Finding Colors to Update

### Search Commands

```bash
# find all indigo references
rg "indigo-[0-9]" src/

# find all gray references
rg "gray-[0-9]" src/

# find all green references
rg "green-[0-9]" src/

# find all red references  
rg "red-[0-9]" src/

# find hardcoded hex colors
rg "#[0-9a-fA-F]{6}" src/
```

## Testing Changes

```bash
# build to verify Tailwind compiles
pnpm run build

# run dev server to test visually
pnpm run dev
```

## Key Differences from Tailwind v3

**Tailwind v4 uses `@theme` in CSS, NOT tailwind.config.js:**

❌ **Don't do this:**
```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: { ... }
    }
  }
}
```

✅ **Do this instead:**
```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-primary-500: #3b82f6;
  --color-secondary-500: #14b8a6;
}
```

## Notes

- Custom arbitrary gradients like `from-[#ff80b5]` are fine for decorative elements
- Opacity modifiers work the same: `/10`, `/20`, `/50`
- All colors automatically support dark mode via CSS variables
- Build succeeds with new color system ✅
