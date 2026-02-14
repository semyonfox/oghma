# Sharing Components (Phase 2+)

⚠️ **ARCHIVED FOR FUTURE USE** ⚠️

This directory contains components for the public note sharing feature, extracted from Notea (MIT License).

## Status: INACTIVE

These components are **not active** in Phase 1. They are archived here for Phase 2+ implementation.

## Components

- **share-modal.tsx** - Modal for toggling public/private share status and copying share links

## When to Activate (Phase 2+)

1. **Verify database schema** - Ensure `notes.shared` field is indexed and working
2. **Create public share page** - Implement `/share/[id]` route for public access
3. **Wire up portal state** - Connect ShareModal to the portal state container
4. **Test thoroughly** - Verify public/private toggle, link copying, access control

## Use Cases (Future)

- **Study groups** - Share class notes with peers
- **Public resources** - Make learning materials publicly accessible
- **Class notes** - Professors sharing lecture notes with students

## Security Considerations

- Ensure public shares don't expose private user data
- Implement rate limiting on public share endpoints
- Consider adding expiration dates for public shares
- Add analytics/tracking for public share access if needed
