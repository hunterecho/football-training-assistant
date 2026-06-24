import { useSettingsStore } from '@/store/settingsStore';
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
        <h1 className="text-2xl font-bold text-white">设置</h1>
      </div>

      <div className="mt-4 space-y-4 px-4">
        {/* 语音设置 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
            <Volume2 className="h-3 w-3" />
            语音播报
          </div>

          <Toggle
            label="启用语音播报"
            desc="通过蓝牙耳机播报教学话术与倒计时"
            checked={settings.speechEnabled}
            onChange={(v) => update({ speechEnabled: v })}
          />

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-300">
              <Gauge className="h-4 w-4" />
              语速
              <span className="ml-auto text-xs text-slate-500">
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
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-300">
              音量
              <span className="ml-auto text-xs text-slate-500">
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
              className="w-full accent-emerald-500"
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

        {!isAdmin && (
          /* LLM 服务入口（普通用户）- 预留升级会员入口 */
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              <KeyRound className="h-3 w-3" />
              LLM 智能解析
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <Lock className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-amber-200">智能文档解析功能</div>
                <div className="text-xs text-slate-400">
                  开通会员即可使用AI智能解析训练文档
                </div>
              </div>
              <button className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-amber-400">
                升级会员
              </button>
            </div>
          </section>
        )}

        {isAdmin && (
          /* LLM 配置（仅管理员可见） */
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              <Crown className="h-3 w-3" />
              LLM 服务配置（管理员）
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-slate-400">服务商</span>
                <select
                  value={settings.llm.provider}
                  onChange={(e) =>
                    updateLLM({ provider: e.target.value as typeof settings.llm.provider })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
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
                    <span className="text-xs text-slate-400">接口地址</span>
                    <input
                      value={settings.llm.endpoint ?? ''}
                      onChange={(e) => updateLLM({ endpoint: e.target.value })}
                      placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-400">API Key</span>
                    <input
                      type="password"
                      value={settings.llm.apiKey ?? ''}
                      onChange={(e) => updateLLM({ apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-400">模型</span>
                    <input
                      value={settings.llm.model ?? ''}
                      onChange={(e) => updateLLM({ model: e.target.value })}
                      placeholder="qwen-plus 或 gpt-4o-mini"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                    />
                  </label>
                </>
              )}
              <div className="rounded-lg bg-slate-950/60 p-2 text-[11px] text-slate-500">
                ⚠️ 此配置对所有用户生效，请谨慎修改
              </div>
            </div>
          </section>
        )}

        {/* 数据管理 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
            <Wrench className="h-3 w-3" />
            数据管理
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={exportData}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              <Download className="h-4 w-4" />
              导出备份
            </button>
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
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
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
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
              className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
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
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/20"
            >
              <Trash2 className="h-4 w-4" />
              重置设置
            </button>
          </div>
        </section>

        <div className="py-4 text-center text-xs text-slate-600">
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
        <div className="text-sm text-slate-200">{label}</div>
        {desc && <div className="text-xs text-slate-500">{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-slate-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}
