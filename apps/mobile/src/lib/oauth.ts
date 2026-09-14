import { Linking } from "react-native";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { completeOAuth, json, origin } from "./api";
import type { User } from "./contracts";
import {
  oauthProvidersSchema,
  oauthReturnUrl,
  parseOAuthReturn,
  pendingOAuthSchema,
} from "./oauth-contracts";

const pendingKey = `oghma.oauth.${new URL(origin).hostname}`;
let completing: Promise<User | null> | null = null;

export async function getOAuthProviders() {
  const providers = await json("/api/auth/providers", oauthProvidersSchema);
  return Object.values(providers).filter(
    (provider) => provider.type === "oauth" || provider.type === "oidc",
  );
}

async function finish(value: string): Promise<User | null> {
  const saved = await SecureStore.getItemAsync(pendingKey);
  if (!saved) return null;
  const pending = pendingOAuthSchema.safeParse(JSON.parse(saved));
  if (!pending.success || Date.now() - pending.data.createdAt > 10 * 60_000) {
    await SecureStore.deleteItemAsync(pendingKey);
    throw new Error("Sign-in expired. Please try again.");
  }
  const code = parseOAuthReturn(value, pending.data.state);
  try {
    return await completeOAuth(code, pending.data.verifier);
  } finally {
    await SecureStore.deleteItemAsync(pendingKey);
  }
}

function finishOnce(value: string) {
  if (completing) return completing;
  completing = finish(value).finally(() => {
    completing = null;
  });
  return completing;
}

export async function resumeOAuth() {
  // Android may recreate the process while the browser is signing in.
  const url = await Linking.getInitialURL();
  if (!url || !url.startsWith(`${oauthReturnUrl}?`)) return null;
  return finishOnce(url);
}

export async function signInWithProvider(provider: string) {
  const providers = await getOAuthProviders();
  if (!providers.some((entry) => entry.id === provider))
    throw new Error("This sign-in provider is not configured right now.");
  const randomHex = async () =>
    Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  const state = await randomHex();
  const verifier = await randomHex();
  const challenge = (
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await SecureStore.setItemAsync(
    pendingKey,
    JSON.stringify({ state, verifier, createdAt: Date.now() }),
  );
  const url = new URL("/auth/mobile", origin);
  url.search = new URLSearchParams({
    provider,
    state,
    code_challenge: challenge,
  }).toString();
  try {
    const result = await WebBrowser.openAuthSessionAsync(
      url.toString(),
      oauthReturnUrl,
    );
    if (result.type !== "success") {
      await SecureStore.deleteItemAsync(pendingKey);
      return null;
    }
    return await finishOnce(result.url);
  } catch (error) {
    await SecureStore.deleteItemAsync(pendingKey);
    throw error;
  }
}
