import type { HealthRecord } from '@/lib/client/api';
import { formatDate, formatDateTime, recordSourceLabels, recordStatus, recordTypeLabels } from '../utils';

type RecordDetailModalProps = {
  record: HealthRecord;
  onDone: () => void;
};

export function RecordDetailModal({ record, onDone }: RecordDetailModalProps) {
  return (
    <>
      <p className="eyebrow">{recordTypeLabels[record.type]} · {recordSourceLabels[record.source]}</p><h2 id="action-dialog-title">{record.title}</h2>
      <div className="detail-meta"><span><small>Record Date</small><b>{formatDate(record.occurredAt)}</b></span><span><small>Data Source</small><b>{record.organization ?? recordSourceLabels[record.source]}</b></span><span><small>Status</small><b>{recordStatus(record)}</b></span></div>
      <div className="detail-copy"><strong>Record Summary</strong><p>{record.description || 'No details were provided.'}</p></div>
      <div className="version-note"><span>Stored metadata</span><p>Created {formatDateTime(record.createdAt)} · Last updated {formatDateTime(record.updatedAt)}</p></div>
      <div className="modal-actions"><button className="secondary" type="button" disabled title="Version history is not currently available">Version History — Unavailable</button><button className="primary" type="button" data-modal-initial-focus="true" onClick={onDone}>Done</button></div>
    </>
  );
}
