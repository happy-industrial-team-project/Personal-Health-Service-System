'use client';

import { useState } from 'react';
import type { Measurement } from '@/lib/client/api';
import type { TrendKey } from './types';
import { formatDate } from './utils';

type ChartScale = {
  minimum: number;
  maximum: number;
  step: number;
  referenceMinimum: number;
  referenceMaximum: number;
};

const chartScales: Record<TrendKey, ChartScale> = {
  systolic: { minimum: 90, maximum: 140, step: 10, referenceMinimum: 90, referenceMaximum: 129 },
  diastolic: { minimum: 60, maximum: 100, step: 10, referenceMinimum: 60, referenceMaximum: 84 },
  glucose: { minimum: 3.5, maximum: 7, step: 0.5, referenceMinimum: 3.9, referenceMaximum: 6.1 },
  heart: { minimum: 50, maximum: 110, step: 10, referenceMinimum: 60, referenceMaximum: 100 },
};

function chartNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function HealthTrendChart({
  measurements,
  trend,
  label,
  compact = false,
}: {
  measurements: Measurement[];
  trend: TrendKey;
  label: string;
  compact?: boolean;
}) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const data = measurements.slice(0, 7).reverse();
  const preferredScale = chartScales[trend];
  const values = data.map((measurement) => measurement.value);
  const minimumValue = values.length > 0 ? Math.min(...values) : preferredScale.minimum;
  const maximumValue = values.length > 0 ? Math.max(...values) : preferredScale.maximum;
  const rawMinimum = Math.min(preferredScale.minimum, minimumValue);
  const rawMaximum = Math.max(preferredScale.maximum, maximumValue);
  const step = preferredScale.step * Math.max(1, Math.ceil((rawMaximum - rawMinimum) / (preferredScale.step * 6)));
  const minimum = Math.floor(rawMinimum / step) * step;
  const maximum = Math.ceil(rawMaximum / step) * step;
  const ticks: number[] = [];
  for (let value = maximum; value >= minimum; value -= step) ticks.push(value);

  const width = 680;
  const height = compact ? 210 : 260;
  const left = 52;
  const right = 18;
  const top = 16;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const valueRange = Math.max(maximum - minimum, preferredScale.step);
  const points = data.map((measurement, index) => ({
    measurement,
    x: data.length === 1 ? left + plotWidth / 2 : left + (index / (data.length - 1)) * plotWidth,
    y: top + ((maximum - measurement.value) / valueRange) * plotHeight,
  }));
  const stroke = trend === 'diastolic' || trend === 'glucose' ? 'var(--orange)' : 'var(--green-2)';
  const referenceTop = top + ((maximum - preferredScale.referenceMaximum) / valueRange) * plotHeight;
  const referenceBottom = top + ((maximum - preferredScale.referenceMinimum) / valueRange) * plotHeight;
  const activePoint = activePointIndex === null ? null : points[activePointIndex] ?? null;
  const tooltip = activePoint ? {
    x: Math.min(width - right - 72, Math.max(left + 72, activePoint.x)),
    y: activePoint.y > top + 65 ? activePoint.y - 58 : activePoint.y + 18,
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(activePoint.measurement.measuredAt)),
  } : null;

  return (
    <div className={compact ? 'line-chart compact' : 'line-chart'}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <rect className="chart-reference-band" x={left} y={referenceTop} width={plotWidth} height={Math.max(referenceBottom - referenceTop, 1)} />
        {ticks.map((tick) => {
          const y = top + ((maximum - tick) / valueRange) * plotHeight;
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="chart-y-label" x={left - 10} y={y + 4} textAnchor="end">{chartNumber(tick)}</text>
            </g>
          );
        })}
        {points.length > 0 && <polyline className="chart-line" points={points.map((point) => `${point.x},${point.y}`).join(' ')} style={{ stroke }} />}
        {points.map(({ measurement, x, y }, index) => (
          <g className="chart-point-group" key={measurement.id} tabIndex={0} aria-label={`${formatDate(measurement.measuredAt)}: ${measurement.value} ${measurement.unit}`} onMouseEnter={() => setActivePointIndex(index)} onMouseLeave={() => setActivePointIndex(null)} onFocus={() => setActivePointIndex(index)} onBlur={() => setActivePointIndex(null)} onClick={() => setActivePointIndex(index)}>
            <circle className="chart-point" cx={x} cy={y} r={compact ? 4 : 5} style={{ stroke }}>
              <title>{`${formatDate(measurement.measuredAt)}: ${measurement.value} ${measurement.unit}`}</title>
            </circle>
            <text className="chart-x-label" x={x} y={height - 12} textAnchor="middle">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(measurement.measuredAt))}</text>
          </g>
        ))}
        {activePoint && tooltip && <g className="chart-tooltip" aria-hidden="true"><rect x={tooltip.x - 68} y={tooltip.y} width={136} height={44} rx={8} /><text x={tooltip.x} y={tooltip.y + 17} textAnchor="middle">{tooltip.date}</text><text className="chart-tooltip-value" x={tooltip.x} y={tooltip.y + 34} textAnchor="middle">{activePoint.measurement.value} {activePoint.measurement.unit}</text></g>}
        {points.length === 0 && <text className="chart-empty-label" x={left + plotWidth / 2} y={top + plotHeight / 2} textAnchor="middle">No saved readings</text>}
      </svg>
      <div className="chart-reference-legend"><i />General reference range <strong>{chartNumber(preferredScale.referenceMinimum)}–{chartNumber(preferredScale.referenceMaximum)} {data[0]?.unit ?? (trend === 'glucose' ? 'mmol/L' : trend === 'heart' ? 'bpm' : 'mmHg')}</strong></div>
    </div>
  );
}
