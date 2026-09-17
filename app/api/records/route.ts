import { randomUUID } from 'node:crypto';
import { appendAudit, requestContext } from '@/lib/server/audit';
import { requireSession } from '@/lib/server/auth';
import { withTransaction } from '@/lib/server/database';
import { apiSuccess, assertAllowedQuery, handleApi, parseJsonObject } from '@/lib/server/http';
import { insertHealthRecord, listHealthRecords } from '@/lib/server/store';
import { recordSources, recordTypes, type HealthRecord } from '@/lib/server/types';
import {
  enumValue,
  isoDateTime,
  optionalEnumValue,
  optionalQueryDateTime,
  optionalQueryString,
  optionalString,
  requiredString,
  validateDateRange,
} from '@/lib/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const url = new URL(request.url);
    assertAllowedQuery(url, ['q', 'type', 'from', 'to']);

    const query = optionalQueryString(url.searchParams.get('q'), 'q', 100)?.toLocaleLowerCase() ?? null;
    const type = optionalEnumValue(url.searchParams.get('type'), 'type', recordTypes);
    const from = optionalQueryDateTime(url.searchParams.get('from'), 'from');
    const to = optionalQueryDateTime(url.searchParams.get('to'), 'to');
    validateDateRange(from, to);

    const records = withTransaction((database) => {
      const matches = listHealthRecords(database, {
        ownerId: session.user.id,
        type,
        from,
        to,
        query,
      });
      appendAudit(database, {
        subjectUserId: session.user.id,
        actorUserId: session.user.id,
        action: 'record.list',
        resourceType: 'health_record',
        outcome: 'success',
        metadata: { ...requestContext(request), resultCount: matches.length },
      });
      return matches;
    });

    return apiSuccess({ records, total: records.length });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const body = await parseJsonObject(request, [
      'type',
      'title',
      'description',
      'occurredAt',
      'source',
      'organization',
    ]);

    const type = enumValue(body.type, 'type', recordTypes);
    const title = requiredString(body.title, 'title', { max: 120 });
    const description = optionalString(body.description, 'description', 2_000) ?? '';
    const occurredAt = isoDateTime(body.occurredAt, 'occurredAt');
    const source = enumValue(body.source, 'source', recordSources);
    const organization = optionalString(body.organization, 'organization', 160);
    const now = new Date().toISOString();

    const record: HealthRecord = {
      id: `record_${randomUUID()}`,
      ownerId: session.user.id,
      type,
      title,
      description,
      occurredAt,
      source,
      organization,
      createdAt: now,
      updatedAt: now,
    };

    withTransaction((database) => {
      insertHealthRecord(database, record);
      appendAudit(database, {
        subjectUserId: session.user.id,
        actorUserId: session.user.id,
        action: 'record.create',
        resourceType: 'health_record',
        resourceId: record.id,
        outcome: 'success',
        metadata: { ...requestContext(request), recordType: record.type },
      });
    });

    return apiSuccess({ record }, 201);
  });
}
