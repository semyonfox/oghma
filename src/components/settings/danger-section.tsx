"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  dangerBtnClass,
  dangerOutlineBtnClass,
  readResponseError,
  secondaryBtnClass,
} from "./settings-utils";
import { SettingsCard, SettingsCardBody } from "./settings-card";

const dangerInputClass =
  "block w-full min-h-11 rounded-radius-md bg-input border border-border px-3 py-2 text-base text-text placeholder:text-text-tertiary focus:border-error-500 focus:ring-1 focus:ring-error-500 focus:outline-none sm:text-sm";
import { useWorkspaceSession } from "@/components/providers/workspace-lifecycle-provider";
import { resetWorkspaceClientState } from "@/lib/notes/workspace-lifecycle";
import { publishWorkspaceInvalidation } from "@/lib/notes/workspace-invalidation";
import useNoteTreeStore from "@/lib/notes/state/tree";

const DELETE_ACCOUNT_PHRASE = "delete my account";

const VAULT_CONFIRM_PHRASE =
  "I solemnly swear on my academic career that I, a person of sound mind and questionable study habits, do hereby voluntarily and irrevocably consent to the total and utter annihilation of every single note, file, and folder in my vault, fully understanding that they are gone forever and that this is entirely my own fault";

function isCurrentWorkspace(ownerUserId: string | null, generation: number) {
  const tree = useNoteTreeStore.getState();
  return tree.ownerUserId === ownerUserId && tree.generation === generation;
}

export default function DangerSection() {
  const { t } = useI18n();
  const router = useRouter();
  const { userId } = useWorkspaceSession();

  const [clearVaultConfirm, setClearVaultConfirm] = useState(false);
  const [clearVaultInput, setClearVaultInput] = useState("");
  const [isClearingVault, setIsClearingVault] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteAccountInput, setDeleteAccountInput] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleClearVault = async () => {
    const mutationOwner = userId;
    const mutationGeneration = useNoteTreeStore.getState().generation;
    let continuationGeneration = mutationGeneration;
    setIsClearingVault(true);
    const run = async () => {
      const res = await fetch("/api/vault", { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readResponseError(res, t("Failed to clear vault")));
        return;
      }
      if (!isCurrentWorkspace(mutationOwner, mutationGeneration)) {
        if (mutationOwner) publishWorkspaceInvalidation(mutationOwner, "vault");
        return;
      }
      const clearing = resetWorkspaceClientState(mutationOwner);
      const resetGeneration = useNoteTreeStore.getState().generation;
      continuationGeneration = resetGeneration;
      if (mutationOwner) publishWorkspaceInvalidation(mutationOwner, "vault");
      await clearing;
      if (!isCurrentWorkspace(mutationOwner, resetGeneration)) return;
      const data = await res.json();
      const { summary } = data;
      toast.success(
        `${t("Vault cleared")} — ${summary.notesDeleted} ${t("notes")}, ${summary.s3FilesDeleted} ${t("files deleted")}`,
      );
      setClearVaultConfirm(false);
    };
    await run()
      .catch(() => {
        if (isCurrentWorkspace(mutationOwner, continuationGeneration)) {
          toast.error(t("Failed to clear vault"));
        }
      })
      .finally(() => {
        setIsClearingVault(false);
      });
  };

  const handleDeleteAccount = async () => {
    const mutationOwner = userId;
    const mutationGeneration = useNoteTreeStore.getState().generation;
    let continuationOwner = mutationOwner;
    let continuationGeneration = mutationGeneration;
    setIsDeletingAccount(true);
    const run = async () => {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: DELETE_ACCOUNT_PHRASE }),
      });
      if (!res.ok) {
        toast.error(
          await readResponseError(res, t("Failed to delete account")),
        );
        return;
      }
      if (!isCurrentWorkspace(mutationOwner, mutationGeneration)) {
        if (mutationOwner) {
          publishWorkspaceInvalidation(mutationOwner, "session");
        }
        return;
      }
      const clearing = resetWorkspaceClientState(null);
      const resetGeneration = useNoteTreeStore.getState().generation;
      continuationOwner = null;
      continuationGeneration = resetGeneration;
      if (mutationOwner) {
        publishWorkspaceInvalidation(mutationOwner, "session");
      }
      await clearing;
      if (!isCurrentWorkspace(null, resetGeneration)) return;
      router.push("/login");
    };
    await run()
      .catch(() => {
        if (isCurrentWorkspace(continuationOwner, continuationGeneration)) {
          toast.error(t("Failed to delete account"));
        }
      })
      .finally(() => {
        setIsDeletingAccount(false);
      });
  };

  return (
    <>
      <SettingsCard
        id="danger"
        tone="danger"
        title={t("Danger Zone")}
        description={t("Irreversible and destructive actions.")}
      >
        <SettingsCardBody className="divide-y divide-border-subtle py-0">
          {/* clear vault */}
          <div className="py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm/6 font-medium text-text">
                  {t("Clear vault")}
                </h3>
                <p className="text-xs text-text-tertiary">
                  {t(
                    "Permanently delete all notes, folders, and imported files. Your account and Canvas connection will remain intact.",
                  )}
                </p>
              </div>
              {!clearVaultConfirm && (
                <button
                  type="button"
                  className={`shrink-0 ${dangerOutlineBtnClass}`}
                  onClick={() => setClearVaultConfirm(true)}
                >
                  {t("Clear vault")}
                </button>
              )}
            </div>
            {clearVaultConfirm && (
              <div className="mt-4 space-y-3 rounded-radius-lg border border-error-500/30 p-4">
                <p className="text-xs text-text-secondary">
                  {t("To confirm, type the following phrase exactly:")}
                </p>
                <p className="select-none pointer-events-none rounded-radius-md border border-border bg-subtle p-3 font-mono text-xs leading-relaxed text-error-700 dark:text-error-300">
                  {VAULT_CONFIRM_PHRASE}
                </p>
                <textarea
                  rows={4}
                  placeholder={t("Type the phrase above...")}
                  value={clearVaultInput}
                  onChange={(e) => setClearVaultInput(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  className={`${dangerInputClass} resize-none`}
                />
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={isClearingVault}
                    className={secondaryBtnClass}
                    onClick={() => {
                      setClearVaultConfirm(false);
                      setClearVaultInput("");
                    }}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={
                      isClearingVault ||
                      (clearVaultInput !== VAULT_CONFIRM_PHRASE &&
                        clearVaultInput !== "0")
                    }
                    className={dangerBtnClass}
                    onClick={handleClearVault}
                  >
                    {isClearingVault ? t("Clearing...") : t("Confirm")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* delete account */}
          <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm/6 font-medium text-text">
                {t("Delete account")}
              </h3>
              <p className="text-xs text-text-tertiary">
                {t(
                  "Permanently delete your account and all associated data. This action cannot be undone.",
                )}
              </p>
            </div>
            <button
              type="button"
              className={`shrink-0 ${dangerOutlineBtnClass}`}
              onClick={() => setDeleteAccountModal(true)}
            >
              {t("Delete my account")}
            </button>
          </div>
        </SettingsCardBody>
      </SettingsCard>

      {/* delete account modal */}
      {deleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-radius-xl border border-border bg-surface p-6 shadow-float">
            <h2 className="text-base font-semibold text-error-700 dark:text-error-400">
              {t("Delete your account?")}
            </h2>
            <p className="text-sm text-text-secondary">
              {t(
                "Your account will be deactivated immediately and scheduled for permanent deletion after 30 days. To cancel, contact support within that window.",
              )}
            </p>
            <p className="text-xs text-text-tertiary">
              {t("To confirm, type")}{" "}
              <span className="font-mono text-error-700 dark:text-error-300">
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
              className={dangerInputClass}
            />
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <button
                type="button"
                disabled={isDeletingAccount}
                className={secondaryBtnClass}
                onClick={() => {
                  setDeleteAccountModal(false);
                  setDeleteAccountInput("");
                }}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                disabled={
                  isDeletingAccount ||
                  deleteAccountInput !== DELETE_ACCOUNT_PHRASE
                }
                className={dangerBtnClass}
                onClick={handleDeleteAccount}
              >
                {isDeletingAccount ? t("Deleting...") : t("Delete my account")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
