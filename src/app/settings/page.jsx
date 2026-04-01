"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  UserCircleIcon,
  SwatchIcon,
  KeyIcon,
  AcademicCapIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import LanguageSelector from "@/components/common/LanguageSelector";
import CanvasIntegration from "@/components/settings/canvas-integration";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";

const inputClass =
  "block w-full rounded-md bg-input px-3 py-1.5 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    settings: _settings,
    setSettings,
    updateSettings,
  } = useSettingsStore();
  const [formState, setFormState] = useState({
    firstName: "",
    lastName: "",
    email: "",
    timezone: "UTC",
    theme: "dark",
    editorWidth: "large",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingSection, setSavingSection] = useState(null);
  const [activeSection, setActiveSection] = useState("account");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  const [clearVaultConfirm, setClearVaultConfirm] = useState(false);
  const [clearVaultInput, setClearVaultInput] = useState("");
  const [isClearingVault, setIsClearingVault] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteAccountInput, setDeleteAccountInput] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // vault import/export state
  const [importStatus, setImportStatus] = useState(null); // null | 'uploading' | 'processing' | 'complete' | 'failed'
  const [importProgress, setImportProgress] = useState(null); // { percent, completed, total }
  const [importJobId, setImportJobId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState(null); // null | 'processing' | 'complete' | 'failed'
  const [exportJobId, setExportJobId] = useState(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState(null);
  const importFileRef = useRef(null);

  const DELETE_ACCOUNT_PHRASE = "delete my account";

  const VAULT_CONFIRM_PHRASE =
    "I solemnly swear on my academic career that I, a person of sound mind and questionable study habits, do hereby voluntarily and irrevocably consent to the total and utter annihilation of every single note, file, and folder in my vault, fully understanding that they are gone forever and that this is entirely my own fault";

  const navigation = [
    { name: t("Account"), id: "account", icon: UserCircleIcon },
    { name: t("Editor & Theme"), id: "editor", icon: SwatchIcon },
    { name: t("Password"), id: "password", icon: KeyIcon },
    { name: t("Canvas"), id: "canvas", icon: AcademicCapIcon },
    { name: t("AI Settings"), id: "ai", icon: SparklesIcon },
    { name: t("Data & Export"), id: "data", icon: ArrowDownTrayIcon },
    { name: t("Danger Zone"), id: "danger", icon: ExclamationTriangleIcon },
  ];

  // load user profile and settings on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const profileResponse = await fetch("/api/auth/me");
        if (profileResponse.ok) {
          const { user } = await profileResponse.json();
          if (user) {
            const nameParts = (user.name || "").split(" ");
            setFormState((prev) => ({
              ...prev,
              firstName: nameParts[0] || "",
              lastName: nameParts.slice(1).join(" ") || "",
              email: user.email || "",
            }));
          }
        }

        const settingsResponse = await fetch("/api/settings");
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          setSettings(settingsData);
          setFormState((prev) => ({
            ...prev,
            theme: settingsData.theme || "dark",
            editorWidth:
              settingsData.editorsize === "small" ? "small" : "large",
            timezone: settingsData.timezone || "UTC",
            // prefer saved display names over OAuth-provided ones
            ...(settingsData.firstName
              ? { firstName: settingsData.firstName }
              : {}),
            ...(settingsData.lastName
              ? { lastName: settingsData.lastName }
              : {}),
          }));
        }

        const avatarResponse = await fetch("/api/auth/avatar");
        if (avatarResponse.ok) {
          const { avatarUrl: url } = await avatarResponse.json();
          if (url) setAvatarUrl(url);
        }
      } catch (error) {
        console.error("Failed to load user data:", error);
      }
    };
    loadUserData();
  }, [setSettings]);

  // track active section on scroll
  useEffect(() => {
    const sectionIds = navigation.map((n) => n.id);
    const handleScroll = () => {
      for (const id of sectionIds) {
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
    // navigation is a static array defined outside the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // instant theme preview when radio changes
  useEffect(() => {
    const root = document.documentElement;
    let isDark;
    if (formState.theme === "system") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      isDark = formState.theme === "dark";
    }
    root.classList.toggle("light", !isDark);
    root.classList.toggle("dark", isDark);
  }, [formState.theme]);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingSection("profile");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: formState.timezone,
          firstName: formState.firstName,
          lastName: formState.lastName,
        }),
      });
      if (response.ok) {
        toast.success(t("Profile updated successfully"));
      } else {
        const error = await response.json();
        toast.error(error.error || t("Failed to save profile"));
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
      toast.error(t("Failed to save profile"));
    } finally {
      setSavingSection(null);
    }
  };

  const handleEditorSettingsSave = async (e) => {
    e.preventDefault();
    setSavingSection("editor");
    try {
      await updateSettings({
        theme: formState.theme,
        editorsize: formState.editorWidth === "small" ? "small" : "large",
      });
      localStorage.setItem("ogma-theme", formState.theme);
      toast.success(t("Editor settings saved"));
    } catch (error) {
      console.error("Failed to save editor settings:", error);
      toast.error(t("Failed to save settings"));
    } finally {
      setSavingSection(null);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (formState.newPassword !== formState.confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }
    if (formState.newPassword.length < 8) {
      toast.error(t("Password must be at least 8 characters"));
      return;
    }
    setSavingSection("password");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: formState.currentPassword,
          newPassword: formState.newPassword,
        }),
      });
      if (response.ok) {
        toast.success(t("Password changed successfully"));
        setFormState((prev) => ({
          ...prev,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }));
      } else {
        toast.error(t("Failed to change password"));
      }
    } catch (error) {
      console.error("Failed to change password:", error);
      toast.error(t("Failed to change password"));
    } finally {
      setSavingSection(null);
    }
  };

  const handleClearVault = async () => {
    setIsClearingVault(true);
    try {
      const res = await fetch("/api/vault", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("Failed to clear vault"));
        return;
      }
      const { summary } = data;
      toast.success(
        `${t("Vault cleared")} — ${summary.notesDeleted} ${t("notes")}, ${summary.s3FilesDeleted} ${t("files deleted")}`,
      );
      setClearVaultConfirm(false);
    } catch {
      toast.error(t("Failed to clear vault"));
    } finally {
      setIsClearingVault(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: DELETE_ACCOUNT_PHRASE }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("Failed to delete account"));
        return;
      }
      router.push("/login");
    } catch {
      toast.error(t("Failed to delete account"));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/auth/avatar", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const { avatarUrl: newUrl } = await response.json();
        setAvatarUrl(newUrl);
        setAvatarPreview(null);
        toast.success(t("Avatar updated successfully"));
      } else {
        const err = await response.json();
        setAvatarPreview(null);
        toast.error(err.error || t("Failed to upload avatar"));
      }
    } catch (error) {
      console.error("Avatar upload failed:", error);
      setAvatarPreview(null);
      toast.error(t("Failed to upload avatar"));
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      localStorage.removeItem("ogma-theme");
      window.location.href = "/login";
    } catch {
      toast.error(t("Failed to sign out"));
      setIsSigningOut(false);
    }
  };

  // ── Vault Import ──
  async function handleVaultImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast.error(t("Please select a .zip file"));
      return;
    }

    try {
      setImportStatus("uploading");
      setUploadProgress(0);

      // get presigned URL
      const presignRes = await fetch("/api/vault/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentLength: file.size }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json();
        throw new Error(err.error || "Failed to get upload URL");
      }
      const { uploadUrl, s3Key } = await presignRes.json();

      // upload to S3 via XMLHttpRequest for progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", "application/zip");
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status < 400
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      setImportStatus("processing");
      setUploadProgress(100);

      // start the import job
      const startRes = await fetch("/api/vault/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Key }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Failed to start import");
      }
      const { jobId } = await startRes.json();
      setImportJobId(jobId);

      toast.success(t("Import started! Processing your vault..."));
    } catch (err) {
      console.error("Vault import failed:", err);
      setImportStatus("failed");
      toast.error(err.message || t("Import failed"));
    }

    // reset file input
    if (importFileRef.current) importFileRef.current.value = "";
  }

  // ── Vault Export ──
  async function handleVaultExport() {
    try {
      setExportStatus("processing");
      setExportDownloadUrl(null);

      const res = await fetch("/api/vault/export", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start export");
      }
      const { jobId } = await res.json();
      setExportJobId(jobId);

      toast.success(t("Export started! We'll notify you when it's ready."));
    } catch (err) {
      console.error("Vault export failed:", err);
      setExportStatus("failed");
      toast.error(err.message || t("Export failed"));
    }
  }

  // poll import status
  useEffect(() => {
    if (
      !importJobId ||
      importStatus === "complete" ||
      importStatus === "failed"
    )
      return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/vault/status?type=vault-import");
        if (!res.ok) return;
        const { job, progress } = await res.json();
        if (!job) return;
        if (job.status === "complete") {
          setImportStatus("complete");
          setImportProgress(progress);
          toast.success(t("Vault import complete!"));
          clearInterval(interval);
        } else if (job.status === "failed") {
          setImportStatus("failed");
          toast.error(job.error || t("Import failed"));
          clearInterval(interval);
        } else if (progress) {
          setImportProgress(progress);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [importJobId, importStatus, t]);

  // poll export status
  useEffect(() => {
    if (
      !exportJobId ||
      exportStatus === "complete" ||
      exportStatus === "failed"
    )
      return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/vault/status?type=vault-export");
        if (!res.ok) return;
        const { job, downloadUrl } = await res.json();
        if (!job) return;
        if (job.status === "complete" && downloadUrl) {
          setExportStatus("complete");
          setExportDownloadUrl(downloadUrl);
          toast.success(t("Vault export ready!"));
          clearInterval(interval);
        } else if (job.status === "failed") {
          setExportStatus("failed");
          toast.error(job.error || t("Export failed"));
          clearInterval(interval);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [exportJobId, exportStatus, t]);

  // check for existing vault jobs on mount
  useEffect(() => {
    async function checkExistingJobs() {
      try {
        const [importRes, exportRes] = await Promise.all([
          fetch("/api/vault/status?type=vault-import"),
          fetch("/api/vault/status?type=vault-export"),
        ]);
        if (importRes.ok) {
          const { job, progress } = await importRes.json();
          if (job && ["queued", "processing"].includes(job.status)) {
            setImportStatus("processing");
            setImportJobId(job.jobId);
            setImportProgress(progress);
          } else if (job?.status === "complete") {
            setImportStatus("complete");
            setImportProgress(progress);
          }
        }
        if (exportRes.ok) {
          const { job, downloadUrl } = await exportRes.json();
          if (job && ["queued", "processing"].includes(job.status)) {
            setExportStatus("processing");
            setExportJobId(job.jobId);
          } else if (job?.status === "complete" && downloadUrl) {
            setExportStatus("complete");
            setExportDownloadUrl(downloadUrl);
          }
        }
      } catch {
        /* ignore */
      }
    }
    checkExistingJobs();
  }, []);

  return (
    <div className="bg-background min-h-screen">
      {/* header */}
      <div className="border-b border-border-subtle">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-4 h-16">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-subtle p-2 -ml-2"
            title={t("Back")}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-text">{t("Settings")}</h1>
        </div>
      </div>

      {/* mobile horizontal nav */}
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
        {/* desktop sidebar */}
        <aside className="hidden lg:block lg:flex-none lg:py-8">
          <nav className="sticky top-24 w-56">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.id}>
                  <button
                    className={cn(
                      "group flex w-full items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
                className="flex w-full items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium text-error-400 hover:bg-error-500/10 transition-colors disabled:opacity-50"
              >
                <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0" />
                {isSigningOut ? t("Signing out...") : t("Sign out")}
              </button>
            </div>
          </nav>
        </aside>

        {/* main content */}
        <main className="flex-1 divide-y divide-border">
          {/* ── Account ── */}
          <div
            id="account"
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("Personal Information")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t("Update your profile information and avatar.")}
              </p>
            </div>

            <form className="md:col-span-2" onSubmit={handleProfileSave}>
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                {/* avatar */}
                <div className="col-span-full flex items-center gap-x-8">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                  {avatarPreview || avatarUrl ? (
                    <img
                      alt={t("Profile")}
                      src={avatarPreview || avatarUrl}
                      className="size-24 flex-none rounded-lg bg-surface object-cover outline -outline-offset-1 outline-border"
                    />
                  ) : (
                    <div className="size-24 flex-none rounded-lg bg-surface flex items-center justify-center outline -outline-offset-1 outline-border">
                      <UserCircleIcon className="size-12 text-text-tertiary" />
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      disabled={isUploadingAvatar}
                      className="rounded-md bg-subtle px-3 py-2 text-sm font-semibold text-text ring-1 ring-border-subtle hover:bg-subtle-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {isUploadingAvatar && (
                        <svg
                          className="animate-spin size-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                      )}
                      {isUploadingAvatar
                        ? t("Uploading...")
                        : t("Change avatar")}
                    </button>
                    <p className="mt-2 text-xs/5 text-text-tertiary">
                      {t("JPG, GIF, PNG or WebP. 5 MB max.")}
                    </p>
                  </div>
                </div>

                {/* first name */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="first-name"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("First name")}
                  </label>
                  <div className="mt-2">
                    <input
                      id="first-name"
                      name="first-name"
                      type="text"
                      autoComplete="given-name"
                      placeholder={t("John")}
                      value={formState.firstName}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          firstName: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* last name */}
                <div className="sm:col-span-3">
                  <label
                    htmlFor="last-name"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("Last name")}
                  </label>
                  <div className="mt-2">
                    <input
                      id="last-name"
                      name="last-name"
                      type="text"
                      autoComplete="family-name"
                      placeholder={t("Doe")}
                      value={formState.lastName}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          lastName: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* email (read-only from auth provider) */}
                <div className="col-span-full">
                  <label
                    htmlFor="email"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("Email address")}
                  </label>
                  <div className="mt-2">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={formState.email}
                      readOnly
                      className={cn(
                        inputClass,
                        "cursor-not-allowed opacity-60",
                      )}
                    />
                  </div>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {t("Email is managed by your authentication provider.")}
                  </p>
                </div>

                {/* timezone */}
                <div className="col-span-full">
                  <label
                    htmlFor="timezone"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("Timezone")}
                  </label>
                  <div className="mt-2 grid grid-cols-1">
                    <select
                      id="timezone"
                      name="timezone"
                      value={formState.timezone}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          timezone: e.target.value,
                        }))
                      }
                      className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-input py-1.5 pr-8 pl-3 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                    >
                      <option>{t("UTC")}</option>
                      <option>{t("Pacific Standard Time")}</option>
                      <option>{t("Eastern Standard Time")}</option>
                      <option>{t("Greenwich Mean Time")}</option>
                      <option>{t("Central European Time")}</option>
                    </select>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-text-tertiary sm:size-4"
                    />
                  </div>
                </div>

                {/* language */}
                <div className="col-span-full">
                  <LanguageSelector variant="compact" showLabel={true} />
                </div>
              </div>

              <div className="mt-8 flex">
                <button
                  type="submit"
                  disabled={savingSection === "profile"}
                  className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingSection === "profile"
                    ? t("Saving...")
                    : t("Save changes")}
                </button>
              </div>
            </form>
          </div>

          {/* ── Editor & Theme ── */}
          <div
            id="editor"
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("Editor & Theme")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t("Customize your note editor appearance and behavior.")}
              </p>
            </div>

            <form className="md:col-span-2" onSubmit={handleEditorSettingsSave}>
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl">
                {/* theme — light/system disabled until component color migration is done */}
                <div>
                  <label className="block text-sm/6 font-medium text-text mb-3">
                    {t("Theme")}
                  </label>
                  <div className="flex gap-3">
                    {[
                      { label: t("Light"), value: "light", disabled: true },
                      { label: t("Dark"), value: "dark", disabled: false },
                      { label: t("System"), value: "system", disabled: true },
                    ].map((theme) => (
                      <label
                        key={theme.value}
                        className={`flex items-center ${theme.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <input
                          type="radio"
                          name="theme"
                          value={theme.value}
                          checked={formState.theme === theme.value}
                          disabled={theme.disabled}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              theme: e.target.value,
                            }))
                          }
                          className="mr-2 accent-primary-500"
                        />
                        <span className="text-sm text-text-secondary">
                          {theme.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-text-tertiary mt-2">
                    {t("Light and system themes coming soon")}
                  </p>
                </div>

                {/* editor width */}
                <div>
                  <label className="block text-sm/6 font-medium text-text mb-1">
                    {t("Editor Width")}
                  </label>
                  <p className="text-xs text-text-tertiary mb-3">
                    {t(
                      "Controls the max width of the note editor. Can also be overridden per note.",
                    )}
                  </p>
                  <div className="flex gap-3">
                    {[
                      { label: t("Small"), value: "small" },
                      { label: t("Large"), value: "large" },
                    ].map((size) => (
                      <label
                        key={size.value}
                        className="flex items-center cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="editor-width"
                          value={size.value}
                          checked={formState.editorWidth === size.value}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              editorWidth: e.target.value,
                            }))
                          }
                          className="mr-2 accent-primary-500"
                        />
                        <span className="text-sm text-text-secondary">
                          {size.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex">
                <button
                  type="submit"
                  disabled={savingSection === "editor"}
                  className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingSection === "editor"
                    ? t("Saving...")
                    : t("Save changes")}
                </button>
              </div>
            </form>
          </div>

          {/* ── Password ── */}
          <div
            id="password"
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("Change password")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t("Update your password associated with your account.")}
              </p>
            </div>

            <form className="md:col-span-2" onSubmit={handlePasswordChange}>
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                <div className="col-span-full">
                  <label
                    htmlFor="current-password"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("Current password")}
                  </label>
                  <div className="mt-2">
                    <input
                      id="current-password"
                      name="current_password"
                      type="password"
                      autoComplete="current-password"
                      value={formState.currentPassword}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          currentPassword: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="col-span-full">
                  <label
                    htmlFor="new-password"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("New password")}
                  </label>
                  <div className="mt-2">
                    <input
                      id="new-password"
                      name="new_password"
                      type="password"
                      autoComplete="new-password"
                      value={formState.newPassword}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          newPassword: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="col-span-full">
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("Confirm password")}
                  </label>
                  <div className="mt-2">
                    <input
                      id="confirm-password"
                      name="confirm_password"
                      type="password"
                      autoComplete="new-password"
                      value={formState.confirmPassword}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          confirmPassword: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex">
                <button
                  type="submit"
                  disabled={savingSection === "password"}
                  className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingSection === "password"
                    ? t("Updating...")
                    : t("Change password")}
                </button>
              </div>
            </form>
          </div>

          {/* ── Canvas Integration ── */}
          <div
            id="canvas"
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("Canvas Integration")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t(
                  "Connect your Canvas LMS account to import your courses and lecture materials.",
                )}
              </p>
            </div>

            <div className="md:col-span-2 space-y-8">
              <div>
                <h3 className="text-sm/6 font-medium text-text mb-4">
                  {t("Connect Canvas Account")}
                </h3>
                <CanvasIntegration />
              </div>
            </div>
          </div>

          {/* ── AI Settings ── */}
          <div
            id="ai"
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("AI Settings")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t("Configure AI-powered features for your notes.")}
              </p>
            </div>

            <div className="md:col-span-2">
              <div className="space-y-8">
                {/* model selector */}
                <div>
                  <label
                    htmlFor="ai-model"
                    className="block text-sm/6 font-medium text-text"
                  >
                    {t("Model")}
                  </label>
                  <p className="mt-1 text-sm text-text-tertiary">
                    {t("Powers chat, search, and study features.")}
                  </p>
                  <div className="mt-2 sm:max-w-xs">
                    <select
                      id="ai-model"
                      className={cn(inputClass, "appearance-auto")}
                      defaultValue="kimi-k2.5"
                      disabled
                    >
                      <option value="kimi-k2.5">Kimi K2.5</option>
                    </select>
                  </div>
                </div>

                {/* BYOK stub */}
                <div className="border-t border-border pt-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm/6 font-medium text-text">
                      {t("Bring Your Own Key")}
                    </h3>
                    <span className="inline-flex items-center rounded-md bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-400 ring-1 ring-inset ring-primary-500/20">
                      {t("Coming Soon")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-tertiary">
                    {t("Use your own API key for supported providers.")}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:max-w-xl sm:grid-cols-6">
                    <div className="col-span-full">
                      <label
                        htmlFor="byok-api-key"
                        className="block text-sm/6 font-medium text-text opacity-50"
                      >
                        {t("API Key")}
                      </label>
                      <div className="mt-2">
                        <input
                          id="byok-api-key"
                          type="password"
                          placeholder="sk-..."
                          disabled
                          className={cn(
                            inputClass,
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                          )}
                        />
                      </div>
                    </div>
                    <div className="col-span-full">
                      <label
                        htmlFor="byok-endpoint"
                        className="block text-sm/6 font-medium text-text opacity-50"
                      >
                        {t("API Endpoint")}
                      </label>
                      <div className="mt-2">
                        <input
                          id="byok-endpoint"
                          type="url"
                          placeholder="https://api.example.com/v1"
                          disabled
                          className={cn(
                            inputClass,
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Data & Export ── */}
          <div
            id="data"
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("Data & Export")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t("Import or export your notes in various formats.")}
              </p>
            </div>

            <div className="md:col-span-2">
              <div className="space-y-6">
                {/* import section */}
                <div>
                  <h3 className="text-sm/6 font-medium text-text mb-1">
                    {t("Import Notes")}
                  </h3>
                  <p className="text-sm text-text-tertiary mb-4">
                    {t(
                      "Upload a .zip file to import folders and notes. Supports PDF, DOCX, Markdown, and more. Max 10GB.",
                    )}
                  </p>

                  {importStatus === "uploading" && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm text-text-secondary mb-1">
                        <span>{t("Uploading...")}</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-subtle rounded-full h-2">
                        <div
                          className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {importStatus === "processing" && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm text-text-secondary mb-1">
                        <span>
                          {importProgress
                            ? `${t("Processing")} ${importProgress.completed}/${importProgress.total} ${t("files")}...`
                            : t("Processing...")}
                        </span>
                        {importProgress?.percent != null && (
                          <span>{importProgress.percent}%</span>
                        )}
                      </div>
                      <div className="w-full bg-subtle rounded-full h-2">
                        <div
                          className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${importProgress?.percent ?? 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {importStatus === "complete" && (
                    <div className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20">
                      {t("Import complete!")}
                      {importProgress &&
                        ` ${importProgress.completed} ${t("files processed")}.`}
                    </div>
                  )}

                  {importStatus === "failed" && (
                    <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
                      {t("Import failed. Please try again.")}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".zip"
                      onChange={handleVaultImport}
                      disabled={
                        importStatus === "uploading" ||
                        importStatus === "processing"
                      }
                      className="hidden"
                      id="vault-import-file"
                    />
                    <label
                      htmlFor="vault-import-file"
                      className={cn(
                        "rounded-md bg-subtle px-3 py-2 text-sm font-semibold text-text ring-1 ring-border-subtle cursor-pointer",
                        importStatus === "uploading" ||
                          importStatus === "processing"
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-subtle-hover",
                      )}
                    >
                      {importStatus === "uploading"
                        ? t("Uploading...")
                        : importStatus === "processing"
                          ? t("Processing...")
                          : t("Select .zip file")}
                    </label>
                  </div>
                </div>

                {/* export section */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm/6 font-medium text-text mb-1">
                    {t("Export Notes")}
                  </h3>
                  <p className="text-sm text-text-tertiary mb-4">
                    {t("Download all your notes and files as a zip archive.")}
                  </p>

                  {exportStatus === "processing" && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
                      <svg
                        className="animate-spin h-4 w-4 text-primary-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      {t("Generating export... This may take a few minutes.")}
                    </div>
                  )}

                  {exportStatus === "complete" && exportDownloadUrl && (
                    <div className="mb-4">
                      <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20 mb-3">
                        {t("Export ready!")}
                      </div>
                      <a
                        href={exportDownloadUrl}
                        download
                        className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-400 inline-block"
                      >
                        {t("Download vault.zip")}
                      </a>
                      <p className="mt-2 text-xs text-text-tertiary">
                        {t("Link expires in 24 hours.")}
                      </p>
                    </div>
                  )}

                  {exportStatus === "failed" && (
                    <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
                      {t("Export failed. Please try again.")}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleVaultExport}
                    disabled={exportStatus === "processing"}
                    className={cn(
                      "rounded-md bg-subtle px-3 py-2 text-sm font-semibold text-text ring-1 ring-border-subtle",
                      exportStatus === "processing"
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-subtle-hover",
                    )}
                  >
                    {exportStatus === "processing"
                      ? t("Exporting...")
                      : t("Export vault")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Danger Zone ── */}
          <div
            id="danger"
            className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
          >
            <div>
              <h2 className="text-base/7 font-semibold text-text">
                {t("Danger Zone")}
              </h2>
              <p className="mt-1 text-sm/6 text-text-tertiary">
                {t("Irreversible and destructive actions.")}
              </p>
            </div>

            <div className="md:col-span-2 space-y-6">
              {/* clear vault */}
              <div>
                <h3 className="text-sm/6 font-medium text-text mb-2">
                  {t("Clear vault")}
                </h3>
                <p className="text-sm text-text-tertiary mb-4">
                  {t(
                    "Permanently delete all notes, folders, and imported files. Your account and Canvas connection will remain intact.",
                  )}
                </p>
                {!clearVaultConfirm ? (
                  <button
                    type="button"
                    className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
                    onClick={() => setClearVaultConfirm(true)}
                  >
                    {t("Clear vault")}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-text-tertiary">
                      {t("To confirm, type the following phrase exactly:")}
                    </p>
                    <p className="text-xs text-red-300 font-mono bg-red-500/10 rounded p-3 ring-1 ring-red-500/20 leading-relaxed select-none pointer-events-none">
                      {VAULT_CONFIRM_PHRASE}
                    </p>
                    <textarea
                      rows={4}
                      placeholder={t("Type the phrase above...")}
                      value={clearVaultInput}
                      onChange={(e) => setClearVaultInput(e.target.value)}
                      onPaste={(e) => e.preventDefault()}
                      className="block w-full rounded-md bg-input px-3 py-2 text-sm text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-red-500 resize-none"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={
                          isClearingVault ||
                          (clearVaultInput !== VAULT_CONFIRM_PHRASE &&
                            clearVaultInput !== "0")
                        }
                        className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={handleClearVault}
                      >
                        {isClearingVault ? t("Clearing...") : t("Confirm")}
                      </button>
                      <button
                        type="button"
                        disabled={isClearingVault}
                        className="rounded-md bg-subtle px-3 py-2 text-sm font-semibold text-text hover:bg-subtle-hover"
                        onClick={() => {
                          setClearVaultConfirm(false);
                          setClearVaultInput("");
                        }}
                      >
                        {t("Cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* delete account */}
              <div className="border-t border-border pt-6">
                <h3 className="text-sm/6 font-medium text-text mb-2">
                  {t("Delete account")}
                </h3>
                <p className="text-sm text-text-tertiary mb-4">
                  {t(
                    "Permanently delete your account and all associated data. This action cannot be undone.",
                  )}
                </p>
                <button
                  type="button"
                  className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400"
                  onClick={() => setDeleteAccountModal(true)}
                >
                  {t("Delete my account")}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* delete account modal */}
      {deleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border-subtle shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-text">
              {t("Delete your account?")}
            </h2>
            <p className="text-sm text-text-tertiary">
              {t(
                "Your account will be deactivated immediately and scheduled for permanent deletion after 30 days. To cancel, contact support within that window.",
              )}
            </p>
            <p className="text-xs text-text-tertiary">
              {t("To confirm, type")}{" "}
              <span className="font-mono text-red-400">
                {DELETE_ACCOUNT_PHRASE}
              </span>{" "}
              {t("below:")}
            </p>
            <input
              type="text"
              autoFocus
              placeholder={DELETE_ACCOUNT_PHRASE}
              value={deleteAccountInput}
              onChange={(e) => setDeleteAccountInput(e.target.value)}
              className="block w-full rounded-md bg-input px-3 py-2 text-sm text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-red-500"
            />
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={
                  isDeletingAccount ||
                  deleteAccountInput !== DELETE_ACCOUNT_PHRASE
                }
                className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={handleDeleteAccount}
              >
                {isDeletingAccount ? t("Deleting...") : t("Delete my account")}
              </button>
              <button
                type="button"
                disabled={isDeletingAccount}
                className="rounded-md bg-subtle px-3 py-2 text-sm font-semibold text-text hover:bg-subtle-hover"
                onClick={() => {
                  setDeleteAccountModal(false);
                  setDeleteAccountInput("");
                }}
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
