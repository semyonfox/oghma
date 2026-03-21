// avatar API route - handles profile picture upload and retrieval
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/auth.config';
import { validateSession } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage/init';
import { getSettingsFromS3, saveSettingsToS3 } from '@/lib/notes/storage/s3-storage';
import logger from '@/lib/logger';

/** resolve user_id from either Auth.js (OAuth) or custom JWT session */
async function resolveUserId(): Promise<string | number | null> {
  const authJsSession = await getServerSession(authConfig) as any;
  if (authJsSession?.user?.id) return authJsSession.user.id;

  const jwtUser = await validateSession();
  if (jwtUser?.user_id) return jwtUser.user_id;

  return null;
}

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET() {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    logger.error('error fetching avatar', { error });
    return NextResponse.json({ error: 'Failed to fetch avatar' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 413 });
    }

    const ext = ALLOWED_MIME[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use JPG, PNG, GIF, WebP, or AVIF.' },
        { status: 415 }
      );
    }

    const timestamp = Date.now();
    const avatarKey = `avatars/${userId}/${timestamp}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageProvider();
    await storage.putObject(avatarKey, buffer, { contentType: file.type });

    // persist key in settings JSON (merge with existing settings)
    const currentSettings = await getSettingsFromS3(userId as number);
    await saveSettingsToS3(userId as number, { ...currentSettings, avatarKey });

    const avatarUrl = await storage.getSignUrl(avatarKey, 3600);

    return NextResponse.json({ success: true, avatarUrl, avatarKey });
  } catch (error) {
    logger.error('error uploading avatar', { error });
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
