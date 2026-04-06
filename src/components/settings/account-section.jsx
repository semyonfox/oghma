"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import LanguageSelector from "@/components/common/LanguageSelector";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { inputClass, cn, saveBtnClass } from "./settings-utils";

export default function AccountSection({
  formState,
  setFormState,
  savingSection,
  setSavingSection,
}) {
  const { t } = useI18n();
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // load avatar on mount
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const avatarResponse = await fetch("/api/auth/avatar");
        if (avatarResponse.ok) {
          const { avatarUrl: url } = await avatarResponse.json();
          if (url) setAvatarUrl(url);
        }
      } catch (error) {
        console.error("Failed to load avatar:", error);
      }
    };
    loadAvatar();
  }, []);

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

  return (
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
                className="size-24 flex-none rounded-radius-lg bg-surface object-cover ring-1 ring-border-subtle"
              />
            ) : (
              <div className="size-24 flex-none rounded-radius-lg bg-surface flex items-center justify-center ring-1 ring-border-subtle">
                <UserCircleIcon className="size-12 text-text-tertiary" />
              </div>
            )}
            <div>
              <button
                type="button"
                disabled={isUploadingAvatar}
                className="glass-card-interactive rounded-radius-md px-3 py-2 text-sm font-semibold text-text disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                {isUploadingAvatar ? t("Uploading...") : t("Change avatar")}
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

          {/* email (read-only) */}
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
                className={cn(inputClass, "cursor-not-allowed opacity-60")}
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
                className="col-start-1 row-start-1 w-full appearance-none rounded-radius-md bg-surface border border-border-subtle py-1.5 pr-8 pl-3 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
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
            className={saveBtnClass}
          >
            {savingSection === "profile" ? t("Saving...") : t("Save changes")}
          </button>
        </div>
      </form>
    </div>
  );
}
