import { z } from "zod";

export const userSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string(),
  displayName: z.string().nullish(),
});
export const profileSchema = z.object({ user: userSchema });
export type User = z.infer<typeof userSchema>;

export function apiHeaders(
  origin: string,
  cookie: string | null,
  body?: BodyInit | null,
  initial?: HeadersInit,
): Headers {
  const headers = new Headers(initial);
  // The existing backend checks Origin on mutations, including sign-in.
  headers.set("Origin", apiOrigin(origin));
  if (cookie) headers.set("Cookie", cookie);
  else headers.delete("Cookie");
  if (typeof body === "string") headers.set("Content-Type", "application/json");
  return headers;
}

export function sessionCookie(header: string | null): string {
  // Extract only our session, never forward attributes or unrelated cookies.
  const match = header?.match(/(?:^|,\s*)session=([A-Za-z0-9_.-]+)(?:;|,|$)/);
  if (!match)
    throw new Error(
      "The server did not return a session. Please try signing in again.",
    );
  return `session=${match[1]}`;
}

export function apiOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("The mobile API must be an HTTPS origin.");
  }
  return url.origin;
}
