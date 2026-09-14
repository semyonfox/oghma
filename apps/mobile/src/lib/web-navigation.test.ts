import test from "node:test";
import assert from "node:assert/strict";
import { navigationAction, parseWebMessage } from "./web-navigation.ts";

const origin = "https://oghmanotes.ie";

test("workspace links stay inside the app; APK links use the verified updater", () => {
  for (const path of ["/notes", "/notes/123", "/settings", "/api/uploads/file.pdf", "/chat"]) {
    assert.equal(navigationAction(`${origin}${path}`, origin), "workspace");
  }
  assert.equal(navigationAction(`${origin}/downloads/oghmanotes-alpha.apk`, origin), "update");
  assert.equal(navigationAction(`${origin}/downloads`, origin), "update");
  assert.equal(navigationAction(`${origin}/`, origin), "home");
  for (const path of ["/pricing", "/about", "/blog/a-post"]) {
    assert.equal(navigationAction(`${origin}${path}`, origin), "external");
  }
  assert.equal(navigationAction("https://example.com/study", origin), "external");
  for (const url of ["javascript:alert(1)", "file:///private", "content://private", "intent://example", "https://user:pass@oghmanotes.ie/notes"]) {
    assert.equal(navigationAction(url, origin), "block");
  }
});

test("only the configured website can send a known native action", () => {
  const oauth = JSON.stringify({ type: "oghma:oauth", provider: "google" });
  assert.deepEqual(parseWebMessage(oauth, `${origin}/login`, origin), { type: "oghma:oauth", provider: "google" });
  for (const source of ["https://oghmanotes.ie.evil.test/login", "https://dev.oghmanotes.ie/login", "about:blank", "https://user@oghmanotes.ie/"]) {
    assert.equal(parseWebMessage(oauth, source, origin), null);
  }
  for (const data of ["null", "invalid", JSON.stringify({ type: "oghma:oauth", provider: "microsoft" }), JSON.stringify({ type: "oghma:updates", url: "https://evil.test/app.apk" }), " ".repeat(513)]) {
    assert.equal(parseWebMessage(data, `${origin}/login`, origin), null);
  }
  assert.deepEqual(parseWebMessage('{"type":"oghma:theme","theme":"dark"}', origin, origin), { type: "oghma:theme", theme: "dark" });
});
