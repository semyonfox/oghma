import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getStorageProvider } from "@/lib/storage/init";
import { getSettingsFromS3 } from "@/lib/notes/storage/s3-storage";
import { auth } from "@/auth";
import { validateSession } from "@/lib/auth";

async function resolveUserId(): Promise<string | number | null> {
  const authJsSession = await auth();
  if (authJsSession?.user?.id) return authJsSession.user.id;
  const jwtUser = await validateSession();
  if (jwtUser?.user_id) return jwtUser.user_id;
  return null;
}

export async function GET() {
  const userId = await resolveUserId();
  if (!userId) return new NextResponse(null, { status: 401 });

  const settings = await getSettingsFromS3(userId as number);
  const avatarKey: string | undefined = settings.avatarKey;
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
