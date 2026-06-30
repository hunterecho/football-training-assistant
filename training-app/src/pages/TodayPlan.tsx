import { useMemo, useEffect } from 'react';
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
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

export function TodayPlan() {
  const templates = useTrainingStore((s) => s.templates);
  const plans = useTrainingStore((s) => s.plans);
  const records = useTrainingStore((s) => s.records);
  const session = useTrainingStore((s) => s.session);
  const syncFromServer = useTrainingStore((s) => s.syncFromServer);
  const setActiveRecord = useTrainingStore((s) => s.setActiveRecord);
  const addRecord = useTrainingStore((s) => s.addRecord);
  const startSession = useTrainingStore((s) => s.startSession);
  const resumeSession = useTrainingStore((s) => s.resumeSession);
  const pauseSession = useTrainingStore((s) => s.pauseSession);
  const skipToDrill = useTrainingStore((s) => s.skipToDrill);
  const toggleRecordStatus = useTrainingStore((s) => s.toggleRecordStatus);
  const setSessionPanelOpen = useTrainingStore((s) => s.setSessionPanelOpen);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      syncFromServer();
    }
  }, [user, syncFromServer]);

  useEffect(() => {
    if (!user) return;
    const inProgressRecord = records.find((r) => r.status === 'in_progress');
    if (inProgressRecord && templates.length > 0) {
      const tpl = templates.find((t) => t.id === inProgressRecord.templateId);
      if (tpl && session.templateId !== inProgressRecord.templateId) {
        const drillIndex = inProgressRecord.completedDrills ?? 0;
        const drill = tpl.drills[drillIndex] || tpl.drills[0];
        setActiveRecord(inProgressRecord.id);
        useTrainingStore.setState({
          session: {
            templateId: inProgressRecord.templateId,
            drillIndex,
            remaining: drill?.duration ?? 0,
            status: 'paused',
            startedAt: inProgressRecord.startTime ?? Date.now(),
            lastTickTs: Date.now(),
            drillStartedAt: Date.now(),
          },
        });
      }
    }
  }, [user, records, templates, session.templateId, setActiveRecord]);

  const today = new Date();
  const dateStr = today.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const todayKey = toDateKey(today);

  const todayPlan = plans.find((p) => p.date === todayKey && p.status === 'planned');
  const todayRecord = records.find((r) =>
    r.planId === todayPlan?.id && r.status === 'in_progress'
  );

  const template = useMemo(() => {
    if (!todayPlan) return null;
    return templates.find((t) => t.id === todayPlan.templateId) ?? null;
  }, [templates, todayPlan]);

  const totalSeconds = template?.drills.reduce((a, d) => a + d.duration, 0) ?? 0;
  const currentIndex =
    session.templateId === template?.id ? session.drillIndex : -1;
  const drillStatus = (idx: number): 'idle' | 'running' | 'paused' | 'done' => {
    if (session.templateId !== template?.id) return 'idle';
    if (idx < currentIndex) return 'done';
    if (idx === currentIndex) {
      if (session.status === 'finished' && session.remaining === 0)
        return 'done';
      return session.status === 'idle'
        ? 'idle'
        : session.status === 'paused'
        ? 'paused'
        : 'running';
    }
    return 'idle';
  };

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
          {template && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-right">
              <div className="text-[11px] uppercase tracking-wider text-emerald-400">
                预计时长
              </div>
              <div className="text-lg font-semibold text-white">
                {totalDuration(totalSeconds)}
              </div>
            </div>
          )}
        </div>

        {todayPlan && template && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                今日计划：{todayPlan.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-emerald-300">
                <span>来自模板「{template.name}」</span>
              </div>
              {todayPlan.note && (
                <div className="mt-1 text-xs text-slate-400">
                  📝 {todayPlan.note}
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
          ) : todayPlan && template ? (
            <button
              onClick={() => {
                if (todayRecord) {
                  setActiveRecord(todayRecord.id);
                } else {
                  const newRecordIdPromise = addRecord({
                    planId: todayPlan.id,
                    templateId: template.id,
                    userId: '',
                    title: todayPlan.title,
                    status: 'in_progress',
                    startTime: Date.now(),
                    totalDrills: template.drills.length,
                    completedDrills: 0,
                  });
                  newRecordIdPromise.then((newRecordId) => {
                    setActiveRecord(newRecordId);
                  });
                }
                startSession(template.id, 0);
                setSessionPanelOpen(true);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
            >
              <PlayCircle className="h-5 w-5" />
              开始今日训练
            </button>
          ) : (
            <Link
              to="/schedule"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
            >
              <Plus className="h-5 w-5" />
              创建训练计划
            </Link>
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

      {/* Drills or No Plan Message */}
      {todayPlan && template ? (
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
      ) : !todayPlan && templates.length > 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
          <CalendarCheck className="mx-auto h-10 w-10 text-slate-500" />
          <div className="mt-3 text-slate-300">今天还没有训练计划</div>
          <div className="mt-1 text-xs text-slate-500">
            创建一个训练计划来开始今天的训练
          </div>
          <Link
            to="/schedule"
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" />
            创建计划
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : !todayPlan && templates.length === 0 ? (
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
      ) : null}
    </div>
  );
}
