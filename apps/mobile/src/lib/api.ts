import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import {
  apiOrigin,
  apiHeaders,
  profileSchema,
  sessionCookie,
  EventDecoder,
  type StreamEvent,
} from "./contracts";

export const origin = apiOrigin(
  process.env.EXPO_PUBLIC_API_URL || "https://oghmanotes.ie",
);
const sessionKey = `oghma.session.${new URL(origin).hostname}`;
let cookie: string | null = null;
const sessionExpiredListeners = new Set<() => void>();

export function onSessionExpired(listener: () => void) {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function request(path: string, init: RequestInit = {}) {
  if (!path.startsWith("/api/") || path.includes("\\"))
    throw new Error("Invalid API path");
  const requestCookie = cookie;
  const headers = apiHeaders(origin, requestCookie, init.body, init.headers);
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers,
    credentials: "omit",
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // A late response from an older account must not clear a newer session.
    if (response.status === 401 && requestCookie && cookie === requestCookie) {
      await clearSession();
      for (const listener of sessionExpiredListeners) listener();
    }
    const data: unknown = await response.json().catch(() => null);
    const parsed = z
      .object({ error: z.string().optional(), message: z.string().optional() })
      .safeParse(data);
    throw new ApiError(
      parsed.success
        ? parsed.data.error ||
            parsed.data.message ||
            `Request failed (${response.status})`
        : `Request failed (${response.status})`,
      response.status,
    );
  }
  return response;
}

export async function json<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await request(path, init);
  const data: unknown = await response.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      "The server returned an unexpected response. Update the app or try again.",
    );
  return parsed.data;
}

export async function restoreSession() {
  cookie = await SecureStore.getItemAsync(sessionKey);
  if (!cookie) return null;
  try {
    return (await json("/api/auth/me", profileSchema)).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSession();
      return null;
    }
    throw error;
  }
}

export async function signIn(email: string, password: string) {
  cookie = null;
  const response = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password, rememberMe: true }),
  });
  return acceptSession(response);
}

export async function completeOAuth(code: string, codeVerifier: string) {
  const response = await request("/api/auth/mobile/exchange", {
    method: "POST",
    body: JSON.stringify({ code, codeVerifier }),
  });
  return acceptSession(response);
}

async function acceptSession(response: Response) {
  const user = profileSchema.parse(await response.json()).user;
  const nextCookie = sessionCookie(response.headers.get("set-cookie"));
  await SecureStore.setItemAsync(sessionKey, nextCookie);
  cookie = nextCookie;
  return user;
}

export async function clearSession() {
  cookie = null;
  await SecureStore.deleteItemAsync(sessionKey);
}

export async function readStream(
  id: string,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  // Replay from the start on reconnect. The caller resets its transient text;
  // persisted history remains authoritative after completion.
  const response = await request(
    `/api/chat/generations/${encodeURIComponent(id)}/stream`,
    { signal, headers: { Accept: "text/event-stream" } },
  );
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error(
      "Streaming is unavailable. Reopen the conversation to retrieve the answer.",
    );
  const decoder = new TextDecoder();
  const events = new EventDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const event of events.push(decoder.decode(value, { stream: true })))
        onEvent(event);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
