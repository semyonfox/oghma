import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  builtAt: z.iso.datetime(),
});

export async function getMobileRelease(
  directory = join(process.cwd(), "public", "downloads"),
) {
  try {
    const parsed = releaseSchema.parse(
      JSON.parse(await readFile(join(directory, "android-alpha.json"), "utf8")),
    );
    const apk = await stat(join(directory, "oghmanotes-alpha.apk"));
    return apk.isFile() && apk.size === parsed.bytes ? parsed : null;
  } catch {
    return null;
  }
}
