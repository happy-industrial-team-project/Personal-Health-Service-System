import { randomUUID } from 'node:crypto';
import { appendAudit, requestContext } from '@/lib/server/audit';
import { requireSession } from '@/lib/server/auth';
import { withTransaction } from '@/lib/server/database';
import { ApiError, apiSuccess, handleApi, parseJsonObject } from '@/lib/server/http';
import { validateMeasurement } from '@/lib/server/measurement-validation';
import { insertMeasurement } from '@/lib/server/store';
import { measurementSources, type Measurement } from '@/lib/server/types';
import {
  enumValue,
  finiteNumber,
  isoDateTime,
  optionalString,
} from '@/lib/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const body = await parseJsonObject(request, [
      'systolic',
      'diastolic',
      'measuredAt',
      'source',
      'notes',
    ]);

    const systolicValue = finiteNumber(body.systolic, 'systolic', { min: 40, max: 300 });
    const diastolicValue = finiteNumber(body.diastolic, 'diastolic', { min: 20, max: 200 });
    validateMeasurement('blood_pressure_systolic', systolicValue, 'mmHg');
    validateMeasurement('blood_pressure_diastolic', diastolicValue, 'mmHg');
    if (systolicValue <= diastolicValue) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', {
        systolic: 'Must be greater than the diastolic value.',
      });
    }

    const measuredAt = isoDateTime(body.measuredAt, 'measuredAt');
    const source = enumValue(body.source, 'source', measurementSources);
    const notes = optionalString(body.notes, 'notes', 500);
    const createdAt = new Date().toISOString();
    const pairId = `measurement_pair_${randomUUID()}`;
    const measurements: Measurement[] = [
      {
        id: `measurement_${randomUUID()}`,
        ownerId: session.user.id,
        metric: 'blood_pressure_systolic',
        value: systolicValue,
        unit: 'mmHg',
        measuredAt,
        source,
        notes,
        createdAt,
      },
      {
        id: `measurement_${randomUUID()}`,
        ownerId: session.user.id,
        metric: 'blood_pressure_diastolic',
        value: diastolicValue,
        unit: 'mmHg',
        measuredAt,
        source,
        notes,
        createdAt,
      },
    ];

    withTransaction((database) => {
      for (const measurement of measurements) {
        insertMeasurement(database, measurement);
        appendAudit(database, {
          subjectUserId: session.user.id,
          actorUserId: session.user.id,
          action: 'measurement.create',
          resourceType: 'measurement',
          resourceId: measurement.id,
          outcome: 'success',
          metadata: {
            ...requestContext(request),
            metric: measurement.metric,
            pairId,
          },
        });
      }
    });

    return apiSuccess({ measurements, pairId }, 201);
  });
}
