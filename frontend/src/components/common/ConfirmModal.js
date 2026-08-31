export default function ConfirmModal({
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  disabled = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirmModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-modal-title">{title}</h2>
        <div className="modalBody">{children}</div>
        <div className="modalActions">
          <button className="button buttonGhost" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`button ${tone === 'danger' ? 'buttonDanger' : 'buttonPrimary'}`}
            type="button"
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
