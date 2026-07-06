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
  const activeRecordId = useTrainingStore((s) => s.activeRecordId);
  const syncFromServer = useTrainingStore((s) => s.syncFromServer);
  const setActiveRecord = useTrainingStore((s) => s.setActiveRecord);
  const addRecord = useTrainingStore((s) => s.addRecord);
  const startSession = useTrainingStore((s) => s.startSession);
  const resumeSession = useTrainingStore((s) => s.resumeSession);
  const pauseSession = useTrainingStore((s) => s.pauseSession);
  const skipToDrill = useTrainingStore((s) => s.skipToDrill);
  const toggleRecordStatus = useTrainingStore((s) => s.toggleRecordStatus);
  const setSessionPanelOpen = useTrainingStore((s) => s.setSessionPanelOpen);
  const nextDrill = useTrainingStore((s) => s.nextDrill);
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

  const todayPlan = plans.find((p) => p.date === todayKey && (p.status === 'planned' || p.status === 'terminated'));
  const todayRecord = records.find((r) =>
    r.planId === todayPlan?.id && r.status === 'in_progress' && r.userId === user?.id
  );

  const recentPlans = useMemo(() => {
    const sortedPlans = [...plans]
      .filter(p => (p.status === 'planned' || p.status === 'terminated') && p.date)
      .sort((a, b) => {
        const aInProgress = records.some(r => r.planId === a.id && r.status === 'in_progress' && r.userId === user?.id);
        const bInProgress = records.some(r => r.planId === b.id && r.status === 'in_progress' && r.userId === user?.id);
        if (aInProgress !== bInProgress) {
          return aInProgress ? -1 : 1;
        }
        const aIsPast = a.date && a.date < todayKey;
        const bIsPast = b.date && b.date < todayKey;
        if (aIsPast !== bIsPast) {
          return aIsPast ? 1 : -1;
        }
        const aIsToday = a.date === todayKey;
        const bIsToday = b.date === todayKey;
        if (aIsToday !== bIsToday) {
          return aIsToday ? -1 : 1;
        }
        return (a.date || '').localeCompare(b.date || '');
      });
    return sortedPlans.slice(0, 5);
  }, [plans, records, user, todayKey]);

  const selectedPlanId = useTrainingStore((s) => s.selectedPlanId);
  const setSelectedPlanId = useTrainingStore((s) => s.setSelectedPlanId);

  const inProgressPlan = useMemo(() => {
    const inProgressRecord = records.find(r => r.status === 'in_progress' && r.userId === user?.id);
    if (inProgressRecord) {
      return plans.find(p => p.id === inProgressRecord.planId);
    }
    return null;
  }, [plans, records, user]);

  const currentPlanId = selectedPlanId ?? inProgressPlan?.id ?? todayPlan?.id ?? recentPlans[0]?.id ?? null;

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
    const planRecords = records
      .filter(r => r.planId === currentPlan?.id && r.userId === user?.id)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const latestRecord = planRecords[0];

    if (!latestRecord) {
      return 'idle';
    }

    if (latestRecord.status === 'completed') {
      return 'done';
    }

    if (latestRecord.status === 'in_progress' && session.templateId === template?.id && activeRecordId === latestRecord.id) {
      if (idx < (latestRecord.completedDrills ?? 0)) return 'done';
      if (idx === session.drillIndex) {
        if (session.status === 'finished' && session.remaining === 0) return 'done';
        if (session.status === 'idle') return 'idle';
        if (session.status === 'paused') return 'paused';
        return 'running';
      }
      if (idx < session.drillIndex) return 'done';
    }

    return 'idle';
  };

  const currentPlanRecord = records.find((r) =>
    r.planId === currentPlan?.id && r.status === 'in_progress' && r.userId === user?.id
  );

  const completedRecord = records.find((r) =>
    r.planId === currentPlan?.id && r.status === 'completed' && r.userId === user?.id
  );

  const hasActive =
    template && session.templateId === template.id && session.status !== 'idle' && currentPlanRecord;

  const hasAnyActiveSession = session.status !== 'idle' && records.some(r => r.status === 'in_progress' && r.userId === user?.id);

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
    if (hasAnyActiveSession && session.status !== 'finished') return;
    setSelectedPlanId(planId);
  };

  const handleDrillStart = async (drillIdx: number) => {
    if (!template) return;
    
    if (hasAnyActiveSession && session.templateId === template.id) {
      if (session.status === 'paused' || session.status === 'ready') {
        resumeSession();
      }
      if (session.drillIndex !== drillIdx) {
        skipToDrill(drillIdx);
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
      if (idx === template.drills.length - 1) {
        nextDrill();
      } else {
        skipToDrill(idx + 1);
      }
    }
  };

  const handleDrillClick = () => {
    setSessionPanelOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      {/* Header */}
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-theme-accent">
              今天
            </div>
            <h1 className="mt-0.5 text-2xl font-bold text-theme-text">{dateStr}</h1>
          </div>
          {template && (
            <div className="rounded-2xl border border-theme-accent/30 bg-theme-accent-light px-4 py-2 text-right">
              <div className="text-[11px] uppercase tracking-wider text-theme-text-secondary">
                预计时长
              </div>
              <div className="text-lg font-semibold text-theme-text">
                {totalDuration(totalSeconds)}
              </div>
            </div>
          )}
        </div>

        {/* Plan Tabs */}
        {recentPlans.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-wider text-theme-text-muted">训练计划</span>
              {hasAnyActiveSession && session.status !== 'finished' && (
                <span className="text-[10px] text-theme-warning">训练中，无法切换</span>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {recentPlans.map((plan) => {
                const planTemplate = templates.find((t) => t.id === plan.templateId);
                const isActive = plan.id === currentPlan?.id;
                const isDisabled = hasAnyActiveSession && !isActive && session.status !== 'finished';
                const planRecord = records.find(r => r.planId === plan.id && r.status === 'in_progress' && r.userId === user?.id);
                
                return (
                  <button
                    key={plan.id}
                    onClick={() => handlePlanSwitch(plan.id)}
                    disabled={isDisabled}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-left transition-all',
                      isActive
                        ? 'border-theme-accent bg-theme-accent text-white shadow-lg'
                        : isDisabled
                        ? 'border-theme-border bg-theme-bg-secondary-muted opacity-50 cursor-not-allowed'
                        : 'border-theme-border bg-theme-bg-card shadow-sm hover:border-theme-accent hover:bg-theme-accent-light'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {planRecord && (
                        <span className="h-1.5 w-1.5 rounded-full bg-theme-accent animate-pulse" />
                      )}
                      <span className={cn('text-sm font-medium truncate max-w-[120px]', isActive ? 'text-white' : 'text-theme-text')}>
                        {plan.title}
                      </span>
                    </div>
                    <div className={cn('mt-0.5 flex items-center gap-1 text-[10px]', isActive ? 'text-white/80' : 'text-theme-text-muted')}>
                      <CalendarCheck className="h-2.5 w-2.5" />
                      {plan.date === todayKey ? '今天' : plan.date}
                    </div>
                    {planTemplate && (
                      <div className={cn('mt-0.5 text-[10px] truncate max-w-[120px]', isActive ? 'text-white/80' : 'text-theme-text-secondary')}>
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
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-theme-accent/30 bg-theme-accent-light p-3">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-theme-text-secondary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-theme-text">
                {currentPlan.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-theme-text-secondary">
                <span>来自模板「{template.name}」</span>
              </div>
              {currentPlan.note && (
                <div className="mt-1 text-xs text-theme-text-muted">
                  📝 {currentPlan.note}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (hasActive && session.status === 'running') {
                    pauseSession();
                  } else if (hasActive && session.status === 'paused') {
                    resumeSession();
                  } else if (completedRecord) {
                    addRecord({
                      planId: currentPlan.id,
                      templateId: template.id,
                      title: currentPlan.title,
                      totalDrills: template.drills.length,
                      completedDrills: 0,
                      userId: user?.id || '',
                      status: 'in_progress' as const,
                      startTime: Date.now(),
                    });
                    setTimeout(() => {
                      const newRecord = records.find(r => r.planId === currentPlan.id && r.status === 'in_progress' && r.userId === user?.id);
                      if (newRecord) {
                        setActiveRecord(newRecord.id);
                      }
                      startSession(template.id);
                    }, 100);
                  } else {
                    const existingRecord = records.find(r => r.planId === currentPlan.id && r.status === 'in_progress' && r.userId === user?.id);
                    if (existingRecord) {
                      setActiveRecord(existingRecord.id);
                      startSession(template.id);
                    } else {
                      addRecord({
                        planId: currentPlan.id,
                        templateId: template.id,
                        title: currentPlan.title,
                        totalDrills: template.drills.length,
                        completedDrills: 0,
                        userId: user?.id || '',
                        status: 'in_progress' as const,
                        startTime: Date.now(),
                      });
                      setTimeout(() => {
                        const newRecord = records.find(r => r.planId === currentPlan.id && r.status === 'in_progress' && r.userId === user?.id);
                        if (newRecord) {
                          setActiveRecord(newRecord.id);
                        }
                        startSession(template.id);
                      }, 100);
                    }
                  }
                  setSessionPanelOpen(true);
                }}
                className={cn(
                  'shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium',
                  hasActive && session.status === 'running'
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-theme-accent text-white hover:bg-theme-accent-hover'
                )}
              >
                {hasActive && session.status === 'running'
                  ? '暂停'
                  : hasActive && session.status === 'paused'
                  ? '继续'
                  : completedRecord
                  ? '再练一次'
                  : '开始训练'}
              </button>
              <Link
                to="/schedule"
                className="shrink-0 rounded-lg bg-theme-bg-card px-2.5 py-1 text-xs text-theme-text-secondary hover:bg-theme-bg-card"
              >
                管理
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Drills or No Plan Message */}
      {currentPlan && template ? (
        <div className="mt-6 space-y-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-theme-text-muted">
              <Dumbbell className="h-3 w-3" />
              训练环节（{template.drills.length}）
            </div>
            {hasAnyActiveSession && (
              <div className="text-xs text-theme-warning">
                训练中：{session.status === 'running' ? '进行中' : '已暂停'}
              </div>
            )}
          </div>
          {template.drills.map((drill, idx) => {
            const isLast = idx === template.drills.length - 1;
            const isActive = session.templateId === template.id && currentIndex === idx;
            return (
              <DrillCard
                key={drill.id}
                drill={drill}
                status={drillStatus(idx)}
                remaining={isActive ? session.remaining : undefined}
                isLast={isLast}
                onStart={() => handleDrillStart(idx)}
                onPause={handleDrillPause}
                onSkip={() => handleDrillSkip(idx)}
                onClick={isActive ? handleDrillClick : undefined}
              />
            );
          })}

          {currentPlanRecord &&
            session.templateId === currentPlanRecord.templateId &&
            session.status === 'finished' && (
              <button
                onClick={handleFinishLast}
                className="w-full rounded-2xl border border-theme-accent/50 bg-theme-accent-light px-4 py-3 text-sm font-medium text-theme-text-secondary hover:bg-theme-accent-light"
              >
                ✓ 标记计划为已完成
              </button>
            )}
        </div>
      ) : !currentPlan && templates.length > 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-theme-border bg-theme-bg-secondary-muted p-8 text-center">
            <CalendarCheck className="mx-auto h-10 w-10 text-theme-text-muted" />
            <div className="mt-3 text-theme-text-secondary">还没有训练计划</div>
            <div className="mt-1 text-xs text-theme-text-muted">
              创建一个训练计划来开始今天的训练
            </div>
          <Link
            to="/schedule"
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-theme-accent text-white px-4 py-2 text-sm font-medium hover:bg-theme-accent-hover"
          >
            <Plus className="h-4 w-4" />
            创建计划
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : !currentPlan && templates.length === 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-theme-border bg-theme-bg-secondary-muted p-8 text-center">
          <div className="mb-2 text-theme-text-secondary">还没有训练模板</div>
          <Link
            to="/import"
            className="inline-flex items-center gap-1 rounded-xl bg-theme-accent text-white px-4 py-2 text-sm font-medium hover:bg-theme-accent-hover"
          >
            去导入文档
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
