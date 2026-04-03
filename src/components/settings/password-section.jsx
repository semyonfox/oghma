"use client";

import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { inputClass, saveBtnClass } from "./settings-utils";

export default function PasswordSection({
  formState,
  setFormState,
  savingSection,
  setSavingSection,
}) {
  const { t } = useI18n();

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
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || t("Failed to change password"));
      }
    } catch (error) {
      console.error("Failed to change password:", error);
      toast.error(t("Failed to change password"));
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
            className={saveBtnClass}
          >
            {savingSection === "password"
              ? t("Updating...")
              : t("Change password")}
          </button>
        </div>
      </form>
    </div>
  );
}
