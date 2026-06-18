# AI Chat UI Redesign Spec

Status: historical approved design record.

## Intent

Redesign assistant messages and the composer so chat feels like a clean study conversation rather than an AI debug log.

## Decisions

- Keep the overall chat layout simple and content-centered.
- User messages are visually distinct but not oversized.
- Assistant messages do not need avatars or model labels.
- Tool calls render as subtle inline pills.
- Thinking/streaming states should be calm and compact.
- Composer stays visually stable and easy to scan.

## Data Mapping

- Plain assistant text remains `content`.
- Structured message parts can represent text and tool call UI.
- Rendering should degrade gracefully for legacy plain-text messages.

## Verification

- Streaming, reload, and persisted historical sessions render consistently.
- Long answers remain readable.
- Tool-call indicators survive reload when backed by structured parts.
