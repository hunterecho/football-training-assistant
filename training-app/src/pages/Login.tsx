import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useTrainingStore } from '@/store/trainingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { UserCircle2, LogIn, Dumbbell, MessageCircle } from 'lucide-react';

export function Login() {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wechatLoading, setWechatLoading] = useState(false);
  const [isWechatEnv, setIsWechatEnv] = useState(false);
  const login = useAuthStore((s) => s.login);
  const wechatLogin = useAuthStore((s) => s.wechatLogin);
  const syncFromServer = useTrainingStore((s) => s.syncFromServer);
  const loadSettings = useSettingsStore((s) => s.loadFromBackend);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as any)?.from || '/';

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsWechatEnv(ua.includes('micromessenger'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) {
      setError('请输入昵称');
      return;
    }
    setLoading(true);
    setError('');
    const result = await login(name);
    if (result.ok) {
      await syncFromServer();
      await loadSettings();
      navigate(redirectTo);
    } else {
      setError(result.error || '登录失败');
    }
    setLoading(false);
  };

  const handleWechatLogin = async () => {
    setWechatLoading(true);
    setError('');
    
    try {
      if (isWechatEnv && (window as any).wx) {
        (window as any).wx.login({
          success: async (res: { code: string }) => {
            const result = await wechatLogin(res.code);
            if (result.ok) {
              await syncFromServer();
              await loadSettings();
              navigate(redirectTo);
            } else {
              setError(result.error || '微信登录失败');
            }
            setWechatLoading(false);
          },
          fail: () => {
            setError('微信登录失败，请重试');
            setWechatLoading(false);
          },
        });
      } else {
        const mockCode = 'mock_wechat_code_' + Date.now();
        const result = await wechatLogin(mockCode);
        if (result.ok) {
          await syncFromServer();
          await loadSettings();
          navigate(redirectTo);
        } else {
          setError(result.error || '登录失败');
        }
        setWechatLoading(false);
      }
    } catch (err) {
      setError('登录异常');
      setWechatLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
            <Dumbbell className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">足球集训</h1>
          <p className="mt-1 text-sm text-slate-400">登录后即可开始今日训练</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <button
            type="button"
            onClick={handleWechatLogin}
            disabled={wechatLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 mb-4"
          >
            <MessageCircle className="h-4 w-4" />
            {wechatLoading ? '登录中...' : '微信登录'}
          </button>

          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">或</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          <label className="text-xs text-slate-400">教练/家长昵称</label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-emerald-500">
            <UserCircle2 className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="请输入您的昵称"
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
              autoFocus
            />
          </div>

          {error && (
            <div className="mt-2 text-xs text-rose-400">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {loading ? '登录中...' : '登录'}
          </button>

          <div className="mt-4 text-center text-[11px] text-slate-500">
            {isWechatEnv ? '建议使用微信登录' : '在微信中打开可使用微信登录'}
          </div>
        </form>
      </div>
    </div>
  );
}
