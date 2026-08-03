import { useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore, themes, type ThemeConfig } from '@/store/themeStore';
import { cn } from '@/lib/utils';
import {
  Volume2,
  Gauge,
  Moon,
  Wrench,
  Trash2,
  Download,
  Upload,
  Lock,
  Palette,
  LogOut,
  UserCircle2,
  Check,
  Bug,
  Play,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useTrainingStore } from '@/store/trainingStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { isWechatBrowser } from '@/utils/wechat';
import { playAudioUrl } from '@/utils/audioPlayer';
import type { Template } from '@/types';

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);
  const templates = useTrainingStore((s) => s.templates);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetSession = useTrainingStore((s) => s.resetSession);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const hasPremiumAccess = user?.role === 'admin' || user?.role === 'premium';
  const [showDebug, setShowDebug] = useState(false);

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
    a.download = `footgo-train-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

        <section className="theme-card">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="flex w-full items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted"
          >
            <Bug className="h-3 w-3" />
            语音调试 {showDebug ? '▾' : '▸'}
          </button>

          {showDebug && <TtsDebugPanel />}
        </section>

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
          足Go棒训练助手 · v1.0
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

/**
 * TTS 语音调试面板
 * - 清除缓存（localStorage + sessionStorage + caches API）
 * - 测试 TTS 预生成和音频播放
 * - 显示环境信息和 audioMap 状态
 */
function TtsDebugPanel() {
  const token = useAuthStore((s) => s.token);
  const audioManifest = useTrainingStore((s) => s.audioManifest);
  const setAudioManifest = useTrainingStore((s) => s.setAudioManifest);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string>('');

  const isWechat = isWechatBrowser();
  const audioMapSize = audioManifest?.audioMap ? Object.keys(audioManifest.audioMap).length : 0;
  const manifestVoice = audioManifest?.voice ?? '无';

  const handleClearCache = async () => {
    setClearing(true);
    setClearResult('清除中...');
    try {
      // 1. 清除 localStorage 中与训练/audio相关的数据
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('coach-train') || key.includes('audio') || key.includes('tts'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // 2. 清除 sessionStorage
      sessionStorage.clear();

      // 3. 清除 Cache API（Service Worker 缓存）
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // 4. 清除 audioManifest
      setAudioManifest(null);

      const msg = `已清除 ${keysToRemove.length} 项 localStorage + sessionStorage + caches`;
      setClearResult(msg);
      setTestResult('');
    } catch (err) {
      setClearResult(`清除失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClearing(false);
    }
  };

  const handleTestTts = async () => {
    setTesting(true);
    setTestResult('测试中...');
    try {
      if (!token) {
        setTestResult('未登录，无法测试');
        return;
      }

      // 调用预生成 API
      const res = await api.post<{ success: boolean; manifest: typeof audioManifest; cached?: boolean }>('/tts/pregenerate', {
        drills: [{ title: '测试环节', duration: 60, summary: '测试摘要', cues: [{ text: '测试注意要点' }] }],
        restDuration: 30,
      });

      if (res.error) {
        setTestResult(`API错误: ${res.error}`);
        return;
      }

      if (!res.data?.manifest) {
        setTestResult('API返回空 manifest');
        return;
      }

      const manifest = res.data.manifest;
      const mapSize = manifest.audioMap ? Object.keys(manifest.audioMap).length : 0;
      setAudioManifest(manifest);

      // 尝试播放第一条音频
      const firstEntry = manifest.audioMap ? Object.values(manifest.audioMap)[0] : null;
      if (firstEntry) {
        setTestResult(`成功! voice=${manifest.voice} 音频数=${mapSize}\n正在播放: "${firstEntry.text}"`);
        try {
          await playAudioUrl(firstEntry.url, 1);
          setTestResult((prev) => prev + '\n播放完成 ✓');
        } catch {
          setTestResult((prev) => prev + '\n播放失败 (可能需要用户交互)');
        }
      } else {
        setTestResult(`成功但 audioMap 为空 voice=${manifest.voice}`);
      }
    } catch (err) {
      setTestResult(`测试失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-theme-border bg-theme-bg-card-subtle p-3">
      {/* 环境信息 */}
      <div className="space-y-1 text-xs text-theme-text-muted">
        <div className="flex items-center gap-2">
          <span className="font-medium text-theme-text">环境:</span>
          <span>{isWechat ? '微信' : '浏览器'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-theme-text">manifest:</span>
          <span>{audioManifest ? `已加载 (${audioMapSize} 条音频, ${manifestVoice})` : '未加载'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-theme-text">token:</span>
          <span>{token ? `已登录 (${token.length} 字符)` : '未登录'}</span>
        </div>
      </div>

      {/* 清除缓存按钮 */}
      <div className="space-y-1">
        <button
          onClick={handleClearCache}
          disabled={clearing}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-theme-warning/30 bg-theme-warning/10 px-3 py-2 text-sm text-theme-warning hover:bg-theme-warning/20 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${clearing ? 'animate-spin' : ''}`} />
          {clearing ? '清除中...' : '清除缓存（localStorage + caches）'}
        </button>
        {clearResult && (
          <div className="rounded bg-theme-bg-card p-2 text-xs text-theme-text-muted">
            {clearResult}
          </div>
        )}
        <p className="text-[10px] text-theme-text-muted">
          清除后请刷新页面（微信内可关闭页面重新打开）
        </p>
      </div>

      {/* TTS 测试按钮 */}
      <div className="space-y-1">
        <button
          onClick={handleTestTts}
          disabled={testing || !token}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-theme-accent/30 bg-theme-accent/10 px-3 py-2 text-sm text-theme-accent hover:bg-theme-accent/20 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {testing ? '测试中...' : '测试 TTS 语音生成与播放'}
        </button>
        {testResult && (
          <div className="whitespace-pre-wrap rounded bg-theme-bg-card p-2 text-xs text-theme-text-muted">
            {testResult}
          </div>
        )}
        {!token && (
          <div className="flex items-center gap-1 text-[10px] text-theme-warning">
            <AlertCircle className="h-3 w-3" />
            需要登录才能测试
          </div>
        )}
      </div>
    </div>
  );
}