import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn<(parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>(),
  permanentlyDeleteNotes: vi.fn(),
  getSettingsFromS3: vi.fn(),
  deleteObject: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/notes/storage/note-lifecycle", () => ({
  permanentlyDeleteNotes: mocks.permanentlyDeleteNotes,
}));
vi.mock("@/lib/notes/storage/s3-storage", () => ({
  getSettingsFromS3: mocks.getSettingsFromS3,
  settingsObjectKey: (userId: string) => `settings/${userId}/settings.json`,
}));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => ({ deleteObject: mocks.deleteObject }),
}));
vi.mock("@/lib/logger", () => ({ default: mocks.logger }));

import {
  DELETED_ACCOUNT_GRACE_DAYS,
  purgeDeletedAccounts,
} from "@/lib/auth/account-purge";

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";

function queries() {
  return mocks.sql.mock.calls.map(([parts, ...values]) => ({
    text: parts.join("?"),
    values,
  }));
}

function expiredAccounts(userIds: string[]) {
  mocks.sql.mockImplementation(
    async (parts, ...values) => {
      const text = parts.join("?");
      if (text.includes("SELECT user_id FROM app.login"))
        return userIds.map((user_id) => ({ user_id }));
      if (text.includes("SELECT note_id FROM app.notes"))
        return values[0] === USER ? [{ note_id: "n-1" }, { note_id: "n-2" }] : [];
      return [];
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permanentlyDeleteNotes.mockResolvedValue({ noteIds: [], cleanupTaskId: null, objectKeys: 0 });
  mocks.getSettingsFromS3.mockResolvedValue({});
  mocks.deleteObject.mockResolvedValue(undefined);
  expiredAccounts([USER]);
});

describe("purgeDeletedAccounts", () => {
  it("selects only soft-deleted accounts older than the promised grace period", async () => {
    await purgeDeletedAccounts();
    const [select] = queries();
    expect(select.text).toContain("deleted_at IS NOT NULL");
    expect(select.text).toContain("deleted_at < NOW() - (? * INTERVAL '1 day')");
    expect(select.values[0]).toBe(DELETED_ACCOUNT_GRACE_DAYS);
    expect(DELETED_ACCOUNT_GRACE_DAYS).toBe(30);
  });

  it("cleans notes and user objects through the lifecycle path before dropping the login row", async () => {
    mocks.getSettingsFromS3.mockResolvedValue({ avatarKey: `avatars/${USER}/me.png` });

    await expect(purgeDeletedAccounts()).resolves.toBe(1);

    expect(mocks.permanentlyDeleteNotes).toHaveBeenCalledWith(USER, ["n-1", "n-2"]);
    expect(mocks.deleteObject).toHaveBeenCalledWith(`avatars/${USER}/me.png`);
    expect(mocks.deleteObject).toHaveBeenCalledWith(`settings/${USER}/settings.json`);

    const deleteIndex = mocks.sql.mock.calls.findIndex(([parts]) =>
      parts.join("").includes("DELETE FROM app.login"),
    );
    expect(deleteIndex).toBeGreaterThan(-1);
    const remove = queries()[deleteIndex];
    expect(remove.text).toContain("deleted_at IS NOT NULL");
    expect(remove.values[0]).toBe(USER);
    expect(mocks.permanentlyDeleteNotes.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sql.mock.invocationCallOrder[deleteIndex] ?? -1,
    );
  });

  it("keeps a failed account for the next pass and still purges the others", async () => {
    expiredAccounts([USER, OTHER]);
    mocks.permanentlyDeleteNotes.mockRejectedValueOnce(new Error("storage down"));

    await expect(purgeDeletedAccounts()).resolves.toBe(1);

    const removed = queries()
      .filter((query) => query.text.includes("DELETE FROM app.login"))
      .map((query) => query.values[0]);
    expect(removed).toEqual([OTHER]);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });
});
