import { randomUUID } from 'node:crypto';
import { appendAudit, requestContext } from '@/lib/server/audit';
import { requireSession } from '@/lib/server/auth';
import { withTransaction } from '@/lib/server/database';
import { ApiError, apiSuccess, assertAllowedQuery, handleApi, parseJsonObject } from '@/lib/server/http';
import { validateMeasurement } from '@/lib/server/measurement-validation';
import { insertMeasurement, listMeasurements } from '@/lib/server/store';
import {
  measurementMetrics,
  measurementSources,
  type Measurement,
} from '@/lib/server/types';
import {
  enumValue,
  finiteNumber,
  isoDateTime,
  optionalEnumValue,
  optionalQueryDateTime,
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
    assertAllowedQuery(url, ['metric', 'from', 'to']);
    const metric = optionalEnumValue(url.searchParams.get('metric'), 'metric', measurementMetrics);
    const from = optionalQueryDateTime(url.searchParams.get('from'), 'from');
    const to = optionalQueryDateTime(url.searchParams.get('to'), 'to');
    validateDateRange(from, to);

    const measurements = withTransaction((database) => {
      const matches = listMeasurements(database, {
        ownerId: session.user.id,
        metric,
        from,
        to,
      });
      appendAudit(database, {
        subjectUserId: session.user.id,
        actorUserId: session.user.id,
        action: 'measurement.list',
        resourceType: 'measurement',
        outcome: 'success',
        metadata: { ...requestContext(request), resultCount: matches.length },
      });
      return matches;
    });

    return apiSuccess({ measurements, total: measurements.length });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const body = await parseJsonObject(request, [
      'metric',
      'value',
      'unit',
      'measuredAt',
      'source',
      'notes',
    ]);

    const metric = enumValue(body.metric, 'metric', measurementMetrics);
    if (metric === 'blood_pressure_systolic' || metric === 'blood_pressure_diastolic') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', {
        metric: 'Use /api/measurements/blood-pressure so both values are saved atomically.',
      });
    }
    const value = finiteNumber(body.value, 'value', { min: -10_000, max: 10_000 });
    const unit = requiredString(body.unit, 'unit', { max: 16 });
    validateMeasurement(metric, value, unit);
    const measuredAt = isoDateTime(body.measuredAt, 'measuredAt');
    const source = enumValue(body.source, 'source', measurementSources);
    const notes = optionalString(body.notes, 'notes', 500);

    const measurement: Measurement = {
      id: `measurement_${randomUUID()}`,
      ownerId: session.user.id,
      metric,
      value,
      unit,
      measuredAt,
      source,
      notes,
      createdAt: new Date().toISOString(),
    };

    withTransaction((database) => {
      insertMeasurement(database, measurement);
      appendAudit(database, {
        subjectUserId: session.user.id,
        actorUserId: session.user.id,
        action: 'measurement.create',
        resourceType: 'measurement',
        resourceId: measurement.id,
        outcome: 'success',
        metadata: { ...requestContext(request), metric: measurement.metric },
      });
    });

    return apiSuccess({ measurement }, 201);
  });
}
