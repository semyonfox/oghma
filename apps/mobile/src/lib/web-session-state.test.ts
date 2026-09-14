import test from "node:test";
import assert from "node:assert/strict";
import {
  restoreStoredWebSession,
  transferOAuthSession,
  type OAuthTransferState,
  type WebSessionStorage,
} from "./web-session-state.ts";

function fakeStorage(initial: {
  cookie?: string | null;
  migrated?: boolean;
  oauth?: OAuthTransferState | null;
  failInstall?: boolean;
  failClear?: boolean;
}) {
  let cookie = initial.cookie ?? null;
  let migrated = initial.migrated ?? false;
  let oauth = initial.oauth ?? null;
  const installed: string[] = [];
  const storage: WebSessionStorage = {
    async readLegacySession() {
      return cookie;
    },
    async clearLegacySession(expected) {
      if (initial.failClear) throw new Error("SecureStore unavailable");
      if (cookie !== expected) return false;
      cookie = null;
      return true;
    },
    async migrationComplete() {
      return migrated;
    },
    async markMigrationComplete() {
      migrated = true;
    },
    async readOAuthTransferState() {
      return oauth;
    },
    async writeOAuthTransferState(state) {
      oauth = state;
    },
    async clearOAuthTransferState() {
      oauth = null;
    },
    async installSession(value) {
      if (initial.failInstall) throw new Error("CookieManager rejected cookie");
      installed.push(value);
    },
  };
  return {
    storage,
    state: () => ({ cookie, migrated, oauth, installed }),
  };
}

test("the alpha session migrates once and is then removed", async () => {
  const fake = fakeStorage({ cookie: "session=alpha" });
  await restoreStoredWebSession(fake.storage);
  assert.deepEqual(fake.state(), {
    cookie: null,
    migrated: true,
    oauth: null,
    installed: ["session=alpha"],
  });

  await restoreStoredWebSession(fake.storage);
  assert.deepEqual(fake.state().installed, ["session=alpha"]);
});

test("a failed install leaves the alpha session available for retry", async () => {
  const fake = fakeStorage({ cookie: "session=alpha", failInstall: true });
  await assert.rejects(() => restoreStoredWebSession(fake.storage));
  assert.equal(fake.state().cookie, "session=alpha");
  assert.equal(fake.state().migrated, false);
});

test("a completed migration never reinstalls a cookie left by a failed deletion", async () => {
  const fake = fakeStorage({
    cookie: "session=old",
    migrated: true,
    failClear: true,
  });
  await assert.rejects(() => restoreStoredWebSession(fake.storage));
  assert.deepEqual(fake.state().installed, []);
});

test("OAuth records installation before deleting its native session", async () => {
  const fake = fakeStorage({
    cookie: "session=oauth",
    migrated: true,
    oauth: "pending",
    failClear: true,
  });
  await assert.rejects(() => transferOAuthSession(fake.storage));
  assert.deepEqual(fake.state(), {
    cookie: "session=oauth",
    migrated: true,
    oauth: "installed",
    installed: ["session=oauth"],
  });

  const recovery = fakeStorage({
    cookie: "session=oauth",
    migrated: true,
    oauth: "installed",
  });
  await restoreStoredWebSession(recovery.storage);
  assert.deepEqual(recovery.state().installed, []);
  assert.equal(recovery.state().cookie, null);
  assert.equal(recovery.state().oauth, null);
});
