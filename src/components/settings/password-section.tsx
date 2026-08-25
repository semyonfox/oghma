"use client";

import { type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { readResponseError, saveBtnClass } from "./settings-utils";

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
    try {
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
    } catch (error) {
      console.error("Failed to request a password change:", error);
      toast.error(t("An error occurred. Please try again."));
    } finally {
      setSavingSection(null);
    }
  };

  return (
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

      <div className="md:col-span-2 sm:max-w-xl">
        <div className="flex">
          <button
            type="button"
            onClick={() => void handlePasswordChange()}
            disabled={savingSection !== null}
            className={saveBtnClass}
          >
            {savingSection === "password"
              ? t("Sending...")
              : t("Send Reset Link")}
          </button>
        </div>
      </div>
    </div>
  );
}
