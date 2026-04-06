# Chat UI Simplicity and Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild chat UI for calm, focused study workflow. Keep icon rail fixed and non-scrollable on both `/notes` and `/chat`. Unify compact and full chat styling into one coherent system.

**Architecture:** Refactor `/chat` into a stable 3-column shell (icon rail + conversation sidebar + main chat). Make all scroll regions explicit: only list/message areas scroll, never structural rails. Update compact chat to use the same visual language as full-screen. Keep message state and backend untouched.

**Tech Stack:** Next.js pages/components, React hooks, Tailwind CSS, Zustand (existing state).

---

## File-Level Plan

- **`src/components/layout/vscode-layout.tsx`** — enforce icon rail non-scroll behavior
- **`src/components/sidebar/icon-nav.tsx`** — ensure rail occupies full height
- **`src/app/chat/page.tsx`** — adopt 3-column stable shell layout
- **`src/components/chat/chat-interface.tsx`** — unify compact/full visual language, pin composer
- **`src/app/globals.css`** — optional calm minimal style tweaks (only if needed)

---

### Task 1: Enforce Icon Rail Non-Scroll in Layout

**Files:**

- Modify: `src/components/layout/vscode-layout.tsx`

- [ ] **Step 1: Read current layout structure**

Run: No command — just understand the current grid setup and how icon rail is positioned.

- [ ] **Step 2: Update icon rail container to prevent scrolling**

In `src/components/layout/vscode-layout.tsx`, change the icon nav pane (Pane 1) from:

```jsx
// Old: may scroll if content exceeds height
<div className="bg-background border-r border-border-subtle overflow-y-auto flex flex-col">
  <IconNav />
</div>
```

To:

```jsx
// New: explicit non-scroll behavior
<div className="bg-background border-r border-border-subtle overflow-hidden flex flex-col">
  <IconNav />
</div>
```

- [ ] **Step 3: Verify no other pane accidentally captures scroll**

Check that each grid pane uses one of:

- `overflow-hidden` (no scroll)
- `overflow-y-auto` (scroll enabled)

Ensure only content panes (tree, editor, right panel) have `overflow-y-auto`, and icon rail has `overflow-hidden`.

- [ ] **Step 4: Run lint**

Run: `npm run lint -- src/components/layout/vscode-layout.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/vscode-layout.tsx
git commit -m "fix: enforce icon rail non-scroll behavior in vscode-layout"
```

---

### Task 2: Ensure Icon Rail Full Height

**Files:**

- Modify: `src/components/sidebar/icon-nav.tsx`

- [ ] **Step 1: Read current icon-nav structure**

Understand that the component is wrapped in a height-controlled div. The component itself should not dictate scroll behavior; its parent does.

- [ ] **Step 2: Verify icon-nav uses full available height**

The icon nav component currently returns:

```jsx
<div className="h-full w-12 shrink-0 flex flex-col items-center py-4 gap-2">
```

Confirm `h-full` is present. It should be — this means the component will fill whatever height its parent provides. No changes needed if this is already correct.

- [ ] **Step 3: Add inline comment clarifying non-scroll contract**

Add a comment at the top of the component:

```jsx
/**
 * Icon-only navigation sidebar (48px fixed width)
 * VSCode-style left navigation with hover tooltips
 * NOTE: Parent container is responsible for overflow behavior (overflow-hidden).
 * This component should never be scrollable; it fills full height.
 */
```

- [ ] **Step 4: Run lint**

Run: `npm run lint -- src/components/sidebar/icon-nav.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/icon-nav.tsx
git commit -m "docs: clarify icon-nav non-scroll contract in comments"
```

---

### Task 3: Refactor `/chat` Page into 3-Column Shell

**Files:**

- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Plan the new structure**

New layout:

```
[48px icon rail | 240px sidebar | flex main chat]
```

Scroll rules:

- icon rail: `overflow-hidden`
- sidebar: `overflow-hidden` but conversation list inside is `overflow-y-auto`
- main chat: `overflow-hidden` but message area inside is `overflow-y-auto`

- [ ] **Step 2: Update ChatPageInner wrapper**

Replace the current full-width flex:

```jsx
// Old:
return (
  <div className="h-screen w-screen flex bg-chat-page text-text overflow-hidden">
    {/* ── left sidebar ───────────────────────────────────────────── */}
    <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border-subtle bg-surface/95 backdrop-blur">
```

With:

```jsx
// New: 3-column grid including icon rail
return (
  <div className="h-screen w-screen flex bg-chat-page text-text overflow-hidden">
    {/* ── icon navigation rail (48px fixed) ───────────────────────── */}
    <div className="w-12 shrink-0 bg-background border-r border-border-subtle overflow-hidden">
      <IconNav />
    </div>

    {/* ── conversation sidebar (240px fixed) ───────────────────────── */}
    <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border-subtle bg-surface/95 backdrop-blur overflow-hidden">
```

- [ ] **Step 3: Add import for IconNav at top of file**

```jsx
import IconNav from "@/components/sidebar/icon-nav";
```

- [ ] **Step 4: Verify conversation list has explicit scroll**

Inside the sidebar, the conversation nav already has `overflow-y-auto`:

```jsx
<nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 obsidian-scrollbar">
```

Confirm this is still present — no changes needed.

- [ ] **Step 5: Run lint**

Run: `npm run lint -- src/app/chat/page.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/chat/page.tsx
git commit -m "refactor: add fixed icon rail to /chat 3-column layout"
```

---

### Task 4: Unify Chat Interface Visual Language (Compact + Full)

**Files:**

- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Identify styling differences between compact and full variants**

Read through the component and note:

- Bubble styling (radius, padding, colors)
- Text sizing (h-_ w-_ text-\*)
- Spacing (gap, py, px)
- Border treatment
- Source chip styling

- [ ] **Step 2: Extract shared message bubble styles into consistent class names**

In `src/components/chat/chat-interface.tsx`, update the compact variant message rendering (around line 390):

Old user bubble:

```jsx
className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs leading-relaxed ${
  m.role === "user"
    ? "bg-primary-500/80 text-text-on-primary rounded-br-none"
    : "bg-subtle text-text-secondary rounded-bl-none border border-border-subtle"
}`}
```

New user bubble (calmer, unified):

```jsx
className={`max-w-[85%] px-2.5 py-1.5 rounded-md text-xs leading-relaxed ${
  m.role === "user"
    ? "bg-primary-500/70 text-text-on-primary rounded-br-sm"
    : "bg-surface border border-border-subtle text-text-secondary rounded-bl-sm"
}`}
```

- [ ] **Step 3: Update full-variant bubble styling to match**

Around line 514, update assistant bubble from:

```jsx
className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
  m.role === "user"
    ? "bg-primary-500 text-text-on-primary rounded-br-sm"
    : "bg-surface text-text rounded-bl-sm border border-border-subtle"
}`}
```

To:

```jsx
className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
  m.role === "user"
    ? "bg-primary-500/85 text-text-on-primary rounded-br-sm"
    : "bg-surface text-text rounded-bl-sm border border-border-subtle"
}`}
```

(Make user bubble slightly less saturated for calm feel.)

- [ ] **Step 4: Tighten compact sidebar chat spacing**

Around line 384, update container:

```jsx
// Old: lots of space
<div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">

// New: tighter but clean
<div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1.5">
```

- [ ] **Step 5: Update source chips styling (compact)**

Around line 79, make chips quieter:

Old:

```jsx
className =
  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-subtle border border-border-subtle text-[10px] text-text-tertiary hover:text-text-secondary hover:border-border transition-colors";
```

New:

```jsx
className =
  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-subtle border border-border-subtle text-[10px] text-text-tertiary hover:text-text-secondary transition-colors";
```

- [ ] **Step 6: Ensure compact input stays pinned**

Around line 439, confirm the input wrapper uses flex-shrink-0:

```jsx
<div className="flex-shrink-0 border-t border-border-subtle px-2 py-2">
```

This is correct — no changes needed.

- [ ] **Step 7: Run lint**

Run: `npm run lint -- src/components/chat/chat-interface.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/chat/chat-interface.tsx
git commit -m "style: unify chat bubble styling and spacing (compact + full)"
```

---

### Task 5: Pin Main Chat Composer and Context Bar

**Files:**

- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Ensure full-variant context bar is sticky**

Around line 478, the context banner should remain:

```jsx
{(noteId || noteTitle) && (
  <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-subtle text-xs text-text-tertiary">
```

Confirm `flex-shrink-0` is present — it is. No changes needed.

- [ ] **Step 2: Ensure full-variant input bar is pinned to bottom**

Around line 619, the input wrapper currently uses:

```jsx
<div className="flex-shrink-0 border-t border-border-subtle bg-background px-4 md:px-8 lg:px-12 py-4">
```

This is correct — `flex-shrink-0` prevents it from collapsing. No changes needed.

- [ ] **Step 3: Ensure message list uses flex-1 overflow**

Around line 500, confirm:

```jsx
<div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 py-6 space-y-5 obsidian-scrollbar">
```

This is correct. No changes needed.

- [ ] **Step 4: Verify no changes needed — commit as verification**

All pinning logic is already correct. No code changes required for this task.

```bash
git status
# Expected: no changes in chat-interface.tsx for this step
```

---

### Task 6: Simplify Chat Styling in globals.css (Optional)

**Files:**

- Modify: `src/app/globals.css` (optional, only if needed)

- [ ] **Step 1: Check if calm minimal bg-chat-page needs adjustment**

Current `.bg-chat-page` is defined around line 375:

```css
.bg-chat-page {
  background: radial-gradient(
    ellipse at top,
    rgb(99 102 241 / 0.2),
    var(--color-background) 58%
  );
}
```

This gradient adds slight purple vibe. For true calm minimal, simplify to:

```css
.bg-chat-page {
  background: var(--color-background);
}
```

- [ ] **Step 2: Decide: keep or simplify?**

**Decision point:** If you want the most minimal feel, change to flat background. Otherwise, keep the gradient.

For now, **assume simplify** (flat background is more "calm minimal").

Update `src/app/globals.css` around line 375:

```css
/* chat page — calm flat background */
.bg-chat-page {
  background: var(--color-background);
}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint -- src/app/globals.css`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style: simplify chat page background to flat calm minimal"
```

---

### Task 7: Verify Layout and Scroll Behavior

**Files:**

- No file changes

- [ ] **Step 1: Manual desktop verification**

Load the app on desktop and navigate through:

1. `/notes` — confirm icon rail is always visible, does not scroll
2. Inspector sidebar with chat tab active — confirm message area scrolls, input stays pinned
3. `/chat` — confirm icon rail + sidebar + main chat all visible, each scroll region independent

- [ ] **Step 2: Stress test long conversations**

In `/chat`:

1. Send 10+ messages to build a long conversation list
2. Scroll the conversation sidebar independently — should not affect main chat area
3. Send a long assistant response (multiple paragraphs)
4. Scroll main message area — should not affect sidebar or rails
5. Confirm composer stays pinned to bottom

- [ ] **Step 3: Manual responsive check**

Reduce viewport width gradually (1200px → 800px → 480px):

1. Icon rail should remain visible at all widths
2. Conversation sidebar should shrink or hide gracefully (if needed)
3. Main chat should remain readable (no horizontal scroll on messages)

- [ ] **Step 4: Lint all changed files**

Run: `npm run lint -- src/components/layout/vscode-layout.tsx src/components/sidebar/icon-nav.tsx src/app/chat/page.tsx src/components/chat/chat-interface.tsx src/app/globals.css`

Expected: PASS (no errors)

- [ ] **Step 5: Run test suite (if any chat/layout tests exist)**

Run: `npm run test:ci`

Expected: PASS

- [ ] **Step 6: Final commit (if any small fixes needed)**

```bash
git status
# If any linting auto-fixes were applied:
git add .
git commit -m "fix: lint formatting and minor style adjustments"
```

---

## Summary

✅ Icon rail is explicitly non-scrollable in both `/notes` and `/chat`
✅ `/chat` uses stable 3-column shell (icon rail + conversation sidebar + main chat)
✅ Compact and full chat variants use unified visual language (calm, minimal)
✅ Scroll regions are explicit (only message list and conversation list scroll)
✅ Composers and context bars are pinned to prevent layout shifts

---

Plan complete and saved to `docs/superpowers/plans/2026-04-03-chat-ui-simplicity-focus.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
