import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [visible, setVisible] = useState(open);
  const [mounted, setMounted] = useState(open);
  const bodyLockRef = useRef<{
    prevOverflow: string;
    prevPosition: string;
    prevTop: string;
    prevWidth: string;
    scrollY: number;
  } | null>(null);

  const lockBody = () => {
    if (bodyLockRef.current) return;
    // 防御性：先做一次无状态清理，防止其他组件/旧实例留下的脏 fixed 样式
    forceCleanupBodyLock();
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    bodyLockRef.current = { prevOverflow, prevPosition, prevTop, prevWidth, scrollY };
  };

  /**
   * 无状态、可安全重复调用的 body 锁清理。
   * 解决两类场景：
   *  1) 组件卸载 / 路由切换时 bodyLockRef 丢失，但 body 仍保留 fixed 样式 → 页面永远无法滚动
   *  2) 上一个实例异常退出留下的脏状态
   */
  const forceCleanupBodyLock = () => {
    if (typeof document === 'undefined') return;
    // 如果当前没有 lock 记录，但 body 却还是 position:fixed / overflow:hidden
    // → 说明是残留锁，做最保守的恢复：清掉相关内联样式，滚动位置尽量保留
    if (
      document.body.style.position === 'fixed' ||
      document.body.style.overflow === 'hidden'
    ) {
      // 优先用现存的 scrollY 记录恢复
      let restoreScrollY: number | null = null;
      if (bodyLockRef.current) {
        restoreScrollY = bodyLockRef.current.scrollY;
      } else if (document.body.style.top) {
        const topNum = parseInt(document.body.style.top, 10);
        if (!Number.isNaN(topNum)) restoreScrollY = -topNum;
      }
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (restoreScrollY != null) {
        try {
          window.scrollTo(0, restoreScrollY);
        } catch {
          /* ignore */
        }
      }
    }
  };

  const unlockBody = () => {
    const s = bodyLockRef.current;
    if (s) {
      document.body.style.overflow = s.prevOverflow;
      document.body.style.position = s.prevPosition;
      document.body.style.top = s.prevTop;
      document.body.style.width = s.prevWidth;
      window.scrollTo(0, s.scrollY);
      bodyLockRef.current = null;
    } else {
      // 没有本地记录，但仍尝试清理可能残留的锁（幂等安全网）
      forceCleanupBodyLock();
    }
  };

  useEffect(() => {
    if (open) {
      lockBody();
      setMounted(true);
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const id = window.setTimeout(() => {
        setMounted(false);
        unlockBody();
      }, 300);
      return () => {
        window.clearTimeout(id);
        // 关键：如果动画期间组件被销毁/下一次 effect 触发了清理，
        // 或者在等待 300ms 过程中快速再打开，都要先释放锁，避免残留
        unlockBody();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    const preventDefault = (e: TouchEvent) => {
      if (e.target && panelRef.current && panelRef.current.contains(e.target as Node)) return;
      e.preventDefault();
    };
    window.addEventListener('touchmove', preventDefault, { passive: false });
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchmove', preventDefault);
    };
  }, [visible, onCancel]);

  /**
   * 组件卸载兜底：无论 open 状态如何、有没有等待中的 setTimeout，
   * 只要组件销毁就强制释放 body 滚动锁。
   * 这是解决「路由切换/Tab 切换导致页面永久无法滚动」的关键修复。
   */
  useEffect(() => {
    return () => {
      unlockBody();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[80] block"
      onClick={onCancel}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/45"
        style={{
          pointerEvents: 'auto',
          touchAction: 'none',
          transition: 'opacity 200ms ease-out',
          opacity: visible ? 1 : 0,
        }}
      />
      {/*
        面板：
        - 用 mx-auto + left-0 + right-0 居中，避免用 -translate-x-1/2
        - 滑入仅用 translateY(百分比 = 面板自身高度)，纯 CSS transition
        - transform 不依赖 keyframes，不会出现覆盖/跳动
      */}
      <div
        ref={panelRef}
        className="absolute left-0 right-0 bottom-0 mx-auto w-full max-w-2xl rounded-t-2xl bg-white p-3 shadow-2xl"
        style={{
          pointerEvents: 'auto',
          transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
          transform: visible ? 'translateY(0%)' : 'translateY(100%)',
          paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-gray-200" />
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

  // 使用 Portal 渲染到 document.body，彻底脱离祖先元素的 transform 影响
  // 否则父级一旦有 transform（如 scale/translate），fixed 定位会变成相对父级而非视口，导致浮窗乱跳
  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
