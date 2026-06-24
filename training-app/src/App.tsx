import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { BottomNav } from '@/components/Layout/BottomNav';
import { TodayPlan } from '@/pages/TodayPlan';
import { SessionTimer } from '@/pages/SessionTimer';
import { Plans } from '@/pages/Plans';
import { TemplateManager } from '@/pages/TemplateManager';
import { ImportPlan } from '@/pages/ImportPlan';
import { Settings } from '@/pages/Settings';
import { Login } from '@/pages/Login';
import { UserMenu } from '@/components/Layout/UserMenu';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function App() {
  const user = useAuthStore((s) => s.user);
  const settings = useSettingsStore((s) => s.settings);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Router>
        {user && <UserMenu />}
        <div className="mx-auto min-h-screen w-full">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RequireAuth><TodayPlan /></RequireAuth>} />
            <Route
              path="/session"
              element={
                <RequireAuth>
                  <SessionTimer onBack={() => window.history.back()} />
                </RequireAuth>
              }
            />
            <Route path="/plans" element={<RequireAuth><Plans /></RequireAuth>} />
            <Route path="/templates" element={<RequireAuth><TemplateManager /></RequireAuth>} />
            <Route path="/import" element={<RequireAuth><ImportPlan /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {user && <BottomNav />}
      </Router>
      <audio id="audio-context-bootstrap" className="hidden" aria-hidden />
      <span data-settings-ready={String(settings.speechEnabled)} className="hidden" aria-hidden />
    </div>
  );
}

export default App;
