import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTrainingStore, toDateKey } from '@/store/trainingStore';
import { DrillCard } from '@/components/Plan/DrillCard';
import { totalDuration } from '@/utils/duration';
import {
  PlayCircle,
  BookOpen,
  Dumbbell,
  ChevronRight,
  CalendarCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function TodayPlan() {
  const templates = useTrainingStore((s) => s.templates);
  const records = useTrainingStore((s) => s.records);
  const activeId = useTrainingStore((s) => s.activeTemplateId);
  const session = useTrainingStore((s) => s.session);
  const setActiveTemplate = useTrainingStore((s) => s.setActiveTemplate);
  const setActiveRecord = useTrainingStore((s) => s.setActiveRecord);
  const startSession = useTrainingStore((s) => s.startSession);
  const resumeSession = useTrainingStore((s) => s.resumeSession);
  const pauseSession = useTrainingStore((s) => s.pauseSession);
  const skipToDrill = useTrainingStore((s) => s.skipToDrill);
  const toggleRecordStatus = useTrainingStore((s) => s.toggleRecordStatus);
  const setSessionPanelOpen = useTrainingStore((s) => s.setSessionPanelOpen);

  const today = new Date();
  const dateStr = today.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const todayKey = toDateKey(today);

  const todayRecord = records.find((r) => r.date === todayKey);

  const template = useMemo(() => {
    const id = todayRecord?.templateId ?? activeId;
    return templates.find((t) => t.id === id) ?? templates[0] ?? null;
  }, [templates, activeId, todayRecord]);

  const totalSeconds = template?.drills.reduce((a, d) => a + d.duration, 0) ?? 0;
  const currentIndex =
    session.templateId === template?.id ? session.drillIndex : -1;
  const drillStatus = (idx: number): 'idle' | 'running' | 'paused' | 'done' => {
    if (session.templateId !== template?.id) return 'idle';
    if (idx < currentIndex) return 'done';
    if (idx === currentIndex) {
      if (
        session.status === 'finished' &&
        session.remaining === 0 &&
        idx < template!.drills.length - 1
      )
        return 'done';
      return session.status === 'idle'
        ? 'idle'
        : session.status === 'paused'
        ? 'paused'
        : 'running';
    }
    return 'idle';
  };

  const canStart = template && session.templateId !== template.id;
  const hasActive =
    template && session.templateId === template.id && session.status !== 'idle';

  const handleFinishLast = () => {
    if (
      todayRecord &&
      session.templateId === todayRecord.templateId &&
      session.status === 'finished'
    ) {
      toggleRecordStatus(todayRecord.id);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      {/* Header */}
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-emerald-400">
              今天
            </div>
            <h1 className="mt-0.5 text-2xl font-bold text-white">{dateStr}</h1>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-right">
            <div className="text-[11px] uppercase tracking-wider text-emerald-400">
              预计时长
            </div>
            <div className="text-lg font-semibold text-white">
              {totalDuration(totalSeconds)}
            </div>
          </div>
        </div>

        {todayRecord && todayRecord.status === 'planned' && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                今日计划：{todayRecord.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-emerald-300">
                <span>来自模板「{template?.name}」</span>
              </div>
              {todayRecord.note && (
                <div className="mt-1 text-xs text-slate-400">
                  📝 {todayRecord.note}
                </div>
              )}
            </div>
            <Link
              to="/schedule"
              className="shrink-0 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30"
            >
              管理
            </Link>
          </div>
        )}

        {/* Template selector (only shown when no plan for today and no active session) */}
        {!todayRecord && !hasActive && (
          <div className="mt-4">
            <label className="text-xs text-slate-400">当前模板</label>
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTemplate(t.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    t.id === template?.id
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {t.name}
                </button>
              ))}
              <Link
                to="/templates"
                className="shrink-0 rounded-full border border-dashed border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200"
              >
                + 管理
              </Link>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-4 flex gap-2">
          {hasActive && session.status === 'paused' ? (
            <button
              onClick={() => {
                resumeSession();
                setSessionPanelOpen(true);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
            >
              <PlayCircle className="h-5 w-5" />
              恢复训练
            </button>
          ) : hasActive && session.status !== 'idle' ? (
            <button
              onClick={() => setSessionPanelOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
            >
              <PlayCircle className="h-5 w-5" />
              继续训练
            </button>
          ) : todayRecord?.status === 'completed' ? (
            <button
              onClick={() => {
                if (template) startSession(template.id, 0);
                setSessionPanelOpen(true);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-medium text-slate-300 hover:border-slate-500"
            >
              重新开始
            </button>
          ) : (
            <button
              onClick={() => {
                if (todayRecord) setActiveRecord(todayRecord.id);
                if (template) startSession(template.id, 0);
                setSessionPanelOpen(true);
              }}
              disabled={!canStart}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-50"
            >
              <PlayCircle className="h-5 w-5" />
              {todayRecord ? '开始今日训练' : '开始训练'}
            </button>
          )}
          <Link
            to="/import"
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-300 hover:border-slate-500"
          >
            <BookOpen className="h-4 w-4" />
            文档
          </Link>
        </div>
      </div>

      {/* Drills */}
      {template ? (
        <div className="mt-6 space-y-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Dumbbell className="h-3 w-3" />
              训练环节（{template.drills.length}）
            </div>
            <div className="text-xs text-slate-500">点击卡片上的按钮直接开始</div>
          </div>
          {template.drills.map((drill, idx) => (
            <DrillCard
              key={drill.id}
              drill={drill}
              status={drillStatus(idx)}
              remaining={
                session.templateId === template.id && currentIndex === idx
                  ? session.remaining
                  : undefined
              }
              onStart={() => {
                if ((drillStatus(idx) === 'running' || drillStatus(idx) === 'paused') && session.templateId === template.id) {
                  if (session.status === 'paused') {
                    resumeSession();
                  }
                  setSessionPanelOpen(true);
                } else {
                  if (todayRecord) setActiveRecord(todayRecord.id);
                  startSession(template.id, idx);
                  setSessionPanelOpen(true);
                }
              }}
              onPause={() => {
                pauseSession();
              }}
              onSkip={() => {
                if (session.templateId === template.id && session.status !== 'idle') {
                  skipToDrill(idx);
                } else {
                  if (todayRecord) setActiveRecord(todayRecord.id);
                  startSession(template.id, idx);
                  setSessionPanelOpen(true);
                }
              }}
            />
          ))}

          {/* Mark as done button when session finished */}
          {todayRecord &&
            session.templateId === todayRecord.templateId &&
            session.status === 'finished' && (
              <button
                onClick={handleFinishLast}
                className="w-full rounded-2xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
              >
                ✓ 标记今日计划为已完成
              </button>
            )}
        </div>
      ) : (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
          <div className="mb-2 text-slate-300">还没有训练模板</div>
          <Link
            to="/import"
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            去导入文档
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
