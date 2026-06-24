import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrainingStore, toDateKey } from '@/store/trainingStore';
import { formatDuration } from '@/utils/duration';
import {
  Plus,
  Calendar as CalendarIcon,
  Trash2,
  PlayCircle,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function fmtDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const today = toDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);
  if (dateStr === today) return '今天';
  if (dateStr === tomorrowKey) return '明天';
  if (dateStr === yesterdayKey) return '昨天';
  return `${m}月${d}日 周${WEEKDAYS[dt.getDay()]}`;
}

export function Plans() {
  const templates = useTrainingStore((s) => s.templates);
  const plans = useTrainingStore((s) => s.plans);
  const removePlan = useTrainingStore((s) => s.removePlan);
  const completePlan = useTrainingStore((s) => s.completePlan);
  const startSession = useTrainingStore((s) => s.startSession);
  const setActivePlan = useTrainingStore((s) => s.setActivePlan);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }, [plans]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof sortedPlans>();
    for (const p of sortedPlans) {
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date)!.push(p);
    }
    return Array.from(map.entries());
  }, [sortedPlans]);

  const navigate = useNavigate();

  const handleStart = (planId: string, templateId: string) => {
    setActivePlan(planId);
    startSession(templateId, 0);
    navigate('/session');
  };

  const todayKey = toDateKey(new Date());

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">训练计划</h1>
            <p className="mt-1 text-sm text-slate-400">
              为指定日期安排训练内容，当天点击即可开始
            </p>
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" />
            新建
          </button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
          <CalendarIcon className="mx-auto h-10 w-10 text-slate-500" />
          <div className="mt-3 text-slate-300">还没有训练计划</div>
          <div className="mt-1 text-xs text-slate-500">
            点击右上角「新建」从模板创建一个计划
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-5 px-4">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="mb-2 flex items-center gap-2">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {fmtDateLabel(date)}
                </div>
                {date === todayKey && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    今天
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {items.map((plan) => {
                  const tpl = templates.find((t) => t.id === plan.templateId);
                  const total = tpl ? tpl.drills.reduce((a, d) => a + d.duration, 0) : 0;
                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        'rounded-2xl border p-4 transition-colors',
                        plan.status === 'completed'
                          ? 'border-slate-700 bg-slate-900/40 opacity-70'
                          : plan.status === 'skipped'
                          ? 'border-slate-700 bg-slate-900/40 opacity-50'
                          : 'border-slate-800 bg-slate-900/60'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3
                              className={cn(
                                'truncate text-base font-semibold text-white',
                                plan.status === 'completed' && 'line-through text-slate-400'
                              )}
                            >
                              {plan.title}
                            </h3>
                          </div>
                          {tpl ? (
                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                              <span>{tpl.drills.length} 个环节</span>
                              <span>·</span>
                              <span>总时长 {formatDuration(total)}</span>
                              {plan.status === 'completed' && (
                                <>
                                  <span>·</span>
                                  <span className="text-emerald-400">已完成</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-rose-400">
                              模板已删除（无法开始）
                            </div>
                          )}
                          {plan.note && (
                            <p className="mt-1 text-xs text-slate-500">📝 {plan.note}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          {plan.status !== 'completed' && tpl && (
                            <button
                              onClick={() => handleStart(plan.id, plan.templateId)}
                              className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300 hover:bg-emerald-500/30"
                              aria-label="开始训练"
                              title="开始训练"
                            >
                              <PlayCircle className="h-4 w-4" />
                            </button>
                          )}
                          {plan.status !== 'completed' && (
                            <button
                              onClick={() => completePlan(plan.id)}
                              className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                              aria-label="标记完成"
                              title="标记为已完成"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          {plan.status === 'completed' && (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                              <Check className="h-4 w-4" />
                            </div>
                          )}
                          <button
                            onClick={() => setConfirmDel(plan.id)}
                            className="rounded-lg bg-slate-800 p-2 text-rose-400 hover:bg-rose-500/20"
                            aria-label="删除"
                            title="删除计划"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <PlanPicker
          templates={templates}
          onClose={() => setPickerOpen(false)}
          onCreated={() => setPickerOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={confirmDel ? '删除该训练计划？' : ''}
        description="删除后无法恢复，不会影响原模板。"
        confirmText="删除"
        onConfirm={() => {
          if (confirmDel) removePlan(confirmDel);
          setConfirmDel(null);
        }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

function PlanPicker({
  templates,
  onClose,
  onCreated,
}: {
  templates: ReturnType<typeof useTrainingStore.getState>['templates'];
  onClose: () => void;
  onCreated: () => void;
}) {
  const addPlan = useTrainingStore((s) => s.addPlan);
  const [selectedDate, setSelectedDate] = useState<string>(toDateKey(new Date()));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id ?? ''
  );
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const [monthCursor, setMonthCursor] = useState<() => string>(() => {
    const d = new Date();
    return () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const handleSubmit = () => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl || !selectedDate) return;
    addPlan({
      templateId: selectedTemplateId,
      title: title.trim() || tpl.name,
      date: selectedDate,
      note: note.trim() || undefined,
    });
    onCreated();
  };

  const template = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border-t border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">新建训练计划</h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            关闭
          </button>
        </div>

        <div>
          <label className="text-xs text-slate-400">选择日期</label>
          <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() =>
                  setCursor((c) => ({
                    y: c.m === 0 ? c.y - 1 : c.y,
                    m: c.m === 0 ? 11 : c.m - 1,
                  }))
                }
                className="rounded p-1 text-slate-400 hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowMonthPicker((v) => !v)}
                className="text-sm font-medium text-slate-200 hover:text-emerald-400"
              >
                {cursor.y} 年 {cursor.m + 1} 月
              </button>
              <button
                onClick={() =>
                  setCursor((c) => ({
                    y: c.m === 11 ? c.y + 1 : c.y,
                    m: c.m === 11 ? 0 : c.m + 1,
                  }))
                }
                className="rounded p-1 text-slate-400 hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {showMonthPicker && (
              <div className="mb-2 grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setCursor({ y: cursor.y, m });
                      setShowMonthPicker(false);
                    }}
                    className="rounded-lg bg-slate-800 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    {m + 1}月
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1 text-slate-500">
                  {w}
                </div>
              ))}
              {(() => {
                const firstDay = new Date(cursor.y, cursor.m, 1).getDay();
                const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
                const todayKey = toDateKey(new Date());
                const cells: (number | null)[] = [];
                for (let i = 0; i < firstDay; i++) cells.push(null);
                for (let i = 1; i <= daysInMonth; i++) cells.push(i);
                return cells.map((d, idx) => {
                  if (d === null) return <div key={idx} />;
                  const dateStr = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === todayKey;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(dateStr)}
                      className={cn(
                        'aspect-square rounded-md text-xs',
                        isSelected
                          ? 'bg-emerald-500 font-semibold text-slate-950'
                          : isToday
                          ? 'bg-slate-800 text-emerald-300'
                          : 'text-slate-300 hover:bg-slate-800'
                      )}
                    >
                      {d}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs text-slate-400">选择训练模板</label>
          <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-2">
            {templates.map((t) => {
              const total = t.drills.reduce((a, d) => a + d.duration, 0);
              const active = t.id === selectedTemplateId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTemplateId(t.id);
                    if (!title.trim()) setTitle(t.name);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50' : 'hover:bg-slate-800'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{t.name}</div>
                    <div className="text-xs text-slate-500">
                      {t.drills.length} 个 · {formatDuration(total)}
                    </div>
                  </div>
                  {active && <Check className="h-4 w-4 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs text-slate-400">计划名称（可选）</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={template?.name}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>

        <div className="mt-3">
          <label className="text-xs text-slate-400">备注（可选）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="给当天训练留个备注，如重点内容"
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selectedTemplateId || !selectedDate}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          创建计划
        </button>
      </div>
    </div>
  );
}
