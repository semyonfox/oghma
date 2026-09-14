import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("Pass the published Android release directory");
const source = await stat(directory).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
if (!source) {
  console.log("No Android alpha has been published yet.");
  process.exit(0);
}
const metadata = await readFile(join(directory, "android-alpha.json"), "utf8");
const release = JSON.parse(metadata);
const apk = await readFile(join(directory, "oghmanotes-alpha.apk"));
if (
  apk.length !== release.bytes ||
  createHash("sha256").update(apk).digest("hex") !== release.sha256
) throw new Error("Published Android release failed integrity verification");
await mkdir("public/downloads", { recursive: true });
for (const name of ["oghmanotes-alpha.apk", "android-alpha.json"]) {
  await copyFile(join(directory, name), join("public/downloads", name));
}
console.log(`Staged Android alpha ${release.version} (${apk.length} bytes)`);
