import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const release = JSON.parse(await readFile("public/downloads/android-alpha.json", "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(release.version))
  throw new Error("Invalid Android release version");
const response = await fetch(
  `https://github.com/semyonfox/oghma/releases/download/android-alpha-v${release.version}/oghmanotes-alpha.apk`,
  { signal: AbortSignal.timeout(120_000) },
);
if (!response.ok) throw new Error(`Android release download failed: ${response.status}`);
const apk = Buffer.from(await response.arrayBuffer());
if (
  apk.length !== release.bytes ||
  createHash("sha256").update(apk).digest("hex") !== release.sha256
) throw new Error("Android release failed integrity verification");
await writeFile("public/downloads/oghmanotes-alpha.apk", apk);
console.log(`Fetched verified Android alpha ${release.version}`);
