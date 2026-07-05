import { AlertTriangle } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'danger' | 'default';
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  tone = 'danger',
}: Props) {
  if (!open) return null;
  const confirmClass =
    tone === 'danger'
      ? 'bg-theme-danger hover:bg-theme-danger text-white'
      : 'bg-theme-accent hover:bg-theme-accent-hover text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={
              tone === 'danger'
                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-danger/20 text-theme-danger'
                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-accent-light text-theme-text'
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-theme-text">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-theme-text-muted">{description}</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-theme-border bg-theme-bg-card py-2.5 text-sm text-theme-text-secondary hover:bg-theme-bg-card"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${confirmClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
