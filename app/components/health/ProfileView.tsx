import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/client/api';
import { bloodTypes, type HealthProfile, type HealthProfileFields, type HealthProfileVersion } from '@/lib/profile';

type Props = { onSaved: (name: string) => void; onError: (error: unknown) => string };
const historyFields = [['medicalHistory', 'Medical History'], ['familyHistory', 'Family History'], ['allergies', 'Allergies'], ['medications', 'Current Medications']] as const;
const versionFields: ReadonlyArray<readonly [keyof HealthProfileFields, string]> = [
  ['name', 'Full Name'], ['gender', 'Gender'], ['birthDate', 'Date of Birth'],
  ['bloodType', 'Blood Type (ABO)'], ['heightCm', 'Height (cm)'], ['weightKg', 'Weight (kg)'],
  ...historyFields,
];

function fieldValue(profile: HealthProfile, field: keyof HealthProfileFields): string {
  const value = profile[field];
  if (value === null || value === '' || value === 'unspecified') return 'Not provided';
  if (value === 'unknown') return 'Unknown';
  return String(value);
}

export function ProfileView({ onSaved, onError }: Props) {
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [saved, setSaved] = useState<HealthProfile | null>(null);
  const [versions, setVersions] = useState<HealthProfileVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);
  const dirty = Boolean(profile && saved && JSON.stringify(profile) !== JSON.stringify(saved));
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ profile: HealthProfile; versions: HealthProfileVersion[] }>('/api/profile', { signal: controller.signal })
      .then(({ profile, versions }) => { if (!controller.signal.aborted) { setProfile(profile); setSaved(profile); setVersions(versions); } })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError(onError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, onError]);
  function change(patch: Partial<HealthProfile>) { setProfile((current) => current ? { ...current, ...patch } : current); setMessage(''); }
  function refresh() {
    if (dirty && !window.confirm('Reloading will discard your unsaved changes. Continue?')) return;
    setLoading(true); setError(''); setMessage(''); setReason(''); setReload((value) => value + 1);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || submitting.current) return;
    submitting.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const { version, updatedAt, ...fields } = profile;
      void updatedAt;
      const result = await apiRequest<{ profile: HealthProfile; versions: HealthProfileVersion[]; changed: boolean }>('/api/profile', { method: 'PUT', body: JSON.stringify({ ...fields, expectedVersion: version, reason }) });
      setProfile(result.profile); setSaved(result.profile); setVersions(result.versions); setReason('');
      if (result.changed) onSaved(result.profile.name);
      setMessage(result.changed ? 'Health profile saved' : 'No changes to save');
    } catch (error) { setError(onError(error)); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <section className="panel profile-panel">
    <p>All fields except your name are optional. Choose Unknown or leave uncertain details blank. This profile is saved separately from health records and measurement trends.</p>
    {error && <p className="record-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {loading ? <p role="status">Loading your profile…</p> : profile && <form onSubmit={save}>
      <fieldset disabled={saving} className="profile-fields"><legend>Basic Information</legend><div className="form-grid">
        <label>Full Name<input required maxLength={100} autoComplete="name" value={profile.name} onChange={(event) => change({ name: event.target.value })} /></label>
        <label>Gender<select value={profile.gender} onChange={(event) => change({ gender: event.target.value as HealthProfile['gender'] })}><option value="unspecified">Not provided</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
        <label>Date of Birth<input type="date" min="1900-01-01" max={new Date().toLocaleDateString('sv-SE')} value={profile.birthDate ?? ''} onChange={(event) => change({ birthDate: event.target.value || null })} /></label>
        <label>Blood Type (ABO)<select value={profile.bloodType} onChange={(event) => change({ bloodType: event.target.value as HealthProfile['bloodType'] })}>{bloodTypes.map((value) => <option key={value} value={value}>{value === 'unknown' ? 'Unknown' : value}</option>)}</select></label>
        <label>Height (cm)<input type="number" min="20" max="300" step="0.1" value={profile.heightCm ?? ''} onChange={(event) => change({ heightCm: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <label>Weight (kg)<input type="number" min="0.5" max="700" step="0.1" value={profile.weightKg ?? ''} onChange={(event) => change({ weightKg: event.target.value === '' ? null : Number(event.target.value) })} /></label>
      </div>
      {historyFields.map(([key, label]) => <label className="full-field" key={key}>{label}<textarea value={profile[key]} maxLength={2000} onChange={(event) => change({ [key]: event.target.value })} /></label>)}
      <p>Blank history, allergy, and medication fields mean not provided, not none. Enter None only when confirmed.</p>
      {saved && saved.version > 0 && <label className="full-field">Reason for change<textarea required={dirty} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what you changed" /></label>}
      <div className="modal-actions"><button className="secondary" type="button" disabled={!dirty} onClick={() => { setProfile(saved); setReason(''); setError(''); setMessage(''); }}>Discard Unsaved Changes</button><button className="primary" type="submit" disabled={!dirty && profile.version > 0}>{saving ? 'Saving…' : 'Save Profile'}</button></div>
      </fieldset>
      <p>{dirty ? 'You have unsaved changes. Save before leaving this page.' : ''}{saved?.updatedAt ? ` Last saved: ${new Date(saved.updatedAt).toLocaleString('en-US')}` : ' Your profile has not been saved yet.'}</p>
    </form>}
    <div className="profile-actions"><button type="button" className="secondary" disabled={loading || saving} onClick={refresh}>Reload Saved Profile</button><button type="button" className="secondary" disabled={loading || saving || versions.length === 0} aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)}>{showHistory ? 'Hide Version History' : 'View Version History'}</button></div>
    {showHistory && <section className="profile-history" aria-label="Health profile version history">
      <h2>Version History</h2><p>Each saved version keeps the complete profile and the changes from the preceding version.</p>
      <div className="record-history">{versions.map((entry, index) => {
        const previous = versions[index + 1]?.profile;
        const changes = previous ? versionFields.filter(([field]) => previous[field] !== entry.profile[field]) : [];
        return <article className="record-version" key={entry.version}>
          <h3>Version {entry.version}{entry.version === saved?.version ? ' · Current' : ''}</h3>
          <p className="record-version-meta">{new Date(entry.changedAt).toLocaleString('en-US')} · {entry.changedBy ?? (entry.baseline ? 'History enabled' : 'Demo data import')}</p>
          <p className="record-version-reason"><strong>Reason: </strong>{entry.reason}</p>
          {changes.length > 0 && <dl className="record-changes">{changes.map(([field, label]) => <div key={field}><dt>{label}</dt><dd><span>Before</span><p>{fieldValue(previous!, field)}</p><span>After</span><p>{fieldValue(entry.profile, field)}</p></dd></div>)}</dl>}
          <details><summary>View full version {entry.version}</summary><dl className="record-snapshot">{versionFields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{fieldValue(entry.profile, field)}</dd></div>)}</dl></details>
        </article>;
      })}</div>
    </section>}
  </section>;
}
