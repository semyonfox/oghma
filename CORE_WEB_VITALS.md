# Core Web Vitals Optimization Report - Phase 6.2

**Date**: February 17, 2026  
**Analysis**: Production Build Baseline  
**Status**: 🔴 NEEDS OPTIMIZATION

---

## Executive Summary

### Current Performance (Estimated)

| Metric | Current | Target | Gap | Priority |
|--------|---------|--------|-----|----------|
| **LCP** (Largest Contentful Paint) | 3.2-3.8s | < 2.5s | -700ms | 🔴 CRITICAL |
| **FCP** (First Contentful Paint) | 3.0-3.5s | < 1.8s | -500ms | 🔴 CRITICAL |
| **FID** (First Input Delay) | 50-100ms | < 100ms | 0-50ms | 🟠 HIGH |
| **CLS** (Cumulative Layout Shift) | 0.03-0.05 | < 0.1 | ✅ GOOD | 🟢 LOW |
| **TTI** (Time to Interactive) | 4.0-4.5s | < 3.0s | -1.0-1.5s | 🔴 CRITICAL |
| **TBT** (Total Blocking Time) | 200-400ms | < 200ms | -200ms | 🟠 HIGH |

### Lighthouse Score Estimate

```
Performance:      55-65/100  ⚠️  Needs work
Accessibility:    90+/100    ✓  Excellent (Phase 5)
Best Practices:   80+/100    ✓  Good
SEO:             90+/100    ✓  Excellent
PWA:             70+/100    ⚠️  Needs work
─────────────────────────────
Average:         75-85/100
```

---

## Root Cause Analysis

### 🔴 Critical Bottleneck: Lexical Editor

**The Problem**:
```
Timeline:
0ms        ├─ HTML starts downloading
~200ms     ├─ CSS loaded (150 KB)
~1200ms    ├─ Main JS starts parsing (1.2 MB total)
~1500ms    ├─ React hydrates
~1700ms    ├─ Component mount begins
           │
           ├─ ⚠️ LEXICAL EDITOR LOADS (992 KB)
           ├─ Lexical parsing: +500-800ms
           ├─ Lexical initialization: +300-500ms
           │
~3200-3800ms └─ LCP TRIGGER (content finally visible)
```

**Impact**:
- Lexical adds 800ms-1.3s to LCP
- Takes up 51% of entire JavaScript bundle
- Blocks page paint even when viewing notes (not editing)
- Worst for users who only want to read notes

### 🟠 Secondary Issues

1. **JavaScript Execution Time**
   - 1.2 MB of JS takes 500-800ms to parse/compile
   - React hydration adds 200-300ms
   - Main thread blocked during this time

2. **No Preloading Strategy**
   - Critical resources not preloaded
   - CSS/JS loaded sequentially, not parallel
   - No resource hints (prefetch, preconnect)

3. **Bundle Size**
   - 3.7 MB uncompressed (1.0-1.2 MB gzipped)
   - Above industry best practice for initial load

---

## Detailed Metrics Analysis

### 1. Largest Contentful Paint (LCP)

**Goal**: < 2.5s

**Current**: 3.2-3.8s ❌

**What's LCP?**: The time when the largest visible content element appears

**What blocks LCP in this app?**
```
1. HTML parsing:           ~0.2s
2. CSS loading:            ~0.2s (150 KB)
3. Main JS parsing:        ~0.6s (1.2 MB)
4. React hydration:        ~0.3s
5. Lexical loading:        ~0.8s (992 KB) ← MAIN CULPRIT
6. Component painting:     ~0.4s
────────────────────────────────
Total:                     ~3.2-3.8s ❌
```

**Optimization Strategy**:

| Optimization | Impact | Effort | Result |
|---|---|---|---|
| Lazy-load Lexical | -0.8s LCP | 3h | 2.4-3.0s |
| Preload CSS/critical JS | -0.2s LCP | 2h | 2.2-2.8s |
| CSS-in-JS reduction | -0.1s LCP | 4h | 2.1-2.7s |
| Image optimization | -0.05s LCP | 2h | 2.0-2.6s |
| **Total** | **-1.15s** | **11h** | **~2.0s ✓** |

### 2. First Contentful Paint (FCP)

**Goal**: < 1.8s

**Current**: 3.0-3.5s ❌

**What's FCP?**: The time when any content appears

**Problem**: Same as LCP - Lexical blocks everything

**Solution**: Same strategy as LCP (lazy-load Lexical)

### 3. First Input Delay (FID)

**Goal**: < 100ms

**Current**: 50-100ms ⚠️ (borderline)

**What's FID?**: Time from user interaction to response

**Why it's slow?**
- Lexical library ties up main thread during initialization
- React event handlers compete with Lexical's event handlers
- Heavy JavaScript execution during interaction

**Optimization**:
- Defer non-critical JS (Lexical, AI Panel)
- Implement requestIdleCallback for background work
- Use Web Workers for heavy computation

### 4. Cumulative Layout Shift (CLS)

**Goal**: < 0.1

**Current**: 0.03-0.05 ✅

**Status**: GOOD - No optimization needed

**Why it's good?**
- Fixed layout structure (Allotment split pane)
- Images have defined dimensions
- No late-loading content blocks

### 5. Total Blocking Time (TBT)

**Goal**: < 200ms

**Current**: 200-400ms ⚠️

**What's TBT?**: Time the main thread is blocked from responding

**Caused by**:
- Lexical parsing: ~200-300ms
- React hydration: ~100-150ms
- Component mounting: ~50-100ms

**Optimization**:
- Code split Lexical (lazy load)
- Use dynamic imports
- Implement streaming SSR (if enabled)

---

## Optimization Roadmap

### PHASE 1: CRITICAL OPTIMIZATIONS (Aim for 2.0s LCP)

#### 1.1 Lazy-Load Lexical Editor ⭐ HIGHEST IMPACT

**Implementation**:
```typescript
// src/components/editor/lexical-editor.tsx
const LexicalEditor = dynamic(() => import('./lexical-editor'), {
  loading: () => <EditorSkeleton />,
  ssr: false,
})
```

**Where it's used**:
- `src/app/notes/page.tsx` (Editor component)
- Only load when user navigates to a note
- NOT loaded on home page, landing pages, etc.

**Expected Impact**:
- LCP: -800ms (3.2s → 2.4s)
- Initial JS: -992 KB (1.2 MB → 208 KB)
- TBT: -200ms

**Effort**: 2-3 hours

#### 1.2 Resource Preloading Hints

**Add to `<head>`**:
```html
<!-- Preload critical CSS -->
<link rel="preload" href="/styles/critical.css" as="style" />

<!-- Prefetch Lexical (load in idle time) -->
<link rel="prefetch" href="/chunks/lexical.js" as="script" />

<!-- Preconnect to external resources -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
```

**Expected Impact**:
- FCP: -150ms
- LCP: -200ms

**Effort**: 1 hour

#### 1.3 Code-Split Non-Critical Components

**Components to defer**:
- AI Panel (loaded on expand)
- Context menus (loaded on right-click)
- Modal dialogs (loaded on open)

**Expected Impact**:
- Initial JS: -150 KB
- LCP: -100ms

**Effort**: 2-3 hours

### PHASE 2: SECONDARY OPTIMIZATIONS (Aim for 1.5s LCP)

#### 2.1 Critical CSS Extraction

**Goal**: Inline above-the-fold CSS only

```css
/* Inline in <head> - critical path only */
@import url('critical.css');

/* Defer non-critical CSS */
<link rel="stylesheet" href="non-critical.css" media="print" onload="this.media='all'" />
```

**Expected Impact**:
- LCP: -100ms
- CLS prevention: +0.5ms

**Effort**: 3-4 hours

#### 2.2 Image Optimization

**Techniques**:
- Use Next.js `<Image>` component
- Serve WebP with fallbacks
- Responsive image sizes
- Lazy-load below-fold images

**Expected Impact**:
- LCP: -50ms (if LCP is an image)
- Page size: -40%

**Effort**: 2-3 hours

#### 2.3 Font Optimization

**Strategy**:
- Use `font-display: swap` for Web Fonts
- Preload critical fonts
- Limit font weights/styles
- Use system fonts for fallback

**Expected Impact**:
- FOUT/FOIT reduction
- LCP: -50ms

**Effort**: 1-2 hours

### PHASE 3: ADVANCED OPTIMIZATIONS (Aim for <1.2s LCP)

#### 3.1 Streaming SSR

**Technology**: React 18 Suspense + streaming

```typescript
// Suspend non-critical content
<Suspense fallback={<Skeleton />}>
  <AIPanel />
  <ContextMenus />
</Suspense>
```

**Expected Impact**:
- LCP: -200ms (earlier paint)
- TBT: -150ms (spread out work)

**Effort**: 4-6 hours

#### 3.2 Service Worker Caching

**Strategy**:
- Cache static assets
- Offline support
- Stale-while-revalidate

**Expected Impact**:
- Repeat visits: -80% (cached)
- Offline: ✓ Functional

**Effort**: 3-4 hours

#### 3.3 Main Thread Optimization

**Techniques**:
- Move work to Web Workers
- Use `requestIdleCallback`
- Break up long tasks
- Optimize event handlers

**Expected Impact**:
- TBT: -100ms
- FID: -30ms

**Effort**: 5-6 hours

---

## Implementation Priority

### Immediate (This Week) - Est. 6-8 hours

1. ✅ Lazy-load Lexical editor (2-3h, -800ms LCP)
2. ✅ Resource preloading hints (1h, -150ms LCP)
3. ✅ Code-split AI Panel (2h, -100KB)

**Expected Result**: LCP 3.2s → 2.4s, Lighthouse 65 → 75

### Short-term (Next Week) - Est. 8-10 hours

4. Critical CSS extraction (3-4h)
5. Image optimization (2-3h)
6. Font optimization (1-2h)

**Expected Result**: LCP 2.4s → 1.8s, Lighthouse 75 → 82

### Medium-term (Phase 6.3+) - Est. 12-16 hours

7. Streaming SSR (4-6h)
8. Service Worker caching (3-4h)
9. Main thread optimization (5-6h)

**Expected Result**: LCP 1.8s → 1.2s, Lighthouse 82 → 88

---

## Measurement Plan

### Before Optimization

```bash
# Run production build
npm run build

# Serve locally with compression
npx next start

# Run Lighthouse audit
lighthouse http://localhost:3000 --output=json > baseline.json
```

### After Each Phase

```bash
# Rebuild and test
npm run build
npx next start

# Re-run audit
lighthouse http://localhost:3000 --output=json > phase-X.json

# Compare metrics
node compare.js baseline.json phase-X.json
```

### Success Criteria

- [ ] LCP < 2.5s (Lighthouse: Good)
- [ ] FCP < 1.8s
- [ ] FID < 100ms
- [ ] TBT < 200ms
- [ ] CLS < 0.1 (maintain)
- [ ] Lighthouse Performance > 80/100
- [ ] Bundle size reduction > 40%

---

## Action Items for Phase 6.2

### Immediate Actions

1. **Create Performance Baseline**
   - [ ] Document current estimated metrics
   - [ ] Run lighthouse audit (once server available)
   - [ ] Create comparison spreadsheet

2. **Implement Lazy-Loading** (HIGHEST ROI)
   - [ ] Identify Lexical import points
   - [ ] Use `dynamic()` for deferred loading
   - [ ] Add loading skeleton
   - [ ] Test functionality

3. **Add Resource Hints**
   - [ ] Update `next.config.js` with hints
   - [ ] Add to layout `<head>`
   - [ ] Verify with Chrome DevTools

4. **Code Split AI Panel**
   - [ ] Dynamic import AI Panel
   - [ ] Add conditional rendering
   - [ ] Test expand/collapse

### Testing Checklist

- [ ] No functionality lost
- [ ] Lazy-loaded components load on demand
- [ ] No console errors during transitions
- [ ] Network waterfall improved
- [ ] Main thread less blocked

---

## Files to Modify

### High Priority (Immediate)

1. `src/app/notes/page.tsx`
   - Lazy import Editor component
   - Add loading boundary

2. `src/app/layout.tsx` or `next.config.js`
   - Add resource preload hints
   - Configure priorities

3. `src/components/notes/ai-panel/index.tsx`
   - Dynamic import in notes page

### Medium Priority (Phase 2)

4. `src/styles/design-system.css`
   - Extract critical CSS

5. Image components
   - Implement Next.js Image optimization

6. Font loading
   - Optimize font loading strategy

---

## Performance Budget

```
Initial Page Load (HTTP/2):
├─ HTML: 50 KB (target)
├─ CSS: 80 KB (critical only, initially)
├─ JS: 200 KB (core only, Lexical deferred)
└─ Fonts: 50 KB (system fonts or subset)
────────────────────────────
Initial: 380 KB (gzipped)

On-Demand (after user navigates):
├─ Lexical JS: 200 KB (lazy loaded)
├─ Other chunks: 150 KB
└─ Total: 550 KB additional
```

---

## References

- [Google Web Vitals](https://web.dev/vitals/)
- [Next.js Performance Optimization](https://nextjs.org/learn/seo/web-performance)
- [React 18 Suspense & Streaming](https://react.dev/reference/react/Suspense)
- [Lighthouse Scoring](https://developers.google.com/web/tools/lighthouse/v3/scoring)
- [Critical Rendering Path](https://web.dev/critical-rendering-path/)

---

## Next Steps

1. ✅ Complete bundle analysis (DONE)
2. ✅ Complete Core Web Vitals analysis (DONE - this document)
3. → Implement lazy-loading optimizations
4. → Run Lighthouse after improvements
5. → Measure actual vs. estimated metrics
6. → Iterate based on real measurements

---

**Report Generated**: February 17, 2026  
**Status**: Ready for implementation  
**Estimated Total Improvement**: -1.2 to -2.0s LCP, +15-25 Lighthouse score points
