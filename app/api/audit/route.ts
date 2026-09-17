import { appendAudit, listAuditEvents, requestContext } from '@/lib/server/audit';
import { requireSession } from '@/lib/server/auth';
import { withTransaction } from '@/lib/server/database';
import { apiSuccess, assertAllowedQuery, handleApi } from '@/lib/server/http';
import {
  enumValue,
  optionalQueryDateTime,
  optionalQueryString,
  queryInteger,
  validateDateRange,
} from '@/lib/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const url = new URL(request.url);
    assertAllowedQuery(url, ['action', 'resourceType', 'outcome', 'from', 'to', 'limit']);
    const action = optionalQueryString(url.searchParams.get('action'), 'action', 100);
    const resourceType = optionalQueryString(url.searchParams.get('resourceType'), 'resourceType', 64);
    const rawOutcome = url.searchParams.get('outcome');
    const outcome = rawOutcome ? enumValue(rawOutcome, 'outcome', ['success', 'failure'] as const) : null;
    const from = optionalQueryDateTime(url.searchParams.get('from'), 'from');
    const to = optionalQueryDateTime(url.searchParams.get('to'), 'to');
    const limit = queryInteger(url.searchParams.get('limit'), 'limit', { defaultValue: 100, min: 1, max: 500 });
    validateDateRange(from, to);

    const events = withTransaction((database) => {
      appendAudit(database, {
        subjectUserId: session.user.id,
        actorUserId: session.user.id,
        action: 'audit.list',
        resourceType: 'audit_event',
        outcome: 'success',
        metadata: requestContext(request),
      });

      return listAuditEvents(database, {
        subjectUserId: session.user.id,
        action,
        resourceType,
        outcome,
        from,
        to,
        limit,
      });
    });

    return apiSuccess({ events, count: events.length, limit });
  });
}
