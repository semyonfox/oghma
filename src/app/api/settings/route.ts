import { NextResponse } from 'next/server';
import { DEFAULT_SETTINGS } from '@/lib/notes/types/settings';
import { getSettingsFromS3, saveSettingsToS3 } from '@/lib/notes/storage/s3-storage';
import { validateSession } from '@/lib/auth';

export async function GET() {
  try {
    // Verify user is authenticated
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user's settings from S3
    const userSettings = await getSettingsFromS3(user.user_id);
    
    // Merge with defaults
    const mergedSettings = { ...DEFAULT_SETTINGS, ...userSettings };
    
    return NextResponse.json(mergedSettings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Fetch current settings and merge
    const currentSettings = await getSettingsFromS3(user.user_id);
    const updatedSettings = { ...currentSettings, ...body };
    
    // Save to S3
    await saveSettingsToS3(user.user_id, updatedSettings);
    
    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
