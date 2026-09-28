import type { TrendKey } from './types';

// Shared display references for this educational demo, not diagnostic thresholds.
export const chartScales = {
  systolic: { minimum: 90, maximum: 140, step: 10, referenceMinimum: 90, referenceMaximum: 129 },
  diastolic: { minimum: 60, maximum: 100, step: 10, referenceMinimum: 60, referenceMaximum: 84 },
  glucose: { minimum: 3.5, maximum: 7, step: 0.5, referenceMinimum: 3.9, referenceMaximum: 6.1 },
  heart: { minimum: 50, maximum: 110, step: 10, referenceMinimum: 60, referenceMaximum: 100 },
};

export function isOutsideReference(trend: TrendKey, value: number): boolean {
  const range = chartScales[trend];
  return value < range.referenceMinimum || value > range.referenceMaximum;
}

export function normalizeGlucose<T extends { metric: string; unit: string; value: number }>(measurement: T): T {
  return measurement.metric === 'blood_glucose' && measurement.unit === 'mg/dL'
    ? { ...measurement, value: Math.round(measurement.value / 18 * 100) / 100, unit: 'mmol/L' }
    : measurement;
}
