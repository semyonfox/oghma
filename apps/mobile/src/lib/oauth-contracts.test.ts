import test from "node:test";
import assert from "node:assert/strict";
import {
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
