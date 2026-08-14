import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { BottomNav } from '@/components/Layout/BottomNav';
import { FloatingSession } from '@/components/Layout/FloatingSession';
import { WechatFloatingGuide } from '@/components/WechatFloatingGuide';
import { TodayPlan } from '@/pages/TodayPlan';
import { Plans } from '@/pages/Plans';
import { TemplateManager } from '@/pages/TemplateManager';
import { ImportPlan } from '@/pages/ImportPlan';
import { Settings } from '@/pages/Settings';
import { AdminSettings } from '@/pages/AdminSettings';
import { Login } from '@/pages/Login';
import { ShareDetail } from '@/pages/ShareDetail';
import { CardSkeleton } from '@/components/CardSkeleton';

import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTrainingStore } from '@/store/trainingStore';
import { unlockAudio } from '@/utils/wechat';

const ROUTER_BASENAME = import.meta.env.VITE_DEPLOY_TARGET === 'gh-pages' ? '/football-training-assistant' : '/';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true, state: { from: location.pathname + location.search } });
    }
  }, [user, location, navigate]);
  
  if (!user) {
    return null;
  }
  return <>{children}</>;
}



function AppContent() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const syncFromServer = useTrainingStore((s) => s.syncFromServer);
  const synced = useTrainingStore((s) => s.synced);
  const syncError = useTrainingStore((s) => s.syncError);
  const templates = useTrainingStore((s) => s.templates);

  // 首次启动时，等 syncFromServer 完成再渲染页面
  // 如果已有缓存数据（templates 不为空），则先显示缓存数据，同步完成后自动更新
  const showLoading = user && !synced && templates.length === 0 && !syncError;

  useEffect(() => {
    if (!user) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncFromServer();
      }
    };
    const handleWindowFocus = () => {
      syncFromServer();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [user, syncFromServer]);

  if (showLoading) {
    return (
      <div className="mx-auto max-w-2xl p-4 bg-theme-bg">
        <div className="mb-4 h-8 w-32 rounded-lg bg-gray-100 animate-shimmer" />
        <CardSkeleton count={4} />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto min-h-screen w-full">
        {syncError && templates.length > 0 && (
          <div className="mx-auto max-w-2xl px-4 pt-4">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
              ⚠️ 数据同步失败（{syncError}），当前显示的是离线缓存数据
            </div>
          </div>
        )}
        <div key={location.pathname} className="animate-route-fade">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/share/:planId" element={<RequireAuth><ShareDetail /></RequireAuth>} />
            <Route path="/" element={<RequireAuth><TodayPlan /></RequireAuth>} />
            <Route path="/schedule" element={<RequireAuth><Plans /></RequireAuth>} />
            <Route path="/templates" element={<RequireAuth><TemplateManager /></RequireAuth>} />
            <Route path="/import" element={<RequireAuth><ImportPlan /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/youyouyoujianchuiyan-settings" element={<RequireAuth><AdminSettings /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      {user && !location.pathname.startsWith('/share/') && <BottomNav />}
      {user && !location.pathname.startsWith('/share/') && <FloatingSession />}
    </>
  );
}

function App() {
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    unlockAudio();
  }, []);

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text">
      <Router basename={ROUTER_BASENAME}>
        <AppContent />
        <WechatFloatingGuide />
      </Router>
      <audio id="audio-context-bootstrap" className="hidden" aria-hidden />
      <span data-settings-ready={String(settings.speechEnabled)} className="hidden" aria-hidden />
    </div>
  );
}

export default App;
