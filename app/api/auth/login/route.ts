import { createAuthenticatedSession, sessionCookie } from '@/lib/server/auth';
import { authenticateCredentials } from '@/lib/server/auth';
import { requestContext, writeAudit } from '@/lib/server/audit';
import { apiFailure, apiSuccess, handleApi, parseJsonObject } from '@/lib/server/http';
import {
  clearLoginFailures,
  loginRateLimitKey,
  rateLimitStatus,
  recordLoginFailure,
} from '@/lib/server/login-rate-limit';
import { toPublicUser } from '@/lib/server/types';
import { emailAddress, requiredString } from '@/lib/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => {
    const body = await parseJsonObject(request, ['email', 'password']);
    const email = emailAddress(body.email);
    const password = requiredString(body.password, 'password', { min: 1, max: 128, trim: false });
    const rateKey = loginRateLimitKey(request, email);
    const rateLimit = rateLimitStatus(rateKey);

    if (!rateLimit.allowed) {
      if (rateLimit.shouldAudit) {
        await writeAudit({
          subjectUserId: null,
          actorUserId: null,
          action: 'auth.login',
          resourceType: 'session',
          outcome: 'failure',
          metadata: { ...requestContext(request), reason: 'rate_limited' },
        });
      }
      return apiFailure(
        429,
        'TOO_MANY_LOGIN_ATTEMPTS',
        'Too many failed sign-in attempts. Try again later.',
        undefined,
        { 'retry-after': String(rateLimit.retryAfterSeconds) },
      );
    }

    const result = await authenticateCredentials(email, password);
    if (!result.valid || !result.user) {
      recordLoginFailure(rateKey);
      await writeAudit({
        subjectUserId: result.user?.id ?? null,
        actorUserId: null,
        action: 'auth.login',
        resourceType: 'session',
        outcome: 'failure',
        metadata: { ...requestContext(request), reason: 'invalid_credentials' },
      });
      return apiFailure(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }

    clearLoginFailures(rateKey);
    const session = await createAuthenticatedSession(result.user, request);
    return apiSuccess(
      {
        user: toPublicUser(result.user),
        expiresAt: session.expiresAt,
      },
      200,
      { 'set-cookie': sessionCookie(session.token, session.maxAge) },
    );
  });
}
