import type { HealthRecord, RecordType } from '@/lib/client/api';
import { formatDate, recordSourceLabels, recordStatus, recordTypeIcons, recordTypeLabels } from './utils';

type RecordsViewProps = {
  records: HealthRecord[];
  error: string;
  loading: boolean;
  filter: RecordType | 'all';
  onFilterChange: (filter: RecordType | 'all') => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onClearDates: () => void;
  onAddRecord: () => void;
  onOpenRecord: (record: HealthRecord) => void;
};

export function RecordsView({ records, error, loading, filter, onFilterChange, dateFrom, dateTo, onDateFromChange, onDateToChange, onClearDates, onAddRecord, onOpenRecord }: RecordsViewProps) {
  const filters = [['all', 'All'], ...Object.entries(recordTypeLabels).filter(([type]) => type !== 'other')] as Array<[RecordType | 'all', string]>;

  return (
    <section className="records-view">
      <div className="toolbar">
        <div className="filter-tabs">{filters.map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => onFilterChange(value)}>{label}</button>)}</div>
        <button className="primary" onClick={onAddRecord}>＋ Add Record</button>
      </div>
      <div className="record-date-filters" role="group" aria-label="Search records by date range">
        <label>Start Date<input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></label>
        <label>End Date<input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></label>
        <button className="secondary" type="button" disabled={!dateFrom && !dateTo} onClick={onClearDates}>Clear Dates</button>
      </div>
      {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="records-layout">
        <article className="panel records-list">
          <div className="list-heading"><span>{loading ? 'Searching…' : `${records.length} records`}</span><small>Your saved health records</small></div>
          {records.map((record) => (
            <button className="record-row" key={record.id} onClick={() => onOpenRecord(record)}>
              <span className="record-icon large">{recordTypeIcons[record.type]}</span>
              <span className="record-main"><span><b>{record.title}</b><em>{recordStatus(record)}</em></span><small>{recordTypeLabels[record.type]} · {record.organization ?? recordSourceLabels[record.source]}</small><p>{record.description || 'No details were provided.'}</p></span>
              <span className="record-date">{formatDate(record.occurredAt)}<b aria-hidden="true">›</b></span>
            </button>
          ))}
          {!loading && !error && records.length === 0 && <div className="empty-state"><strong>No matching records</strong><p>Try another search term, record type, or date range.</p></div>}
        </article>
        <aside className="panel record-guide">
          <p className="eyebrow">RECORD RULES</p><h2>Clear Data Provenance</h2>
          <dl><div><dt>Self-entered</dt><dd>Created through this form and persisted by the health records service</dd></div><div><dt>Hospital source</dt><dd>Hospital-source records are identified separately from self-entered information</dd></div><div><dt>Search</dt><dd>Text, type, and date filters are validated and applied by the server</dd></div></dl>
          <button className="secondary" type="button" disabled title="Direct hospital integration is not currently available">Hospital Sync — Unavailable</button>
        </aside>
      </div>
    </section>
  );
}
