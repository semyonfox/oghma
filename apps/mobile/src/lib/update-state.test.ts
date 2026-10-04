import { test } from "node:test";
import assert from "node:assert/strict";
import {
  releaseSchema,
  UpdateController,
  type UpdateDriver,
} from "./update-state.ts";

const release = {
  version: "0.1.3",
  versionCode: 4,
  bytes: 1024,
  sha256: "a".repeat(64),
  builtAt: "2026-09-14T00:00:00.000Z",
};
function setup(overrides: Partial<UpdateDriver> = {}) {
  const driver: UpdateDriver = {
    getInstalledVersion: () => ({ version: "0.1.2", versionCode: 3 }),
    fetchRelease: async () => release,
    downloadUpdate: async () => {},
    cancelDownload: () => {},
    canInstallPackages: () => true,
    openInstallPermissionSettings: async () => {},
    installUpdate: async () => {},
    ...overrides,
  };
  return new UpdateController(driver);
}

test("release metadata rejects malformed, oversized or unversioned APKs", () => {
  for (const patch of [
    { versionCode: undefined },
    { versionCode: 0 },
    { versionCode: 3.5 },
    { bytes: 251 * 1024 * 1024 },
    { bytes: -1 },
    { sha256: "bad" },
    { version: "<script>" },
  ]) {
    assert.equal(
      releaseSchema.safeParse({ ...release, ...patch }).success,
      false,
    );
  }
});
test("Android versionCode governs update availability, including a server rollback", async () => {
  for (const versionCode of [2, 3, 4]) {
    const controller = setup({
      fetchRelease: async () => ({ ...release, versionCode }),
    });
    await controller.check();
    assert.equal(
      controller.getSnapshot().status,
      versionCode > 3 ? "available" : "current",
    );
  }
});
test("a failed update check can be retried without claiming the app is current", async () => {
  let fail = true;
  const controller = setup({
    fetchRelease: async () => {
      if (fail) throw new Error("offline");
      return release;
    },
  });
  await controller.check();
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().checkedAt, null);
  fail = false;
  await controller.retry();
  assert.equal(controller.getSnapshot().status, "available");
});
test("cancel waits for the native download to settle and ignores late progress", async () => {
  let complete: () => void = () => {};
  let downloads = 0;
  const controller = setup({
    downloadUpdate: () => {
      downloads++;
      return new Promise<void>((resolve) => {
        complete = resolve;
      });
    },
  });
  await controller.check();
  const pending = controller.download();
  controller.progress({
    receivedBytes: 512,
    totalBytes: 1024,
    stage: "downloading",
  });
  assert.equal(controller.getSnapshot().receivedBytes, 512);
  controller.cancel();
  controller.progress({
    receivedBytes: 1024,
    totalBytes: 1024,
    stage: "verifying",
  });
  assert.equal(controller.getSnapshot().status, "cancelling");
  await controller.download();
  assert.equal(downloads, 1);
  complete();
  await pending;
  assert.equal(controller.getSnapshot().status, "available");
});
test("integrity failure cannot become an installable update", async () => {
  let installs = 0;
  const controller = setup({
    downloadUpdate: async () => {
      throw new Error("Download verification failed.");
    },
    installUpdate: async () => {
      installs++;
    },
  });
  await controller.check();
  await controller.download();
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().retry, "download");
  await controller.install();
  assert.equal(installs, 0);
});
test("permission denial retains the APK and a grant never silently starts installation", async () => {
  let allowed = false;
  let downloads = 0;
  let installs = 0;
  const controller = setup({
    canInstallPackages: () => allowed,
    downloadUpdate: async () => {
      downloads++;
    },
    installUpdate: async () => {
      installs++;
    },
  });
  await controller.check();
  await controller.download();
  await controller.install();
  assert.equal(controller.getSnapshot().status, "permission");
  controller.foreground();
  assert.equal(controller.getSnapshot().status, "permission");
  allowed = true;
  controller.foreground();
  assert.equal(controller.getSnapshot().status, "ready");
  assert.equal(installs, 0);
  await controller.install();
  assert.equal(controller.getSnapshot().status, "installer");
  controller.foreground();
  await controller.install();
  assert.equal(installs, 2);
  assert.equal(downloads, 1);
  assert.equal(controller.getSnapshot().status, "installer");
});
test("opening the installer is serialized and never reports installation success", async () => {
  let finish: () => void = () => {};
  let installs = 0;
  const controller = setup({
    installUpdate: () => {
      installs++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  });
  await controller.check();
  await controller.download();
  const opening = controller.install();
  await controller.install();
  assert.equal(installs, 1);
  assert.equal(controller.getSnapshot().status, "opening");
  finish();
  await opening;
  assert.equal(controller.getSnapshot().status, "installer");
});
