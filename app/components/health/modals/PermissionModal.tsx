import type { FormEventHandler } from 'react';
import type { PermissionForm, PermissionScope } from '../types';

type PermissionModalProps = {
  form: PermissionForm;
  busy: boolean;
  onChange: (patch: Partial<PermissionForm>) => void;
  onToggleScope: (scope: PermissionScope) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
};

export function PermissionModal({ form, busy, onChange, onToggleScope, onSubmit, onCancel }: PermissionModalProps) {
  return (
    <form onSubmit={onSubmit}>
      <p className="eyebrow">MINIMUM NECESSARY ACCESS</p><h2 id="action-dialog-title">Record Temporary Permission</h2>
      <div className="form-grid">
        <label>Clinician or Health Manager<select data-modal-initial-focus="true" value={form.recipient} onChange={(event) => onChange({ recipient: event.target.value as PermissionForm['recipient'] })}><option value="carter">Dr. William Carter · Riverside General Hospital</option><option value="chen">Emma Chen · Lakeside Community Hospital</option></select></label>
        <label>Duration<select value={form.durationHours} onChange={(event) => onChange({ durationHours: Number(event.target.value) })}><option value={24}>24 Hours</option><option value={72}>3 Days</option><option value={168}>7 Days</option></select></label>
      </div>
      <fieldset><legend>Intended read-only scope</legend><label className="check-row"><input type="checkbox" checked={form.scopes.includes('records:read')} onChange={() => onToggleScope('records:read')} />Health records</label><label className="check-row"><input type="checkbox" checked={form.scopes.includes('measurements:read')} onChange={() => onToggleScope('measurements:read')} />Health measurements</label></fieldset>
      <label className="check-row consent-check"><input type="checkbox" checked={form.confirmed} onChange={(event) => onChange({ confirmed: event.target.checked })} />I have confirmed the recipient, scope, and expiry</label>
      <div className="modal-actions"><button className="secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Save Permission Record'}</button></div>
    </form>
  );
}
