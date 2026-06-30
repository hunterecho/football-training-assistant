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
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
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
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      syncFromServer();
    }
  }, [user, syncFromServer]);

  useEffect(() => {
    if (!user) return;
    const inProgressRecord = records.find((r) => r.status === 'in_progress' && r.userId === user.id);
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
    r.planId === todayPlan?.id && r.status === 'in_progress' && r.userId === user?.id
  );

  const recentPlans = useMemo(() => {
    const sortedPlans = [...plans]
      .filter(p => p.status === 'planned' && p.date)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return sortedPlans.slice(0, 10);
  }, [plans]);

  const selectedPlanId = useTrainingStore((s) => s.selectedPlanId);
  const setSelectedPlanId = useTrainingStore((s) => s.setSelectedPlanId);

  const currentPlanId = selectedPlanId ?? todayPlan?.id ?? recentPlans[0]?.id ?? null;

  const currentPlan = useMemo(() => {
    if (currentPlanId) {
      return plans.find(p => p.id === currentPlanId) ?? todayPlan ?? recentPlans[0] ?? null;
    }
    return todayPlan ?? recentPlans[0] ?? null;
  }, [currentPlanId, plans, todayPlan, recentPlans]);

  const template = useMemo(() => {
    if (!currentPlan) return null;
    return templates.find((t) => t.id === currentPlan.templateId) ?? null;
  }, [templates, currentPlan]);

  const totalSeconds = template?.drills.reduce((a, d) => a + d.duration, 0) ?? 0;
  const currentIndex =
    session.templateId === template?.id ? session.drillIndex : -1;
  const drillStatus = (idx: number): 'idle' | 'running' | 'paused' | 'done' => {
    if (session.templateId !== template?.id) return 'idle';
    if (idx < currentIndex) return 'done';
    if (idx === currentIndex) {
      if (session.status === 'finished' && session.remaining === 0)
        return 'done';
      if (session.status === 'idle') return 'idle';
      if (session.status === 'paused') return 'paused';
      return 'running';
    }
    return 'idle';
  };

  const hasActive =
    template && session.templateId === template.id && session.status !== 'idle';

  const hasAnyActiveSession = session.status !== 'idle';

  const currentPlanRecord = records.find((r) =>
    r.planId === currentPlan?.id && r.status === 'in_progress' && r.userId === user?.id
  );

  const handleFinishLast = () => {
    if (
      currentPlanRecord &&
      session.templateId === currentPlanRecord.templateId &&
      session.status === 'finished'
    ) {
      toggleRecordStatus(currentPlanRecord.id);
    }
  };

  const handlePlanSwitch = (planId: string) => {
    if (hasAnyActiveSession) return;
    setSelectedPlanId(planId);
  };

  const handleDrillStart = async (drillIdx: number) => {
    if (!template) return;
    
    if (hasAnyActiveSession && session.templateId === template.id) {
      if (session.status === 'paused' || session.status === 'ready') {
        resumeSession();
      }
      return;
    }

    if (hasAnyActiveSession && session.templateId !== template.id) {
      return;
    }

    setSelectedPlanId(currentPlanId);

    if (currentPlanRecord) {
      setActiveRecord(currentPlanRecord.id);
    } else if (currentPlan) {
      const newRecordId = await addRecord({
        planId: currentPlan.id,
        templateId: template.id,
        userId: user?.id || '',
        title: currentPlan.title,
        status: 'in_progress',
        startTime: Date.now(),
        totalDrills: template.drills.length,
        completedDrills: 0,
      });
      setActiveRecord(newRecordId);
    }
    startSession(template.id, drillIdx);
  };

  const handleDrillPause = () => {
    pauseSession();
  };

  const handleDrillSkip = (idx: number) => {
    if (!template) return;
    if (session.templateId === template.id && session.status !== 'idle') {
      skipToDrill(idx);
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

        {/* Plan Tabs */}
        {recentPlans.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-wider text-slate-500">训练计划</span>
              {hasAnyActiveSession && (
                <span className="text-[10px] text-amber-400">训练中，无法切换</span>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {recentPlans.map((plan) => {
                const planTemplate = templates.find((t) => t.id === plan.templateId);
                const isActive = plan.id === currentPlan?.id;
                const isDisabled = hasAnyActiveSession && !isActive;
                const planRecord = records.find(r => r.planId === plan.id && r.status === 'in_progress' && r.userId === user?.id);
                
                return (
                  <button
                    key={plan.id}
                    onClick={() => handlePlanSwitch(plan.id)}
                    disabled={isDisabled}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-left transition-all',
                      isActive
                        ? 'border-emerald-500 bg-emerald-500/20'
                        : isDisabled
                        ? 'border-slate-800 bg-slate-900/40 opacity-50 cursor-not-allowed'
                        : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {planRecord && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                      <span className={cn('text-sm font-medium truncate max-w-[120px]', isActive ? 'text-white' : 'text-slate-300')}>
                        {plan.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                      <CalendarCheck className="h-2.5 w-2.5" />
                      {plan.date === todayKey ? '今天' : plan.date}
                    </div>
                    {planTemplate && (
                      <div className="mt-0.5 text-[10px] text-slate-600 truncate max-w-[120px]">
                        {planTemplate.name}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {currentPlan && template && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                {currentPlan.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-emerald-300">
                <span>来自模板「{template.name}」</span>
              </div>
              {currentPlan.note && (
                <div className="mt-1 text-xs text-slate-400">
                  📝 {currentPlan.note}
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
      </div>

      {/* Drills or No Plan Message */}
      {currentPlan && template ? (
        <div className="mt-6 space-y-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Dumbbell className="h-3 w-3" />
              训练环节（{template.drills.length}）
            </div>
            {hasAnyActiveSession && (
              <div className="text-xs text-amber-400">
                训练中：{session.status === 'running' ? '进行中' : '已暂停'}
              </div>
            )}
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
              onStart={() => handleDrillStart(idx)}
              onPause={handleDrillPause}
              onSkip={() => handleDrillSkip(idx)}
            />
          ))}

          {currentPlanRecord &&
            session.templateId === currentPlanRecord.templateId &&
            session.status === 'finished' && (
              <button
                onClick={handleFinishLast}
                className="w-full rounded-2xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
              >
                ✓ 标记计划为已完成
              </button>
            )}
        </div>
      ) : !currentPlan && templates.length > 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
          <CalendarCheck className="mx-auto h-10 w-10 text-slate-500" />
          <div className="mt-3 text-slate-300">还没有训练计划</div>
          <div className="mt-1 text-xs text-slate-500">
            创建一个训练计划来开始今天的训练
          </div>
          <Link
            to="/schedule"
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" />
            创建计划
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : !currentPlan && templates.length === 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
          <div className="mb-2 text-slate-300">还没有训练模板</div>
          <Link
            to="/import"
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            去导入文档
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
