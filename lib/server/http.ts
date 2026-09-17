type ErrorFields = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ErrorFields;

  constructor(status: number, code: string, message: string, fields?: ErrorFields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function jsonHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return headers;
}

export function apiSuccess<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: jsonHeaders(headers),
  });
}

export function apiFailure(
  status: number,
  code: string,
  message: string,
  fields?: ErrorFields,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify({
    ok: false,
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
  }), {
    status,
    headers: jsonHeaders(headers),
  });
}

export async function handleApi(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) {
      return apiFailure(error.status, error.code, error.message, error.fields);
    }

    console.error('Unhandled API error', error);
    return apiFailure(500, 'INTERNAL_ERROR', 'The server could not complete the request.');
  }
}

export async function parseJsonObject(
  request: Request,
  allowedKeys: readonly string[],
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The JSON body must be 64 KB or smaller.');
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
  }

  if (!isPlainObject(value)) {
    throw new ApiError(400, 'INVALID_BODY', 'The JSON body must be an object.');
  }

  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new ApiError(400, 'UNKNOWN_FIELDS', 'The request contains unsupported fields.', {
      body: `Unsupported field(s): ${unknownKeys.join(', ')}`,
    });
  }

  return value;
}

export function assertAllowedQuery(url: URL, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  const unknownKeys = [...url.searchParams.keys()].filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new ApiError(400, 'UNKNOWN_QUERY_PARAMETERS', 'The request contains unsupported query parameters.', {
      query: `Unsupported parameter(s): ${[...new Set(unknownKeys)].join(', ')}`,
    });
  }

  for (const key of allowedKeys) {
    if (url.searchParams.getAll(key).length > 1) {
      throw new ApiError(400, 'DUPLICATE_QUERY_PARAMETER', 'A query parameter was provided more than once.', {
        [key]: 'Provide this parameter only once.',
      });
    }
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
