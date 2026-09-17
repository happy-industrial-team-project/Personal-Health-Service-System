import { randomUUID } from 'node:crypto';
import { appendAudit, requestContext } from '@/lib/server/audit';
import { requireSession } from '@/lib/server/auth';
import { withTransaction } from '@/lib/server/database';
import { ApiError, apiSuccess, assertAllowedQuery, handleApi, parseJsonObject } from '@/lib/server/http';
import {
  expirePermissions,
  insertPermission,
  listPermissions,
  revokePermissionById,
} from '@/lib/server/store';
import {
  granteeTypes,
  permissionScopes,
  permissionStatuses,
  type Permission,
} from '@/lib/server/types';
import {
  enumArray,
  enumValue,
  isoDateTime,
  optionalEnumValue,
  optionalString,
  requiredString,
} from '@/lib/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const url = new URL(request.url);
    assertAllowedQuery(url, ['status']);
    const status = optionalEnumValue(url.searchParams.get('status'), 'status', permissionStatuses);

    const permissions = withTransaction((database) => {
      const expiredIds = expirePermissions(database, session.user.id, new Date().toISOString());
      for (const permissionId of expiredIds) {
        appendAudit(database, {
          subjectUserId: session.user.id,
          actorUserId: null,
          action: 'permission.expire',
          resourceType: 'permission',
          resourceId: permissionId,
          outcome: 'success',
          metadata: { trigger: 'expiry_check' },
        });
      }
      const matches = listPermissions(database, session.user.id, status);
      appendAudit(database, {
        subjectUserId: session.user.id,
        actorUserId: session.user.id,
        action: 'permission.list',
        resourceType: 'permission',
        outcome: 'success',
        metadata: { ...requestContext(request), resultCount: matches.length },
      });
      return matches;
    });

    return apiSuccess({ permissions, total: permissions.length });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const body = await parseJsonObject(request, [
      'granteeName',
      'granteeType',
      'organization',
      'scopes',
      'expiresAt',
    ]);
    const granteeName = requiredString(body.granteeName, 'granteeName', { max: 100 });
    const granteeType = enumValue(body.granteeType, 'granteeType', granteeTypes);
    const organization = optionalString(body.organization, 'organization', 160);
    const scopes = enumArray(body.scopes, 'scopes', permissionScopes, { min: 1, max: permissionScopes.length });
    const expiresAt = isoDateTime(body.expiresAt, 'expiresAt');
    const expiresTimestamp = Date.parse(expiresAt);
    const now = Date.now();
    if (expiresTimestamp <= now) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', {
        expiresAt: 'Must be in the future.',
      });
    }
    if (expiresTimestamp > now + 366 * 24 * 60 * 60 * 1_000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', {
        expiresAt: 'Must be no more than one year in the future.',
      });
    }

    const permission: Permission = {
      id: `permission_${randomUUID()}`,
      ownerId: session.user.id,
      granteeName,
      granteeType,
      organization,
      scopes,
      status: 'active',
      expiresAt,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };

    withTransaction((database) => {
      insertPermission(database, permission);
      appendAudit(database, {
        subjectUserId: session.user.id,
        actorUserId: session.user.id,
        action: 'permission.create',
        resourceType: 'permission',
        resourceId: permission.id,
        outcome: 'success',
        metadata: { ...requestContext(request), granteeType, scopes: scopes.join(',') },
      });
    });

    return apiSuccess({ permission }, 201);
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const body = await parseJsonObject(request, ['id', 'action']);
    const id = requiredString(body.id, 'id', { max: 100 });
    enumValue(body.action, 'action', ['revoke'] as const);

    const permission = withTransaction((database) => {
      const expiredIds = expirePermissions(database, session.user.id, new Date().toISOString());
      for (const permissionId of expiredIds) {
        appendAudit(database, {
          subjectUserId: session.user.id,
          actorUserId: null,
          action: 'permission.expire',
          resourceType: 'permission',
          resourceId: permissionId,
          outcome: 'success',
          metadata: { trigger: 'expiry_check' },
        });
      }
      const result = revokePermissionById(
        database,
        id,
        session.user.id,
        new Date().toISOString(),
      );
      if (!result) {
        throw new ApiError(404, 'PERMISSION_NOT_FOUND', 'The permission does not exist.');
      }

      if (result.changed) {
        appendAudit(database, {
          subjectUserId: session.user.id,
          actorUserId: session.user.id,
          action: 'permission.revoke',
          resourceType: 'permission',
          resourceId: result.permission.id,
          outcome: 'success',
          metadata: requestContext(request),
        });
      }
      return result.permission;
    });

    return apiSuccess({ permission });
  });
}
