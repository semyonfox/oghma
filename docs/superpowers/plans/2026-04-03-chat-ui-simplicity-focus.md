# Chat UI Simplicity And Focus Plan

Status: historical implementation record.

## Goal

Make chat feel like a calm study workspace: fixed icon rail, full-height layout, focused `/chat` shell, and consistent compact/full chat styling.

## Scope

- Keep the icon rail fixed and non-scrollable.
- Ensure rail and app shell fill the viewport.
- Refactor `/chat` into a focused multi-column shell.
- Unify compact chat and full chat visual language.
- Pin context bar and composer in the main chat view.
- Simplify global chat CSS where needed.
- Verify scroll behavior across `/notes` and `/chat`.

## Key Files

| Area | Files |
|---|---|
| Layout | app shell / VSCode-style layout components |
| Chat page | `src/app/chat/page.*` |
| Chat components | chat interface, sidebar, message list, composer |
| Styles | `src/app/globals.css` |

## Verification

- Icon rail does not scroll with chat content.
- Composer remains usable at viewport edges.
- Conversation list, main thread, and context surfaces scroll independently.
- Compact chat in notes and full chat in `/chat` share the same visual system.
