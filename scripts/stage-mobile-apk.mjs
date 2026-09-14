import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const source = resolve(
  process.argv[2] || "apps/mobile/dist/oghmanotes-alpha.apk",
);
const bytes = await readFile(source);
if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
  throw new Error("Expected an APK ZIP archive");
const config = JSON.parse(await readFile("apps/mobile/app.json", "utf8"));
const directory = resolve("public/downloads");
await mkdir(directory, { recursive: true });
await copyFile(source, resolve(directory, "oghmanotes-alpha.apk"));
await writeFile(
  resolve(directory, "android-alpha.json"),
  JSON.stringify(
    {
      version: config.expo.version,
      versionCode: config.expo.android.versionCode,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Staged the APK and checksum for /downloads. Include public/downloads in the website deployment.",
);
