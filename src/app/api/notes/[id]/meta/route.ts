import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';

/**
 * @deprecated Use PUT /api/notes/:id instead
 * This endpoint is no longer supported. Note metadata updates
 * are now handled by the main PUT endpoint which uses PostgreSQL
 * as the authoritative source.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await validateSession();
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      error: 'Endpoint deprecated',
      message: 'Use PUT /api/notes/:id instead for updating note metadata',
      example: { method: 'PUT', url: '/api/notes/:id', body: { title: 'New Title', content: 'New content' } }
    },
    { status: 410 }
  );
}
