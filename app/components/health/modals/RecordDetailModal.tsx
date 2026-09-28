import type { HealthRecord } from '@/lib/client/api';
import { formatDate, formatDateTime, recordSourceLabels, recordStatus, recordTypeLabels } from '../utils';

type RecordDetailModalProps = {
  record: HealthRecord;
  onDone: () => void;
  onEdit: () => void;
  onVoid: () => void;
  onHistory: () => void;
  loading: boolean;
};

export function RecordDetailModal({ record, onDone, onEdit, onVoid, onHistory, loading }: RecordDetailModalProps) {
  return (
    <>
      <p className="eyebrow">{recordTypeLabels[record.type]} · {recordSourceLabels[record.source]}</p><h2 id="action-dialog-title">{record.title}</h2>
      <div className="detail-meta"><span><small>Record Date</small><b>{formatDate(record.occurredAt)}</b></span><span><small>Data Source</small><b>{record.organization ?? recordSourceLabels[record.source]}</b></span><span><small>Status</small><b>{recordStatus(record)}</b></span></div>
      <div className="detail-copy"><strong>Record Summary</strong><p>{record.description || 'No details were provided.'}</p></div>
      {record.voidedAt && <div className="version-note" role="status"><span>Voided · {new Date(record.voidedAt).toLocaleString()}</span><p>{record.voidReason}</p><p>This record is retained for reference and cannot be edited.</p></div>}
      <div className="version-note"><span>Version {record.version}</span><p>Created {formatDateTime(record.createdAt)} · Last updated {formatDateTime(record.updatedAt)}</p></div>
      <div className="modal-actions"><button className="secondary" type="button" disabled={loading} onClick={onHistory}>Version History</button>{!record.voidedAt && <><button className="primary" type="button" disabled={loading} onClick={onEdit}>Edit Record</button><button className="danger" type="button" disabled={loading} onClick={onVoid}>Void Record</button></>}<button className="secondary" type="button" data-modal-initial-focus="true" onClick={onDone}>Done</button></div>
    </>
  );
}
