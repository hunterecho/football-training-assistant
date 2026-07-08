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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-theme-text">训练模板</h1>
            <p className="mt-1 text-sm text-theme-text-muted">设计训练课程，定制专属模板</p>
          </div>
          <button
            onClick={createNew}
            className="flex items-center gap-1.5 rounded-2xl bg-theme-accent text-white px-3.5 py-2 text-sm font-semibold shadow-lg hover:bg-theme-accent-hover"
          >
            <Plus className="h-4 w-4" />
            新建模板
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3 px-4">
        {[...templates].sort((a, b) => b.createdAt - a.createdAt).map((t) => {
          const total = t.drills.reduce((a, d) => a + d.duration, 0);
          return (
            <div
              key={t.id}
              className="rounded-2xl border border-theme-border bg-theme-bg-card p-4 transition-colors hover:border-theme-accent hover:bg-theme-accent-light"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={t.name}
                    onChange={(e) => updateTemplate(t.id, { name: e.target.value })}
                    className="w-full bg-transparent text-base font-semibold text-theme-text outline-none placeholder:text-theme-text-muted"
                  />
                  <div className="mt-1 flex items-center gap-2 text-xs text-theme-text-muted">
                    <span>{t.drills.length} 个环节</span>
                    <span>·</span>
                    <span>总时长 {formatDuration(total)}</span>
                  </div>
                  {t.description && (
                    <p className="mt-1 text-xs text-theme-text-muted">{t.description}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="rounded-lg p-2 bg-theme-bg-card-subtle text-theme-text-secondary transition-colors hover:bg-theme-bg-card"
                    aria-label="编辑"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => duplicateTemplate(t.id)}
                    className="rounded-lg p-2 bg-theme-bg-card-subtle text-theme-text-secondary transition-colors hover:bg-theme-bg-card"
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
                    className="rounded-lg p-2 bg-theme-bg-card-subtle text-theme-danger transition-colors hover:bg-theme-danger/20"
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
                      title: '该条注意要点',
                    })
                  }
                />
              )}

              {editing?.id !== t.id && (
                <div className="mt-3">
                  {t.drills.map((d, idx) => (
                    <div
                      key={d.id}
                      className={cn(
                        'flex items-center justify-between rounded-lg bg-theme-bg-card-subtle px-3 py-2 text-sm',
                        idx > 0 && 'border-t border-theme-border/50'
                      )}
                    >
                      <div className="flex items-center gap-2 text-theme-text-secondary">
                        <span className="truncate">{d.title}</span>
                      </div>
                      <span className="text-xs text-theme-text-muted">
                        {formatDuration(d.duration)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
            ? '删除后无法恢复，模板下的所有环节和要点都会一起移除。'
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
  const [invalidDrills, setInvalidDrills] = useState<Set<string>>(new Set());
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

  const handleClose = () => {
    const invalid = new Set<string>();
    template.drills.forEach((d) => {
      if (!d.duration || d.duration <= 0) {
        invalid.add(d.id);
      }
    });
    if (invalid.size > 0) {
      setInvalidDrills(invalid);
      return;
    }
    onClose();
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-theme-border bg-theme-bg-card-subtle p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-theme-text-muted">
          编辑环节
        </div>
        <button
          onClick={handleClose}
          className="flex items-center gap-1 rounded-lg bg-theme-accent/20 px-2 py-1 text-xs text-theme-accent hover:bg-theme-accent/30"
        >
          <Check className="h-3 w-3" />
          完成
        </button>
      </div>

      {template.drills.map((d, idx) => (
        <div
          key={d.id}
          className={cn(
            'rounded-lg border border-theme-border bg-theme-bg-card-light p-2',
            idx > 0 && 'mt-2'
          )}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              className="rounded p-1 text-xs text-theme-text-muted hover:bg-theme-bg-card disabled:opacity-30"
            >
              ↑
            </button>
            <button
              onClick={() => moveDown(idx)}
              disabled={idx >= template.drills.length - 1}
              className="rounded p-1 text-xs text-theme-text-muted hover:bg-theme-bg-card disabled:opacity-30"
            >
              ↓
            </button>
            <input
              value={d.title}
              onChange={(e) => updateDrill(d.id, { title: e.target.value })}
              className="flex-1 rounded-md bg-theme-bg-card px-2 py-1 text-sm text-theme-text outline-none"
              placeholder="环节名称"
            />
            <input
              type="number"
              value={d.duration || ''}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                updateDrill(d.id, { duration: val });
                if (invalidDrills.has(d.id)) {
                  const next = new Set(invalidDrills);
                  next.delete(d.id);
                  setInvalidDrills(next);
                }
              }}
              className={cn(
                "w-16 rounded-md px-2 py-1 text-sm outline-none",
                invalidDrills.has(d.id)
                  ? "bg-red-50 border border-red-500 text-red-600"
                  : "bg-theme-bg-card text-theme-text"
              )}
              min={0}
              step={1}
              placeholder="0"
            />
            <span className="text-xs text-theme-text-muted">秒</span>
            <button
              onClick={() => onDeleteDrill(d.id, d.title)}
              className="rounded p-1 text-theme-danger hover:bg-theme-danger/20"
              aria-label="删除环节"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <input
            value={d.summary ?? ''}
            onChange={(e) => updateDrill(d.id, { summary: e.target.value })}
            className="mt-1.5 w-full rounded-md bg-theme-bg-card px-2 py-1 text-xs text-theme-text-secondary outline-none"
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
                  className="flex-1 rounded-md bg-theme-bg-card px-2 py-1 text-xs text-theme-text-secondary outline-none"
                  placeholder="注意要点"
                />
                <button
                  onClick={() => onDeleteCue(d.id, c.id)}
                  className="rounded p-1 text-theme-danger hover:bg-theme-danger/20"
                  aria-label="删除要点"
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
              className="text-xs text-theme-accent hover:text-theme-accent-hover"
            >
              + 添加要点
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={addDrill}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-theme-border py-2 text-xs text-theme-text-muted hover:border-theme-accent/50 hover:text-theme-accent"
      >
        <Plus className="h-3 w-3" />
        添加环节
      </button>
    </div>
  );
}
