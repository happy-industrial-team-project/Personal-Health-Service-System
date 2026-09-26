import type { Permission } from '@/lib/client/api';
import { formatDateTime, initials, scopeLabel } from './utils';

type PermissionsViewProps = {
  activePermissions: Permission[];
  expiredCount: number;
  revokedCount: number;
  error: string;
  busy: string;
  onAddPermission: () => void;
  onViewAudit: () => void;
  onRevoke: (permission: Permission) => void;
};

const lifecycleSteps = [
  'Recipient is selected',
  'Patient chooses the scope',
  'Server stores an expiry',
  'Consent record is active',
  'Permission expires or is revoked',
  'Every change is logged',
];

export function PermissionsView({ activePermissions, expiredCount, revokedCount, error, busy, onAddPermission, onViewAudit, onRevoke }: PermissionsViewProps) {
  return (
    <section className="permission-view">
      <div className="consent-hero">
        <div><p className="eyebrow">MINIMUM NECESSARY ACCESS</p><h2>Your information, your decision</h2><p>Choose a recipient, define the read-only scope, and set an expiry. Every permission decision is stored and included in the access log. Clinician sign-in is not currently available.</p></div>
        <button className="primary light" onClick={onAddPermission}>＋ Record Permission</button>
      </div>
      {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="permission-stats"><div><strong>{activePermissions.length}</strong><span>Active Records</span></div><div><strong>{expiredCount}</strong><span>Expired</span></div><div><strong>{revokedCount}</strong><span>Revoked</span></div></div>
      <div className="permission-grid">
        <article className="panel grants">
          <div className="panel-title"><div><p className="eyebrow">ACTIVE PERMISSION RECORDS</p><h2>Recorded Sharing Decisions</h2></div></div>
          {activePermissions.length === 0 ? <div className="empty-state"><strong>No active permissions</strong><p>A new sharing decision requires your confirmation.</p></div> : activePermissions.map((permission) => (
            <div className="grant-card" key={permission.id}>
              <div className="doctor-line"><span className="doctor-avatar">{initials(permission.granteeName)}</span><span><strong>{permission.granteeName}</strong><small>{permission.organization ?? permission.granteeType}</small></span><b className="verified">Active</b></div>
              <div className="grant-scope"><span><small>Recorded scope</small><b>{scopeLabel(permission.scopes)}</b></span><span><small>Valid until</small><b>{formatDateTime(permission.expiresAt)}</b></span><span><small>Access mode</small><b>Consent record only</b></span></div>
              <div className="grant-actions"><button className="secondary" onClick={onViewAudit}>View Access Log</button><button className="danger" disabled={busy === `revoke:${permission.id}`} onClick={() => onRevoke(permission)}>{busy === `revoke:${permission.id}` ? 'Revoking…' : 'Revoke'}</button></div>
            </div>
          ))}
        </article>
        <aside className="panel flow-panel">
          <p className="eyebrow">PERMISSION FLOW</p><h2>Consent Lifecycle</h2>
          {lifecycleSteps.map((step, index) => <div className="flow-step" key={step}><span>{index + 1}</span><b>{step}</b></div>)}
        </aside>
      </div>
    </section>
  );
}
