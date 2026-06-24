import { useState } from 'react';
import { useTrainingStore } from '@/store/trainingStore';
import type { Template, Drill } from '@/types';
import { uid, formatDuration } from '@/utils/duration';
import {
  Plus,
  Trash2,
  Copy,
  Edit3,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export function TemplateManager() {
  const templates = useTrainingStore((s) => s.templates);
  const addTemplate = useTrainingStore((s) => s.addTemplate);
  const removeTemplate = useTrainingStore((s) => s.removeTemplate);
  const duplicateTemplate = useTrainingStore((s) => s.duplicateTemplate);
  const updateTemplate = useTrainingStore((s) => s.updateTemplate);
  const setActiveTemplate = useTrainingStore((s) => s.setActiveTemplate);
  const activeId = useTrainingStore((s) => s.activeTemplateId);

  const [editing, setEditing] = useState<Template | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    target: 'template' | 'drill' | 'cue';
    templateId: string;
    drillId?: string;
    cueId?: string;
    title: string;
  } | null>(null);

  const createNew = () => {
    const tpl: Template = {
      id: uid('tpl'),
      name: '未命名模板',
      description: '',
      drills: [
        {
          id: uid('drill'),
          title: '环节 1',
          duration: 300,
          summary: '',
          cues: [],
        },
      ],
      createdAt: Date.now(),
    };
    addTemplate(tpl);
    setActiveTemplate(tpl.id);
    setEditing(tpl);
  };

  const handleConfirm = () => {
    if (!confirmDelete) return;
    const { target, templateId, drillId, cueId } = confirmDelete;
    if (target === 'template') {
      removeTemplate(templateId);
    } else if (target === 'drill') {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl && drillId) {
        updateTemplate(templateId, {
          drills: tpl.drills.filter((d) => d.id !== drillId),
        });
      }
    } else if (target === 'cue') {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl && drillId && cueId) {
        const drill = tpl.drills.find((d) => d.id === drillId);
        if (drill) {
          updateTemplate(templateId, {
            drills: tpl.drills.map((d) =>
              d.id === drillId
                ? { ...d, cues: d.cues.filter((c) => c.id !== cueId) }
                : d
            ),
          });
        }
      }
    }
    setConfirmDelete(null);
  };

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-white">训练模板</h1>
        <p className="mt-1 text-sm text-slate-400">
          所有模板保存在本地浏览器中，可随时编辑和导入
        </p>
      </div>

      <div className="mt-4 space-y-3 px-4">
        {templates.map((t) => {
          const total = t.drills.reduce((a, d) => a + d.duration, 0);
          return (
            <div
              key={t.id}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                t.id === activeId
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/60'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={t.name}
                    onChange={(e) => updateTemplate(t.id, { name: e.target.value })}
                    className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-500"
                  />
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <span>{t.drills.length} 个环节</span>
                    <span>·</span>
                    <span>总时长 {formatDuration(total)}</span>
                  </div>
                  {t.description && (
                    <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                    aria-label="编辑"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => duplicateTemplate(t.id)}
                    className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                    aria-label="复制"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setConfirmDelete({
                        target: 'template',
                        templateId: t.id,
                        title: t.name,
                      })
                    }
                    className="rounded-lg bg-slate-800 p-2 text-rose-400 hover:bg-rose-500/20"
                    aria-label="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {editing?.id === t.id && (
                <DrillEditor
                  template={t}
                  onChange={(drills) => updateTemplate(t.id, { drills })}
                  onClose={() => setEditing(null)}
                  onDeleteDrill={(drillId, title) =>
                    setConfirmDelete({
                      target: 'drill',
                      templateId: t.id,
                      drillId,
                      title,
                    })
                  }
                  onDeleteCue={(drillId, cueId) =>
                    setConfirmDelete({
                      target: 'cue',
                      templateId: t.id,
                      drillId,
                      cueId,
                      title: '该条教学话术',
                    })
                  }
                />
              )}

              {editing?.id !== t.id && (
                <div className="mt-3 space-y-1">
                  {t.drills.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 text-slate-200">
                        <span className="truncate">{d.title}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {formatDuration(d.duration)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={createNew}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-4 text-sm text-slate-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-emerald-400"
        >
          <Plus className="h-4 w-4" />
          新建模板
        </button>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title={
          confirmDelete
            ? {
                template: `删除模板「${confirmDelete.title}」？`,
                drill: `删除环节「${confirmDelete.title}」？`,
                cue: `删除${confirmDelete.title}？`,
              }[confirmDelete.target]
            : ''
        }
        description={
          confirmDelete?.target === 'template'
            ? '删除后无法恢复，模板下的所有环节和话术都会一起移除。'
            : confirmDelete?.target === 'drill'
            ? '删除后无法恢复。'
            : undefined
        }
        confirmText="删除"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function DrillEditor({
  template,
  onChange,
  onClose,
  onDeleteDrill,
  onDeleteCue,
}: {
  template: Template;
  onChange: (drills: Drill[]) => void;
  onClose: () => void;
  onDeleteDrill: (drillId: string, title: string) => void;
  onDeleteCue: (drillId: string, cueId: string) => void;
}) {
  const addDrill = () => {
    const d: Drill = {
      id: uid('drill'),
      title: `环节 ${template.drills.length + 1}`,
      duration: 300,
      summary: '',
      cues: [],
    };
    onChange([...template.drills, d]);
  };

  const updateDrill = (id: string, patch: Partial<Drill>) => {
    onChange(template.drills.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...template.drills];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= template.drills.length - 1) return;
    const next = [...template.drills];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    onChange(next);
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
          编辑环节
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30"
        >
          <Check className="h-3 w-3" />
          完成
        </button>
      </div>

      {template.drills.map((d, idx) => (
        <div
          key={d.id}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-2"
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              className="rounded p-1 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              onClick={() => moveDown(idx)}
              disabled={idx >= template.drills.length - 1}
              className="rounded p-1 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-30"
            >
              ↓
            </button>
            <input
              value={d.title}
              onChange={(e) => updateDrill(d.id, { title: e.target.value })}
              className="flex-1 rounded-md bg-slate-950 px-2 py-1 text-sm text-white outline-none"
              placeholder="环节名称"
            />
            <input
              type="number"
              value={d.duration}
              onChange={(e) =>
                updateDrill(d.id, { duration: Math.max(5, parseInt(e.target.value) || 0) })
              }
              className="w-16 rounded-md bg-slate-950 px-2 py-1 text-sm text-white outline-none"
              min={5}
              step={5}
            />
            <span className="text-xs text-slate-500">秒</span>
            <button
              onClick={() => onDeleteDrill(d.id, d.title)}
              className="rounded p-1 text-rose-400 hover:bg-rose-500/20"
              aria-label="删除环节"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <input
            value={d.summary ?? ''}
            onChange={(e) => updateDrill(d.id, { summary: e.target.value })}
            className="mt-1.5 w-full rounded-md bg-slate-950 px-2 py-1 text-xs text-slate-300 outline-none"
            placeholder="一句话简介（可选）"
          />
          <div className="mt-1.5 space-y-1">
            {d.cues.map((c) => (
              <div key={c.id} className="flex items-center gap-1">
                <input
                  value={c.text}
                  onChange={(e) =>
                    updateDrill(d.id, {
                      cues: d.cues.map((x) =>
                        x.id === c.id ? { ...x, text: e.target.value } : x
                      ),
                    })
                  }
                  className="flex-1 rounded-md bg-slate-950 px-2 py-1 text-xs text-slate-300 outline-none"
                  placeholder="教学话术"
                />
                <button
                  onClick={() => onDeleteCue(d.id, c.id)}
                  className="rounded p-1 text-rose-400 hover:bg-rose-500/20"
                  aria-label="删除话术"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                updateDrill(d.id, {
                  cues: [
                    ...d.cues,
                    { id: uid('cue'), text: '', trigger: 'start' },
                  ],
                })
              }
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              + 添加话术
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={addDrill}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-700 py-2 text-xs text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400"
      >
        <Plus className="h-3 w-3" />
        添加环节
      </button>
    </div>
  );
}
