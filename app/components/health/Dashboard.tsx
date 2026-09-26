import type { HealthRecord, Measurement, Permission } from '@/lib/client/api';
import { HealthTrendChart } from './HealthTrendChart';
import type { BloodPressureTrend, DashboardMetric, TrendKey } from './types';
import { formatDate, formatDateTime, initials, recordSourceLabels, recordTypeIcons, scopeLabel, valuesForTrend } from './utils';

type DashboardProps = {
  userName: string;
  metrics: DashboardMetric[];
  measurements: Measurement[];
  records: HealthRecord[];
  activePermissions: Permission[];
  pressureTrend: BloodPressureTrend;
  onPressureTrendChange: (trend: BloodPressureTrend) => void;
  onSelectTrend: (trend: TrendKey) => void;
  onOpenMeasurement: () => void;
  onOpenRecords: () => void;
  onOpenPermissions: () => void;
  onOpenRecord: (record: HealthRecord) => void;
};

export function Dashboard({
  userName,
  metrics,
  measurements,
  records,
  activePermissions,
  pressureTrend,
  onPressureTrendChange,
  onSelectTrend,
  onOpenMeasurement,
  onOpenRecords,
  onOpenPermissions,
  onOpenRecord,
}: DashboardProps) {
  const flaggedMetrics = metrics.filter((item) => item.tone === 'orange');

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">PERSONAL HEALTH OVERVIEW</p>
          <h1>Welcome, {userName.split(' ')[0]}</h1>
          <p>Your latest health summary is ready.</p>
        </div>
        <button className="primary" onClick={onOpenMeasurement}>＋ Record Health Data</button>
      </section>

      <section className="metrics" aria-label="Latest health metrics">
        {metrics.map((item) => (
          <button className="metric" key={item.key} onClick={() => onSelectTrend(item.trend)}>
            <span className="metric-head"><span>{item.name}</span><b className={item.tone}>{item.value === '—' ? 'No data' : item.state}</b></span>
            <span className="metric-value"><strong>{item.value}</strong><small>{item.unit}</small></span>
            <span className="metric-foot">{item.updatedAt ? `Saved ${formatDateTime(item.updatedAt)}` : 'Add a measurement to begin'}</span>
          </button>
        ))}
        <article className="metric score">
          <span className="metric-head"><span>Saved Measurements</span><b>Server-backed</b></span>
          <span className="metric-value"><strong>{measurements.length}</strong><small>entries</small></span>
          <span className="metric-foot">Across {new Set(measurements.map((item) => item.metric)).size} metric types</span>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel trend-panel">
          <div className="panel-title">
            <div><p className="eyebrow">RECENT SAVED READINGS</p><h2>Blood Pressure Trend</h2></div>
            <button className="text-button" onClick={() => onSelectTrend(pressureTrend)}>View All</button>
          </div>
          <div className="pressure-chart-toolbar" role="group" aria-label="Choose blood pressure type">
            <button type="button" className={pressureTrend === 'systolic' ? 'selected' : ''} aria-pressed={pressureTrend === 'systolic'} onClick={() => onPressureTrendChange('systolic')}><i className="dot dark" />Systolic Pressure</button>
            <button type="button" className={pressureTrend === 'diastolic' ? 'selected' : ''} aria-pressed={pressureTrend === 'diastolic'} onClick={() => onPressureTrendChange('diastolic')}><i className="dot orange" />Diastolic Pressure</button>
            <small>mmHg</small>
          </div>
          <HealthTrendChart compact trend={pressureTrend} measurements={valuesForTrend(measurements, pressureTrend)} label={`${pressureTrend === 'systolic' ? 'Systolic' : 'Diastolic'} blood pressure line chart in millimetres of mercury`} />
        </article>

        <aside className="panel alert-panel">
          <div className="panel-title"><div><p className="eyebrow">RULE-BASED SUMMARY</p><h2>Latest Reading Check</h2></div><span className="count">{flaggedMetrics.length}</span></div>
          {flaggedMetrics.length > 0 ? flaggedMetrics.slice(0, 1).map((item) => (
            <div className="alert-card" key={item.name}><span className="alert-icon">!</span><div><strong>{item.name} is outside the reference range</strong><p>{item.detail} Recheck under comparable conditions or consult a qualified professional if concerned.</p></div></div>
          )) : <div className="empty-state"><strong>No reading is flagged</strong><p>Current readings are within the configured reference ranges.</p></div>}
          <div className="next-check"><span>Important limitation</span><strong>General health guidance</strong><small>Reference ranges provide general information and do not replace professional medical advice.</small></div>
        </aside>
      </section>

      <section className="lower-grid">
        <article className="panel compact-list">
          <div className="panel-title"><div><p className="eyebrow">RECENT RECORDS</p><h2>Saved Health Information</h2></div><button className="text-button" onClick={onOpenRecords}>Open Records</button></div>
          {records.slice(0, 3).map((record) => (
            <button className="mini-row" key={record.id} onClick={() => onOpenRecord(record)}>
              <span className="record-icon">{recordTypeIcons[record.type]}</span>
              <span><strong>{record.title}</strong><small>{record.organization ?? recordSourceLabels[record.source]} · {formatDate(record.occurredAt)}</small></span>
              <b aria-hidden="true">›</b>
            </button>
          ))}
          {records.length === 0 && <div className="empty-state"><strong>No records yet</strong><p>Add a record to populate this section.</p></div>}
        </article>

        <article className="panel consent-summary">
          <p className="eyebrow">ACTIVE PERMISSION RECORD</p>
          {activePermissions[0] ? <>
            <h2>{activePermissions.length} temporary sharing decision{activePermissions.length === 1 ? ' is' : 's are'} recorded</h2>
            <div className="doctor-line"><span className="doctor-avatar">{initials(activePermissions[0].granteeName)}</span><span><strong>{activePermissions[0].granteeName}</strong><small>{scopeLabel(activePermissions[0].scopes)} · Expires {formatDateTime(activePermissions[0].expiresAt)}</small></span></div>
          </> : <><h2>No active sharing permission</h2><p>No active consent record exists right now.</p></>}
          <button className="secondary" onClick={onOpenPermissions}>Manage Permissions</button>
        </article>
      </section>
    </>
  );
}
