import type { FormEventHandler } from 'react';
import type { RecordType } from '@/lib/client/api';
import type { RecordForm } from '../types';
import { recordTypeLabels } from '../utils';

type RecordModalProps = {
  editing?: boolean;
  reason?: string;
  onReasonChange?: (value: string) => void;
  form: RecordForm;
  busy: boolean;
  onChange: (patch: Partial<RecordForm>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
};

export function RecordModal({ form, busy, onChange, onSubmit, onCancel, editing = false, reason = '', onReasonChange }: RecordModalProps) {
  return (
    <form onSubmit={onSubmit}>
      <p className="eyebrow">PERSONAL ENTRY</p><h2 id="action-dialog-title">{editing ? 'Edit Health Record' : 'Add a Health Record'}</h2>
      <fieldset disabled={busy} className="record-fields">
      <div className="form-grid">
        <label>Record Type<select data-modal-initial-focus="true" value={form.type} onChange={(event) => onChange({ type: event.target.value as RecordType })}>{Object.entries(recordTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Record Date<input type="date" value={form.date} onChange={(event) => onChange({ date: event.target.value })} required /></label>
      </div>
      <label className="full-field">Title<input value={form.title} onChange={(event) => onChange({ title: event.target.value })} maxLength={120} placeholder="Example: Annual community health examination" required /></label>
      <label className="full-field">Details<textarea value={form.description} onChange={(event) => onChange({ description: event.target.value })} maxLength={2000} placeholder="Enter key results or information to retain" /></label>
      {editing && <label className="full-field">Reason for change<textarea value={reason} onChange={(event) => onReasonChange?.(event.target.value)} maxLength={500} placeholder="Describe what you are correcting or updating" required /></label>}
      </fieldset>
      <div className="version-note"><span>{editing ? 'Version history' : 'Attachment limitation'}</span><p>{editing ? 'Your previous record will remain available in version history. The original source is preserved.' : 'File upload is not currently available, so this form stores text only.'}</p></div>
      <div className="modal-actions"><button className="secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Record'}</button></div>
    </form>
  );
}
