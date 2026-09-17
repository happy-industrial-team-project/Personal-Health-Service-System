import { expiredSessionCookie, optionalSession } from '@/lib/server/auth';
import { apiSuccess, handleApi } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await optionalSession(request);
    if (!session) {
      return apiSuccess(
        { authenticated: false, user: null, expiresAt: null },
        200,
        { 'set-cookie': expiredSessionCookie() },
      );
    }

    return apiSuccess({
      authenticated: true,
      user: session.user,
      expiresAt: session.expiresAt,
    });
  });
}
