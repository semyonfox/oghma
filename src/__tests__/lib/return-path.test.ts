import { expect, it } from "vitest";
import { authReturnPath } from "@/lib/auth/return-path";

it.each(["/quiz", "/notes/some-note?mode=read#heading", "/study-map?filter=one%20two"])(
  "preserves a local destination %s",
  (path) => expect(authReturnPath(path)).toBe(path),
);

it.each([
  null, "", "quiz", "https://example.test/", "//example.test/",
  "/\\example.test/", "/notes\n", "/login?next=/quiz", "/register/",
  "/notes/../login", "/notes/..//example.test/",
])("uses the default destination for %j", (path) => {
  expect(authReturnPath(path)).toBe("/notes");
});
