import { NextResponse } from 'next/server';
import { requireAuth, withErrorHandler } from '@/lib/api-error';
import { getQuizDashboardSummary } from '@/lib/quiz/dashboard';
import { resolveTimeZone } from '@/lib/quiz/time-zone';

export const GET = withErrorHandler(async (request) => {
    const user = await requireAuth();
    const timeZone = resolveTimeZone(new URL(request.url).searchParams.get('tz'));

    return NextResponse.json(await getQuizDashboardSummary(user.user_id, timeZone));
});
