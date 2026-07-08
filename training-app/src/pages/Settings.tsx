import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore, themes, type ThemeConfig } from '@/store/themeStore';
import { cn } from '@/lib/utils';
import {
  Volume2,
  Gauge,
  Moon,
  Wrench,
  KeyRound,
  Trash2,
  Copy,
  Download,
  Upload,
  Crown,
  Lock,
  Palette,
  LogOut,
  UserCircle2,
  Check,
} from 'lucide-react';
import { useTrainingStore } from '@/store/trainingStore';
import { useAuthStore } from '@/store/authStore';
import type { Template } from '@/types';

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const updateLLM = useSettingsStore((s) => s.updateLLM);
  const reset = useSettingsStore((s) => s.reset);
  const saveToBackend = useSettingsStore((s) => s.saveToBackend);
  const templates = useTrainingStore((s) => s.templates);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetSession = useTrainingStore((s) => s.resetSession);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const isAdmin = user?.role === 'admin';
  const hasPremiumAccess = user?.role === 'admin' || user?.role === 'premium'; // 预留付费会员角色

  const exportData = () => {
    const data = {
      templates,
      settings,
      exportedAt: Date.now(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coach-train-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        templates?: Template[];
        settings?: typeof settings;
      };
      if (Array.isArray(parsed.templates) && parsed.templates.length > 0) {
        useTrainingStore.setState({ templates: parsed.templates });
      }
      if (parsed.settings) {
        useSettingsStore.setState({ settings: { ...settings, ...parsed.settings } });
      }
      alert('导入成功');
    } catch {
      alert('导入失败，请检查文件格式');
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-theme-text">设置</h1>
      </div>

      <div className="mt-4 space-y-4 px-4">
        {/* 用户信息 */}
        <section className="theme-card">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-theme-accent/20">
              <UserCircle2 className="h-6 w-6 text-theme-accent" />
            </div>
            <div className="flex-1">
              <div className="text-base font-semibold text-theme-text">{user?.nickname}</div>
              <div className="flex items-center gap-2 text-xs text-theme-text-muted">
                {user?.role === 'admin' ? '管理员' : user?.role === 'premium' ? '会员' : '用户'}
                <span className="inline-flex items-center gap-0.5 rounded-full bg-theme-accent/20 px-1.5 py-0.5 text-[10px] text-theme-accent">
                  <Check className="h-2.5 w-2.5" />
                  已登录
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                resetSession();
              }}
              className="flex items-center gap-1.5 rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-3 py-2 text-sm text-theme-danger hover:bg-theme-danger/20"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </section>

        {/* 语音设置 */}
        <section className="theme-card">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
              <Volume2 className="h-3 w-3" />
              语音播报
            </div>

            <Toggle
              label="启用语音播报"
              desc="通过蓝牙耳机播报训练要点与倒计时"
              checked={settings.speechEnabled}
              onChange={(v) => update({ speechEnabled: v })}
            />

            <div className="mt-3">
              <div className="mb-1 flex items-center gap-2 text-sm text-theme-text">
                <Gauge className="h-4 w-4" />
                语速
                <span className="ml-auto text-xs text-theme-text-muted">
                  {settings.speechRate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.speechRate}
                onChange={(e) => update({ speechRate: parseFloat(e.target.value) })}
                className="w-full accent-theme-accent"
              />
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center gap-2 text-sm text-theme-text">
                音量
                <span className="ml-auto text-xs text-theme-text-muted">
                  {Math.round(settings.speechVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.speechVolume}
                onChange={(e) => update({ speechVolume: parseFloat(e.target.value) })}
                className="w-full accent-theme-accent"
              />
            </div>

            <Toggle
              label="环节切换提示音"
              desc="用 beep 音提示环节开始与结束"
              checked={settings.soundEnabled}
              onChange={(v) => update({ soundEnabled: v })}
            />

            <Toggle
              label="训练时保持屏幕常亮"
              desc="避免训练中屏幕自动熄灭"
              checked={settings.keepScreenAwake}
              onChange={(v) => update({ keepScreenAwake: v })}
            />
          </section>

          <section className="theme-card">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
              <Palette className="h-3 w-3" />
              主题换肤
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.values(themes) as ThemeConfig[]).map((theme) => {
                const isLocked = theme.vipOnly && !hasPremiumAccess;
                const isActive = currentTheme === theme.name;
                return (
                  <button
                    key={theme.name}
                    onClick={() => {
                      if (!isLocked) {
                        useThemeStore.getState().setTheme(theme.name);
                      }
                    }}
                    className={cn(
                      'relative flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all',
                      isActive
                        ? 'border-theme-accent bg-theme-accent text-white shadow-lg shadow-theme-accent/20'
                        : isLocked
                          ? 'border-theme-border bg-theme-bg-card-subtle text-theme-text-muted cursor-not-allowed opacity-50'
                          : 'border-theme-border bg-theme-bg-card text-theme-text hover:bg-theme-bg-hover'
                    )}
                    disabled={isLocked}
                  >
                    <span className="text-lg">{theme.icon}</span>
                    <span className="font-medium">{theme.label}</span>
                    {isLocked && (
                      <span className="absolute -right-1 -top-1">
                        <Lock className="h-4 w-4 text-theme-warning" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

        {!isAdmin && (
          <section className="theme-card">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
              <KeyRound className="h-3 w-3" />
              LLM 智能解析
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-theme-warning/30 bg-theme-warning/5 p-3">
              <Lock className="h-5 w-5 shrink-0 text-theme-warning" />
              <div className="flex-1">
                <div className="text-sm font-medium text-theme-warning">智能文档解析功能</div>
                <div className="text-xs text-theme-text-secondary">
                  开通会员即可使用AI智能解析训练文档
                </div>
              </div>
              <button className="rounded-lg bg-theme-warning px-3 py-1.5 text-xs font-medium text-white hover:bg-theme-warning/80">
                升级会员
              </button>
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="theme-card">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
              <Crown className="h-3 w-3" />
              LLM 服务配置（管理员）
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-theme-text-muted">服务商</span>
                <select
                  value={settings.llm.provider}
                  onChange={(e) =>
                    updateLLM({ provider: e.target.value as typeof settings.llm.provider })
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
                      value={settings.llm.endpoint ?? ''}
                      onChange={(e) => updateLLM({ endpoint: e.target.value })}
                      placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
                      className="mt-1 w-full theme-input"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-theme-text-muted">API Key</span>
                    <input
                      type="password"
                      value={settings.llm.apiKey ?? ''}
                      onChange={(e) => updateLLM({ apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="mt-1 w-full theme-input"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-theme-text-muted">模型</span>
                    <input
                      value={settings.llm.model ?? ''}
                      onChange={(e) => updateLLM({ model: e.target.value })}
                      placeholder="qwen-plus 或 gpt-4o-mini"
                      className="mt-1 w-full theme-input"
                    />
                  </label>
                </>
              )}
              <div className="rounded-lg bg-theme-bg-hover p-2 text-[11px] text-theme-text-muted">
                ⚠️ 此配置对所有用户生效，请谨慎修改
              </div>
            </div>
          </section>
        )}

        {/* 数据管理 */}
        <section className="theme-card">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
            <Wrench className="h-3 w-3" />
            数据管理
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={exportData}
              className="flex items-center justify-center gap-1.5 theme-button-secondary"
            >
              <Download className="h-4 w-4" />
              导出备份
            </button>
            <label className="flex cursor-pointer items-center justify-center gap-1.5 theme-button-secondary">
              <Upload className="h-4 w-4" />
              <span>导入备份</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importData(f);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              onClick={() => {
                const text = JSON.stringify(templates, null, 2);
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(text).then(
                    () => alert('已复制模板 JSON 到剪贴板'),
                    () => alert('复制失败')
                  );
                }
              }}
              className="flex items-center justify-center gap-1.5 theme-button-secondary"
            >
              <Copy className="h-4 w-4" />
              复制模板
            </button>
            <button
              onClick={async () => {
                try {
                  await saveToBackend();
                  alert('设置已保存到云端');
                } catch {
                  alert('保存失败');
                }
              }}
              className="flex items-center justify-center gap-1.5 theme-button-primary"
            >
              <Upload className="h-4 w-4" />
              保存到云端
            </button>
            <button
              onClick={() => {
                if (confirm('确定要重置所有设置吗？此操作不可恢复')) {
                  reset();
                }
              }}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-3 py-2 text-sm text-theme-danger hover:bg-theme-danger/20"
            >
              <Trash2 className="h-4 w-4" />
              重置设置
            </button>
          </div>
        </section>

        <div className="py-4 text-center text-xs text-theme-text-muted">
          <Moon className="mx-auto mb-1 h-4 w-4" />
          足球集训执行助手 · v1.0
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <div>
        <div className="text-sm text-theme-text">{label}</div>
        {desc && <div className="text-xs text-theme-text-muted">{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-theme-accent' : 'bg-theme-border'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-theme-bg-card shadow transition-all ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}
