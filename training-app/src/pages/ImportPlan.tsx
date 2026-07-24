import { useRef, useState, useEffect } from 'react';
import { useTrainingStore } from '@/store/trainingStore';
import { parseMarkdownDocument, type ParseWarning } from '@/utils/docParser';
import { drillInputsToTemplate } from '@/utils/llmParser';
import type { DrillInput } from '@/types';
import { formatDurationChinese } from '@/utils/duration';
import { exampleMarkdownDoc } from '@/data/defaultTemplate';
import { api } from '@/lib/api';
import {
  Upload,
  FileText,
  Wand2,
  Sparkles,
  AlertTriangle,
  Save,
  RotateCcw,
  FileUp,
  Crown,
  Gift,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'parsing' | 'done' | 'error';

interface TrialStatus {
  isAdmin: boolean;
  isPremium: boolean;
  remainingTrials: number;
  trialLimit: number;
  canUseLLM: boolean;
}

export function ImportPlan() {
  const addTemplate = useTrainingStore((s) => s.addTemplate);
  const setActiveTemplate = useTrainingStore((s) => s.setActiveTemplate);

  const [rawText, setRawText] = useState<string>('');
  const [status, setStatus] = useState<Status>('idle');
  const [parsingMode, setParsingMode] = useState<'rule' | 'llm'>('rule');
  const [drills, setDrills] = useState<DrillInput[]>([]);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [error, setError] = useState<string>('');
  const [templateName, setTemplateName] = useState<string>('');
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [trialUpdated, setTrialUpdated] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTrialStatus();
  }, [trialUpdated]);

  const loadTrialStatus = async () => {
    const res = await api.get<TrialStatus>('/llm-proxy/trial-status');
    if (res.data) {
      setTrialStatus(res.data);
    }
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      setRawText(text);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const h1Match = text.match(/^\s*#\s+(.+?)(?:\n|$)/m);
      setTemplateName(h1Match ? h1Match[1].trim() : baseName);
      setStatus('idle');
      setDrills([]);
      setWarnings([]);
      setError('');
    } catch {
      setError('无法读取该文件，请使用 .txt 或 .md 格式');
      setStatus('error');
    }
  };

  const extractTitle = (text: string): string => {
    const h1Match = text.match(/^\s*#\s+(.+?)(?:\n|$)/m);
    if (h1Match) return h1Match[1].trim();
    const firstLine = text.split(/\r?\n/).map(l => l.trim()).find(l => l);
    if (firstLine && firstLine.length <= 30) return firstLine;
    return '';
  };

  const runParse = async () => {
    if (!rawText.trim()) {
      setError('请先粘贴或上传训练文档');
      setStatus('error');
      return;
    }

    if (parsingMode === 'llm' && trialStatus && !trialStatus.canUseLLM) {
      setError('试用次数已用完，请升级为会员继续使用智能解析功能');
      setStatus('error');
      return;
    }

    setStatus('parsing');
    setError('');
    setWarnings([]);
    try {
      const detectedTitle = extractTitle(rawText);
      const effectiveName = templateName || detectedTitle || '导入的训练计划';
      if (parsingMode === 'llm') {
        const res = await api.post<{
          success: boolean;
          data: { drills: DrillInput[]; warnings: string[] };
          remainingTrials: number;
        }>('/llm-proxy/parse', { source: rawText });
        if (!res.data || !res.data.success) {
          throw new Error(res.error || '解析失败');
        }
        setDrills(res.data.data.drills);
        setWarnings(res.data.data.warnings);
        setTrialUpdated((prev) => !prev);
      } else {
        const res = parseMarkdownDocument(rawText, effectiveName);
        const inputs: DrillInput[] = res.template.drills.map((d) => ({
          drillName: d.title,
          durationSeconds: d.duration,
          summary: d.summary,
          cues: d.cues.map((c) => c.text),
        }));
        setDrills(inputs);
        setWarnings(res.warnings);
        if (effectiveName && !templateName) setTemplateName(effectiveName);
      }
      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  };

  const useExample = () => {
    setRawText(exampleMarkdownDoc);
    setTemplateName('示例：7 月 15 日训练计划');
    setStatus('idle');
    setDrills([]);
    setWarnings([]);
    setError('');
  };

  const updateDrill = (idx: number, patch: Partial<DrillInput>) => {
    setDrills((list) => list.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const moveDrill = (idx: number, dir: -1 | 1) => {
    const next = [...drills];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setDrills(next);
  };

  const removeDrill = (idx: number) => {
    setDrills((list) => list.filter((_, i) => i !== idx));
  };

  const addDrillRow = () => {
    setDrills((list) => [
      ...list,
      { drillName: '新环节', durationSeconds: 300, cues: [] },
    ]);
  };

  const saveTemplate = () => {
    if (drills.length === 0) {
      setError('没有可保存的环节');
      setStatus('error');
      return;
    }
    const tplName = templateName || '导入的训练计划';
    const tpl = drillInputsToTemplate(drills, tplName);
    addTemplate(tpl);
    setActiveTemplate(tpl.id);
    setRawText('');
    setDrills([]);
    setWarnings([]);
    setStatus('idle');
  };

  const canUseLLM = trialStatus?.canUseLLM ?? false;

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-theme-text">文档导入</h1>
        <p className="mt-1 text-sm text-theme-text-muted">
          把你的训练计划文档交给 AI 解析，自动生成训练模板
        </p>
      </div>

      <div className="mt-4 space-y-4 px-4">
        {trialStatus && parsingMode === 'llm' && (
          <div
            className={cn(
              'rounded-xl p-3 text-xs',
              trialStatus.isAdmin || trialStatus.isPremium
                ? 'border border-theme-accent/30 bg-theme-accent-light'
                : trialStatus.remainingTrials > 0
                  ? 'border border-theme-warning/30 bg-theme-warning/5'
                  : 'border border-theme-danger/30 bg-theme-danger/10'
            )}
          >
            <div className="flex items-center gap-2">
              {trialStatus.isAdmin || trialStatus.isPremium ? (
                <Crown className="h-4 w-4 text-theme-accent" />
              ) : trialStatus.remainingTrials > 0 ? (
                <Gift className="h-4 w-4 text-theme-warning" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-theme-danger" />
              )}
              <div>
                {trialStatus.isAdmin || trialStatus.isPremium ? (
                  <span className="text-theme-accent font-medium">会员专属</span>
                ) : trialStatus.remainingTrials > 0 ? (
                  <span className="text-theme-warning font-medium">
                    免费试用中：还剩 {trialStatus.remainingTrials} 次（共 {trialStatus.trialLimit} 次）
                  </span>
                ) : (
                  <span className="text-theme-danger font-medium">试用次数已用完</span>
                )}
                <div className={cn('mt-0.5', trialStatus.isAdmin || trialStatus.isPremium ? 'text-theme-text-secondary' : trialStatus.remainingTrials > 0 ? 'text-theme-text-muted' : 'text-theme-text-secondary')}>
                  {trialStatus.isAdmin || trialStatus.isPremium
                    ? '智能解析功能无限制使用'
                    : trialStatus.remainingTrials > 0
                      ? '每次使用消耗一次试用机会'
                      : '升级为会员即可继续使用智能解析功能'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-theme-border bg-theme-bg-card-light p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
            <FileText className="h-3 w-3" />
            第 1 步 · 上传或粘贴文档
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-bg-card px-3 py-1.5 text-sm text-theme-text-secondary hover:border-theme-accent"
            >
              <FileUp className="h-4 w-4" />
              选择文件
            </button>
            <button
              onClick={useExample}
              className="flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-bg-card px-3 py-1.5 text-sm text-theme-text-secondary hover:border-theme-accent"
            >
              <Sparkles className="h-4 w-4" />
              使用示例
            </button>
            {rawText && (
              <button
                onClick={() => {
                  setRawText('');
                  setDrills([]);
                  setStatus('idle');
                }}
                className="flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-bg-card px-3 py-1.5 text-sm text-theme-text-muted hover:border-theme-danger/50 hover:text-theme-danger"
              >
                <RotateCcw className="h-4 w-4" />
                清空
              </button>
            )}
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="把训练计划的文本粘贴到这里…支持 Markdown、纯文本、自然语言段落"
            className="mt-2 h-40 w-full resize-y rounded-lg border border-theme-border bg-theme-bg-card p-3 text-sm text-theme-text-secondary outline-none placeholder:text-theme-text-muted focus:border-theme-accent/50"
          />
        </div>

        <div className="rounded-2xl border border-theme-border bg-theme-bg-card-light p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
            <Wand2 className="h-3 w-3" />
            第 2 步 · 选择解析方式
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setParsingMode('rule')}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                parsingMode === 'rule'
                  ? 'border-theme-accent bg-theme-accent text-white'
                  : 'border-theme-border bg-theme-bg-card text-theme-text-secondary hover:border-theme-accent hover:bg-theme-accent-light'
              )}
            >
              规则解析（离线）
              <div className={cn('mt-0.5 text-[11px] font-normal', parsingMode === 'rule' ? 'text-white/80' : 'text-theme-text-muted')}>
                快速、稳定，支持 Markdown 与常见格式
              </div>
            </button>
            <button
              onClick={() => setParsingMode('llm')}
              disabled={!canUseLLM}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                parsingMode === 'llm'
                  ? 'border-theme-accent bg-theme-accent text-white'
                  : !canUseLLM
                    ? 'border-theme-border bg-theme-bg-card text-theme-text-muted cursor-not-allowed opacity-50'
                    : 'border-theme-border bg-theme-bg-card text-theme-text-secondary hover:border-theme-accent hover:bg-theme-accent-light'
              )}
            >
              LLM 智能解析
              <div className={cn('mt-0.5 text-[11px] font-normal', parsingMode === 'llm' ? 'text-white/80' : 'text-theme-text-muted')}>
                {canUseLLM ? 'AI 智能理解，支持更自由的格式' : '试用次数已用完'}
              </div>
            </button>
          </div>
          <button
            onClick={() => void runParse()}
            disabled={!rawText.trim() || status === 'parsing' || (parsingMode === 'llm' && !canUseLLM)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-theme-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-theme-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {status === 'parsing' ? '解析中…' : '解析文档'}
          </button>
          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-theme-danger/30 hover:bg-theme-danger/10 p-2 text-xs text-theme-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {status === 'done' && (
          <div className="rounded-2xl border border-theme-border bg-theme-bg-card-light p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                <Sparkles className="h-3 w-3" />
                第 3 步 · 预览与微调（{drills.length} 个环节）
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="mb-2 rounded-lg border border-theme-warning/30 bg-theme-warning/5 p-2 text-xs text-theme-warning">
                <div className="mb-0.5 font-medium">提示</div>
                <ul className="list-disc space-y-0.5 pl-4">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="模板名称"
              className="mb-2 w-full rounded-lg border border-theme-border bg-theme-bg-card px-3 py-2 text-sm text-theme-text outline-none focus:border-theme-accent/50"
            />

            <div className="space-y-2">
              {drills.map((d, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-theme-border bg-theme-bg-card-subtle p-2"
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveDrill(idx, -1)}
                      disabled={idx === 0}
                      className="rounded px-1.5 py-0.5 text-xs text-theme-text-muted hover:bg-theme-bg-card disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDrill(idx, 1)}
                      disabled={idx >= drills.length - 1}
                      className="rounded px-1.5 py-0.5 text-xs text-theme-text-muted hover:bg-theme-bg-card disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <input
                      value={d.drillName}
                      onChange={(e) => updateDrill(idx, { drillName: e.target.value })}
                      className="flex-1 rounded-md bg-theme-bg-card px-2 py-1 text-sm text-theme-text outline-none"
                      placeholder="环节名称"
                    />
                    <input
                      type="number"
                      value={d.durationSeconds}
                      onChange={(e) =>
                        updateDrill(idx, {
                          durationSeconds: Math.max(1, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-16 rounded-md bg-theme-bg-card px-2 py-1 text-sm text-theme-text outline-none"
                      min={1}
                      step={1}
                    />
                    <span className="text-xs text-theme-text-muted">
                      {formatDurationChinese(d.durationSeconds)}
                    </span>
                    <button
                      onClick={() => removeDrill(idx)}
                      className="rounded px-1.5 py-0.5 text-xs text-theme-danger hover:bg-theme-danger/20"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    value={d.summary ?? ''}
                    onChange={(e) => updateDrill(idx, { summary: e.target.value })}
                    className="mt-1.5 w-full rounded-md bg-theme-bg-card px-2 py-1 text-xs text-theme-text-secondary outline-none"
                    placeholder="一句话简介（可选）"
                  />
                  <div className="mt-1.5 space-y-1">
                    {d.cues.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-1">
                        <input
                          value={c}
                          onChange={(e) =>
                            updateDrill(idx, {
                              cues: d.cues.map((x, j) => (j === ci ? e.target.value : x)),
                            })
                          }
                          className="flex-1 rounded-md bg-theme-bg-card px-2 py-1 text-xs text-theme-text-secondary outline-none"
                          placeholder="注意要点"
                        />
                        <button
                          onClick={() =>
                            updateDrill(idx, {
                              cues: d.cues.filter((_, j) => j !== ci),
                            })
                          }
                          className="rounded px-1.5 py-0.5 text-xs text-theme-danger hover:bg-theme-danger/20"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        updateDrill(idx, { cues: [...d.cues, ''] })
                      }
                      className="text-xs text-theme-accent hover:text-theme-accent-hover"
                    >
                      + 添加要点
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addDrillRow}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-theme-border py-2 text-xs text-theme-text-muted hover:border-theme-accent/50 hover:text-theme-accent"
              >
                + 添加环节
              </button>
            </div>

            <button
              onClick={saveTemplate}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-theme-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-theme-accent-hover"
            >
              <Save className="h-4 w-4" />
              保存为模板并选中
            </button>
          </div>
        )}
      </div>
    </div>
  );
}