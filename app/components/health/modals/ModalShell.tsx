import { forwardRef, type ReactNode } from 'react';

type ModalShellProps = {
  busy: boolean;
  error: string;
  children: ReactNode;
  onClose: () => void;
};

export const ModalShell = forwardRef<HTMLElement, ModalShellProps>(function ModalShell({ busy, error, children, onClose }, ref) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <section ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title" aria-describedby={error ? 'action-dialog-error' : undefined} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button>
        {error && <p id="action-dialog-error" role="alert" style={{ color: 'var(--red)', paddingRight: 34 }}>{error}</p>}
        {children}
      </section>
    </div>
  );
});
