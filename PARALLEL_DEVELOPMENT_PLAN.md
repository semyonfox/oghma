# SocsBoard - Parallel Development Plan

**Generated:** February 18, 2025  
**Duration:** 2-3 weeks (parallel execution)  
**Team Size:** 4 developers (recommended)

---

## 🎯 Executive Summary

**Good News:** No truly blocking issues! You can start 3-4 parallel streams immediately while 1 senior dev fixes critical issues (3-4 days).

**Time Savings:** 11-14 days by running in parallel vs. sequential

**Critical Path:** Only 3-4 days (TypeScript + Auto-save fixes)

---

## 📊 Parallel Streams Overview

```
Week 1-2: Start All 4 Streams in Parallel
└─ Stream 5 (Blocker): 3-4 days (senior dev)
   └─ Then: State management refactoring + Command Palette
└─ Stream 1 (AI Panel): 5-7 days (runs independently)
└─ Stream 2 (Testing): 2-3 days (runs independently)
└─ Stream 4 (Validation): 2-3 days (runs independently)

Week 3+: Merge & Continue
└─ All developers converge on dependent features
```

---

## 🔴 STREAM 5: CRITICAL FIXES (Blocker Removal)

**Developer:** Senior/Lead  
**Duration:** 3-4 days  
**Blocking:** Certain features require these fixes

### Day 1: TypeScript Strict Mode (1 day)

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,  // ADD THIS
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

**Tasks:**
1. Enable strict mode in tsconfig
2. Fix the ~36 files with `any` types
3. Run `npm run build` to verify
4. Commit: "refactor: enable TypeScript strict mode"

**Expected Errors:** 50-100 TypeScript errors (most are easy fixes)

**Quick Fixes:**
- Replace `any` with proper types
- Add type annotations to function parameters
- Fix null/undefined checks

---

### Day 2-3: Auto-save Integration (1.5 days)

**Files:**
- `src/app/notes/page.tsx` (integrate hook)
- `src/lib/notes/hooks/use-auto-save.ts` (already exists!)
- `src/lib/notes/state/editor.zustand.ts` (connect to store)

**What to do:**

1. **Wire hook to page:**
```tsx
// src/app/notes/page.tsx
function NotesUI() {
  const { note } = NoteState.useContainer();
  const { content } = useEditorStore();
  
  // ALREADY DONE! Just need to ensure it's called
  const autoSaveStatus = useAutoSave(note?.id, content);
  
  // Your code already does this - verify it's working
  console.log('Auto-save status:', autoSaveStatus.status);
}
```

2. **Test auto-save flow:**
   - Edit a note
   - Wait 3 seconds
   - Check browser network tab (should see PUT request)
   - Refresh page - content should persist

3. **Implement manual save (Cmd+S):**
```tsx
useShortcut({
  key: 's',
  meta: true,
  ctrl: true,
  handler: async () => {
    if (note?.id) {
      await useAutoSave.getState().saveNow();
      toast.success('Note saved!');
    }
  }
});
```

---

### Day 3-4: Implement TODO Stubs (1.5 days)

**Critical TODOs:**

File: `src/lib/notes/state/editor.zustand.ts`

```typescript
// TODO #1: Implement onEditorChange
onEditorChange: (content: string) => {
  set({ content });
  // Trigger auto-save (already handled by use-auto-save hook)
},

// TODO #2: Implement onNoteChange  
onNoteChange: (updates: Partial<NoteModel>) => {
  set((state) => ({
    note: { ...state.note, ...updates }
  }));
},

// TODO #3: Implement saveNow
saveNow: async () => {
  const { note, content } = get();
  if (!note?.id) return;
  
  return fetch(`/api/notes/${note.id}`, {
    method: 'PUT',
    body: JSON.stringify({ content })
  }).then(res => res.json());
}
```

**Testing:**
- Verify editor changes update state
- Verify manual save works
- Verify content persists on page reload

---

## 🟢 STREAM 1: AI PANEL FEATURES

**Developer:** Mid-level frontend  
**Duration:** 5-7 days  
**Dependencies:** None (independent feature)

### What to build:

1. **LLM Integration (2-3 days)**
   - [ ] Add Claude API key to `.env.local`
   - [ ] Create `lib/notes/ai/claude-client.ts`
   - [ ] Build chat streaming handler
   - [ ] Test with simple query

2. **Chat UI Improvements (2 days)**
   - [ ] Add message history display
   - [ ] Implement streaming animation
   - [ ] Add copy/regenerate buttons
   - [ ] Error state handling

3. **Context-Aware Features (1-2 days)**
   - [ ] Send note context to LLM
   - [ ] Implement system prompts
   - [ ] Add temperature/model selection
   - [ ] Cache recent responses

### How to run in parallel:

Don't wait for Stream 5! You can:
- Build UI without API integration
- Mock responses first, swap in real API later
- Use existing note API endpoint to fetch context
- Test locally with hardcoded responses

### Files to create:

```
src/lib/notes/ai/
├─ claude-client.ts (LLM integration)
├─ prompts.ts (system prompts)
└─ types.ts (message types)

src/components/notes/ai-panel/
├─ chat-messages.tsx (message display)
├─ chat-input.tsx (input field)
└─ ai-tools-enhanced.tsx (improved tools)
```

---

## 🔵 STREAM 2: TESTING FOUNDATION

**Developer:** QA/Junior dev  
**Duration:** 2-3 days  
**Dependencies:** None (infrastructure only)

### What to set up:

1. **Install testing tools (0.5 days)**
```bash
npm install -D vitest @testing-library/react @testing-library/user-event happy-dom
```

2. **Create test infrastructure (1 day)**
   - [ ] `vitest.config.ts` - Vitest configuration
   - [ ] `src/test/setup.ts` - Test helpers
   - [ ] `src/test/mocks.ts` - Mock API responses
   - [ ] `src/test/fixtures.ts` - Test data

3. **Write critical path tests (0.5-1 days)**
   - [ ] Editor component tests
   - [ ] Sidebar list tests
   - [ ] Auto-save hook tests
   - [ ] API client tests

### Files to create:

```
tests/
├─ setup.ts
├─ mocks.ts
├─ fixtures.ts
└─ unit/
    ├─ editor.test.tsx
    ├─ sidebar.test.tsx
    └─ hooks.test.ts
```

### How to run in parallel:

- Don't wait for features to be complete
- Test existing code (even buggy code needs tests)
- Create test infrastructure first
- Write tests for Stream 5 fixes as they're done

---

## 🟡 STREAM 4: SECURITY HARDENING

**Developer:** Mid-level backend  
**Duration:** 2-3 days  
**Dependencies:** None (API layer only)

### What to implement:

1. **Input Validation with Zod (1.5 days)**

File: `src/app/api/notes/[id]/schemas.ts`

```typescript
import { z } from 'zod';

export const createNoteSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().max(1_000_000),
  parentId: z.string().uuid().optional(),
});

export const updateNoteSchema = createNoteSchema.partial();
```

Then in route:
```typescript
// src/app/api/notes/[id]/route.ts
export async function PUT(req: Request) {
  const json = await req.json();
  const data = updateNoteSchema.parse(json); // Validates!
  // ... rest of logic
}
```

2. **Authorization Checks (0.5 days)**
```typescript
// Verify user owns the note before updating
const userId = session.user.id;
const note = await db.notes.findUnique({
  where: { id: params.id }
});

if (note.userId !== userId) {
  return new Response('Unauthorized', { status: 403 });
}
```

3. **CSRF Verification (0.5 days)**
```typescript
// Verify CSRF token in API routes
const csrfToken = req.headers.get('x-csrf-token');
if (!verifyCsrfToken(csrfToken)) {
  return new Response('Forbidden', { status: 403 });
}
```

### Files to create/modify:

```
src/app/api/
├─ middleware/
│  └─ auth.ts (verify user owns resource)
├─ schemas/
│  ├─ notes.ts (Zod schemas)
│  └─ users.ts (Zod schemas)
└─ [routes]/ (add validation to all routes)
```

### How to run in parallel:

- Doesn't depend on any feature work
- Just add validation to existing routes
- Can test locally without frontend changes
- Frontend continues working with unvalidated API

---

## 🟣 AFTER STREAM 5 COMPLETES (Week 2)

Once the critical fixes are done, Stream 5 developer can start:

### Command Palette Actions (2 days)

```typescript
// Now that TODOs are implemented, wire up actions

const actions = {
  'new-note': async () => {
    const note = await createNote({ title: 'Untitled' });
    router.push(`/notes/${note.id}`);
  },
  
  'save-note': async () => {
    await useEditorStore.getState().saveNow();
  },
  
  'delete-note': async (noteId: string) => {
    await deleteNote(noteId);
  }
};
```

### State Management Refactoring (3-4 days)

Consolidate Zustand + Unstated-next into single source of truth:
- [ ] Move all state to Zustand
- [ ] Remove redundant state
- [ ] Fix race conditions
- [ ] Ensure cache consistency

---

## 📅 WEEK-BY-WEEK TIMELINE

### Week 1: Parallel Execution

| Day | Stream 5 (Blocker) | Stream 1 (AI) | Stream 2 (Tests) | Stream 4 (Security) |
|-----|---|---|---|---|
| Mon | TS Strict setup | AI UI scaffold | Vitest setup | Zod schemas |
| Tue | Fix `any` types | Chat component | Test utils | API validation |
| Wed | Auto-save wire | Streaming UI | Unit tests | CSRF + Auth |
| Thu | TODO stubs | Claude API | Mock setup | Rate limiting |
| Fri | Test/verify | Refinement | Refinement | Security review |

### Week 2: Convergence + Continue

| Day | Developer 1 | Developer 2 | Developer 3 | Developer 4 |
|-----|---|---|---|---|
| Mon-Tue | State refactoring | Backlinks UI | a11y improvements | Perf tests |
| Wed-Fri | Command Palette | Graph viz | Documentation | Collab editing |

---

## 🎯 SUCCESS CRITERIA

### Stream 5 (Blocker):
- [ ] TypeScript strict mode enabled, 0 errors
- [ ] Auto-save works (PUT requests on edit, data persists on reload)
- [ ] Manual save (Cmd+S) executes
- [ ] All 17 TODOs implemented
- [ ] Build passes: `npm run build`

### Stream 1 (AI):
- [ ] Chat UI displays messages
- [ ] Can send queries to Claude
- [ ] Streaming responses work
- [ ] Error handling implemented

### Stream 2 (Testing):
- [ ] Vitest configured and running
- [ ] 10+ unit tests written
- [ ] CI/CD tests green
- [ ] Test coverage visible

### Stream 4 (Security):
- [ ] All API routes have Zod validation
- [ ] Authorization checks in place
- [ ] CSRF verification working
- [ ] No XSS vulnerabilities

---

## ⚡ COMMON PITFALLS TO AVOID

### Stream 5:
- ❌ Don't try to fix TypeScript and auto-save simultaneously
  - ✅ Do: Fix TypeScript first (1 day), then auto-save (1 day)
- ❌ Don't ignore test failures when enabling strict mode
  - ✅ Do: Address each error type systematically

### Stream 1:
- ❌ Don't build UI and API integration together
  - ✅ Do: Mock API first, swap real implementation later
- ❌ Don't forget error handling for streaming responses
  - ✅ Do: Handle network failures, API errors, timeouts

### Stream 2:
- ❌ Don't write tests without setup
  - ✅ Do: Create helpers first, then tests
- ❌ Don't test implementation details
  - ✅ Do: Test behavior and user interactions

### Stream 4:
- ❌ Don't validate on frontend only
  - ✅ Do: Always validate server-side
- ❌ Don't forget authorization (just validation)
  - ✅ Do: Verify user owns/can access resource

---

## 🔄 MERGE STRATEGY

After 3-4 days when Stream 5 is complete:

1. **Merge Stream 5 fixes first** (critical path)
   - TypeScript strict mode
   - Auto-save working
   - TODO stubs implemented

2. **Continue parallel work**
   - Don't wait for all streams to finish
   - Use feature branches
   - Merge as each stream completes

3. **Integration points** (Week 2):
   - Merge Stream 1 AI features
   - Merge Stream 4 validation
   - Merge Stream 2 tests
   - Fix any conflicts in state management

---

## 📊 EFFORT BREAKDOWN

| Stream | Effort | Days | Developer |
|--------|--------|------|-----------|
| Critical Fixes | 3-4 days | 1 | Senior |
| AI Panel | 5-7 days | 1 | Mid-level |
| Testing | 2-3 days | 1 | QA/Junior |
| Validation | 2-3 days | 1 | Mid-level |
| **Total Sequential** | | **12-17 days** | 4x dev |
| **Total Parallel** | | **5-7 days** | 4x dev |
| **Time Saved** | | **-7-10 days** | 🎉 |

---

## 🚀 START NOW!

Ready to begin? Here's the exact command for each stream:

**Stream 5 (Senior Dev):**
```bash
# 1. Enable TypeScript
# 2. Fix 36 any types
npm run build
# 3. Wire auto-save
# 4. Implement TODOs
```

**Stream 1 (AI Dev):**
```bash
# Create AI client structure
mkdir -p src/lib/notes/ai
touch src/lib/notes/ai/{claude-client,prompts,types}.ts
# Start building chat UI
```

**Stream 2 (QA Dev):**
```bash
# Install and configure
npm install -D vitest @testing-library/react
# Create test infrastructure
mkdir -p tests/{setup,unit}
```

**Stream 4 (Security Dev):**
```bash
# Install Zod
npm install zod
# Create validation schemas
mkdir -p src/app/api/schemas
touch src/app/api/schemas/notes.ts
```

Good luck! 🚀
