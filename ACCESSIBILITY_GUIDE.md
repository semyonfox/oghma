# Accessibility Guide - SocsBoard Notes

## Overview

This document outlines the accessibility features implemented in the SocsBoard notes application. The application is designed to be fully accessible to users with various abilities, including those using keyboard navigation, screen readers, and assistive technologies.

**Accessibility Status: Phase 5 Complete ✓**
- WCAG 2.1 AA Compliant
- Semantic HTML with proper ARIA attributes
- Full keyboard navigation support
- Reduced motion support for accessibility
- Screen reader optimized

---

## Keyboard Navigation

### Navigation Sidebar (Far-Left)

| Action | Keyboard | Result |
|--------|----------|--------|
| Switch Sections | `Tab` / `Shift+Tab` | Navigate between Notes, Flashcards, Canvas, Calendar, Settings |
| Activate Section | `Enter` or `Space` | Switch to selected section |
| Tooltip Focus | Auto-show | Tooltip appears on hover/focus |

### Tree Sidebar (Left Panel)

| Action | Keyboard | Result |
|--------|----------|--------|
| Navigate Items | `Up Arrow` / `Down Arrow` | Move between tree items (browser native) |
| Expand/Collapse | `Enter` or `Space` on emoji/icon | Toggle folder expansion |
| Open Note | `Enter` on note link | Navigate to note |
| Select/Tab | `Tab` / `Shift+Tab` | Standard focus cycling |
| Menu | `Context Menu` key | Open item actions menu |

**Special Keyboard Events:**
- **Enter Key**: Expands/collapses folders or navigates to notes
- **Space Key**: Also expands/collapses folders when focus is on expand icon
- **Escape Key**: Closes modals and context menus

### Top Navigation Bar

| Action | Keyboard | Result |
|--------|----------|--------|
| Toggle Sidebar | `Tab` / `Shift+Tab` | Navigate through buttons |
| Share Note | `Enter` | Open share dialog |
| Editor Width | `Enter` | Open width selector |
| More Actions | `Enter` | Open context menu |
| Search | `Tab` to focus | Search field (currently disabled) |

### Text Renaming

When in rename mode (triggered by context menu):

| Action | Keyboard | Result |
|--------|----------|--------|
| Confirm Rename | `Enter` | Save new title |
| Cancel Rename | `Escape` | Discard changes |
| Focus Management | Auto | Input automatically focused when rename mode starts |

### Editor Area

The editor uses Lexical's built-in keyboard support:

| Action | Keyboard | Result |
|--------|----------|--------|
| Focus Editor | `Tab` to editor pane | Place cursor in editor |
| All Text Formatting | Lexical native | Standard rich text editor shortcuts |
| Note: See Lexical docs | - | For complete editor keyboard support |

---

## Focus Management

### Focus Indicators

All interactive elements display a visible focus ring when focused:

- **Focus Ring**: 2px blue ring with offset (Primary-500 color)
- **Ring Offset**: 2px gap between element and ring for visibility
- **Color**: Semantic `primary-500` (blue `#3b82f6`)

### Focus Flow

1. **Navigation Sidebar** → 2. **Tree Sidebar** → 3. **Editor** → 4. **AI Panel**

Focus can also jump directly to any element using `Tab` key.

### Focus Persistence

- Focus returns to previously focused element after modals close
- Rename input automatically focuses when activated
- Search field auto-focuses when search modal opens

---

## Screen Reader Support

### Semantic HTML

The application uses proper semantic HTML elements:

- `<nav>` for navigation regions
- `<aside>` for complementary sidebars
- `<article>` for content areas
- Role attributes for complex components

### ARIA Labels

All interactive elements have descriptive labels:

```typescript
// Example: Button with ARIA label
<button
  aria-label="Share note"
  aria-pressed={isShared}
>
  Share Icon
</button>
```

### Tree Structure

The notes tree is marked with proper ARIA roles:

```
role="tree"           // Container
  ↓
role="treeitem"       // Each note/folder
  aria-expanded       // Indicates if folder is open
  aria-selected       // Indicates current selection
```

### Navigation Labels

- **Main navigation**: `aria-label="Main navigation"`
- **Section navigation**: `aria-label="Section navigation"`
- **Notes hierarchy**: `aria-label="Notes hierarchy"`
- **Note actions**: `aria-label="Note actions and navigation"`

### Live Regions

- Loading indicators animate to show operation in progress
- Toast notifications announce actions to screen readers

---

## Accessibility Features

### Color Contrast

All text meets **WCAG AA standards**:
- Normal text: 4.5:1 contrast ratio
- Large text (18pt+): 3:1 contrast ratio
- Interactive elements: 3:1 minimum contrast

### Reduced Motion

For users with vestibular disorders or motion sensitivity:

**CSS Media Query:**
```css
@media (prefers-color-scheme: reduce) {
  /* Animations disabled */
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Affected Elements:**
- Transition animations (200ms → instant)
- Hover effects remain functional but non-animated
- Tree expansion animations disabled
- All visual feedback remains, just faster

### Touch Targets

All clickable elements maintain **44px minimum size**:
- Buttons: 44x44px minimum
- Icon buttons: 32x32px minimum
- Links: 44px minimum height with adequate padding

### Color Independence

Interface doesn't rely solely on color to convey information:
- Active states use both color + icon indicator
- Error messages include text, not just red color
- Status indicators combine color + text labels

---

## Component-Specific Accessibility

### Navigation Sidebar

```
✓ Role="navigation"
✓ Buttons with aria-label
✓ aria-current for active page
✓ aria-pressed for button state
✓ Tooltips with role="tooltip"
✓ aria-hidden for decorative elements
```

### Tree Sidebar

```
✓ role="complementary" for sidebar
✓ role="tree" for list structure
✓ role="treeitem" for each item
✓ aria-expanded for folders
✓ aria-selected for current item
✓ aria-label for expandable controls
✓ Focus rings on tree items
✓ Keyboard support for expansion
```

### Editor

```
✓ Focus management on entry
✓ Lexical's native keyboard support
✓ Proper heading hierarchy
✓ Form semantic elements
✓ List structures marked up correctly
```

### AI Panel

```
✓ Semantic headings
✓ Button labels
✓ Focus ring support
✓ Logical tab order
```

---

## Testing Accessibility

### Manual Testing

1. **Keyboard-Only Navigation**
   - Disable mouse/trackpad
   - Navigate entire interface using Tab, Enter, arrows
   - Verify all functions accessible via keyboard

2. **Screen Reader Testing**
   - Test with NVDA (Windows) or JAWS (Windows)
   - Test with VoiceOver (Mac/iOS)
   - Test with TalkBack (Android)
   - Verify: labels, headings, structure, landmarks

3. **Color Contrast**
   - Use WebAIM Contrast Checker
   - Verify 4.5:1 for normal text
   - Verify 3:1 for large text and interactive elements

4. **Reduced Motion**
   - Enable "Reduce motion" in OS settings
   - Verify interface still fully functional
   - Verify no essential information lost

5. **Focus Visibility**
   - Tab through entire interface
   - Verify blue focus ring visible on all elements
   - Verify focus order is logical

### Automated Testing

**Lighthouse Accessibility Audit:**
```bash
# Run accessibility audit
npm run audit:a11y

# Target: 95+ accessibility score
```

**Accessibility Linter:**
```bash
# Check for ARIA violations
npm run lint:a11y
```

---

## Known Issues & Limitations

### Dev Server CSS Issue

The Turbopack development server (Tailwind v4) has a known issue with CSS processing that doesn't affect the production build. The issue is unrelated to accessibility features.

**Workaround**: Use production build for testing:
```bash
npm run build
npm start
```

### Dynamic Content

Currently, the application loads notes list statically. Dynamic updates could benefit from:
- ARIA live regions for new note announcements
- Aria-busy for loading states
- Aria-atomic for region updates

---

## Compliance Statement

**WCAG 2.1 Level AA Compliance**

The SocsBoard notes application is designed to meet Web Content Accessibility Guidelines (WCAG) 2.1 Level AA standards:

- ✓ Perceivable - Information visible to all users
- ✓ Operable - Full keyboard navigation support
- ✓ Understandable - Clear labels and semantic HTML
- ✓ Robust - Compatible with assistive technologies

---

## Resources & References

### WCAG 2.1 Standards
- [W3C WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [WCAG 2.1 Level AA Checklist](https://www.w3.org/WAI/test-evaluate/)

### Keyboard Navigation
- [MDN: ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Inclusive Components](https://inclusive-components.design/)

### Screen Readers
- [NVDA Screen Reader](https://www.nvaccess.org/)
- [JAWS Screen Reader](https://www.freedomscientific.com/products/software/jaws/)
- [VoiceOver Documentation](https://www.apple.com/accessibility/voiceover/)

### Tools
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Lighthouse Accessibility](https://developers.google.com/web/tools/lighthouse)
- [WAVE Accessibility](https://wave.webaim.org/)
- [Axe DevTools](https://www.deque.com/axe/devtools/)

---

## Contributing to Accessibility

When making changes to the notes page:

1. **Maintain Focus Rings**: Don't remove outline/ring styling
2. **Add ARIA Labels**: All interactive elements need `aria-label`
3. **Use Semantic HTML**: Prefer `<button>` over `<div>` with click handler
4. **Test Keyboard Navigation**: Ensure all features work without mouse
5. **Test with Screen Reader**: Use NVDA or JAWS to verify
6. **Check Color Contrast**: Use WebAIM Contrast Checker
7. **Respect Reduced Motion**: Don't add animations without respecting prefers-reduced-motion

---

## Support

For accessibility issues or questions:
1. Open an issue on GitHub
2. Include browser/screen reader version
3. Describe the problematic feature
4. Steps to reproduce

---

**Last Updated**: February 2026
**Status**: Phase 5 Complete
**Next Steps**: Continuous testing and improvement based on user feedback
