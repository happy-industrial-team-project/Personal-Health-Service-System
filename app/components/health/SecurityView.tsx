import { formatDateTime } from './utils';

type SecurityViewProps = {
  email?: string;
  sessionExpiresAt: string | null;
  busy: string;
  onRecheckSession: () => void;
  onViewAudit: () => void;
  onLogout: () => void;
};

const activeControls = [
  ['Password verification', 'Enabled', 'Scrypt hash comparison on the server'],
  ['Signed session', 'Enabled', 'HttpOnly, SameSite=Lax cookie'],
  ['Login rate limit', 'Enabled', 'Repeated failed attempts are temporarily blocked'],
];

const plannedFeatures = [
  ['Multi-factor authentication', 'Requires SMS or authenticator provider'],
  ['Trusted-device management', 'Requires device/session inventory'],
  ['Biometric sign-in', 'Requires a platform authenticator flow'],
];

export function SecurityView({ email, sessionExpiresAt, busy, onRecheckSession, onViewAudit, onLogout }: SecurityViewProps) {
  return (
    <section className="security-view">
      <div className="security-score panel"><div className="score-ring">✓</div><div><p className="eyebrow">ACCOUNT PROTECTION</p><h2>Authenticated Account Session</h2><p>The server verifies a hashed password, issues a signed HttpOnly session cookie, limits repeated failed sign-ins, validates API input, and writes audit events.</p></div><button className="secondary" type="button" onClick={onRecheckSession}>Recheck Session</button></div>
      <div className="security-grid">
        <article className="panel"><p className="eyebrow">ACTIVE CONTROLS</p><h2>Server-Enforced Protections</h2>{activeControls.map(([name, state, description], index) => <div className="setting-row" key={name}><span className="setting-icon">{index + 1}</span><span><b>{name}</b><small>{description}</small></span><button className="on" type="button" disabled>{state}</button></div>)}</article>
        <article className="panel"><p className="eyebrow">PLANNED FEATURES</p><h2>Additional Security Options</h2>{plannedFeatures.map(([name, description], index) => <div className="device-row" key={name}><span className="device-icon">{index + 1}</span><span><b>{name}</b><small>{description}</small></span><em>Planned</em></div>)}<button className="danger full" type="button" disabled>Sign Out Other Devices — Unavailable</button></article>
      </div>
      <article className="panel security-events">
        <div className="panel-title"><div><p className="eyebrow">CURRENT SESSION</p><h2>Session Information</h2></div><button className="text-button" onClick={onViewAudit}>View Full Log</button></div>
        <div className="event-row"><span>✓</span><div><strong>Signed in as {email}</strong><small>{sessionExpiresAt ? `Session expires ${formatDateTime(sessionExpiresAt)}` : 'Expiry unavailable'}</small></div><b>Active</b></div>
        <button className="danger full" type="button" disabled={busy === 'logout'} onClick={onLogout}>{busy === 'logout' ? 'Signing Out…' : 'Sign Out This Session'}</button>
      </article>
    </section>
  );
}
