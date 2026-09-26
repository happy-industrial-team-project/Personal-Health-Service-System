import type { Measurement } from '@/lib/client/api';
import { HealthTrendChart } from './HealthTrendChart';
import type { TrendKey, TrendRow, TrendSummary } from './types';
import { formatDateTime } from './utils';

type HealthTrendsViewProps = {
  trend: TrendKey;
  trendData: Record<TrendKey, TrendSummary>;
  measurements: Measurement[];
  rows: TrendRow[];
  onTrendChange: (trend: TrendKey) => void;
  onAddMeasurement: () => void;
};

export function HealthTrendsView({ trend, trendData, measurements, rows, onTrendChange, onAddMeasurement }: HealthTrendsViewProps) {
  return (
    <section className="trends-view">
      <div className="metric-switch">
        {(Object.entries(trendData) as Array<[TrendKey, TrendSummary]>).map(([key, item]) => <button key={key} className={trend === key ? 'selected' : ''} onClick={() => onTrendChange(key)}><span>{item.name}</span><strong>{item.value}</strong><small>{item.unit}</small></button>)}
      </div>
      <div className="trend-detail-grid">
        <article className="panel trend-large">
          <div className="panel-title"><div><p className="eyebrow">ALL SAVED READINGS</p><h2>{trendData[trend].name} Trend</h2></div><span className="status-label">{measurements.length} DATA POINTS</span></div>
          <div className="trend-summary"><strong>{trendData[trend].value}</strong><span>{trendData[trend].unit}<b>{trendData[trend].state}</b></span></div>
          <HealthTrendChart trend={trend} measurements={measurements} label={`${trendData[trend].name} line chart in ${trendData[trend].unit}`} />
        </article>
        <aside className="panel insight">
          <p className="eyebrow">RULE-BASED SUMMARY</p><h2>{trendData[trend].state}</h2><p>{trendData[trend].detail}</p>
          <div className="advice"><strong>Everyday guidance</strong><p>Measure under consistent conditions and contact a qualified professional if unusual readings persist or you feel unwell.</p></div>
          <small className="disclaimer">This automated range check provides general information and is not a diagnosis or treatment recommendation.</small>
        </aside>
      </div>
      <article className="panel history-table">
        <div className="panel-title"><h2>Recent Measurements</h2><button className="text-button" onClick={onAddMeasurement}>Add Measurement</button></div>
        <div className="table-head"><span>Measured At</span><span>Result</span><span>Range Check</span><span>Source</span></div>
        {rows.map((row) => <div className="table-row" key={row.id}><span>{formatDateTime(row.time)}</span><strong>{row.result}</strong><span><i className={row.review ? 'status-dot warn' : 'status-dot'} />{row.review ? 'Review' : 'Within range'}</span><span>{row.source}</span></div>)}
        {rows.length === 0 && <div className="empty-state"><strong>No saved readings</strong><p>Add a measurement to begin this trend.</p></div>}
      </article>
    </section>
  );
}
