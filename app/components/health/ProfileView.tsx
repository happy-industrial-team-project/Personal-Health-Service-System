import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/client/api';
import { bloodTypes, type HealthProfile } from '@/lib/profile';

type Props = { onSaved: (name: string) => void; onError: (error: unknown) => string };
const historyFields = [['medicalHistory', 'Medical History'], ['familyHistory', 'Family History'], ['allergies', 'Allergies'], ['medications', 'Current Medications']] as const;

export function ProfileView({ onSaved, onError }: Props) {
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [saved, setSaved] = useState<HealthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);
  const dirty = Boolean(profile && saved && JSON.stringify(profile) !== JSON.stringify(saved));
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ profile: HealthProfile }>('/api/profile', { signal: controller.signal })
      .then(({ profile }) => { if (!controller.signal.aborted) { setProfile(profile); setSaved(profile); } })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError(onError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, onError]);
  function change(patch: Partial<HealthProfile>) { setProfile((current) => current ? { ...current, ...patch } : current); setMessage(''); }
  function refresh() {
    if (dirty && !window.confirm('Reloading will discard your unsaved changes. Continue?')) return;
    setLoading(true); setError(''); setMessage(''); setReload((value) => value + 1);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || submitting.current) return;
    submitting.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const { version, updatedAt, ...fields } = profile;
      void updatedAt;
      const result = await apiRequest<{ profile: HealthProfile }>('/api/profile', { method: 'PUT', body: JSON.stringify({ ...fields, expectedVersion: version }) });
      setProfile(result.profile); setSaved(result.profile); onSaved(result.profile.name); setMessage('Health profile saved');
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
      <div className="modal-actions"><button className="secondary" type="button" disabled={!dirty} onClick={() => { setProfile(saved); setError(''); setMessage(''); }}>Discard Unsaved Changes</button><button className="primary" type="submit" disabled={!dirty && profile.version > 0}>{saving ? 'Saving…' : 'Save Profile'}</button></div>
      </fieldset>
      <p>{dirty ? 'You have unsaved changes. Save before leaving this page.' : ''}{saved?.updatedAt ? ` Last saved: ${new Date(saved.updatedAt).toLocaleString('en-US')}` : ' Your profile has not been saved yet.'}</p>
    </form>}
    <button type="button" className="secondary" disabled={loading || saving} onClick={refresh}>Reload Saved Profile</button>
  </section>;
}
