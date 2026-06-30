import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { BottomNav } from '@/components/Layout/BottomNav';
import { FloatingSession } from '@/components/Layout/FloatingSession';
import { TodayPlan } from '@/pages/TodayPlan';
import { Plans } from '@/pages/Plans';
import { TemplateManager } from '@/pages/TemplateManager';
import { ImportPlan } from '@/pages/ImportPlan';
import { Settings } from '@/pages/Settings';
import { Login } from '@/pages/Login';
import { ShareDetail } from '@/pages/ShareDetail';
import { UserMenu } from '@/components/Layout/UserMenu';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTrainingStore } from '@/store/trainingStore';

const ROUTER_BASENAME = import.meta.env.VITE_DEPLOY_TARGET === 'gh-pages' ? '/football-training-assistant' : '/';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

function App() {
  const user = useAuthStore((s) => s.user);
  const settings = useSettingsStore((s) => s.settings);
  const syncFromServer = useTrainingStore((s) => s.syncFromServer);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Router basename={ROUTER_BASENAME}>
        {user && <UserMenu />}
        <div className="mx-auto min-h-screen w-full">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/share/:planId" element={<RequireAuth><ShareDetail /></RequireAuth>} />
            <Route path="/" element={<RequireAuth><TodayPlan /></RequireAuth>} />
            <Route path="/schedule" element={<RequireAuth><Plans /></RequireAuth>} />
            <Route path="/templates" element={<RequireAuth><TemplateManager /></RequireAuth>} />
            <Route path="/import" element={<RequireAuth><ImportPlan /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {user && !window.location.pathname.startsWith('/share/') && <BottomNav />}
        {user && !window.location.pathname.startsWith('/share/') && <FloatingSession />}
      </Router>
      <audio id="audio-context-bootstrap" className="hidden" aria-hidden />
      <span data-settings-ready={String(settings.speechEnabled)} className="hidden" aria-hidden />
    </div>
  );
}

export default App;
