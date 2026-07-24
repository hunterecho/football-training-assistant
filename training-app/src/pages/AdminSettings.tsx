import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  Crown,
  Save,
  RotateCcw,
  Settings as SettingsIcon,
  Sparkles,
  AlertTriangle,
  Check,
} from 'lucide-react';

type LLMProvider = 'none' | 'dashscope' | 'openai' | 'custom';

interface LLMSettings {
  provider: LLMProvider;
  endpoint: string;
  apiKey: string;
  model: string;
}

interface SystemSettings {
  llm: LLMSettings;
  trialCount: number;
}

export function AdminSettings() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SystemSettings>({
    llm: {
      provider: 'none',
      endpoint: '',
      apiKey: '',
      model: '',
    },
    trialCount: 3,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'admin') {
      navigate('/');
      return;
    }
    loadSettings();
  }, [user, navigate]);

  const loadSettings = async () => {
    try {
      const llmRes = await api.get<{ value: LLMSettings }>('/settings/system/llm_config');
      const trialRes = await api.get<{ value: number }>('/settings/system/trial_count');
      
      if (llmRes.data?.value) {
        setSettings((prev) => ({ ...prev, llm: llmRes.data.value }));
      }
      if (trialRes.data?.value !== undefined) {
        setSettings((prev) => ({ ...prev, trialCount: trialRes.data.value }));
      }
    } catch {
      // ignore errors, use defaults
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.put('/settings/system/llm_config', { value: settings.llm });
      await api.put('/settings/system/trial_count', { value: settings.trialCount });
      setMessage({ type: 'success', text: '设置已保存' });
    } catch {
      setMessage({ type: 'error', text: '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = () => {
    if (confirm('确定要重置所有系统设置吗？')) {
      setSettings({
        llm: { provider: 'none', endpoint: '', apiKey: '', model: '' },
        trialCount: 3,
      });
      setMessage(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex h-64 w-full max-w-2xl items-center justify-center">
        <div className="text-theme-text-muted">加载中...</div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6">
        <div className="rounded-2xl border border-theme-danger/30 bg-theme-danger/10 p-6 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-theme-danger" />
          <div className="mt-4 text-lg font-semibold text-theme-danger">无权限访问</div>
          <div className="mt-2 text-sm text-theme-text-muted">请使用管理员账号登录</div>
          <button
            onClick={() => navigate('/')}
            className="mt-4 rounded-lg bg-theme-accent px-4 py-2 text-white text-sm font-medium hover:bg-theme-accent-hover"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="px-4 pt-6">
        <div className="flex items-center gap-3">
          <Crown className="h-8 w-8 text-theme-warning" />
          <div>
            <h1 className="text-2xl font-bold text-theme-text">系统管理</h1>
            <p className="mt-0.5 text-sm text-theme-text-muted">管理员专用配置页面</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4 px-4">
        <section className="theme-card">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
            <Sparkles className="h-3 w-3" />
            LLM 服务配置
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-theme-text-muted">服务商</span>
              <select
                value={settings.llm.provider}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    llm: { ...prev.llm, provider: e.target.value as LLMProvider },
                  }))
                }
                className="mt-1 w-full theme-input"
              >
                <option value="none">不使用（仅规则解析）</option>
                <option value="dashscope">阿里云 DashScope</option>
                <option value="openai">OpenAI 兼容</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            {settings.llm.provider !== 'none' && (
              <>
                <label className="block">
                  <span className="text-xs text-theme-text-muted">接口地址</span>
                  <input
                    value={settings.llm.endpoint}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        llm: { ...prev.llm, endpoint: e.target.value },
                      }))
                    }
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
                    className="mt-1 w-full theme-input"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-theme-text-muted">API Key</span>
                  <input
                    type="password"
                    value={settings.llm.apiKey}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        llm: { ...prev.llm, apiKey: e.target.value },
                      }))
                    }
                    placeholder="sk-..."
                    className="mt-1 w-full theme-input"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-theme-text-muted">模型</span>
                  <input
                    value={settings.llm.model}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        llm: { ...prev.llm, model: e.target.value },
                      }))
                    }
                    placeholder="qwen-plus 或 gpt-4o-mini"
                    className="mt-1 w-full theme-input"
                  />
                </label>
              </>
            )}
            <div className="rounded-lg bg-theme-bg-hover p-2 text-[11px] text-theme-text-muted">
              ⚠️ API Key 仅存储在服务端，不会暴露给前端
            </div>
          </div>
        </section>

        <section className="theme-card">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
            <SettingsIcon className="h-3 w-3" />
            试用设置
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-theme-text-muted">免费试用次数</span>
              <input
                type="number"
                min={0}
                max={100}
                value={settings.trialCount}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    trialCount: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
                className="mt-1 w-full theme-input"
              />
            </label>
            <div className="rounded-lg bg-theme-bg-hover p-2 text-[11px] text-theme-text-muted">
              设置为 0 表示关闭试用功能，用户必须是 VIP 会员才能使用 LLM 解析
            </div>
          </div>
        </section>

        {message && (
          <div
            className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
              message.type === 'success'
                ? 'border border-theme-success/30 bg-theme-success/10 text-theme-success'
                : 'border border-theme-danger/30 bg-theme-danger/10 text-theme-danger'
            }`}
          >
            {message.type === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-theme-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-theme-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存设置'}
          </button>
          <button
            onClick={resetSettings}
            className="flex items-center justify-center gap-2 rounded-xl border border-theme-border bg-theme-bg-card text-theme-text-secondary px-4 py-2.5 text-sm font-medium hover:bg-theme-bg-hover"
          >
            <RotateCcw className="h-4 w-4" />
            重置
          </button>
        </div>
      </div>
    </div>
  );
}