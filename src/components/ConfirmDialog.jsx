export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', danger = false, busy = false,
  onConfirm, onCancel,
}) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">{title}</h3>
        <p className="sub">{message}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
