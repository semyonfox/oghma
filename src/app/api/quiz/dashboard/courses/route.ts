import { NextResponse } from 'next/server';
import { requireAuth, withErrorHandler } from '@/lib/api-error';
import { getQuizDashboardCourses } from '@/lib/quiz/dashboard';

export const GET = withErrorHandler(async (request) => {
    const user = await requireAuth();
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === '1';

    const courses = await getQuizDashboardCourses(user.user_id, { includeArchived });
    return NextResponse.json({ courses });
});
