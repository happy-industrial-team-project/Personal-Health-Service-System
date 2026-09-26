import type { AuditEvent } from '@/lib/client/api';
import type { AuditFilter, AuditRow } from './types';
import { actionLabels, formatDateTime } from './utils';

type AccessLogViewProps = {
  failedEvent?: AuditEvent;
  filter: AuditFilter;
  rows: AuditRow[];
  onFilterChange: (filter: AuditFilter) => void;
  onReviewSecurity: () => void;
};

const auditFilters: AuditFilter[] = ['All Activity', 'Views', 'Changes', 'Failed'];

export function AccessLogView({ failedEvent, filter, rows, onFilterChange, onReviewSecurity }: AccessLogViewProps) {
  return (
    <section className="audit-view">
      {failedEvent && <div className="risk-banner"><span className="alert-icon">!</span><div><strong>A failed request was recorded</strong><p>{actionLabels[failedEvent.action] ?? failedEvent.action} · {formatDateTime(failedEvent.createdAt)}. The event did not complete successfully.</p></div><button onClick={onReviewSecurity}>Review Account Security</button></div>}
      <div className="toolbar audit-toolbar">
        <div className="filter-tabs">{auditFilters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => onFilterChange(item)}>{item}</button>)}</div>
        <button className="secondary" type="button" disabled title="Audit export is not currently available">Export — Unavailable</button>
      </div>
      <article className="panel audit-list">
        <div className="audit-head"><span>Actor</span><span>Action and Resource</span><span>Time and Context</span><span>Result</span></div>
        {rows.map((row) => <div className={row.risk ? 'audit-row risky' : 'audit-row'} key={row.id}><span><i className="person-dot">{row.initials}</i><b>{row.person}</b></span><span><b>{row.action}</b><small>{row.target}</small></span><span><b>{row.time}</b><small>{row.place}</small></span><span><em>{row.result}</em></span></div>)}
        {rows.length === 0 && <div className="empty-state"><strong>No matching audit events</strong><p>Actions performed through the health service will appear here.</p></div>}
      </article>
    </section>
  );
}
