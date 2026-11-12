"use client";

import { type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { readResponseError, secondaryBtnClass } from "./settings-utils";
import { SettingsCard } from "./settings-card";

type Props = {
  savingSection: string | null;
  setSavingSection: Dispatch<SetStateAction<string | null>>;
};

export default function PasswordSection({
  savingSection,
  setSavingSection,
}: Props) {
  const { t } = useI18n();

  const handlePasswordChange = async (): Promise<void> => {
    setSavingSection("password");
    const run = async () => {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.success(
          data.message ||
            t(
              "We sent a verification link to your email. Click the link to verify your account.",
            ),
        );
      } else {
        toast.error(
          await readResponseError(response, t("An error occurred. Please try again.")),
        );
      }
    };
    await run()
      .catch((error: unknown) => {
        console.error("Failed to request a password change:", error);
        toast.error(t("An error occurred. Please try again."));
      })
      .finally(() => {
        setSavingSection(null);
      });
  };

  return (
    <SettingsCard
      id="password"
      title={t("Change password")}
      description={t("Update your password associated with your account.")}
      aside={
        <button
          type="button"
          onClick={() => void handlePasswordChange()}
          disabled={savingSection !== null}
          className={secondaryBtnClass}
        >
          {savingSection === "password"
            ? t("Sending...")
            : t("Send Reset Link")}
        </button>
      }
    />
  );
}
