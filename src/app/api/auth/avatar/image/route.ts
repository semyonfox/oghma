import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getStorageProvider } from "@/lib/storage/init";
import { getSettingsFromS3 } from "@/lib/notes/storage/s3-storage";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return new NextResponse(null, { status: 401 });

  const settings = await getSettingsFromS3(userId);
  const { avatarKey } = settings;
  if (!avatarKey) return new NextResponse(null, { status: 404 });

  const storage = getStorageProvider();
  if (!(await storage.hasObject(avatarKey))) return new NextResponse(null, { status: 404 });

  const { body, contentType } = await storage.getObjectStream(avatarKey);
  return new NextResponse(Readable.toWeb(body) as ReadableStream, {
    headers: {
      "Content-Type": contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
