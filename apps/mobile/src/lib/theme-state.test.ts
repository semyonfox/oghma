import assert from "node:assert/strict";
import { test } from "node:test";
import { isCurrentThemeRequest } from "./theme-state.ts";

test("a late theme response cannot overwrite a newer local choice or account", () => {
  assert.equal(isCurrentThemeRequest("account-a", "account-a", 2, 1), false);
  assert.equal(isCurrentThemeRequest("account-b", "account-a", 1, 1), false);
  assert.equal(isCurrentThemeRequest("account-a", "account-a", 1, 1), true);
});
