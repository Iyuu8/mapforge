import { X } from 'lucide-react';

export default function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toastStack" aria-live="polite">
      {toasts.map((toast) => (
        <article className={`toast toast-${toast.tone || 'info'}`} key={toast.id}>
          <div>
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </article>
      ))}
    </div>
  );
}
