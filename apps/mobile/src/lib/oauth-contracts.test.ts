import test from "node:test";
import assert from "node:assert/strict";
import {
  isPendingOAuthCurrent,
  oauthProvidersSchema,
  parseOAuthReturn,
  oauthReturnUrl,
} from "./oauth-contracts.ts";
const state = "a".repeat(64);
const code = "b".repeat(43);
const valid = `${oauthReturnUrl}?state=${state}&code=${code}`;

test("only the exact native callback and pending state can complete sign-in", () => {
  assert.equal(parseOAuthReturn(valid, state), code);
  for (const url of [
    valid.replace("ie.oghmanotes.alpha:", "https:"),
    valid.replace("//auth", "//auth.attacker.test"),
    valid.replace("//auth", "//user@auth"),
    valid.replace("?state=", "/extra?state="),
    `${valid}&state=${state}`,
    `${valid}&code=${code}`,
    `${valid}#fragment`,
  ])
    assert.throws(() => parseOAuthReturn(url, state));
  assert.throws(() => parseOAuthReturn(valid, "c".repeat(64)));
  assert.throws(() =>
    parseOAuthReturn(`${oauthReturnUrl}?state=${state}&code=short`, state),
  );
});

test("provider discovery accepts server configured OAuth providers and rejects unsafe ids", () => {
  const providers = oauthProvidersSchema.parse({
    google: { id: "google", name: "Google", type: "oidc" },
    github: { id: "github", name: "GitHub", type: "oauth" },
    credentials: {
      id: "credentials",
      name: "Credentials",
      type: "credentials",
    },
  });
  assert.deepEqual(
    Object.values(providers)
      .filter((entry) => entry.type === "oauth" || entry.type === "oidc")
      .map((entry) => entry.id),
    ["google", "github"],
  );
  assert.throws(() =>
    oauthProvidersSchema.parse({
      evil: { id: "../redirect", name: "x", type: "oauth" },
    }),
  );
});

test("cold-resume OAuth state expires after ten minutes", () => {
  const now = 2_000_000;
  const pending = {
    state,
    verifier: "c".repeat(64),
    createdAt: now - 10 * 60_000,
  };
  assert.equal(isPendingOAuthCurrent(pending, now), true);
  assert.equal(
    isPendingOAuthCurrent({ ...pending, createdAt: pending.createdAt - 1 }, now),
    false,
  );
  assert.equal(isPendingOAuthCurrent({ ...pending, verifier: "short" }, now), false);
});
