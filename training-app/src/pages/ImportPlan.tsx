import { useRef, useState } from 'react';
import { useTrainingStore } from '@/store/trainingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { parseMarkdownDocument, type ParseWarning } from '@/utils/docParser';
import { parseWithLLM, drillInputsToTemplate } from '@/utils/llmParser';
import type { DrillInput } from '@/types';
import { uid, formatDurationChinese } from '@/utils/duration';
import { exampleMarkdownDoc } from '@/data/defaultTemplate';
import {
  Upload,
  FileText,
  Wand2,
  Sparkles,
  AlertTriangle,
  Save,
  RotateCcw,
  FileUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'parsing' | 'done' | 'error';

export function ImportPlan() {
  const addTemplate = useTrainingStore((s) => s.addTemplate);
  const setActiveTemplate = useTrainingStore((s) => s.setActiveTemplate);
  const settings = useSettingsStore((s) => s.settings);

  const [rawText, setRawText] = useState<string>('');
  const [status, setStatus] = useState<Status>('idle');
  const [parsingMode, setParsingMode] = useState<'rule' | 'llm'>('rule');
  const [drills, setDrills] = useState<DrillInput[]>([]);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [error, setError] = useState<string>('');
  const [templateName, setTemplateName] = useState<string>('');

  const fileRef = useRef<HTMLInputElement>(null);

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
    setStatus('parsing');
    setError('');
    setWarnings([]);
    try {
      const detectedTitle = extractTitle(rawText);
      const effectiveName = templateName || detectedTitle || '导入的训练计划';
      if (parsingMode === 'llm') {
        if (settings.llm.provider === 'none' || !settings.llm.endpoint || !settings.llm.apiKey) {
          throw new Error('请先在"设置"页配置 LLM 服务');
        }
        const res = await parseWithLLM(rawText, {
          endpoint: settings.llm.endpoint,
          apiKey: settings.llm.apiKey,
          model: settings.llm.model || 'gpt-4o-mini',
        });
        setDrills(res.drills);
        setWarnings(res.warnings);
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

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-white">文档导入</h1>
        <p className="mt-1 text-sm text-slate-400">
          把你的训练计划文档交给 AI 解析，自动生成训练模板
        </p>
      </div>

      <div className="mt-4 space-y-4 px-4">
        {/* Step 1: input */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
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
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
            >
              <FileUp className="h-4 w-4" />
              选择文件
            </button>
            <button
              onClick={useExample}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
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
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-400 hover:border-rose-500/50 hover:text-rose-400"
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
            className="mt-2 h-40 w-full resize-y rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
        </div>

        {/* Step 2: parse */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
            <Wand2 className="h-3 w-3" />
            第 2 步 · 选择解析方式
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setParsingMode('rule')}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                parsingMode === 'rule'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
              )}
            >
              规则解析（离线）
              <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                快速、稳定，支持 Markdown 与常见格式
              </div>
            </button>
            <button
              onClick={() => setParsingMode('llm')}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                parsingMode === 'llm'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
              )}
            >
              LLM 解析（可选）
              <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                需在设置中配置 API Key，理解更自由的格式
              </div>
            </button>
          </div>
          <button
            onClick={() => void runParse()}
            disabled={!rawText.trim() || status === 'parsing'}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {status === 'parsing' ? '解析中…' : '解析文档'}
          </button>
          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Step 3: preview */}
        {status === 'done' && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                <Sparkles className="h-3 w-3" />
                第 3 步 · 预览与微调（{drills.length} 个环节）
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-300">
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
              className="mb-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />

            <div className="space-y-2">
              {drills.map((d, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 p-2"
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveDrill(idx, -1)}
                      disabled={idx === 0}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDrill(idx, 1)}
                      disabled={idx >= drills.length - 1}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <input
                      value={d.drillName}
                      onChange={(e) => updateDrill(idx, { drillName: e.target.value })}
                      className="flex-1 rounded-md bg-slate-900 px-2 py-1 text-sm text-white outline-none"
                      placeholder="环节名称"
                    />
                    <input
                      type="number"
                      value={d.durationSeconds}
                      onChange={(e) =>
                        updateDrill(idx, {
                          durationSeconds: Math.max(5, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-16 rounded-md bg-slate-900 px-2 py-1 text-sm text-white outline-none"
                      min={5}
                      step={5}
                    />
                    <span className="text-xs text-slate-500">
                      {formatDurationChinese(d.durationSeconds)}
                    </span>
                    <button
                      onClick={() => removeDrill(idx)}
                      className="rounded px-1.5 py-0.5 text-xs text-rose-400 hover:bg-rose-500/20"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    value={d.summary ?? ''}
                    onChange={(e) => updateDrill(idx, { summary: e.target.value })}
                    className="mt-1.5 w-full rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none"
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
                          className="flex-1 rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none"
                          placeholder="教学话术"
                        />
                        <button
                          onClick={() =>
                            updateDrill(idx, {
                              cues: d.cues.filter((_, j) => j !== ci),
                            })
                          }
                          className="rounded px-1.5 py-0.5 text-xs text-rose-400 hover:bg-rose-500/20"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        updateDrill(idx, { cues: [...d.cues, ''] })
                      }
                      className="text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      + 添加话术
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addDrillRow}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-700 py-2 text-xs text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400"
              >
                + 添加环节
              </button>
            </div>

            <button
              onClick={saveTemplate}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
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

// reference uid so the import stays (it is used via drillInputsToTemplate inside llmParser.ts via cues but
// we keep the uid import for clarity; suppress unused warning by referencing it once)
void uid;
