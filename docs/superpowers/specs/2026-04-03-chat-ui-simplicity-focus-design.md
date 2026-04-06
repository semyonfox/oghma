# AI Chat UI Simplicity and Focus Design

Date: 2026-04-03
Status: approved in conversation, pending final spec review

## Goal

Make AI chat feel calmer, clearer, and more study-focused in both contexts:

- sidebar mini-chat in the notes inspector
- full-screen `/chat` experience

The design must remove visual clutter and keep navigation stable. The icon rail must remain visible and non-scrollable in both `/notes` and `/chat`.

## User Intent Captured

- "no vibe coded slop"
- focus on simplicity and study flow
- polish both sidebar and full-screen chat
- icon sidebar must not disappear or become scrollable
- acceptable to replace current chat UI with a stronger prebuilt-style structure

## Scope

- Redesign chat UI structure and styling in:
  - `src/app/chat/page.tsx`
  - `src/components/chat/chat-interface.tsx`
- Ensure icon rail behavior is fixed and non-scrollable in:
  - `src/components/layout/vscode-layout.tsx`
  - `src/components/sidebar/icon-nav.tsx`
- Optional small style token/use-site adjustments in `src/app/globals.css` for consistency.

## Out of Scope

- Any backend API changes (`/api/chat`, sessions, streaming)
- Any AI model behavior or prompt changes
- New chat product features (attachments, reactions, threaded replies)

## Current Problems

1. Visual hierarchy is inconsistent between compact and full chat variants.
2. Full-screen chat has too much decorative styling for a focused study workflow.
3. Sidebar and main chat shells are not unified by one clear layout contract.
4. Icon rail behavior is not explicitly enforced as non-scrollable across both contexts.

## Design Principles

1. **calm minimal**: flat surfaces, subtle borders, low-noise accents
2. **layout stability**: headers and composers stay pinned; only content regions scroll
3. **one visual language**: compact and full chat use the same spacing and tone system
4. **study-first readability**: message typography and rhythm optimized for long answers
5. **functional over decorative**: remove cosmetic effects that do not improve task focus

## Proposed Layout Architecture

### `/chat` (full-screen)

Use a stable 3-column shell:

1. fixed icon rail (48px)
2. conversation sidebar (fixed width)
3. main chat area (flex)

Scroll contract:

- icon rail: no scrolling
- conversation sidebar: only conversation list scrolls
- main chat: only message stream scrolls
- top bar and composer: pinned

### `/notes` (inspector + icon rail)

Keep existing pane structure, but enforce explicit non-scroll icon rail behavior:

- icon rail column remains visible at all times
- icon rail itself does not become the vertical scroll container
- right-panel compact chat keeps pinned input and scrolling message area only

## Component Design

### Shared chat surface system

Unify compact and full variants around the same message/composer structure:

- same bubble radius rules
- same text sizing scale and markdown spacing rhythm
- same subtle border treatment
- same source-chip styling language

This avoids "mini-chat looks unrelated" drift and makes the UI feel intentional.

### Full-screen conversation sidebar

- fixed header with title and new conversation action
- scrollable middle list with improved active/hover states
- fixed footer for settings/config link
- delete action stays discoverable without dominating row layout

### Main chat area

- top context bar with clear but quiet context chips
- central message stream with consistent max widths and calmer contrast
- sticky composer with stable vertical rhythm and restrained action styling

## Visual Spec (Calm Minimal)

- Replace decorative chat backdrop with flat quiet surface.
- Reduce saturation of user bubble and remove unnecessary glow/pulse emphasis.
- Keep one accent role (primary) for active/send/selected states only.
- Tighten but standardize spacing in sidebar rows and message blocks.
- Improve markdown readability with clearer paragraph/list/code spacing.
- Keep timestamps and metadata present but de-emphasized.

## Interaction Details

- Active conversation state remains obvious without loud backgrounds.
- Hover actions should be predictable and not hide critical controls.
- Keyboard flow:
  - Enter sends (Shift+Enter newline)
  - tab order remains logical across sidebar, message area, composer
- Long conversation stress behavior:
  - no layout jump when many messages load
  - composer remains pinned
  - icon rail remains visible and stable

## Accessibility

- Preserve semantic landmarks (`aside`, `main`, `nav`, `header`).
- Maintain visible focus states on interactive controls.
- Ensure contrast remains acceptable with reduced visual intensity.
- Keep icon-only controls with `title` and/or aria labels.

## Acceptance Criteria

1. Icon rail is visible and non-scrollable on both `/notes` and `/chat`.
2. `/chat` uses two sidebars plus main chat (icon rail + conversation list + chat).
3. Compact and full chat variants look like one coherent system.
4. Only intended regions scroll (list/messages), not structural rails.
5. Chat UI appears materially cleaner and calmer than current implementation.

## Verification Strategy

1. Lint all changed files.
2. Manual desktop check:
   - `/notes` icon rail stability
   - inspector compact chat scroll/input behavior
   - `/chat` 3-column shell stability
3. Manual stress checks:
   - long conversation list
   - long markdown assistant responses
   - repeated sends with autogrowing textarea
4. Manual responsive check:
   - reduced widths preserve icon rail and readable main chat

## Risks and Mitigations

- **Risk:** refactor causes subtle regressions in send/input behavior.
  - **Mitigation:** keep message state and send logic untouched; only reshape presentation and layout wrappers.
- **Risk:** compact/full visual unification over-corrects and loses context clarity.
  - **Mitigation:** keep context banner and source chips, but reduce visual noise rather than remove structure.
- **Risk:** non-scrollable rail conflicts with existing container overflow settings.
  - **Mitigation:** explicitly move overflow responsibility to content columns and keep rail containers `overflow-hidden`.

## File-Level Plan

- `src/app/chat/page.tsx`
  - adopt stable 3-column shell with fixed icon rail and focused sidebar/chat split
- `src/components/chat/chat-interface.tsx`
  - unify compact/full visual language and pinned composer behavior
- `src/components/layout/vscode-layout.tsx`
  - enforce non-scroll icon rail container behavior
- `src/components/sidebar/icon-nav.tsx`
  - ensure icon rail occupies full height and does not rely on parent scrolling
- `src/app/globals.css` (only if needed)
  - minor utility/token alignment for calm minimal consistency
