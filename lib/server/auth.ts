import { createHmac, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { ApiError } from './http';
import { appendAudit, requestContext } from './audit';
import { withDatabase, withTransaction } from './database';
import {
  deleteInactiveSessions,
  findActiveSession,
  findUserByEmail,
  firstUser,
  insertSession,
  revokeSessionById,
} from './store';
import type { PublicUser, User } from './types';
import { toPublicUser } from './types';

export const SESSION_COOKIE = 'phss_session';
const DEVELOPMENT_SECRET = 'phss-local-development-secret-change-before-deployment';

type SessionTokenPayload = {
  v: 1;
  sid: string;
  uid: string;
  exp: number;
};

export type AuthenticatedSession = {
  sessionId: string;
  expiresAt: string;
  user: PublicUser;
};

function sessionSecret(): string {
  const configured = process.env.PHSS_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PHSS_SESSION_SECRET must contain at least 32 characters in production.');
  }
  return DEVELOPMENT_SECRET;
}

function sessionTtlSeconds(): number {
  const raw = process.env.PHSS_SESSION_TTL_SECONDS?.trim();
  if (!raw) return 8 * 60 * 60;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 15 * 60 || parsed > 7 * 24 * 60 * 60) {
    throw new Error('PHSS_SESSION_TTL_SECONDS must be an integer between 900 and 604800.');
  }
  return parsed;
}

function deriveScrypt(password: string, salt: string, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function passwordMatches(password: string, user: User): Promise<boolean> {
  if (user.password.algorithm !== 'scrypt') return false;
  const expected = Buffer.from(user.password.hash, 'base64');
  if (expected.length !== user.password.keyLength) return false;
  const actual = await deriveScrypt(password, user.password.salt, user.password.keyLength);
  return timingSafeEqual(actual, expected);
}

export async function authenticateCredentials(
  email: string,
  password: string,
): Promise<{ user: User | null; valid: boolean }> {
  const { matchingUser, comparisonUser } = withDatabase((database) => {
    const matching = findUserByEmail(database, email);
    return {
      matchingUser: matching,
      comparisonUser: matching ?? firstUser(database),
    };
  });
  // Use the demo hash for unknown users so both paths still perform the expensive scrypt operation.
  if (!comparisonUser) throw new Error('The database does not contain a credential comparison user.');
  const valid = await passwordMatches(password, comparisonUser);
  return { user: matchingUser, valid: Boolean(matchingUser && valid) };
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function createToken(payload: SessionTokenPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signPayload(encoded, secret)}`;
}

function verifyToken(token: string): SessionTokenPayload | null {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra !== undefined) return null;

  const expected = Buffer.from(signPayload(encoded, sessionSecret()), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionTokenPayload>;
    if (value.v !== 1 || typeof value.sid !== 'string' || typeof value.uid !== 'string' || typeof value.exp !== 'number') {
      return null;
    }
    if (!Number.isSafeInteger(value.exp) || value.exp <= Math.floor(Date.now() / 1_000)) return null;
    return value as SessionTokenPayload;
  } catch {
    return null;
  }
}

function cookieValue(request: Request): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export async function createAuthenticatedSession(user: User, request: Request): Promise<{
  token: string;
  expiresAt: string;
  maxAge: number;
}> {
  const sessionId = `session_${randomUUID()}`;
  const maxAge = sessionTtlSeconds();
  const expiresAt = new Date(Date.now() + maxAge * 1_000).toISOString();
  // Validate the signing configuration before committing a database session.
  const secret = sessionSecret();

  withTransaction((database) => {
    const now = new Date().toISOString();
    deleteInactiveSessions(database, now);
    insertSession(database, {
      id: sessionId,
      userId: user.id,
      createdAt: now,
      expiresAt,
      revokedAt: null,
    });
    appendAudit(database, {
      subjectUserId: user.id,
      actorUserId: user.id,
      action: 'auth.login',
      resourceType: 'session',
      resourceId: sessionId,
      outcome: 'success',
      metadata: requestContext(request),
    });
  });

  const payload: SessionTokenPayload = {
    v: 1,
    sid: sessionId,
    uid: user.id,
    exp: Math.floor(Date.parse(expiresAt) / 1_000),
  };
  return { token: createToken(payload, secret), expiresAt, maxAge };
}

export function sessionCookie(token: string, maxAge: number): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}

export function expiredSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}

export async function optionalSession(request: Request): Promise<AuthenticatedSession | null> {
  const raw = cookieValue(request);
  if (!raw) return null;
  const payload = verifyToken(raw);
  if (!payload) return null;

  const result = withDatabase((database) =>
    findActiveSession(database, payload.sid, payload.uid, new Date().toISOString()),
  );
  if (!result) return null;
  return {
    sessionId: result.session.id,
    expiresAt: result.session.expiresAt,
    user: toPublicUser(result.user),
  };
}

export async function requireSession(request: Request): Promise<AuthenticatedSession> {
  const session = await optionalSession(request);
  if (!session) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'A valid signed-in session is required.');
  }
  return session;
}

export async function revokeSession(request: Request): Promise<boolean> {
  const current = await optionalSession(request);
  if (!current) return false;

  return withTransaction((database) => {
    const revokedAt = new Date().toISOString();
    if (!revokeSessionById(database, current.sessionId, revokedAt)) return false;
    appendAudit(database, {
      subjectUserId: current.user.id,
      actorUserId: current.user.id,
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: current.sessionId,
      outcome: 'success',
      metadata: requestContext(request),
    });
    return true;
  });
}
