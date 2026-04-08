# AI Chat UI Redesign

**Date:** 2026-04-08
**Status:** Approved

## Problem

The existing chat UI renders 4–5 separate visual elements per assistant response (thinking bubble, search context bubble, retrieval summary, source file boxes, answer bubble). Sources appear 2–3 times. The thinking toggle is an unlabelled icon. There is no clear streaming state. The overall experience is cluttered and inconsistent.

## Goal

Replace the chat UI with a clean, polished experience modelled on ChatGPT/Claude.ai — single column, calm visual hierarchy, every element present exactly once.

---

## Approved Design

### Overall layout

- Max content width ~760px, centred, with generous padding (28px sides)
- Top bar: conversation title (left) + scope badge (right, e.g. "Scoped to CT213")
- Messages scrolled in the centre column
- Fixed input area at the bottom

### User messages

- Right-aligned bubble, `border-radius: 20px 20px 5px 20px`
- Background `#2a2a35`, max-width ~68%

### Assistant messages (no avatar, no model label)

Three stacked elements, each only rendered when data is present:

1. **Thinking block** (only when `message.thinking` is set)
   - Collapsed by default, border `1px solid #27272d`, rounded card
   - Header: `◆` gem icon + italic "Thought for N seconds" + chevron on the right
   - Clicking header toggles body open/closed (chevron rotates)
   - Body: dimmed italic text, `color: #505058`

2. **Answer text**
   - Plain text, no bubble background, `font-size: 14px`, `line-height: 1.75`
   - Markdown rendered (bold, lists, code blocks)

3. **Sources block** (only when `message.sources` has entries)
   - Collapsed by default
   - Header: "N sources used" (no emoji) + chevron
   - Expanded list: one row per source — small dot + full note title + relevance label (high/med)
   - Clicking a source navigates to that note

### Input area

```
[ CT213 × ]           ← context badge row (only shown when scope is set)

┌─────────────────────────────────────────────┐
│ Ask anything about your notes…  ◆ Thinking  🛫│
└─────────────────────────────────────────────┘
```

- **Context badge** sits above the box as a removable pill — clicking × clears the scope
- **Input box**: single-row, `border-radius: 12px`
- **Right cluster** (always right-aligned, no wrapping):
  - `◆ Thinking` toggle button — purple/filled when on (`#9d8fff` on `#25213a`), grey outline when off; clicking cycles on↔off
  - **Send**: paper plane SVG icon, `background: #7c6aff`, `border-radius: 8px`

### Streaming state

- While streaming, show animated typing indicator (3 pulsing dots) below the last assistant message
- Thinking block header reads "Thinking…" with a spinning border icon while tokens arrive; switches to "Thought for Ns" when done
- Send button disabled while loading

---

## Files to change

| File | Change |
|------|--------|
| `src/components/chat/message-bubble.tsx` | Full rewrite — remove all old bubble variants, implement the three-element layout above |
| `src/components/chat/chat-interface.tsx` | Rewrite input area; update message list padding/spacing; remove compact retrieval summary and search context bubbles |

### Components to remove

- `ThinkingBubble` (amber box)
- `SearchContextBubble`
- `CompactRetrievalSummary`
- `SourceFileBoxes`
- `SourceChips`
- `CompactSearchContext`

### Components to add / keep

- `ThinkingBlock` — new collapsible card
- `SourcesBlock` — new collapsible list
- `TypingDots` — keep existing or replace with CSS animation

---

## Data mapping

Existing `Message` interface maps cleanly — no API changes needed:

| UI element | Data source |
|------------|-------------|
| Thinking block | `message.thinking` |
| Answer | `message.content` |
| Sources list | `message.sources` (title) + `message.retrieval.usedFiles` for relevance |
| "Thought for Ns" | derive from streaming duration client-side |

---

## Verification

1. Send a message — user bubble appears right-aligned
2. While streaming — typing dots visible, thinking block shows spinner with "Thinking…"
3. After response — thinking block collapsed by default, click to expand
4. Sources collapsed by default, click to expand, full note title visible
5. Toggle `◆ Thinking` button — switches between purple (on) and grey (off), persists across page reload (localStorage)
6. Add a note scope — badge appears above input; click × to remove
7. No duplicate source display anywhere in the message
