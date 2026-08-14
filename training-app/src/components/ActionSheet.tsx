import { useEffect } from 'react';

export type ActionSheetItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
};

type Props = {
  open: boolean;
  items: ActionSheetItem[];
  onCancel: () => void;
  title?: string;
};

export function ActionSheet({ open, items, onCancel, title }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div
        className="relative w-full max-w-2xl rounded-t-2xl bg-white p-3 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-2 px-3 py-1.5 text-center text-xs font-medium text-theme-text-muted">
            {title}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                item.onClick();
                onCancel();
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors ${
                item.danger
                  ? 'text-theme-danger hover:bg-theme-danger/10'
                  : 'text-theme-text hover:bg-theme-bg-hover'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        <div className="my-2 h-px bg-theme-border" />
        <button
          onClick={onCancel}
          className="w-full rounded-xl py-3 text-sm font-medium text-theme-text-secondary hover:bg-theme-bg-hover"
        >
          取消
        </button>
      </div>
    </div>
  );
}
