import { memo } from 'react';
import { useAppStore, Toast } from '../store';

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const color =
    toast.kind === 'success'
      ? 'bg-accent text-on-accent'
      : toast.kind === 'error'
        ? 'bg-danger text-on-danger'
        : 'bg-bg-elev text-fg border border-muted/40';

  return (
    <button
      onClick={() => onDismiss(toast.id)}
      className={`${color} text-[11px] px-2.5 py-1.5 rounded shadow-lg max-w-full text-left`}
      style={{ animation: 'toast-in 180ms ease-out' }}
    >
      {toast.message}
    </button>
  );
}

function ToasterBase() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-8 left-0 right-0 z-40 flex flex-col items-center gap-1 px-2">
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismissToast} />
        </div>
      ))}
    </div>
  );
}

export const Toaster = memo(ToasterBase);
