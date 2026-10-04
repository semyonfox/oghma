import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const packageRoot = new URL(
  "../node_modules/@excalidraw/excalidraw/",
  import.meta.url,
);
const manifest = JSON.parse(
  await readFile(new URL("package.json", packageRoot), "utf8"),
);
if (manifest.version !== "0.18.1") {
  throw new Error("Review the local-font patch before upgrading Excalidraw");
}

// Chromium checks every FontFace source against CSP, even unused fallbacks
const remoteFallback =
  /("ASSETS_FALLBACK_URL",\s*)`https:\/\/esm\.sh\/\$\{[^;]+?\/dist\/prod\/`/g;
const localFallback =
  '$1new URL("/study-board-assets/", window.location.origin).href';
const patchedFallback =
  /"ASSETS_FALLBACK_URL",\s*new URL\("\/study-board-assets\/", window\.location\.origin\)\.href/g;
for (const mode of ["dev", "prod"]) {
  const directory = new URL(`dist/${mode}/`, packageRoot);
  let patched = 0;
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".js")) continue;
    const file = new URL(name, directory);
    const contents = await readFile(file, "utf8");
    if (!contents.includes('"ASSETS_FALLBACK_URL"')) continue;
    const updated = contents.replace(remoteFallback, localFallback);
    if (
      [...updated.matchAll(patchedFallback)].length !== 1 ||
      [...updated.matchAll(remoteFallback)].length !== 0
    ) {
      throw new Error(`Excalidraw ${mode} font patch no longer matches`);
    }
    patched++;
    if (contents !== updated) await writeFile(file, updated);
  }
  if (patched !== 1)
    throw new Error(`Expected one Excalidraw ${mode} font fallback`);
}

const source = new URL(
  "../node_modules/@excalidraw/excalidraw/dist/prod/fonts/",
  import.meta.url,
);
const destination = new URL(
  "../public/study-board-assets/fonts/",
  import.meta.url,
);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (entry) => path.basename(entry) !== "Liberation",
});
const licenses = new URL(
  "../public/study-board-assets/licenses/",
  import.meta.url,
);
await rm(licenses, { recursive: true, force: true });
await cp(new URL("../third_party/study-board/", import.meta.url), licenses, {
  recursive: true,
});
