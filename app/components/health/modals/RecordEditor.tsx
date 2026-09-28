import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest, type HealthRecord, type HealthRecordVersion } from '@/lib/client/api';
import type { RecordForm } from '../types';
import { formatDate, recordTypeLabels } from '../utils';
import { RecordModal } from './RecordModal';
import { RecordDetailModal } from './RecordDetailModal';

function dateInput(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const fields = ['type', 'title', 'occurredAt', 'description', 'voidedAt', 'voidReason'] as const;
const labels = { type: 'Record type', title: 'Title', occurredAt: 'Record date', description: 'Details', voidedAt: 'Status', voidReason: 'Reason for voiding' };
function fieldValue(record: HealthRecord, field: typeof fields[number]): string {
  if (field === 'type') return recordTypeLabels[record.type];
  if (field === 'occurredAt') return formatDate(record.occurredAt);
  if (field === 'voidedAt') return record.voidedAt ? `Voided · ${new Date(record.voidedAt).toLocaleString()}` : 'Active';
  if (field === 'voidReason') return record.voidReason || 'Not applicable';
  return record[field] || 'No details were provided.';
}

type Props = {
  initialRecord: HealthRecord;
  onDone: () => void;
  onUpdated: (record: HealthRecord) => void;
  onBusyChange: (busy: string) => void;
  onError: (error: unknown) => string;
};

export function RecordEditor({ initialRecord, onDone, onUpdated, onBusyChange, onError }: Props) {
  const [record, setRecord] = useState(initialRecord);
  const [versions, setVersions] = useState<HealthRecordVersion[]>([]);
  const [mode, setMode] = useState<'detail' | 'edit' | 'history' | 'void'>('detail');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [reason, setReason] = useState('');
  const [form, setForm] = useState<RecordForm>({ type: record.type, title: record.title, description: record.description, date: dateInput(record.occurredAt) });
  const container = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ record: HealthRecord; versions: HealthRecordVersion[] }>(`/api/records/${encodeURIComponent(initialRecord.id)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setRecord(result.record); setVersions(result.versions); setError(''); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(onError(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialRecord.id, onError, reload]);

  useEffect(() => {
    container.current?.querySelector<HTMLElement>('[data-modal-initial-focus]')?.focus();
  }, [mode]);

  function edit() {
    setForm({ type: record.type, title: record.title, description: record.description, date: dateInput(record.occurredAt) });
    setReason(''); setError(''); setMode('edit');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setSaving(true); onBusyChange('record-edit'); setError('');
    try {
      // Preserve the original instant when only text/type changes, avoiding an accidental date revision.
      const occurredAt = form.date === dateInput(record.occurredAt) ? record.occurredAt : new Date(`${form.date}T12:00:00`).toISOString();
      const result = await apiRequest<{ record: HealthRecord; changed: boolean }>(`/api/records/${encodeURIComponent(record.id)}`, {
        method: 'PATCH', body: JSON.stringify({ type: form.type, title: form.title, description: form.description, occurredAt, expectedVersion: record.version, reason }),
      });
      setRecord(result.record); onUpdated(result.record); setMode('detail');
      setLoading(true); setReload((value) => value + 1);
    } catch (failure) { setError(onError(failure)); }
    finally { submitting.current = false; setSaving(false); onBusyChange(''); }
  }

  async function confirmVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setSaving(true); onBusyChange('record-void'); setError('');
    try {
      const result = await apiRequest<{ record: HealthRecord }>(`/api/records/${encodeURIComponent(record.id)}`, {
        method: 'POST', body: JSON.stringify({ action: 'void', expectedVersion: record.version, reason }),
      });
      setRecord(result.record); onUpdated(result.record); setMode('detail');
      setLoading(true); setReload((value) => value + 1);
    } catch (failure) { setError(onError(failure)); }
    finally { submitting.current = false; setSaving(false); onBusyChange(''); }
  }

  return <div ref={container}>
    {error && <p className="record-error" role="alert">{error}</p>}
    {loading && <p role="status">Loading latest record and history…</p>}
    {mode !== 'edit' && mode !== 'void' && error && <button className="secondary" onClick={() => { setLoading(true); setError(''); setReload((value) => value + 1); }}>Retry</button>}
    {mode === 'detail' && <RecordDetailModal record={record} loading={loading || Boolean(error)} onDone={onDone} onEdit={edit} onVoid={() => { setReason(''); setError(''); setMode('void'); }} onHistory={() => setMode('history')} />}
    {mode === 'void' && <form onSubmit={confirmVoid}>
      <p className="eyebrow">CORRECT AN ERRONEOUS RECORD</p><h2 id="action-dialog-title">Void Record</h2>
      <p><strong>{record.title}</strong></p><p>This marks the record as invalid. Its content and version history will be retained. You will no longer be able to edit it.</p>
      <label className="full-field">Reason for voiding<textarea data-modal-initial-focus="true" required maxLength={500} disabled={saving} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: duplicate record or entered for the wrong date" /></label>
      <div className="modal-actions"><button type="button" className="secondary" disabled={saving} onClick={() => { setError(''); setMode('detail'); setLoading(true); setReload((value) => value + 1); }}>Cancel</button><button type="submit" className="danger" disabled={saving}>{saving ? 'Voiding…' : 'Confirm Void'}</button></div>
    </form>}
    {mode === 'edit' && <RecordModal editing form={form} reason={reason} busy={saving} onReasonChange={setReason} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} onSubmit={save} onCancel={() => { setError(''); setMode('detail'); setLoading(true); setReload((value) => value + 1); }} />}
    {mode === 'history' && <>
      <p className="eyebrow">HEALTH RECORD</p><h2 id="action-dialog-title" tabIndex={-1} data-modal-initial-focus="true">Version History</h2>
      <p>{record.title} · {versions.length} saved versions</p>
      <div className="record-history">
        {versions.map((entry, index) => {
          const previous = versions[index + 1]?.record;
          const changes = previous ? fields.filter((field) => previous[field] !== entry.record[field]) : [];
          return <article className="record-version" key={entry.version}>
            <h3>Version {entry.version}{entry.version === record.version ? ' · Current' : ''}</h3>
            <p className="record-version-meta">{new Date(entry.changedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {entry.changedBy ?? (entry.baseline ? 'History enabled' : 'Initial record')}</p>
            <p className="record-version-reason"><strong>Reason: </strong>{entry.reason}</p>
            {changes.length > 0 && <dl className="record-changes">{changes.map((field) => <div key={field}><dt>{labels[field]}</dt><dd><span>Before</span><p>{fieldValue(previous!, field)}</p><span>After</span><p>{fieldValue(entry.record, field)}</p></dd></div>)}</dl>}
            <details><summary>View full version {entry.version}</summary><dl className="record-snapshot">{fields.map((field) => <div key={field}><dt>{labels[field]}</dt><dd>{fieldValue(entry.record, field)}</dd></div>)}</dl></details>
          </article>;
        })}
      </div>
      <div className="modal-actions"><button className="secondary" onClick={() => setMode('detail')}>Back to Record</button><button className="primary" onClick={onDone}>Done</button></div>
    </>}
  </div>;
}
