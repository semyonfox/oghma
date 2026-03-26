/*
 * login Route Handler
 * Validates credentials, authenticates user, and creates session
 * 1. Validate request fields
 * 2. Query database for user
 * 3. Verify password
 * 4. Generate JWT token and create session
 * 5. Return success response
 */

import bcrypt from "bcryptjs";
import sql from "@/database/pgsql.js";
import { CanvasClient } from "@/lib/canvas/client.js";
import {validateAuthCredentials} from "@/lib/validation.js";
import {generateUUID} from "@/lib/utils/uuid";
import {createAuthSession, createErrorResponse, createValidationErrorResponse, parseJsonBody} from "@/lib/auth.js";
import {isRateLimited, recordFailedAttempt, clearFailedAttempts, isAccountLocked, getLockoutMinutesRemaining} from "@/lib/rateLimit.js";
import { decrypt } from '@/lib/crypto';
import logger from '@/lib/logger';

export async function POST(request) {
    try {
        // 1. Parse and validate request body
        const {data: body, error: parseError} = await parseJsonBody(request);
        if (parseError) return parseError;

        const {email, password, rememberMe} = body;

        // 2. Validate credentials format
        const validation = validateAuthCredentials(email, password, false);
        if (!validation.isValid) {
            return createValidationErrorResponse(validation.errors);
        }

        // 3. Check if account is locked due to too many failed attempts
        if (await isAccountLocked(email)) {
            const minutesRemaining = await getLockoutMinutesRemaining(email);
            return createErrorResponse(
                `Account temporarily locked. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
                429
            );
        }

        // 4. Check rate limit (prevents brute force even with multiple accounts)
        if (await isRateLimited(email)) {
            return createErrorResponse(
                'Too many login attempts. Please try again later.',
                429
            );
        }

        // 5. Query database for user
        const data = await sql`
            SELECT user_id, email, hashed_password, is_active, deleted_at
            FROM app.login
            WHERE email = ${email.trim()};
        `;

        const user = data[0];

        if (!user) {
            // Record failed attempt for security tracking
            await recordFailedAttempt(email);
            return createErrorResponse('Invalid email or password', 401);
        }

        // reject soft-deleted accounts
        if (user.is_active === false || user.deleted_at) {
            return createErrorResponse('This account has been deactivated. Contact support if this was a mistake.', 403);
        }

        // Security check: ensure no duplicate emails exist (UNIQUE constraint should prevent this)
        if (data.length > 1) {
            logger.error('multiple accounts with same email detected', {
                email: email.trim(),
                count: data.length,
                user_ids: data.map(u => u.user_id)
            });
            return createErrorResponse('Account configuration error. Please contact support.', 500);
        }

        // 6. Verify password
        const matchingPassword = await bcrypt.compare(password, user.hashed_password);

        if (!matchingPassword) {
            // Record failed attempt for security tracking
            await recordFailedAttempt(email);
            return createErrorResponse('Invalid email or password', 401);
        }

        // 7. Successful login - clear failed attempt counters
        await clearFailedAttempts(email);

        // 8. Create auth session (generates JWT, sets cookie, returns response)
        const sessionResponse = await createAuthSession(user, rememberMe ? 30 : 1);

        // 9. Fire-and-forget Canvas resync if the user has credentials + prior imports.
        //    We don't await this — login speed is unaffected.
        queueCanvasSync(user.user_id).catch(err =>
          logger.warn('canvas auto-sync queue failed', { error: err.message })
        );

        return sessionResponse;

    } catch (error) {
        logger.error('login error', {
            message: error.message,
            code: error.code,
            detail: error.detail,
        });
        return createErrorResponse('Internal server error', 500);
    }
}

// ── Canvas auto-sync helper ───────────────────────────────────────────────────

/**
 * Queues a background Canvas resync job for the user if:
 *   - They have canvas credentials stored
 *   - They have at least one prior import
 *
 * Called fire-and-forget after login — never throws to the caller.
 */
async function queueCanvasSync(userId) {
  const credRows = await sql`
    SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}
  `;
  const { canvas_token, canvas_domain } = credRows[0] ?? {};
  if (!canvas_token || !canvas_domain) return;

  // decrypt the BYOK-encrypted token before using it
  const plainToken = decrypt(canvas_token, userId);

  const prevCourseRows = await sql`
    SELECT DISTINCT canvas_course_id FROM app.canvas_imports WHERE user_id = ${userId}
  `;
  if (prevCourseRows.length === 0) return;

  const prevCourseIds = new Set(prevCourseRows.map(r => String(r.canvas_course_id)));

  const client = new CanvasClient(canvas_domain, plainToken);
  const { data: allCourses } = await client.getCourses();

  const courses = (allCourses ?? [])
    .filter(c => prevCourseIds.has(String(c.id)))
    .map(c => ({ id: c.id, name: c.name ?? String(c.id), course_code: c.course_code ?? '' }));

  // include courses no longer visible in Canvas (bare ID fallback)
  for (const id of prevCourseIds) {
    if (!courses.some(c => String(c.id) === id)) {
      courses.push({ id: Number(id), name: String(id), course_code: '' });
    }
  }

  if (courses.length === 0) return;

  const jobId = generateUUID();
  await sql`
    INSERT INTO app.canvas_import_jobs (id, user_id, course_ids, status, job_type)
    VALUES (${jobId}::uuid, ${userId}::uuid, ${JSON.stringify(courses)}, 'queued', 'sync')
  `;
  logger.info('canvas auto-sync job queued on login', { jobId, courseCount: courses.length });
}
