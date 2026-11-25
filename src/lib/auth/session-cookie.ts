// custom JWT, Auth.js v5 session, and the numbered chunks Auth.js uses for large tokens
const SESSION_COOKIE = /^(?:session|(?:__Secure-)?authjs\.session-token(?:\.\d+)?)$/;

/**
 * Whether the request carries a session cookie at all. It says nothing about
 * validity, revocation is enforced by validateSession in every API route.
 */
export function hasSessionCookie(cookies: readonly { name: string; value: string }[]): boolean {
  return cookies.some((cookie) => SESSION_COOKIE.test(cookie.name) && cookie.value !== "");
}
