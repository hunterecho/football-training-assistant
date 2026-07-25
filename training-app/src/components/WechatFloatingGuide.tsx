import { useState, useEffect } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { isWechatBrowser, getWechatFloatingGuideText } from '@/utils/wechat';

export function WechatFloatingGuide() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isWechatBrowser()) return;
    
    const key = 'wechat_floating_guide_dismissed';
    const wasDismissed = localStorage.getItem(key);
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const timer = setTimeout(() => {
      setVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem('wechat_floating_guide_dismissed', '1');
  };

  if (!visible || dismissed || !isWechatBrowser()) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-theme-border/50 overflow-hidden">
        <div className="bg-gradient-to-r from-theme-accent/10 to-theme-accent/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-theme-accent/20 flex items-center justify-center">
              <Maximize2 className="w-4 h-4 text-theme-accent" />
            </div>
            <span className="text-sm font-semibold text-theme-text">微信浮窗功能</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-theme-text-muted hover:text-theme-text-secondary transition-colors p-1"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-theme-text-secondary leading-relaxed">
            {getWechatFloatingGuideText()}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-theme-text-muted">
            <div className="flex items-center gap-1">
              <span className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-[10px]">···</span>
              <span>点击右上角</span>
            </div>
            <span className="text-theme-border">→</span>
            <div className="flex items-center gap-1">
              <span className="w-5 h-5 rounded bg-theme-accent/10 flex items-center justify-center text-[10px] text-theme-accent">浮</span>
              <span>选择浮窗</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
