"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  UserCircleIcon,
  SwatchIcon,
  KeyIcon,
  AcademicCapIcon,
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Locale, normalizeLocale } from "@/locales";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import { cn } from "@/components/settings/settings-utils";
import {
  DEFAULT_EDITOR_SIZE,
  normalizeEditorSize,
} from "@/lib/notes/editor-width";

import dynamic from "next/dynamic";
import AccountSection from "@/components/settings/account-section";
import type { FormState } from "@/components/settings/account-section";
import CourseVisibilityManager, {
  mergeCourseVisibilityItems,
} from "@/components/course-visibility/course-visibility-manager";
import EditorThemeSection from "@/components/settings/editor-theme-section";
import PasswordSection from "@/components/settings/password-section";
import useCourseStore from "@/lib/notes/state/courses.zustand";

const CanvasSection = dynamic(
  () => import("@/components/settings/canvas-section"),
);
const AISection = dynamic(() => import("@/components/settings/ai-section"));
const DataExportSection = dynamic(
  () => import("@/components/settings/data-export-section"),
);
const DangerSection = dynamic(
  () => import("@/components/settings/danger-section"),
);

type QuizCourse = { courseId: string; courseName: string; isActive: boolean; dueCount: number; totalCards: number };
function mapQuizCourses(courses: QuizCourse[]) {
  return courses.map((course) => ({
    courseId: course.courseId,
    courseName: course.courseName,
    isActive: course.isActive,
    dueCount: course.dueCount,
    totalCards: course.totalCards,
    hasDueItems: course.dueCount > 0,
  }));
}

const SECTION_IDS = [
  "account",
  "editor",
  "password",
  "canvas",
  "ai",
  "course-visibility",
  "data",
  "danger",
];

const NAVIGATION_ITEMS = [
  { label: "Account", id: "account", icon: UserCircleIcon },
  { label: "Editor & Theme", id: "editor", icon: SwatchIcon },
  { label: "Password", id: "password", icon: KeyIcon },
  { label: "Canvas", id: "canvas", icon: AcademicCapIcon },
  { label: "AI Settings", id: "ai", icon: SparklesIcon },
  {
    label: "Course visibility",
    id: "course-visibility",
    icon: ArchiveBoxIcon,
  },
  { label: "Data & Export", id: "data", icon: ArrowDownTrayIcon },
  { label: "Danger Zone", id: "danger", icon: ExclamationTriangleIcon },
];

type SavedProfile = Pick<
  FormState,
  "firstName" | "lastName" | "email" | "timezone" | "locale"
>;
type SavedEditorSettings = Pick<FormState, "theme" | "editorWidth">;

function applyThemePreview(theme: FormState["theme"]) {
  const root = document.documentElement;
  const isDark =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : theme === "dark";
  root.classList.toggle("light", !isDark);
  root.classList.toggle("dark", isDark);
}

export default function SettingsPage() {
  const router = useRouter();
  const { t, activeLocale } = useI18n();
  const { setSettings } = useSettingsStore();
  const {
    settings: courseSettings,
    fetchSettings,
    archiveCourse,
    unarchiveCourse,
  } = useCourseStore();
  const [formState, setFormState] = useState<FormState>({
    firstName: "",
    lastName: "",
    email: "",
    timezone: "UTC",
    theme: "system",
    editorWidth: DEFAULT_EDITOR_SIZE,
    locale: Locale.EN,
  });
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);
  const [savedEditorSettings, setSavedEditorSettings] =
    useState<SavedEditorSettings | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("account");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [quizCourses, setQuizCourses] = useState<ReturnType<typeof mapQuizCourses>>([]);
  const [courseVisibilityLoading, setCourseVisibilityLoading] = useState(true);
  const [courseVisibilityError, setCourseVisibilityError] = useState(false);

  // Read the displayed language without making the settings fetch depend on
  // it; saving a language changes it and would otherwise refetch the form.
  const activeLocaleRef = useRef(activeLocale);
  activeLocaleRef.current = activeLocale;

  const navigation = NAVIGATION_ITEMS.map(({ label, ...item }) => ({
    ...item,
    name: t(label),
  }));

  const loadCourseVisibility = useCallback(async () => {
    setCourseVisibilityError(false);

    const [coursesResponse] = await Promise.all([
      fetch("/api/quiz/dashboard/courses?includeArchived=1"),
      fetchSettings(),
    ]);

    if (!coursesResponse.ok) {
      throw new Error("Failed to load course visibility settings");
    }

    const data = await coursesResponse.json();
    setQuizCourses(mapQuizCourses(data.courses || []));
  }, [fetchSettings]);

  const courseVisibilityItems = useMemo(
    () =>
      mergeCourseVisibilityItems(
        quizCourses.map((course) => ({
          ...course,
          contextText:
            course.totalCards > 0
              ? t("{dueCount} due · {totalCards} cards", {
                  dueCount: course.dueCount,
                  totalCards: course.totalCards,
                })
              : t("No quiz cards yet"),
        })),
        courseSettings,
      ),
    [courseSettings, quizCourses, t],
  );

  useEffect(() => {
    const loadUserData = async () => {
      try {
        let profile: SavedProfile = {
          firstName: "",
          lastName: "",
          email: "",
          timezone: "UTC",
          locale: activeLocaleRef.current ?? Locale.EN,
        };
        let editorSettings: SavedEditorSettings = {
          theme: "system",
          editorWidth: DEFAULT_EDITOR_SIZE,
        };

        const profileResponse = await fetch("/api/auth/me");
        if (profileResponse.ok) {
          const { user } = await profileResponse.json();
          if (user) {
            const nameParts = (user.name || "").split(" ");
            profile = {
              ...profile,
              firstName: nameParts[0] || "",
              lastName: nameParts.slice(1).join(" ") || "",
              email: user.email || "",
              timezone: "UTC",
            };
          }
        }

        const settingsResponse = await fetch("/api/settings");
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          setSettings(settingsData);
          profile = {
            ...profile,
            timezone: settingsData.timezone || "UTC",
            locale:
              normalizeLocale(settingsData.locale) ??
              activeLocaleRef.current ??
              Locale.EN,
            ...(Object.hasOwn(settingsData, "firstName")
              ? { firstName: settingsData.firstName || "" }
              : {}),
            ...(Object.hasOwn(settingsData, "lastName")
              ? { lastName: settingsData.lastName || "" }
              : {}),
          };
          editorSettings = {
            theme: settingsData.theme || "system",
            editorWidth: normalizeEditorSize(settingsData.editorsize),
          };
        }

        setFormState((previous) => ({
          ...previous,
          ...profile,
          ...editorSettings,
        }));
        setSavedProfile(profile);
        setSavedEditorSettings(editorSettings);
      } catch (error) {
        console.error("Failed to load user data:", error);
      }
    };
    void loadUserData();
  }, [setSettings]);

  useEffect(() => {
    const loadVisibility = async () => {
      setCourseVisibilityLoading(true);
      try {
        await loadCourseVisibility();
      } catch (error) {
        console.error("Failed to load course visibility:", error);
        setCourseVisibilityError(true);
      } finally {
        setCourseVisibilityLoading(false);
      }
    };

    void loadVisibility();
  }, [loadCourseVisibility]);

  useEffect(() => {
    const handleScroll = () => {
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom >= 0) {
            setActiveSection(id);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    applyThemePreview(formState.theme);

    return () => {
      applyThemePreview(savedEditorSettings?.theme || "system");
    };
  }, [formState.theme, savedEditorSettings?.theme]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      localStorage.removeItem("ogma-theme");
      document.cookie = "ogma-theme=; path=/; max-age=0";
      window.location.href = "/login";
    } catch {
      toast.error(t("Failed to sign out"));
      setIsSigningOut(false);
    }
  };

  const handleSetCourseVisibility = async (item: { courseId: string; courseName: string }, nextActive: boolean) => {
    if (nextActive) {
      await unarchiveCourse(item.courseId);
    } else {
      await archiveCourse(item.courseId, item.courseName);
    }

    await loadCourseVisibility();
  };

  const handleRestoreArchivedCourses = async (items: Array<{ courseId: string }>) => {
    await Promise.all(items.map((item: { courseId: string }) => unarchiveCourse(item.courseId)));
    await loadCourseVisibility();
  };

  const profileHasChanges =
    savedProfile !== null &&
    (formState.firstName !== savedProfile.firstName ||
      formState.lastName !== savedProfile.lastName ||
      formState.timezone !== savedProfile.timezone ||
      formState.locale !== savedProfile.locale);
  const editorHasChanges =
    savedEditorSettings !== null &&
    (formState.theme !== savedEditorSettings.theme ||
      normalizeEditorSize(formState.editorWidth) !==
        savedEditorSettings.editorWidth);
  const hasUnsavedSettings = profileHasChanges || editorHasChanges;

  useEffect(() => {
    if (!hasUnsavedSettings) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedSettings]);

  return (
    <div className="bg-app-page min-h-screen">
      <div className="border-b border-border-subtle">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-4 h-16">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center justify-center rounded-radius-md text-text-tertiary hover:text-text hover:bg-subtle p-2 -ml-2"
            title={t("Back")}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="font-serif text-2xl font-semibold text-text">
            {t("Settings")}
          </h1>
        </div>
      </div>

      <nav className="lg:hidden border-b border-border-subtle overflow-x-auto">
        <ul className="flex min-w-full gap-x-6 px-4 py-4 text-sm font-semibold text-text-tertiary sm:px-6">
          {navigation.map((item) => (
            <li key={item.id} className="whitespace-nowrap">
              <button
                className={cn(
                  activeSection === item.id
                    ? "text-primary-400 border-b-2 border-primary-500 pb-3.5"
                    : "hover:text-text-secondary",
                )}
                onClick={() => scrollToSection(item.id)}
              >
                {item.name}
              </button>
            </li>
          ))}
          <li className="whitespace-nowrap">
            <button
              className="text-error-400 hover:text-error-300"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? t("Signing out...") : t("Sign out")}
            </button>
          </li>
        </ul>
      </nav>

      <div className="mx-auto max-w-7xl lg:flex lg:gap-x-16 px-4 sm:px-6 lg:px-8">
        <aside className="hidden lg:block lg:flex-none lg:py-8">
          <nav className="sticky top-24 w-56">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.id}>
                  <button
                    className={cn(
                      "group flex w-full items-center gap-x-3 rounded-radius-md px-3 py-2 text-sm font-medium transition-colors",
                      activeSection === item.id
                        ? "bg-primary-500/10 text-primary-400"
                        : "text-text-tertiary hover:text-text-secondary hover:bg-subtle",
                    )}
                    onClick={() => scrollToSection(item.id)}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-8 border-t border-border-subtle pt-4">
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex w-full items-center gap-x-3 rounded-radius-md px-3 py-2 text-sm font-medium text-error-400 hover:bg-error-500/10 transition-colors disabled:opacity-50"
              >
                <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0" />
                {isSigningOut ? t("Signing out...") : t("Sign out")}
              </button>
            </div>
          </nav>
        </aside>

        <main className="flex-1 divide-y divide-border">
          <AccountSection
            formState={formState}
            setFormState={setFormState}
            savingSection={savingSection}
            setSavingSection={setSavingSection}
            hasChanges={profileHasChanges}
            onSaved={(savedProfileData) => {
              setSavedProfile({
                ...savedProfileData,
                email: formState.email,
              });
            }}
          />
          <EditorThemeSection
            formState={formState}
            setFormState={setFormState}
            savingSection={savingSection}
            setSavingSection={setSavingSection}
            hasChanges={editorHasChanges}
            onSaved={(savedEditorSettingsData) =>
              setSavedEditorSettings(savedEditorSettingsData)
            }
          />
          <PasswordSection
            savingSection={savingSection}
            setSavingSection={setSavingSection}
          />
          <CanvasSection />
          <AISection />
          <section
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
            id="course-visibility"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("Course visibility")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t(
                  "Hide archived courses from daily counts and restore them here when you need them again.",
                )}
              </p>
            </div>

            <div className="md:col-span-2">
              {courseVisibilityLoading ? (
                <div className="rounded-radius-lg border border-border-subtle bg-surface/60 px-4 py-4 text-sm text-text-tertiary">
                  {t("Loading...")}
                </div>
              ) : courseVisibilityError ? (
                <div className="rounded-radius-lg border border-error-500/20 bg-error-500/5 px-4 py-4 text-sm text-text-tertiary">
                  {t("Could not load course visibility settings.")}
                </div>
              ) : (
                <CourseVisibilityManager
                  inline
                  items={courseVisibilityItems}
                  onToggleCourse={handleSetCourseVisibility}
                  onRestoreAll={handleRestoreArchivedCourses}
                />
              )}
            </div>
          </section>
          <DataExportSection />
          <DangerSection />
        </main>
      </div>
    </div>
  );
}
