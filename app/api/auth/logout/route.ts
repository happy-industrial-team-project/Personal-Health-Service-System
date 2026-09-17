import { expiredSessionCookie, revokeSession } from '@/lib/server/auth';
import { apiSuccess, handleApi } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => {
    await revokeSession(request);
    return apiSuccess(
      { authenticated: false },
      200,
      { 'set-cookie': expiredSessionCookie() },
    );
  });
}
