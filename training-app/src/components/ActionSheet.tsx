import { useEffect, useRef } from 'react';

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
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // 打开前先锁 body 滚动，防止 viewport 高度变化导致面板位置跳动
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.touchAction = 'none';

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);

    const preventDefault = (e: TouchEvent) => {
      if (e.target && panelRef.current && panelRef.current.contains(e.target as Node)) return;
      e.preventDefault();
    };
    // 阻止遮罩上的 touchmove 穿透滚动页面
    window.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchmove', preventDefault);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] block"
      style={{ pointerEvents: 'auto' }}
      onClick={onCancel}
    >
      {/* 遮罩：绝对定位贴满全屏，拦截点击 */}
      <div
        className="absolute inset-0 bg-black/45 animate-fade-in"
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
      />
      {/* 面板：absolute bottom-0 直接贴底，动画从屏外滑入，避免 flex items-end + 锁 body 滚动产生的跳动 */}
      <div
        ref={panelRef}
        className="absolute bottom-0 left-1/2 w-full max-w-2xl -translate-x-1/2 rounded-t-2xl bg-white p-3 shadow-2xl animate-slide-up"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
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
              onClick={(e) => {
                e.stopPropagation();
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
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="w-full rounded-xl py-3 text-sm font-medium text-theme-text-secondary hover:bg-theme-bg-hover"
        >
          取消
        </button>
      </div>
    </div>
  );
}
