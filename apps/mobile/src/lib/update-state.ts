import { z } from "zod";

export const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  versionCode: z.number().int().positive().max(2_100_000_000),
  bytes: z
    .number()
    .int()
    .positive()
    .max(250 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  builtAt: z.iso.datetime(),
});
export type MobileRelease = z.infer<typeof releaseSchema>;
export type UpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "verifying"
  | "cancelling"
  | "ready"
  | "permission"
  | "opening"
  | "installer"
  | "error";
type RetryAction = "check" | "download" | "install" | "permission";
export type UpdateState = {
  status: UpdateStatus;
  release: MobileRelease | null;
  receivedBytes: number;
  checkedAt: number | null;
  error: string;
  retry: RetryAction;
};
export type DownloadProgress = {
  receivedBytes: number;
  totalBytes: number;
  stage: "downloading" | "verifying";
};
export type UpdateDriver = {
  getInstalledVersion(): { version: string; versionCode: number };
  fetchRelease(): Promise<MobileRelease>;
  downloadUpdate(release: MobileRelease): Promise<void>;
  cancelDownload(): void;
  canInstallPackages(): boolean;
  openInstallPermissionSettings(): Promise<void>;
  installUpdate(): Promise<void>;
};

// Shared by every entry point, so closing the sheet cannot lose a download.
export class UpdateController {
  private listeners = new Set<() => void>();
  private busy = false;
  private cancelled = false;
  private lastAttempt = 0;
  private state: UpdateState = {
    status: "idle",
    release: null,
    receivedBytes: 0,
    checkedAt: null,
    error: "",
    retry: "check",
  };
  readonly installed: { version: string; versionCode: number };
  private driver: UpdateDriver;

  constructor(driver: UpdateDriver) {
    this.driver = driver;
    this.installed = driver.getInstalledVersion();
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private fail(error: unknown, retry: RetryAction) {
    this.set({
      status: "error",
      retry,
      error: error instanceof Error ? error.message : "Please try again.",
    });
  }
  async check(automatic = false) {
    if (
      this.busy ||
      ["ready", "permission", "opening", "installer"].includes(
        this.state.status,
      )
    )
      return;
    if (
      automatic &&
      (this.state.release || Date.now() - this.lastAttempt < 30 * 60_000)
    )
      return;
    this.lastAttempt = Date.now();
    this.busy = true;
    this.set({ status: "checking", error: "" });
    try {
      const release = releaseSchema.parse(await this.driver.fetchRelease());
      const newer = release.versionCode > this.installed.versionCode;
      this.set({
        status: newer ? "available" : "current",
        release: newer ? release : null,
        checkedAt: Date.now(),
      });
    } catch {
      this.fail(
        new Error(
          "Could not check for updates. Check your connection and try again.",
        ),
        "check",
      );
    } finally {
      this.busy = false;
    }
  }
  async download() {
    const release = this.state.release;
    if (
      this.busy ||
      !release ||
      !["available", "error"].includes(this.state.status)
    )
      return;
    this.busy = true;
    this.cancelled = false;
    this.set({ status: "downloading", receivedBytes: 0, error: "" });
    try {
      await this.driver.downloadUpdate(release);
      this.set({
        status: this.cancelled ? "available" : "ready",
        receivedBytes: this.cancelled ? 0 : release.bytes,
      });
    } catch (error) {
      if (this.cancelled) this.set({ status: "available", receivedBytes: 0 });
      else this.fail(error, "download");
    } finally {
      this.busy = false;
    }
  }
  progress = (event: DownloadProgress) => {
    if (!["downloading", "verifying"].includes(this.state.status)) return;
    const size = this.state.release?.bytes ?? 0;
    if (!Number.isFinite(event.receivedBytes) || event.totalBytes !== size)
      return;
    this.set({
      status: event.stage,
      receivedBytes: Math.min(size, Math.max(0, event.receivedBytes)),
    });
  };
  cancel() {
    if (!["downloading", "verifying"].includes(this.state.status)) return;
    this.cancelled = true;
    this.set({ status: "cancelling" });
    this.driver.cancelDownload();
  }
  async install() {
    const retrying =
      this.state.status === "error" && this.state.retry === "install";
    if (
      this.busy ||
      !this.state.release ||
      (!retrying &&
        !["ready", "permission", "installer"].includes(this.state.status))
    )
      return;
    this.busy = true;
    this.set({ error: "" });
    try {
      if (!this.driver.canInstallPackages()) {
        this.set({ status: "permission" });
        return;
      }
      this.set({ status: "opening" });
      await this.driver.installUpdate();
      // Opening Android's installer is not evidence that the update was installed.
      this.set({ status: "installer" });
    } catch (error) {
      this.fail(error, "install");
    } finally {
      this.busy = false;
    }
  }
  async permission() {
    if (this.busy) return;
    this.busy = true;
    this.set({ status: "permission", error: "" });
    try {
      await this.driver.openInstallPermissionSettings();
    } catch (error) {
      this.fail(error, "permission");
    } finally {
      this.busy = false;
    }
  }
  foreground() {
    if (this.state.status === "permission") {
      try {
        if (this.driver.canInstallPackages()) this.set({ status: "ready" });
      } catch (error) {
        this.fail(error, "permission");
      }
    } else {
      void this.check(true);
    }
  }
  retry() {
    switch (this.state.retry) {
      case "download":
        return this.download();
      case "install":
        return this.install();
      case "permission":
        return this.permission();
      default:
        return this.check();
    }
  }
}
