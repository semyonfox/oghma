import { z } from "zod";

export const oauthReturnUrl = "ie.oghmanotes.alpha://auth";
export const oauthProvidersSchema = z.record(
  z.string(),
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    type: z.string(),
  }),
);
export type OAuthProvider = z.infer<typeof oauthProvidersSchema>[string];
export const pendingOAuthSchema = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.number(),
});

export function isPendingOAuthCurrent(value: unknown, now = Date.now()) {
  const pending = pendingOAuthSchema.safeParse(value);
  return pending.success && now - pending.data.createdAt <= 10 * 60_000;
}

export function parseOAuthReturn(value: string, state: string) {
  const url = new URL(value);
  if (
    `${url.protocol}//${url.host}${url.pathname}` !== oauthReturnUrl ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.getAll("state").length !== 1 ||
    url.searchParams.get("state") !== state ||
    url.searchParams.getAll("code").length !== 1
  )
    throw new Error(
      "This sign-in response does not match this phone. Please try again.",
    );
  const code = url.searchParams.get("code");
  if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code))
    throw new Error("The sign-in response was incomplete. Please try again.");
  return code;
}
