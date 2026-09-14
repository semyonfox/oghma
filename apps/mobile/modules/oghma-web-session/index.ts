import { NativeModule, requireNativeModule } from "expo-modules-core";

declare class OghmaWebSessionNativeModule extends NativeModule {
  installSession(origin: string, cookie: string): Promise<void>;
}

const nativeModule =
  requireNativeModule<OghmaWebSessionNativeModule>("OghmaWebSession");

/** Installs only OghmaNotes' fixed HttpOnly session cookie. */
export function installSession(origin: string, cookie: string): Promise<void> {
  return nativeModule.installSession(origin, cookie);
}
