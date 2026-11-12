"use client";

import {
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowPathIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import LanguageSelector from "@/components/common/language-selector";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { loadLocaleData } from "@/lib/i18n/locale-data";
import { Locale } from "@/locales";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import {
  inputClass,
  cn,
  readResponseError,
  saveBtnClass,
  secondaryBtnClass,
  selectClass,
  unsavedChipClass,
} from "./settings-utils";
import {
  SettingsCard,
  SettingsCardBody,
  SettingsCardFooter,
} from "./settings-card";

// the English label is the stored value, so a saved choice survives a language switch
const TIMEZONE_OPTIONS = [
  "UTC",
  "Pacific Standard Time",
  "Eastern Standard Time",
  "Greenwich Mean Time",
  "Central European Time",
] as const;

export type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  timezone: string;
  theme: "dark" | "light" | "system";
  editorWidth: string | number;
  locale: Locale;
};

type ProfileSettings = Pick<
  FormState,
  "firstName" | "lastName" | "timezone" | "locale"
>;

type Props = {
  formState: FormState;
  setFormState: Dispatch<SetStateAction<FormState>>;
  savingSection: string | null;
  setSavingSection: Dispatch<SetStateAction<string | null>>;
  hasChanges: boolean;
  onSaved?: (savedProfile: ProfileSettings) => void;
};

export default function AccountSection({
  formState,
  setFormState,
  savingSection,
  setSavingSection,
  hasChanges,
  onSaved,
}: Props) {
  const { t, locale: applyLocale, activeLocale } = useI18n();
  const router = useRouter();
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarPreviewUrlRef = useRef<string | null>(null);

  const replaceAvatarPreview = (nextUrl: string | null) => {
    if (avatarPreviewUrlRef.current) {
      URL.revokeObjectURL(avatarPreviewUrlRef.current);
    }
    avatarPreviewUrlRef.current = nextUrl;
    setAvatarPreview(nextUrl);
  };

  useEffect(() => {
    const loadAvatar = async () => {
      const run = async () => {
        const avatarResponse = await fetch("/api/auth/avatar");
        if (avatarResponse.ok) {
          const { avatarUrl: url } = await avatarResponse.json();
          if (url) setAvatarUrl(url);
        }
      };
      await run()
        .catch((error: unknown) => {
          console.error("Failed to load avatar:", error);
        });
    };
    void loadAvatar();

    return () => {
      if (avatarPreviewUrlRef.current) {
        URL.revokeObjectURL(avatarPreviewUrlRef.current);
      }
    };
  }, []);

  const handleProfileSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingSection("profile");
    const run = async () => {
      // Load the dictionary before saving so a missing translation bundle
      // fails the save instead of leaving a stored locale the UI cannot show.
      const nextLocale = formState.locale;
      const dictionary =
        nextLocale === activeLocale
          ? null
          : (await loadLocaleData(nextLocale)).dict;

      const savedSettings = await updateSettings({
        timezone: formState.timezone,
        firstName: formState.firstName,
        lastName: formState.lastName,
        locale: nextLocale,
      });
      const savedLocale = savedSettings.locale ?? nextLocale;
      onSaved?.({
        firstName: savedSettings.firstName ?? formState.firstName,
        lastName: savedSettings.lastName ?? formState.lastName,
        timezone: savedSettings.timezone ?? formState.timezone,
        locale: savedLocale,
      });

      // Switch the UI only once the account has the new language, so the page
      // never shows a language that a failed request did not store.
      if (dictionary && savedLocale === nextLocale) {
        applyLocale(nextLocale, dictionary);
        router.refresh();
      }
      toast.success(t("Profile updated successfully"));
    };
    await run()
      .catch((error: unknown) => {
        console.error("Failed to save profile:", error);
        toast.error(t("Failed to save profile"));
      })
      .finally(() => {
        setSavingSection(null);
      });
  };

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    replaceAvatarPreview(objectUrl);

    setIsUploadingAvatar(true);
    const run = async () => {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/auth/avatar", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const { avatarUrl: newUrl } = await response.json();
        setAvatarUrl(newUrl);
        replaceAvatarPreview(null);
        toast.success(t("Avatar updated successfully"));
      } else {
        replaceAvatarPreview(null);
        toast.error(
          await readResponseError(response, t("Failed to upload avatar")),
        );
      }
    };
    await run()
      .catch((error: unknown) => {
        console.error("Avatar upload failed:", error);
        replaceAvatarPreview(null);
        toast.error(t("Failed to upload avatar"));
      })
      .finally(() => {
        setIsUploadingAvatar(false);
        if (avatarInputRef.current) avatarInputRef.current.value = "";
      });
  };

  return (
    <SettingsCard
      id="account"
      title={t("Personal Information")}
      description={t("Update your profile information and avatar.")}
      aside={
        hasChanges ? (
          <span className={unsavedChipClass} role="status">
            {t("Unsaved")}
          </span>
        ) : null
      }
    >
      <form onSubmit={handleProfileSave}>
        <SettingsCardBody>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
            {/* avatar */}
            <div className="col-span-full flex items-center gap-x-4">
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
                  src={avatarPreview || avatarUrl || undefined}
                  className="size-16 flex-none rounded-full bg-subtle object-cover ring-1 ring-border"
                />
              ) : (
                <div className="size-16 flex-none rounded-full bg-subtle flex items-center justify-center ring-1 ring-border">
                  <UserCircleIcon className="size-9 text-text-tertiary" />
                </div>
              )}
              <div>
                <button
                  type="button"
                  disabled={isUploadingAvatar}
                  className={secondaryBtnClass}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {isUploadingAvatar && (
                    <ArrowPathIcon
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {isUploadingAvatar ? t("Uploading...") : t("Change avatar")}
                </button>
                <p className="mt-1.5 text-xs/5 text-text-tertiary">
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
              <div className="mt-1.5">
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
              <div className="mt-1.5">
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
              <div className="mt-1.5">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formState.email}
                  readOnly
                  className={cn(inputClass, "cursor-not-allowed")}
                />
              </div>
              <p className="mt-1.5 text-xs text-text-tertiary">
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
              <div className="mt-1.5 grid grid-cols-1">
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
                  className={selectClass}
                >
                  {TIMEZONE_OPTIONS.map((zone) => (
                    <option key={zone} value={zone}>
                      {t(zone)}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-text-tertiary sm:size-4"
                />
              </div>
            </div>

            {/* language - saved with the rest of this section */}
            <div className="col-span-full">
              <LanguageSelector
                variant="compact"
                showLabel={true}
                value={formState.locale}
                onSelect={(nextLocale) =>
                  setFormState((prev) => ({ ...prev, locale: nextLocale }))
                }
              />
            </div>
          </div>
        </SettingsCardBody>
        <SettingsCardFooter>
          <button
            type="submit"
            disabled={savingSection !== null || !hasChanges}
            className={saveBtnClass}
          >
            {savingSection === "profile" ? t("Saving...") : t("Save changes")}
          </button>
        </SettingsCardFooter>
      </form>
    </SettingsCard>
  );
}
