# Chat UI Simplicity And Focus Spec

Status: historical design record.

## Intent

Make chat a focused study workspace instead of a crowded assistant panel.

## Decisions

- `/chat` gets a full-page conversation layout.
- `/notes` keeps compact chat in the inspector/side context.
- The icon rail stays fixed and non-scrollable.
- Conversation list, main thread, context, and composer have predictable scroll behavior.
- Visual treatment should be calm, minimal, and consistent with the app design system.

## Accessibility

- Preserve keyboard navigation.
- Maintain clear focus states.
- Avoid relying only on color for state.

## Verification

- Desktop and mobile layouts do not overlap.
- Composer remains reachable.
- Long conversations scroll correctly.
- Compact and full chat variants feel related.
