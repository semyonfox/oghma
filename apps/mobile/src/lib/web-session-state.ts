export type OAuthTransferState = "pending" | "installed";

export interface WebSessionStorage {
  readLegacySession(): Promise<string | null>;
  clearLegacySession(expected: string): Promise<boolean>;
  migrationComplete(): Promise<boolean>;
  markMigrationComplete(): Promise<void>;
  readOAuthTransferState(): Promise<OAuthTransferState | null>;
  writeOAuthTransferState(state: OAuthTransferState): Promise<void>;
  clearOAuthTransferState(): Promise<void>;
  installSession(cookie: string): Promise<void>;
}

async function clearTransferredSession(
  storage: WebSessionStorage,
  cookie: string,
): Promise<void> {
  const cleared = await storage.clearLegacySession(cookie);
  if (!cleared) {
    throw new Error("The saved sign-in changed while it was being restored.");
  }
}

export async function restoreStoredWebSession(
  storage: WebSessionStorage,
): Promise<void> {
  const [migrationComplete, oauthState, cookie] = await Promise.all([
    storage.migrationComplete(),
    storage.readOAuthTransferState(),
    storage.readLegacySession(),
  ]);

  if (oauthState === "installed") {
    if (cookie) await clearTransferredSession(storage, cookie);
    await storage.clearOAuthTransferState();
    return;
  }

  if (oauthState === "pending" && cookie) {
    await transferOAuthSession(storage, cookie);
    return;
  }

  if (migrationComplete) {
    // A failed SecureStore deletion must never restore an old native session
    // after the user has logged out in the WebView.
    if (cookie) await clearTransferredSession(storage, cookie);
    return;
  }

  if (cookie) await storage.installSession(cookie);
  await storage.markMigrationComplete();
  if (cookie) await clearTransferredSession(storage, cookie);
}

export async function transferOAuthSession(
  storage: WebSessionStorage,
  knownCookie?: string,
): Promise<void> {
  const cookie = knownCookie ?? (await storage.readLegacySession());
  if (!cookie) throw new Error("The sign-in did not return a session.");

  await storage.installSession(cookie);
  await storage.writeOAuthTransferState("installed");
  await clearTransferredSession(storage, cookie);
  await storage.clearOAuthTransferState();
}
