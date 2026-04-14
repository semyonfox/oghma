# Course Active/Inactive Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to mark Canvas courses as active/inactive so quiz cards and assignments from inactive courses can be filtered out while remaining accessible for reference.

**Architecture:** Add a `user_course_settings` table to store per-user, per-course active status. Create API endpoints for CRUD operations. Update quiz dashboard and assignments APIs to filter by active status. Add subtle UI toggles in both areas for manual archive/unarchive.

**Tech Stack:** PostgreSQL, Next.js API routes, TypeScript, Zustand (existing), React

---

## File Structure Overview

| File | Purpose |
|------|---------|
| `database/migrations/017_user_course_settings.sql` | Create the settings table |
| `src/app/api/courses/settings/route.ts` | GET/POST course settings |
| `src/app/api/courses/settings/[courseId]/route.ts` | PATCH/DELETE specific course setting |
| `src/app/api/quiz/dashboard/courses/route.ts` | Update to include is_active flag |
| `src/app/api/assignments/route.ts` | Update to filter by course settings |
| `src/lib/notes/state/courses.zustand.ts` | New store for course settings |
| `src/components/quiz/course-list.tsx` | Add archive toggle per course |
| `src/components/quiz/dashboard.tsx` | Add "show archived" toggle |
| `src/components/panels/assignment-tracker.tsx` | Add "show archived" toggle for courses |

---

## Task 1: Database Migration

**Files:**
- Create: `database/migrations/017_user_course_settings.sql`

- [ ] **Step 1: Write migration file**

```sql
-- User course settings for active/inactive status
CREATE TABLE IF NOT EXISTS app.user_course_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_course_id INTEGER NOT NULL,
    course_name     TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    auto_archived   BOOLEAN NOT NULL DEFAULT false,
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, canvas_course_id)
);

CREATE INDEX IF NOT EXISTS idx_user_course_settings_user 
    ON app.user_course_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_course_settings_course 
    ON app.user_course_settings(canvas_course_id);
```

- [ ] **Step 2: Run migration locally**

```bash
# Apply migration (using project's existing pattern)
npx postgres-migrate apply 017_user_course_settings.sql
# Or run via psql if that's how the project handles migrations
psql $DATABASE_URL -f database/migrations/017_user_course_settings.sql
```

- [ ] **Step 3: Verify table created**

```bash
psql $DATABASE_URL -c "\d app.user_course_settings"
```

Expected: Table exists with all columns listed above.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/017_user_course_settings.sql
git commit -m "feat: add user_course_settings table for course active/inactive status"
```

---

## Task 2: Course Settings Store

**Files:**
- Create: `src/lib/notes/state/courses.zustand.ts`

- [ ] **Step 1: Create the Zustand store**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CourseSetting {
  id: string;
  canvasCourseId: number;
  courseName: string;
  isActive: boolean;
  autoArchived: boolean;
  archivedAt: string | null;
}

interface CourseState {
  settings: CourseSetting[];
  loading: boolean;
  showArchived: boolean;

  fetchSettings: () => Promise<void>;
  archiveCourse: (courseId: number, courseName: string) => Promise<void>;
  unarchiveCourse: (courseId: number) => Promise<void>;
  toggleShowArchived: () => void;
  isCourseActive: (courseId: number) => boolean;
}

const useCourseStore = create<CourseState>()(
  persist(
    (set, get) => ({
      settings: [],
      loading: false,
      showArchived: false,

      fetchSettings: async () => {
        set({ loading: true });
        try {
          const res = await fetch("/api/courses/settings");
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          set({ settings: data.settings, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      archiveCourse: async (courseId: number, courseName: string) => {
        try {
          const res = await fetch("/api/courses/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              canvasCourseId: courseId,
              courseName,
              isActive: false,
            }),
          });
          if (!res.ok) return;
          const setting = await res.json();
          set((s) => ({
            settings: [
              ...s.settings.filter((st) => st.canvasCourseId !== courseId),
              setting,
            ],
          }));
        } catch {
          // silent
        }
      },

      unarchiveCourse: async (courseId: number) => {
        try {
          const res = await fetch(`/api/courses/settings/${courseId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: true }),
          });
          if (!res.ok) return;
          const setting = await res.json();
          set((s) => ({
            settings: [
              ...s.settings.filter((st) => st.canvasCourseId !== courseId),
              setting,
            ],
          }));
        } catch {
          // silent
        }
      },

      toggleShowArchived: () => set((s) => ({ showArchived: !s.showArchived })),

      isCourseActive: (courseId: number) => {
        const setting = get().settings.find(
          (s) => s.canvasCourseId === courseId
        );
        // If no setting exists, course is active by default
        return setting?.isActive ?? true;
      },
    }),
    {
      name: "oghma-courses",
      partialize: (state) => ({ showArchived: state.showArchived }),
    }
  )
);

export default useCourseStore;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notes/state/courses.zustand.ts
git commit -m "feat: add course settings zustand store"
```

---

## Task 3: API - GET/POST Course Settings

**Files:**
- Create: `src/app/api/courses/settings/route.ts`

- [ ] **Step 1: Write the API route**

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(async () => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;

  const settings = await sql`
    SELECT 
      id,
      canvas_course_id as "canvasCourseId",
      course_name as "courseName",
      is_active as "isActive",
      auto_archived as "autoArchived",
      archived_at as "archivedAt"
    FROM app.user_course_settings
    WHERE user_id = ${userId}::uuid
    ORDER BY course_name
  `;

  return NextResponse.json({ settings });
});

export const POST = withErrorHandler(async (request: Request) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;
  const body = await request.json();
  const { canvasCourseId, courseName, isActive } = body;

  if (!canvasCourseId || !courseName) {
    return tracedError("Missing required fields", 400);
  }

  const setting = await sql`
    INSERT INTO app.user_course_settings (
      user_id, canvas_course_id, course_name, is_active, 
      auto_archived, archived_at
    ) VALUES (
      ${userId}::uuid, ${canvasCourseId}, ${courseName}, ${isActive ?? true},
      false, ${isActive === false ? sql`NOW()` : null}
    )
    ON CONFLICT (user_id, canvas_course_id) 
    DO UPDATE SET 
      is_active = EXCLUDED.is_active,
      archived_at = CASE 
        WHEN EXCLUDED.is_active = false THEN NOW() 
        ELSE NULL 
      END,
      updated_at = NOW()
    RETURNING 
      id,
      canvas_course_id as "canvasCourseId",
      course_name as "courseName",
      is_active as "isActive",
      auto_archived as "autoArchived",
      archived_at as "archivedAt"
  `;

  return NextResponse.json(setting[0]);
});
```

- [ ] **Step 2: Test GET endpoint**

```bash
curl -H "Cookie: session=<your_session>" \
  http://localhost:3000/api/courses/settings
```

Expected: `{"settings":[]}` (empty initially)

- [ ] **Step 3: Test POST endpoint**

```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Cookie: session=<your_session>" \
  -d '{"canvasCourseId":31965,"courseName":"CT101","isActive":false}' \
  http://localhost:3000/api/courses/settings
```

Expected: Returns the created setting with `isActive: false`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/courses/settings/route.ts
git commit -m "feat: add GET/POST course settings API"
```

---

## Task 4: API - PATCH/DELETE Specific Course Setting

**Files:**
- Create: `src/app/api/courses/settings/[courseId]/route.ts`

- [ ] **Step 1: Write the API route**

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const PATCH = withErrorHandler(
  async (request: Request, { params }: { params: { courseId: string } }) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const userId = user.user_id;
    const courseId = parseInt(params.courseId, 10);
    if (isNaN(courseId)) return tracedError("Invalid course ID", 400);

    const body = await request.json();
    const { isActive } = body;

    const setting = await sql`
      UPDATE app.user_course_settings
      SET 
        is_active = ${isActive},
        archived_at = CASE 
          WHEN ${isActive} = false THEN NOW() 
          ELSE NULL 
        END,
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND canvas_course_id = ${courseId}
      RETURNING 
        id,
        canvas_course_id as "canvasCourseId",
        course_name as "courseName",
        is_active as "isActive",
        auto_archived as "autoArchived",
        archived_at as "archivedAt"
    `;

    if (setting.length === 0) {
      return tracedError("Course setting not found", 404);
    }

    return NextResponse.json(setting[0]);
  }
);

export const DELETE = withErrorHandler(
  async (_request: Request, { params }: { params: { courseId: string } }) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const userId = user.user_id;
    const courseId = parseInt(params.courseId, 10);
    if (isNaN(courseId)) return tracedError("Invalid course ID", 400);

    await sql`
      DELETE FROM app.user_course_settings
      WHERE user_id = ${userId}::uuid AND canvas_course_id = ${courseId}
    `;

    return NextResponse.json({ success: true });
  }
);
```

- [ ] **Step 2: Test PATCH endpoint**

```bash
curl -X PATCH -H "Content-Type: application/json" \
  -H "Cookie: session=<your_session>" \
  -d '{"isActive":true}' \
  http://localhost:3000/api/courses/settings/31965
```

Expected: Returns updated setting with `isActive: true`, `archivedAt: null`

- [ ] **Step 3: Commit**

```bash
git add 'src/app/api/courses/settings/[courseId]/route.ts'
git commit -m "feat: add PATCH/DELETE course settings API"
```

---

## Task 5: Update Quiz Dashboard API

**Files:**
- Modify: `src/app/api/quiz/dashboard/courses/route.ts`

- [ ] **Step 1: Read current file**

```bash
cat src/app/api/quiz/dashboard/courses/route.ts
```

- [ ] **Step 2: Update to include isActive flag**

Replace the entire file content:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(async () => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;

  const courses = await sql`
    SELECT
      n.canvas_course_id,
      COALESCE(
        (SELECT f.title FROM app.notes f
         WHERE f.user_id = ${userId}::uuid
           AND f.canvas_course_id = n.canvas_course_id
           AND f.is_folder = true
           AND f.canvas_module_id IS NULL
           AND f.canvas_assignment_id IS NULL
           AND f.deleted = 0
         ORDER BY f.created_at ASC
         LIMIT 1),
        MAX(n.title)
      ) as course_name,
      COUNT(DISTINCT qc.id)::int as total_cards,
      COUNT(DISTINCT qc.id) FILTER (WHERE qc.due <= now())::int as due_count,
      COUNT(DISTINCT qc.id) FILTER (WHERE qc.state = 'review' AND qc.stability > 7)::int as mastered_count,
      COALESCE(ucs.is_active, true) as is_active
    FROM app.notes n
    LEFT JOIN app.quiz_questions qq ON qq.note_id = n.note_id AND qq.user_id = ${userId}::uuid
    LEFT JOIN app.quiz_cards qc ON qc.question_id = qq.id AND qc.user_id = ${userId}::uuid
    LEFT JOIN app.user_course_settings ucs 
      ON ucs.user_id = ${userId}::uuid 
      AND ucs.canvas_course_id = n.canvas_course_id
    WHERE n.user_id = ${userId}::uuid
      AND n.canvas_course_id IS NOT NULL
      AND n.deleted = 0
      AND EXISTS (
          SELECT 1 FROM app.chunks c
          WHERE c.document_id = n.note_id AND c.user_id = ${userId}::uuid
      )
    GROUP BY n.canvas_course_id, ucs.is_active
    ORDER BY due_count DESC, total_cards DESC
  `;

  const result = courses.map((c: any) => ({
    courseId: c.canvas_course_id,
    courseName: c.course_name,
    totalCards: c.total_cards,
    dueCount: c.due_count,
    mastery: c.total_cards > 0 ? Math.round((c.mastered_count / c.total_cards) * 100) : 0,
    isActive: c.is_active,
  }));

  return NextResponse.json({ courses: result });
});
```

- [ ] **Step 3: Test the endpoint**

```bash
curl -H "Cookie: session=<your_session>" \
  http://localhost:3000/api/quiz/dashboard/courses
```

Expected: Each course has `isActive: true` (or false if you archived one)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quiz/dashboard/courses/route.ts
git commit -m "feat: include isActive flag in quiz dashboard courses API"
```

---

## Task 6: Update Quiz Sessions API to Filter Archived

**Files:**
- Modify: `src/app/api/quiz/sessions/route.ts`

- [ ] **Step 1: Find the card selection query**

Search for the SQL query that selects cards for quiz sessions - look for the filter logic around line 60-120.

- [ ] **Step 2: Update to exclude archived course cards**

Add a join to `user_course_settings` and filter out inactive courses:

```typescript
// In the card selection query, add this WHERE condition:
// AND (ucs.is_active IS NULL OR ucs.is_active = true)

// The modified query should look like:
const cards = await sql`
  SELECT 
    qc.id, 
    COALESCE(n.canvas_module_id, -1) AS module_id
  FROM app.quiz_cards qc
  JOIN app.quiz_questions qq ON qq.id = qc.question_id
  JOIN app.notes n ON n.note_id = qq.note_id
  LEFT JOIN app.user_course_settings ucs 
    ON ucs.user_id = ${userId}::uuid 
    AND ucs.canvas_course_id = n.canvas_course_id
  WHERE qc.user_id = ${userId}::uuid
    AND qc.due <= NOW()
    AND (ucs.is_active IS NULL OR ucs.is_active = true)
    ${filterType === "course" ? sql`AND n.canvas_course_id = ${filterValue}` : sql``}
  ORDER BY qc.due ASC
  LIMIT 50
`;
```

- [ ] **Step 3: Test quiz session creation**

Create a quiz session and verify cards from archived courses are excluded.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quiz/sessions/route.ts
git commit -m "feat: filter out archived course cards from quiz sessions"
```

---

## Task 7: Update CourseList Component with Archive Toggle

**Files:**
- Modify: `src/components/quiz/course-list.tsx`

- [ ] **Step 1: Read current file**

```bash
cat src/components/quiz/course-list.tsx
```

- [ ] **Step 2: Update Course interface and props**

```typescript
interface Course {
  courseId: number;
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
  isActive?: boolean;  // Add this
}

interface CourseListProps {
  courses: Course[];
  onSelectCourse: (courseId: number) => void;
  allNotesStats?: { totalCards: number; dueCount: number; mastery: number } | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loadingCourseId?: string | null;
  showArchived: boolean;  // Add this
  onToggleArchived: () => void;  // Add this
  onArchiveCourse: (courseId: number, courseName: string) => void;  // Add this
  onUnarchiveCourse: (courseId: number) => void;  // Add this
}
```

- [ ] **Step 3: Update CourseButton to show archive action**

Add an archive/unarchive button to each course row:

```typescript
function CourseButton({
  courseName,
  totalCards,
  dueCount,
  mastery,
  isActive,
  isLoading,
  disabled,
  onClick,
  onArchive,
  onUnarchive,
}: {
  // ... existing props
  isActive?: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
}) {
  const { t } = useI18n();
  const hasCards = totalCards > 0;
  const nothingDue = hasCards && dueCount === 0;
  const isArchived = isActive === false;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={disabled || nothingDue}
        className={`glass-card-interactive rounded-radius-lg p-3 flex items-center gap-3 transition-colors text-left w-full disabled:cursor-not-allowed ${
          isArchived ? "opacity-60" : ""
        }`}
      >
        {/* ... existing content ... */}
      </button>
      
      {/* Archive toggle button */}
      {isArchived ? (
        <button
          onClick={onUnarchive}
          title={t("Unarchive course")}
          className="p-2 text-text-tertiary hover:text-text transition-colors"
        >
          <EyeIcon className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onArchive}
          title={t("Archive course")}
          className="p-2 text-text-tertiary hover:text-text transition-colors opacity-0 group-hover:opacity-100"
        >
          <EyeSlashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update CourseList component with archived section**

Split courses into active and archived:

```typescript
export default function CourseList({
  courses,
  onSelectCourse,
  allNotesStats,
  searchQuery,
  onSearchChange,
  loadingCourseId,
  showArchived,
  onToggleArchived,
  onArchiveCourse,
  onUnarchiveCourse,
}: CourseListProps) {
  const { t } = useI18n();
  const anyLoading = !!loadingCourseId;

  const activeCourses = courses.filter((c) => c.isActive !== false);
  const archivedCourses = courses.filter((c) => c.isActive === false);
  
  const filteredActive = activeCourses.filter((c) =>
    c.courseName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredArchived = archivedCourses.filter((c) =>
    c.courseName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-text font-semibold text-sm">{t("Courses")}</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("quiz.courses.search_placeholder")}
            className="bg-surface border border-border-subtle rounded-radius-md px-3 py-1.5 text-sm text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 w-48"
          />
          {archivedCourses.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-text-tertiary cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={onToggleArchived}
                className="rounded border-border-subtle"
              />
              {t("Show archived")}
            </label>
          )}
        </div>
      </div>
      
      <div className="flex flex-col gap-2">
        {/* All My Notes button */}
        {allNotesStats && (
          <CourseButton ... />
        )}

        {/* Active courses */}
        {filteredActive.map((course) => (
          <CourseButton
            key={course.courseId}
            courseName={course.courseName}
            totalCards={course.totalCards}
            dueCount={course.dueCount}
            mastery={course.mastery}
            isActive={course.isActive}
            isLoading={loadingCourseId === String(course.courseId)}
            disabled={anyLoading}
            onClick={() => onSelectCourse(course.courseId)}
            onArchive={() => onArchiveCourse(course.courseId, course.courseName)}
          />
        ))}

        {/* Archived courses section */}
        {showArchived && filteredArchived.length > 0 && (
          <>
            <div className="text-text-tertiary text-xs font-medium mt-4 mb-2">
              {t("Archived courses")}
            </div>
            {filteredArchived.map((course) => (
              <CourseButton
                key={course.courseId}
                courseName={course.courseName}
                totalCards={course.totalCards}
                dueCount={course.dueCount}
                mastery={course.mastery}
                isActive={course.isActive}
                isLoading={loadingCourseId === String(course.courseId)}
                disabled={anyLoading}
                onClick={() => onSelectCourse(course.courseId)}
                onUnarchive={() => onUnarchiveCourse(course.courseId)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/quiz/course-list.tsx
git commit -m "feat: add archive/unarchive toggle to quiz course list"
```

---

## Task 8: Update Quiz Dashboard to Connect Store

**Files:**
- Modify: `src/components/quiz/dashboard.tsx`

- [ ] **Step 1: Read current file**

```bash
cat src/components/quiz/dashboard.tsx
```

- [ ] **Step 2: Import and use course store**

```typescript
import useCourseStore from "@/lib/notes/state/courses.zustand";

export default function QuizDashboard() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    dashboardData,
    courses,
    dashboardLoading,
    setDashboard,
    setCourses,
    setDashboardLoading,
    startSession,
  } = useQuizStore();
  
  // Add course store
  const {
    settings,
    showArchived,
    fetchSettings,
    toggleShowArchived,
    archiveCourse,
    unarchiveCourse,
  } = useCourseStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [startingSession, setStartingSession] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setDashboardLoading(true);
      // Fetch both dashboard and course settings
      await Promise.all([
        (async () => {
          const [dashRes, coursesRes] = await Promise.all([
            fetch("/api/quiz/dashboard"),
            fetch("/api/quiz/dashboard/courses"),
          ]);
          if (dashRes.ok) setDashboard(await dashRes.json());
          if (coursesRes.ok) {
            const data = await coursesRes.json();
            setCourses(data.courses);
          }
        })(),
        fetchSettings(), // Load course settings
      ]);
      // ... rest of loading logic
    }
    load();
  }, [setDashboard, setCourses, setDashboardLoading, fetchSettings]);

  // ... rest of component

  return (
    <div className="max-w-container-content mx-auto px-6 py-8">
      {/* ... existing header ... */}
      
      <div className="mt-6">
        <CourseList
          courses={courses}
          onSelectCourse={(courseId) => {
            if (courseId === 0) startReview("all");
            else startReview("course", courseId);
          }}
          allNotesStats={...}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          loadingCourseId={startingSession}
          showArchived={showArchived}
          onToggleArchived={toggleShowArchived}
          onArchiveCourse={archiveCourse}
          onUnarchiveCourse={unarchiveCourse}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test the UI**

1. Navigate to quiz dashboard
2. Verify archive button appears on hover
3. Click archive - course should move to archived section
4. Toggle "Show archived" - archived courses should appear
5. Click unarchive - course should return to active

- [ ] **Step 4: Commit**

```bash
git add src/components/quiz/dashboard.tsx
git commit -m "feat: integrate course settings store with quiz dashboard"
```

---

## Task 9: Update Assignments API

**Files:**
- Modify: `src/app/api/assignments/route.ts`

- [ ] **Step 1: Read current file**

```bash
cat src/app/api/assignments/route.ts
```

- [ ] **Step 2: Add query param for showing archived courses**

```typescript
export const GET = withErrorHandler(async (request: Request) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";
  const includeArchived = searchParams.get("includeArchived") === "1";

  const assignments = await sql`
    SELECT 
      a.*,
      COALESCE(ucs.is_active, true) as course_is_active
    FROM app.assignments a
    LEFT JOIN app.user_course_settings ucs 
      ON ucs.user_id = ${userId}::uuid 
      AND ucs.canvas_course_id = a.canvas_course_id
    WHERE a.user_id = ${userId}::uuid
      ${!all ? sql`AND (a.due_at IS NULL OR a.due_at >= NOW() - INTERVAL '30 days')` : sql``}
      ${!includeArchived ? sql`AND (ucs.is_active IS NULL OR ucs.is_active = true)` : sql``}
    ORDER BY 
      CASE WHEN a.due_at IS NULL THEN 1 ELSE 0 END,
      a.due_at ASC
  `;

  return NextResponse.json(assignments);
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assignments/route.ts
git commit -m "feat: filter assignments by archived course status"
```

---

## Task 10: Update Assignment Tracker UI

**Files:**
- Modify: `src/components/panels/assignment-tracker.tsx`

- [ ] **Step 1: Read current file**

```bash
cat src/components/panels/assignment-tracker.tsx
```

- [ ] **Step 2: Import course store and add archived toggle**

```typescript
import useCourseStore from "@/lib/notes/state/courses.zustand";

export default function AssignmentTracker() {
  // ... existing state
  const { 
    assignments, 
    fetchAssignments, 
    // ... other store methods
  } = useAssignmentStore();
  
  const { showArchived, toggleShowArchived } = useCourseStore();
  const [includeArchived, setIncludeArchived] = useState(false);

  // Fetch assignments when includeArchived changes
  useEffect(() => {
    fetchAssignments({ includeArchived });
  }, [includeArchived, fetchAssignments]);

  return (
    <div className="...">
      {/* ... existing header ... */}
      
      {/* Add archived toggle near filters */}
      <div className="flex items-center justify-between mb-4">
        {/* ... course filter dropdown ... */}
        
        <label className="flex items-center gap-1.5 text-xs text-text-tertiary cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-border-subtle"
          />
          {t("Show archived courses")}
        </label>
      </div>
      
      {/* ... rest of component ... */}
    </div>
  );
}
```

- [ ] **Step 3: Update fetchAssignments to support includeArchived**

Modify the store to pass the includeArchived param:

```typescript
fetchAssignments: async (opts?: { all?: boolean; includeArchived?: boolean }) => {
  set({ loading: true });
  try {
    const all = opts?.all ?? get().includeAll;
    const includeArchived = opts?.includeArchived ?? false;
    const res = await fetch(
      `/api/assignments?${all ? "all=1&" : ""}${includeArchived ? "includeArchived=1" : ""}`
    );
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    set({ assignments: data, loading: false });
  } catch {
    set({ loading: false });
  }
},
```

- [ ] **Step 4: Test the UI**

1. Go to assignments panel
2. Verify "Show archived courses" checkbox appears
3. Archive a course from quiz dashboard
4. Verify its assignments disappear from default view
5. Check "Show archived courses" - assignments should reappear

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/assignment-tracker.tsx
git commit -m "feat: add archived courses toggle to assignment tracker"
```

---

## Task 11: End-to-End Testing

- [ ] **Step 1: Full flow test**

1. Import a Canvas course (if not already imported)
2. Archive the course from quiz dashboard
3. Verify:
   - Course moves to archived section
   - Cards from that course excluded from "All My Notes" review
   - Course assignments hidden from default assignment view
4. Unarchive the course
5. Verify everything returns to active state

- [ ] **Step 2: Edge cases**

- Archive course with 0 cards (should still work)
- Archive course with due cards (should be excluded from review)
- Refresh page after archiving (should persist)
- Try to start review on archived course (should still work via direct URL)

- [ ] **Step 3: Commit any fixes**

```bash
git commit -m "fix: handle edge cases in course archiving"
```

---

## Summary

This implementation adds:
1. Database table for course settings
2. API endpoints for CRUD operations
3. Zustand store for client state
4. Archive toggle in quiz dashboard
5. Filter in assignments panel
6. Persisted "show archived" preference

All changes are backward compatible - existing behavior unchanged until user explicitly archives a course.
