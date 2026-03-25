import { getServerSession } from 'next-auth';
import { authConfig } from '@/auth.config';
import { validateSession } from '@/lib/auth.js';
import { getLinkedProviders } from '@/lib/auth-oauth';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

async function fetchProfile(userId) {
    const [profileRows, providers] = await Promise.all([
        sql`SELECT display_name, avatar_url, locale FROM app.login WHERE user_id = ${userId}::uuid`,
        getLinkedProviders(userId),
    ]);
    const profile = profileRows[0] || {};
    return {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        locale: profile.locale,
        linkedProviders: providers,
    };
}

export async function GET(request) {
    try {
        // try Auth.js session first (OAuth users)
        const authJsSession = await getServerSession(authConfig);
        if (authJsSession?.user?.id) {
            const userId = authJsSession.user.id;
            const profile = await fetchProfile(userId);
            return Response.json({
                success: true,
                user: {
                    user_id: userId,
                    email: authJsSession.user.email,
                    name: authJsSession.user.name,
                    ...profile,
                },
            });
        }

        // fall back to custom JWT (email/password users)
        const jwtUser = await validateSession();
        if (jwtUser) {
            const profile = await fetchProfile(jwtUser.user_id);
            return Response.json({
                success: true,
                user: {
                    user_id: jwtUser.user_id,
                    email: jwtUser.email,
                    ...profile,
                },
            });
        }

        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    } catch (error) {
        logger.error('auth me error', { error });
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }
}
