import type { MeasurementMetric } from './types';
import { invalid } from './validation';

const unitsByMetric: Record<MeasurementMetric, readonly string[]> = {
  blood_pressure_systolic: ['mmHg'],
  blood_pressure_diastolic: ['mmHg'],
  blood_glucose: ['mmol/L', 'mg/dL'],
  heart_rate: ['bpm'],
  weight: ['kg', 'lb'],
  body_temperature: ['C', 'F'],
  oxygen_saturation: ['%'],
};

export function validateMeasurement(metric: MeasurementMetric, value: number, unit: string): void {
  if (!unitsByMetric[metric].includes(unit)) {
    invalid('unit', `For ${metric}, use one of: ${unitsByMetric[metric].join(', ')}.`);
  }

  const ranges: Record<MeasurementMetric, [number, number]> = {
    blood_pressure_systolic: [40, 300],
    blood_pressure_diastolic: [20, 200],
    blood_glucose: unit === 'mg/dL' ? [10, 900] : [0.5, 50],
    heart_rate: [20, 300],
    weight: unit === 'lb' ? [2, 1_100] : [1, 500],
    body_temperature: unit === 'F' ? [86, 113] : [30, 45],
    oxygen_saturation: [50, 100],
  };
  const [minimum, maximum] = ranges[metric];
  if (value < minimum || value > maximum) {
    invalid('value', `For ${metric} in ${unit}, must be between ${minimum} and ${maximum}.`);
  }
}
