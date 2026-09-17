import { ApiError } from './http';

export function requiredString(
  value: unknown,
  field: string,
  options: { min?: number; max: number; trim?: boolean },
): string {
  if (typeof value !== 'string') {
    invalid(field, 'Must be a string.');
  }

  const result = options.trim === false ? value : value.trim();
  const minimum = options.min ?? 1;
  if (result.length < minimum || result.length > options.max) {
    invalid(field, `Must contain between ${minimum} and ${options.max} characters.`);
  }

  return result;
}

export function optionalString(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredString(value, field, { max });
}

export function emailAddress(value: unknown, field = 'email'): string {
  const email = requiredString(value, field, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalid(field, 'Must be a valid email address.');
  }
  return email;
}

export function finiteNumber(
  value: unknown,
  field: string,
  options: { min: number; max: number },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(field, 'Must be a finite number.');
  }
  if (value < options.min || value > options.max) {
    invalid(field, `Must be between ${options.min} and ${options.max}.`);
  }
  return value;
}

export function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    invalid(field, `Must be one of: ${allowed.join(', ')}.`);
  }
  return value as T[number];
}

export function optionalEnumValue<const T extends readonly string[]>(
  value: string | null,
  field: string,
  allowed: T,
): T[number] | null {
  if (value === null || value === '') return null;
  return enumValue(value, field, allowed);
}

export function enumArray<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
  options: { min: number; max: number },
): T[number][] {
  if (!Array.isArray(value)) {
    invalid(field, 'Must be an array.');
  }
  if (value.length < options.min || value.length > options.max) {
    invalid(field, `Must contain between ${options.min} and ${options.max} items.`);
  }
  const result = value.map((item) => enumValue(item, field, allowed));
  if (new Set(result).size !== result.length) {
    invalid(field, 'Must not contain duplicate items.');
  }
  return result;
}

export function isoDateTime(value: unknown, field: string): string {
  const raw = requiredString(value, field, { max: 40 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    invalid(field, 'Must be an ISO 8601 date-time with a timezone.');
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    invalid(field, 'Must be a valid date-time.');
  }
  return new Date(timestamp).toISOString();
}

export function optionalQueryString(value: string | null, field: string, max: number): string | null {
  if (value === null || value === '') return null;
  return requiredString(value, field, { max });
}

export function optionalQueryDateTime(value: string | null, field: string): string | null {
  if (value === null || value === '') return null;
  return isoDateTime(value, field);
}

export function queryInteger(
  value: string | null,
  field: string,
  options: { defaultValue: number; min: number; max: number },
): number {
  if (value === null || value === '') return options.defaultValue;
  if (!/^\d+$/.test(value)) invalid(field, 'Must be a whole number.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    invalid(field, `Must be between ${options.min} and ${options.max}.`);
  }
  return parsed;
}

export function validateDateRange(from: string | null, to: string | null): void {
  if (from && to && Date.parse(from) > Date.parse(to)) {
    throw new ApiError(400, 'INVALID_DATE_RANGE', 'The start date must not be after the end date.', {
      from: 'Must be before or equal to the end date.',
    });
  }
}

export function invalid(field: string, message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', { [field]: message });
}
