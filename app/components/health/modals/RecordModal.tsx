import type { FormEventHandler } from 'react';
import type { RecordType } from '@/lib/client/api';
import type { RecordForm } from '../types';
import { recordTypeLabels } from '../utils';

type RecordModalProps = {
  form: RecordForm;
  busy: boolean;
  onChange: (patch: Partial<RecordForm>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
};

export function RecordModal({ form, busy, onChange, onSubmit, onCancel }: RecordModalProps) {
  return (
    <form onSubmit={onSubmit}>
      <p className="eyebrow">PERSONAL ENTRY</p><h2 id="action-dialog-title">Add a Health Record</h2>
      <div className="form-grid">
        <label>Record Type<select data-modal-initial-focus="true" value={form.type} onChange={(event) => onChange({ type: event.target.value as RecordType })}>{Object.entries(recordTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Record Date<input type="date" value={form.date} onChange={(event) => onChange({ date: event.target.value })} required /></label>
      </div>
      <label className="full-field">Title<input value={form.title} onChange={(event) => onChange({ title: event.target.value })} maxLength={120} placeholder="Example: Annual community health examination" required /></label>
      <label className="full-field">Details<textarea value={form.description} onChange={(event) => onChange({ description: event.target.value })} maxLength={2000} placeholder="Enter key results or information to retain" /></label>
      <div className="version-note"><span>Attachment limitation</span><p>File upload is not currently available, so this form stores text only.</p></div>
      <div className="modal-actions"><button className="secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Record'}</button></div>
    </form>
  );
}
