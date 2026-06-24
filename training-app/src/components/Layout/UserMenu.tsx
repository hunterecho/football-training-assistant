import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useTrainingStore } from '@/store/trainingStore';
import { UserCircle2, LogOut, Check } from 'lucide-react';

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetSession = useTrainingStore((s) => s.resetSession);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="fixed right-4 top-4 z-[60]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-sm text-slate-200 backdrop-blur hover:bg-slate-800"
      >
        <UserCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="max-w-[120px] truncate">{user.nickname}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 -z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
            <div className="border-b border-slate-800 px-3 py-2">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">
                当前用户
              </div>
              <div className="mt-0.5 text-sm font-semibold text-white">
                {user.nickname}
              </div>
              <div className="text-xs text-slate-500">
                {user.role === 'coach' ? '教练' : user.role === 'parent' ? '家长' : '用户'}
                <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  <Check className="h-2.5 w-2.5" />
                  已登录
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setOpen(false);
                logout();
                resetSession();
                navigate('/login', { replace: true });
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </>
      )}
    </div>
  );
}
