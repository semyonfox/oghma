import * as SecureStore from "expo-secure-store";
import { origin, readStoredSessionCookie, clearStoredSessionCookie } from "./api";
import { hasPendingOAuth, resumeOAuth, signInWithProvider } from "./oauth";
import {
  restoreStoredWebSession,
  transferOAuthSession,
  type OAuthTransferState,
  type WebSessionStorage,
} from "./web-session-state";
import { installSession } from "../../modules/oghma-web-session";

export type WebOAuthProvider = "google" | "github";

const hostname = new URL(origin).hostname;
const migrationKey = `oghma.web-session.migrated.${hostname}`;
const oauthTransferKey = `oghma.web-session.oauth.${hostname}`;

const storage: WebSessionStorage = {
  readLegacySession: readStoredSessionCookie,
  clearLegacySession: clearStoredSessionCookie,
  async migrationComplete() {
    return (await SecureStore.getItemAsync(migrationKey)) === "1";
  },
  async markMigrationComplete() {
    await SecureStore.setItemAsync(migrationKey, "1");
  },
  async readOAuthTransferState() {
    const state = await SecureStore.getItemAsync(oauthTransferKey);
    return state === "pending" || state === "installed" ? state : null;
  },
  async writeOAuthTransferState(state: OAuthTransferState) {
    await SecureStore.setItemAsync(oauthTransferKey, state);
  },
  async clearOAuthTransferState() {
    await SecureStore.deleteItemAsync(oauthTransferKey);
  },
  async installSession(cookie: string) {
    await installSession(origin, cookie);
  },
};

export async function restoreWebSession(): Promise<void> {
  await restoreStoredWebSession(storage);
}

async function finishWebOAuth(
  complete: () => Promise<unknown>,
): Promise<boolean> {
  let user: unknown;
  try {
    user = await complete();
  } catch (error) {
    // The HTTPS exchange stores the session before cleaning up its pending
    // state. A cleanup failure must not discard an otherwise valid sign-in.
    const cookie = await storage.readLegacySession();
    if (cookie) {
      await transferOAuthSession(storage, cookie);
      return true;
    }
    await storage.clearOAuthTransferState();
    throw error;
  }

  if (!user) {
    await storage.clearOAuthTransferState();
    return false;
  }
  await transferOAuthSession(storage);
  return true;
}

export async function signInToWeb(
  provider: WebOAuthProvider,
): Promise<boolean> {
  if (provider !== "google" && provider !== "github") {
    throw new Error("This sign-in provider is not supported.");
  }
  await storage.writeOAuthTransferState("pending");
  return finishWebOAuth(() => signInWithProvider(provider));
}

export async function resumeWebSignIn(callbackUrl?: string): Promise<boolean> {
  const state = await storage.readOAuthTransferState();
  if (state === "installed") {
    await restoreStoredWebSession(storage);
    return true;
  }
  if (state !== "pending") return false;

  const cookie = await storage.readLegacySession();
  if (cookie) {
    await transferOAuthSession(storage, cookie);
    return true;
  }

  let user: unknown;
  try {
    user = await resumeOAuth(callbackUrl);
  } catch (error) {
    const exchangedCookie = await storage.readLegacySession();
    if (exchangedCookie) {
      await transferOAuthSession(storage, exchangedCookie);
      return true;
    }
    await storage.clearOAuthTransferState();
    throw error;
  }
  if (!user) {
    // A process can resume before the browser redirects. Keep waiting while
    // the verifier is valid; an expired or corrupt request is removed.
    if (!(await hasPendingOAuth())) await storage.clearOAuthTransferState();
    return false;
  }
  await transferOAuthSession(storage);
  return true;
}
