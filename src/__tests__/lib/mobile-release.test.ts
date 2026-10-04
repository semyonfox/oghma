import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMobileRelease } from "@/lib/mobile-release";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "oghma-apk-test-"));
  directories.push(directory);
  return directory;
}
const release = {
  version: "0.1.0",
  bytes: 4,
  sha256: "a".repeat(64),
  builtAt: "2026-09-14T12:00:00.000Z",
};

it("does not advertise a download before an APK exists", async () => {
  const directory = await fixture();
  expect(await getMobileRelease(directory)).toBeNull();
  await writeFile(
    join(directory, "android-alpha.json"),
    JSON.stringify(release),
  );
  expect(await getMobileRelease(directory)).toBeNull();
});
it("hides a partially staged or mismatched APK", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "android-alpha.json"),
    JSON.stringify(release),
  );
  await writeFile(join(directory, "oghmanotes-alpha.apk"), "PK");
  expect(await getMobileRelease(directory)).toBeNull();
});
it("returns valid metadata only when the matching artifact exists", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "android-alpha.json"),
    JSON.stringify(release),
  );
  await writeFile(join(directory, "oghmanotes-alpha.apk"), "PK00");
  expect(await getMobileRelease(directory)).toEqual(release);
});
it("rejects malformed release metadata", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "android-alpha.json"),
    JSON.stringify({ ...release, sha256: "invalid" }),
  );
  await writeFile(join(directory, "oghmanotes-alpha.apk"), "PK00");
  expect(await getMobileRelease(directory)).toBeNull();
});
