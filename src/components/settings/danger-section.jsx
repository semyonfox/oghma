"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";

const DELETE_ACCOUNT_PHRASE = "delete my account";

const VAULT_CONFIRM_PHRASE =
  "I solemnly swear on my academic career that I, a person of sound mind and questionable study habits, do hereby voluntarily and irrevocably consent to the total and utter annihilation of every single note, file, and folder in my vault, fully understanding that they are gone forever and that this is entirely my own fault";

export default function DangerSection() {
  const { t } = useI18n();
  const router = useRouter();

  const [clearVaultConfirm, setClearVaultConfirm] = useState(false);
  const [clearVaultInput, setClearVaultInput] = useState("");
  const [isClearingVault, setIsClearingVault] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteAccountInput, setDeleteAccountInput] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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

  return (
    <>
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
                  className="block w-full rounded-radius-md bg-surface border border-border-subtle px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-error-500/50 focus:border-error-500/50 focus:outline-none resize-none"
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
                    className="glass-card-interactive rounded-radius-md px-3 py-2 text-sm font-semibold text-text"
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

      {/* delete account modal */}
      {deleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-radius-xl p-6 space-y-4">
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
              className="block w-full rounded-radius-md bg-surface border border-border-subtle px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-error-500/50 focus:border-error-500/50 focus:outline-none"
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
                className="glass-card-interactive rounded-radius-md px-3 py-2 text-sm font-semibold text-text"
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
    </>
  );
}
