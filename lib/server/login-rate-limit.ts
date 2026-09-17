const WINDOW_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;
const RATE_LIMIT_AUDIT_INTERVAL_MS = 5 * 60 * 1_000;

type Attempt = { failures: number; resetAt: number; lastRateLimitAuditAt: number | null };
const attempts = new Map<string, Attempt>();

export function loginRateLimitKey(request: Request, email: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return `${forwarded || realIp || 'local'}:${email}`;
}

export function rateLimitStatus(key: string):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; shouldAudit: boolean } {
  const now = Date.now();
  const attempt = attempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    attempts.delete(key);
    return { allowed: true };
  }
  if (attempt.failures < MAX_FAILURES) return { allowed: true };
  const shouldAudit = attempt.lastRateLimitAuditAt === null
    || now - attempt.lastRateLimitAuditAt >= RATE_LIMIT_AUDIT_INTERVAL_MS;
  if (shouldAudit) attempt.lastRateLimitAuditAt = now;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((attempt.resetAt - now) / 1_000)),
    shouldAudit,
  };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { failures: 1, resetAt: now + WINDOW_MS, lastRateLimitAuditAt: null });
    return;
  }
  current.failures += 1;
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
