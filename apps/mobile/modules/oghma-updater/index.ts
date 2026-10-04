import { NativeModule, requireNativeModule } from "expo-modules-core";

export type InstalledVersion = {
  version: string;
  versionCode: number;
};

export type UpdateDownload = {
  versionCode: number;
  bytes: number;
  sha256: string;
};

export type DownloadProgress = {
  receivedBytes: number;
  totalBytes: number;
  stage: "downloading" | "verifying";
};

type UpdaterEvents = {
  downloadProgress: (progress: DownloadProgress) => void;
};

declare class OghmaUpdaterNativeModule extends NativeModule<UpdaterEvents> {
  getInstalledVersion(): InstalledVersion;
  downloadUpdate(update: UpdateDownload): Promise<void>;
  cancelDownload(): void;
  canInstallPackages(): boolean;
  openInstallPermissionSettings(): Promise<void>;
  installUpdate(): Promise<void>;
  discardUpdate(): void;
}

const nativeModule =
  requireNativeModule<OghmaUpdaterNativeModule>("OghmaUpdater");

export function getInstalledVersion(): InstalledVersion {
  return nativeModule.getInstalledVersion();
}

export function downloadUpdate(update: UpdateDownload): Promise<void> {
  return nativeModule.downloadUpdate(update);
}

export function cancelDownload(): void {
  nativeModule.cancelDownload();
}

export function canInstallPackages(): boolean {
  return nativeModule.canInstallPackages();
}

export function openInstallPermissionSettings(): Promise<void> {
  return nativeModule.openInstallPermissionSettings();
}

export function installUpdate(): Promise<void> {
  return nativeModule.installUpdate();
}

export function discardUpdate(): void {
  nativeModule.discardUpdate();
}

export function addDownloadProgressListener(
  listener: (progress: DownloadProgress) => void,
): { remove(): void } {
  return nativeModule.addListener("downloadProgress", listener);
}
