# SocsBoard Color System

research-backed color palette optimized for AI-powered learning platforms

## Philosophy

**Blue → Teal → Green Progression**
- **Blue**: Focus, productivity, task initiation
- **Teal**: Progress, learning in action
- **Green**: Completion, mastery achieved
- **Amber**: AI assistance, intelligent suggestions

## Color Palette

### Primary Colors

#### Primary (Blue) - Focus & Productivity
```css
bg-primary-500     /* main brand color */
text-primary-600   /* links, interactive text */
border-primary-500 /* focus rings, active states */
```

**Usage:**
- Primary buttons and CTAs
- Navigation highlights
- Task/note creation actions
- Learning session start states

#### Secondary (Teal) - Progress & Learning
```css
bg-secondary-500   /* progress indicators */
text-secondary-600 /* status messages */
```

**Usage:**
- Progress bars (mid-state)
- "In progress" badges
- Active learning sessions
- Study streaks

#### Success (Green) - Completion
```css
bg-success-500     /* completion states */
text-success-600   /* achievement text */
```

**Usage:**
- Completed tasks
- Success notifications
- Mastery indicators
- Submission confirmations

### Accent Colors

#### AI (Amber) - AI-Powered Features
```css
bg-ai-500          /* AI feature highlights */
text-ai-600        /* AI suggestion text */
border-ai-400      /* AI content borders */
```

**Usage:**
- AI-generated content badges
- Smart suggestions
- Auto-complete highlights
- ML-powered features

#### Error (Red) - Warnings & Destructive Actions
```css
bg-error-500       /* error states */
text-error-600     /* error messages */
```

**Usage:**
- Form validation errors
- Delete confirmations
- Failed submissions
- Warning alerts

### Neutral Colors

#### Backgrounds & Surfaces
```css
bg-neutral-50      /* page background */
bg-surface         /* cards, panels (white in light, gray-800 in dark) */
bg-surface-elevated /* modals, dropdowns */
```

#### Text Hierarchy
```css
text-text          /* primary content */
text-text-secondary /* supporting text, captions */
text-text-tertiary  /* placeholders, hints */
```

#### Borders
```css
border-border       /* standard borders */
border-border-subtle /* subtle dividers */
```

## Semantic Tokens

use these instead of direct color values for automatic dark mode support:

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `bg-background` | neutral-50 | neutral-900 | Page background |
| `bg-surface` | white | neutral-800 | Cards, panels |
| `bg-surface-elevated` | white | neutral-700 | Modals, popovers |
| `text-text` | neutral-900 | neutral-50 | Body text |
| `text-text-secondary` | neutral-600 | neutral-300 | Captions |
| `text-text-tertiary` | neutral-400 | neutral-500 | Placeholders |
| `border-border` | neutral-200 | neutral-700 | Dividers |

## Gradients

### Progress Gradient (Blue → Teal → Green)
```css
bg-[image:var(--gradient-progress)]
```

**Usage:**
- Study session progress bars
- Learning path visualization
- Completion percentages

### AI Feature Gradient
```css
bg-[image:var(--gradient-ai)]
```

**Usage:**
- AI feature banners
- Smart assistant backgrounds
- Premium AI tools

## Opacity Scale

standardized opacity modifiers:

| Modifier | Value | Usage |
|----------|-------|-------|
| `/[0.05]` or `bg-white/[var(--opacity-subtle)]` | 5% | Subtle hover states |
| `/[0.1]` or `bg-white/[var(--opacity-muted)]` | 10% | Muted backgrounds |
| `/[0.2]` or `bg-white/[var(--opacity-border)]` | 20% | Border accents |
| `/[0.5]` or `bg-black/[var(--opacity-overlay)]` | 50% | Modal overlays |
| `/[0.4]` or `text-text/[var(--opacity-disabled)]` | 40% | Disabled states |

## Dark Mode Support

all colors automatically adapt via `@media (prefers-color-scheme: dark)` in globals.css

manual dark mode variants available:

```jsx
<div className="bg-surface text-text dark:bg-surface-elevated dark:text-text-secondary">
  content adapts to theme
</div>
```

## Usage Examples

### Buttons

```jsx
// Primary action
<button className="bg-primary-500 hover:bg-primary-600 text-white">
  Start Learning
</button>

// Secondary action
<button className="bg-secondary-500 hover:bg-secondary-600 text-white">
  Continue Session
</button>

// Success state
<button className="bg-success-500 hover:bg-success-600 text-white">
  Mark Complete
</button>

// AI feature
<button className="bg-ai-500 hover:bg-ai-600 text-white">
  Ask AI Assistant
</button>

// Destructive
<button className="bg-error-500 hover:bg-error-600 text-white">
  Delete Note
</button>
```

### Cards & Surfaces

```jsx
// Standard card
<div className="bg-surface border border-border rounded-lg p-4">
  <h3 className="text-text">Note Title</h3>
  <p className="text-text-secondary">Note description</p>
</div>

// Elevated card (modals, dropdowns)
<div className="bg-surface-elevated border border-border-subtle rounded-lg shadow-lg p-6">
  <h2 className="text-text">Modal Title</h2>
</div>
```

### Status Indicators

```jsx
// In progress
<span className="bg-secondary-100 text-secondary-700 dark:bg-secondary-900 dark:text-secondary-300 px-2 py-1 rounded">
  In Progress
</span>

// Completed
<span className="bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-300 px-2 py-1 rounded">
  Completed
</span>

// AI-generated
<span className="bg-ai-100 text-ai-700 dark:bg-ai-900 dark:text-ai-300 px-2 py-1 rounded">
  AI Suggested
</span>
```

### Input Fields

```jsx
<input 
  className="
    bg-surface 
    border border-border 
    text-text 
    placeholder:text-text-tertiary
    focus:border-primary-500 
    focus:ring-2 
    focus:ring-primary-500/[0.2]
    rounded-lg 
    px-4 
    py-2
  "
  placeholder="Enter note title..."
/>
```

### Progress Bars

```jsx
// Blue to green gradient progress
<div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
  <div 
    className="bg-[image:var(--gradient-progress)] h-2 rounded-full transition-all"
    style={{ width: '65%' }}
  />
</div>

// Single color progress
<div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
  <div className="bg-primary-500 h-2 rounded-full" style={{ width: '45%' }} />
</div>
```

## Accessibility

### Contrast Ratios

all color combinations meet WCAG 2.1 AA standards:

- **Text on Background**: 7:1 (AAA)
- **Interactive Elements**: 4.5:1 minimum
- **Focus Indicators**: 3:1 against adjacent colors

### Focus States

always include visible focus indicators:

```jsx
<button className="
  focus:outline-none 
  focus:ring-2 
  focus:ring-primary-500 
  focus:ring-offset-2
">
  Accessible Button
</button>
```

## Migration Guide

### From Old Colors to New

| Old | New | Notes |
|-----|-----|-------|
| `bg-indigo-500` | `bg-primary-500` | Use semantic token |
| `text-gray-400` | `text-text-tertiary` | Automatic dark mode |
| `bg-gray-900` | `bg-background` or `bg-surface` | Context-dependent |
| `bg-green-500` | `bg-success-500` | Semantic success state |
| `border-white/10` | `border-border-subtle` | Standardized opacity |

### Finding Colors to Update

```bash
# find hardcoded indigo references
rg "indigo-[0-9]" src/

# find gray colors that should be neutral
rg "gray-[0-9]" src/

# find custom hex colors
rg "#[0-9a-f]{6}" src/
```

## Tools & Resources

- **Tailwind CSS v4 Docs**: https://tailwindcss.com/docs/v4-beta
- **Color Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Material Design Theme Builder**: https://material.io/design/color

## Color Psychology References

this palette design is based on research from:
- Brainstream UX study (2025): https://brainstream.ltd/2025/06/30/how-ux-affects-students-learning-process/
- Material Design color system: https://developer.android.com/design/ui/mobile/guides/styles/color
- Blue/green productivity research: https://www.reddit.com/r/Business_Ideas/comments/136ba3b/
