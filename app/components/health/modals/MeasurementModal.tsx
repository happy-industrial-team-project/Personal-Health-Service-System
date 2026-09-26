import type { FormEventHandler } from 'react';
import type { MeasurementForm } from '../types';

type MeasurementModalProps = {
  form: MeasurementForm;
  busy: boolean;
  onChange: (patch: Partial<MeasurementForm>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
};

export function MeasurementModal({ form, busy, onChange, onSubmit, onCancel }: MeasurementModalProps) {
  return (
    <form onSubmit={onSubmit}>
      <p className="eyebrow">NEW MEASUREMENT</p><h2 id="action-dialog-title">Record Health Data</h2>
      <div className="form-grid">
        <label>Metric Type<select data-modal-initial-focus="true" value={form.kind} onChange={(event) => { const kind = event.target.value as MeasurementForm['kind']; onChange({ kind, result: kind === 'blood_pressure' ? '126/78' : kind === 'heart_rate' ? '72' : '6.2' }); }}><option value="blood_glucose">Fasting Glucose</option><option value="blood_pressure">Blood Pressure</option><option value="heart_rate">Resting Heart Rate</option></select></label>
        <label>{form.kind === 'blood_pressure' ? 'Result (systolic/diastolic)' : 'Result'}<input value={form.result} onChange={(event) => onChange({ result: event.target.value })} inputMode={form.kind === 'blood_pressure' ? 'text' : 'decimal'} required /></label>
        <label>Unit<input value={form.kind === 'blood_pressure' ? 'mmHg' : form.kind === 'blood_glucose' ? 'mmol/L' : 'bpm'} readOnly /></label>
        <label>Measured At<input type="datetime-local" value={form.measuredAt} onChange={(event) => onChange({ measuredAt: event.target.value })} required /></label>
      </div>
      <label className="full-field">Notes<textarea value={form.notes} onChange={(event) => onChange({ notes: event.target.value })} maxLength={500} placeholder="Add meal, sleep, or measurement conditions" /></label>
      <div className="modal-actions"><button className="secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Measurement'}</button></div>
    </form>
  );
}
