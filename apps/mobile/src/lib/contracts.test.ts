import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiOrigin,
  apiHeaders,
  sessionCookie,
} from "./contracts.ts";

test("native mutations satisfy the backend Origin contract without weakening cookie isolation", () => {
  const headers = apiHeaders(
    "https://oghmanotes.ie",
    "session=synthetic",
    "{}",
    { Origin: "https://other.example" },
  );
  assert.equal(headers.get("Origin"), "https://oghmanotes.ie");
  assert.equal(headers.get("Cookie"), "session=synthetic");
  assert.equal(headers.get("Content-Type"), "application/json");
  const loginHeaders = apiHeaders("https://oghmanotes.ie", null, "{}", {
    Cookie: "session=old",
  });
  assert.equal(loginHeaders.has("Cookie"), false);
  assert.equal(loginHeaders.get("Origin"), "https://oghmanotes.ie");
});

test("session extraction never forwards attributes or other cookies", () => {
  assert.equal(
    sessionCookie("session=a.b-c_d; Path=/; HttpOnly; Secure"),
    "session=a.b-c_d",
  );
  assert.equal(
    sessionCookie("other=123; Path=/, session=a.b.c; HttpOnly"),
    "session=a.b.c",
  );
  assert.throws(() => sessionCookie("other=123"));
  assert.throws(() => sessionCookie("session=; Path=/"));
});
test("credentials can only be sent to an HTTPS origin", () => {
  assert.equal(apiOrigin("https://oghmanotes.ie/"), "https://oghmanotes.ie");
  for (const url of [
    "http://oghmanotes.ie",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com/?x=1",
  ])
    assert.throws(() => apiOrigin(url));
});
