// avatar API route - handles profile picture upload and retrieval
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { validateSession } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage/init";
import {
  getSettingsFromS3,
  saveSettingsToS3,
} from "@/lib/notes/storage/s3-storage";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";

/** resolve user_id from either Auth.js (OAuth) or custom JWT session */
async function resolveUserId(): Promise<string | number | null> {
  const authJsSession = await auth();
  if (authJsSession?.user?.id) return authJsSession.user.id;

  const jwtUser = await validateSession();
  if (jwtUser?.user_id) return jwtUser.user_id;

  return null;
}

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// magic byte signatures for allowed image formats
const MAGIC_BYTES: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/gif", [0x47, 0x49, 0x46]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF header
  ["image/avif", [0x00, 0x00, 0x00]], // ftyp box (checked with 'avif' at offset 8)
];

function detectMimeFromBytes(bytes: Uint8Array): string | null {
  for (const [mime, sig] of MAGIC_BYTES) {
    if (sig.every((b, i) => bytes[i] === b)) {
      // WebP needs extra check: bytes 8-11 should be 'WEBP'
      if (mime === "image/webp") {
        const tag = String.fromCharCode(
          bytes[8],
          bytes[9],
          bytes[10],
          bytes[11],
        );
        if (tag !== "WEBP") continue;
      }
      // AVIF needs ftyp box check
      if (mime === "image/avif") {
        const ftyp = String.fromCharCode(
          bytes[4],
          bytes[5],
          bytes[6],
          bytes[7],
        );
        if (ftyp !== "ftyp") continue;
        const brand = String.fromCharCode(
          bytes[8],
          bytes[9],
          bytes[10],
          bytes[11],
        );
        if (!brand.startsWith("avif") && !brand.startsWith("avis")) continue;
      }
      return mime;
    }
  }
  return null;
}

export async function GET() {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getSettingsFromS3(userId as number);
    const avatarKey: string | undefined = settings.avatarKey;

    if (!avatarKey) {
      return NextResponse.json({ avatarUrl: null });
    }

    const storage = getStorageProvider();
    const exists = await storage.hasObject(avatarKey);
    if (!exists) {
      return NextResponse.json({ avatarUrl: null });
    }

    const avatarUrl = await storage.getSignUrl(avatarKey, 3600);
    return NextResponse.json({ avatarUrl });
  } catch (error) {
    logger.error("error fetching avatar", { error });
    return NextResponse.json(
      { error: "Failed to fetch avatar" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const userId = await resolveUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 5 MB limit" },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // validate actual file content, not client-controlled MIME type
    const detectedMime = detectMimeFromBytes(new Uint8Array(buffer));
    const ext = detectedMime ? ALLOWED_MIME[detectedMime] : null;
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPG, PNG, GIF, WebP, or AVIF." },
        { status: 415 },
      );
    }

    const timestamp = Date.now();
    const avatarKey = `avatars/${userId}/${timestamp}.${ext}`;
    const storage = getStorageProvider();
    await storage.putObject(avatarKey, buffer, { contentType: detectedMime! });

    // persist key in settings JSON (merge with existing settings)
    const currentSettings = await getSettingsFromS3(userId as number);
    await saveSettingsToS3(userId as number, { ...currentSettings, avatarKey });

    const avatarUrl = await storage.getSignUrl(avatarKey, 3600);

    return NextResponse.json({ success: true, avatarUrl, avatarKey });
  } catch (error) {
    logger.error("error uploading avatar", { error });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
