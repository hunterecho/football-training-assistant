import { useMemo, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTrainingStore, toDateKey } from '@/store/trainingStore';
import { DrillCard } from '@/components/Plan/DrillCard';
import { totalDuration, formatDuration } from '@/utils/duration';
import {
  Dumbbell,
  CalendarCheck,
  Plus,
  ChevronRight as ChevronRightIcon,
  Gift,
  Clock,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

export function TodayPlan() {
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
  const setSharePlanId = useTrainingStore((s) => s.setSharePlanId);
  const user = useAuthStore((s) => s.user);

  const [searchParams] = useSearchParams();
  const [showShareToast, setShowShareToast] = useState(false);
  const [sharePlanInfo, setSharePlanInfo] = useState<{ planId: string; title: string; sharerName: string } | null>(null);
  const [showRestModal, setShowRestModal] = useState(false);
  const [restDuration, setRestDuration] = useState(0);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<any>(null);
  const [pendingDrillIndex, setPendingDrillIndex] = useState(0);

  const selectedPlanId = useTrainingStore((s) => s.selectedPlanId);
  const setSelectedPlanId = useTrainingStore((s) => s.setSelectedPlanId);
  const hasAnyActiveSession = session.status !== 'idle' && records.some(r => (r.status === 'in_progress' || r.status === 'paused') && r.userId === user?.id) || session.status === 'resting';

  useEffect(() => {
    if (user && !searchParams.get('sharePlanId')) {
      syncFromServer();
    }
  }, [user, syncFromServer, searchParams]);

  useEffect(() => {
    const sharePlanId = searchParams.get('sharePlanId');
    if (sharePlanId && user) {
      setSharePlanId(sharePlanId);
      const checkAndLoadShare = async () => {
        try {
          const checkRes = await api.get<{ exists: boolean; terminated: boolean; sharerId: string | null }>(`/plans/check-share/${sharePlanId}`);
          if (checkRes.data) {
            if (!checkRes.data.exists) {
              setSharePlanInfo({
                planId: sharePlanId,
                title: '该训练计划已被删除',
                sharerName: '未知用户',
              });
              setShowShareToast(true);
              return;
            }
            if (checkRes.data.terminated) {
              setSharePlanInfo({
                planId: sharePlanId,
                title: '已停止分享',
                sharerName: '未知用户',
              });
              setShowShareToast(true);
              return;
            }
          }
          
          await syncFromServer(sharePlanId);
          
          setSharePlanInfo({
            planId: sharePlanId,
            title: '新训练计划',
            sharerName: '未知用户',
          });
          setShowShareToast(true);
          
          if (!hasAnyActiveSession || session.status === 'finished') {
            setTimeout(() => {
              setSelectedPlanId(sharePlanId);
            }, 300);
          }
        } catch (error) {
          console.error('Failed to load share:', error);
          setSharePlanInfo({
            planId: sharePlanId,
            title: '该训练计划已被删除',
            sharerName: '未知用户',
          });
          setShowShareToast(true);
        }
      };
      checkAndLoadShare();
    }
  }, [searchParams, user, syncFromServer, hasAnyActiveSession, session.status, setSharePlanId]);

  useEffect(() => {
    if (!user) return;
    const inProgressRecord = records.find((r) => (r.status === 'in_progress' || r.status === 'paused') && r.userId === user.id);
    if (inProgressRecord) {
      const plan = plans.find((p) => p.id === inProgressRecord.planId);
      const drills = plan?.drills || [];
      
      if (drills.length > 0 && session.templateId !== inProgressRecord.planId) {
        const drillIndex = Math.min(inProgressRecord.completedDrills ?? 0, drills.length - 1);
        const drill = drills[drillIndex] || drills[0];
        setActiveRecord(inProgressRecord.id);
        useTrainingStore.setState({
          session: {
            templateId: inProgressRecord.planId,
            drillIndex,
            remaining: drill?.duration ?? 0,
            status: 'paused',
            previousStatus: null,
            startedAt: inProgressRecord.startTime ?? Date.now(),
            lastTickTs: Date.now(),
            drillStartedAt: Date.now(),
            restDuration: 60,
            restRemaining: 0,
          },
        });
      }
    }
  }, [user, records, plans, session.templateId, setActiveRecord]);

  const today = new Date();
  const dateStr = today.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const todayKey = toDateKey(today);

  const todayPlan = plans.find((p) => p.date === todayKey && (p.status === 'planned' || p.status === 'terminated'));

  const recentPlans = useMemo(() => {
    const sortedPlans = [...plans]
      .filter(p => (p.status === 'planned' || p.status === 'terminated') && p.date)
      .sort((a, b) => {
        const aInProgress = records.some(r => r.planId === a.id && (r.status === 'in_progress' || r.status === 'paused') && r.userId === user?.id);
        const bInProgress = records.some(r => r.planId === b.id && (r.status === 'in_progress' || r.status === 'paused') && r.userId === user?.id);
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

  const inProgressPlan = useMemo(() => {
    const inProgressRecord = records.find(r => (r.status === 'in_progress' || r.status === 'paused') && r.userId === user?.id);
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

  const drills = useMemo(() => {
    if (!currentPlan) return [];
    return currentPlan.drills || [];
  }, [currentPlan]);

  const totalSeconds = drills.reduce((a, d) => a + d.duration, 0) ?? 0;
  const currentIndex =
    session.templateId === currentPlan?.id ? session.drillIndex : -1;
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

    const sessionMatchesPlan = session.templateId === currentPlan?.id;
    const isActiveRecord = activeRecordId === latestRecord.id;
    const isInProgressOrPaused = latestRecord.status === 'in_progress' || latestRecord.status === 'paused';
    
    if (isInProgressOrPaused && sessionMatchesPlan && isActiveRecord) {
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
    r.planId === currentPlan?.id && (r.status === 'in_progress' || r.status === 'paused') && r.userId === user?.id
  );

  const completedRecord = records.find((r) =>
    r.planId === currentPlan?.id && r.status === 'completed' && r.userId === user?.id
  );

  const hasActive =
    session.status !== 'idle' && currentPlanRecord && session.templateId === currentPlan?.id;

  const handleFinishLast = () => {
    if (
      currentPlanRecord &&
      session.templateId === currentPlan?.id &&
      session.status === 'finished'
    ) {
      toggleRecordStatus(currentPlanRecord.id);
    }
  };

  const handlePlanSwitch = (planId: string) => {
    setSelectedPlanId(planId);
  };

  const handleDrillStart = async (drillIdx: number) => {
    if (drills.length === 0) return;
    
    const sessionId = currentPlan?.id;
    if (!sessionId) return;
    
    if (hasAnyActiveSession && session.templateId === sessionId) {
      if (session.status === 'paused' || session.status === 'ready') {
        resumeSession();
      }
      if (session.drillIndex !== drillIdx) {
        skipToDrill(drillIdx);
      }
      return;
    }

    if (hasAnyActiveSession && session.templateId !== sessionId) {
      return;
    }

    setSelectedPlanId(currentPlanId);
    setPendingSessionId(sessionId);
    setPendingPlan(currentPlan);
    setPendingDrillIndex(drillIdx);
    setRestDuration(currentPlan?.restDuration ?? 60);
    setShowRestModal(true);
  };

  const handleDrillPause = () => {
    pauseSession();
  };

  const handleDrillSkip = (idx: number) => {
    if (!currentPlan) return;
    if (session.templateId === currentPlan.id && session.status !== 'idle') {
      if (idx === drills.length - 1) {
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
          {currentPlan && (
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
        {showShareToast && sharePlanInfo && !(hasAnyActiveSession && session.status !== 'finished' && currentPlan?.id === sharePlanInfo.planId) && (
          <div className="mt-4 rounded-2xl border border-theme-warning bg-theme-warning/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-theme-warning text-white">
                <Gift className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-theme-text">收到新的训练计划邀请</div>
              </div>
              <button
                onClick={() => {
                  if (!hasAnyActiveSession || session.status === 'finished') {
                    setShowShareToast(false);
                    setSelectedPlanId(sharePlanInfo.planId);
                  } else {
                    if (confirm('查看新计划将取消当前进行中的训练，确定要继续吗？')) {
                      setShowShareToast(false);
                      setSelectedPlanId(sharePlanInfo.planId);
                    }
                  }
                }}
                className="shrink-0 rounded-lg bg-theme-warning px-3 py-1.5 text-xs font-medium text-white hover:bg-theme-warning/80"
              >
                {hasAnyActiveSession && session.status !== 'finished' ? '去查看' : '查看'}
              </button>
            </div>
          </div>
        )}

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
                const isActive = plan.id === currentPlan?.id;
                const isDisabled = hasAnyActiveSession && !isActive && session.status !== 'finished';
                const planRecord = records.find(r => r.planId === plan.id && (r.status === 'in_progress' || r.status === 'paused') && r.userId === user?.id);
                const isShared = !!plan.sourcePlanId;
                
                return (
                  <button
                    key={plan.id}
                    onClick={() => handlePlanSwitch(plan.id)}
                    disabled={isDisabled}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-left transition-all',
                      isActive
                        ? isShared
                          ? 'border-theme-warning bg-theme-warning text-white shadow-lg'
                          : 'border-theme-accent bg-theme-accent text-white shadow-lg'
                        : isDisabled
                        ? 'border-theme-border bg-theme-bg-secondary-muted opacity-50 cursor-not-allowed'
                        : isShared
                          ? 'border-theme-warning/50 bg-theme-warning/10 shadow-sm hover:border-theme-warning hover:bg-theme-warning/20'
                          : 'border-theme-border bg-theme-bg-card shadow-sm hover:border-theme-accent hover:bg-theme-accent-light'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {planRecord && (
                        <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', isActive && isShared ? 'bg-white' : 'bg-theme-accent')} />
                      )}
                      {isShared && !isActive && (
                        <Gift className={cn('h-3 w-3', isActive ? 'text-white/80' : 'text-theme-warning')} />
                      )}
                      <span className={cn('text-sm font-medium truncate max-w-[100px]', isActive ? 'text-white' : 'text-theme-text')}>
                        {plan.title}
                      </span>
                    </div>
                    <div className={cn('mt-0.5 flex items-center gap-1 text-[10px]', isActive ? 'text-white/80' : 'text-theme-text-muted')}>
                      <CalendarCheck className="h-2.5 w-2.5" />
                      {plan.date === todayKey ? '今天' : plan.date}
                    </div>
                    {isShared && plan.sharerName && (
                      <div className={cn('mt-0.5 text-[10px] truncate max-w-[100px]', isActive ? 'text-white/80' : 'text-theme-warning')}>
                        {plan.sharerName} 创建并分享
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {currentPlan && drills.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-theme-accent/30 bg-theme-accent-light p-3">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-theme-text-secondary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-theme-text">
                {currentPlan.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-theme-text-secondary">
                {currentPlan.sharerName ? (
                  <span>{currentPlan.sharerName} 创建并分享</span>
                ) : (
                  <span>训练计划</span>
                )}
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
                  const sessionId = currentPlan?.id;
                  if (!sessionId) return;
                  
                  if (hasActive && (session.status === 'running' || session.status === 'resting')) {
                    pauseSession();
                  } else if (hasActive && session.status === 'paused') {
                    resumeSession();
                  } else if (completedRecord) {
                    setPendingSessionId(sessionId);
                    setPendingPlan(currentPlan);
                    setPendingDrillIndex(0);
                    setRestDuration(0);
                    setShowRestModal(true);
                  } else {
                    setPendingSessionId(sessionId);
                    setPendingPlan(currentPlan);
                    setPendingDrillIndex(0);
                    setRestDuration(0);
                    setShowRestModal(true);
                  }
                }}
                disabled={hasAnyActiveSession && !hasActive}
                className={cn(
                  'shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  hasAnyActiveSession && !hasActive
                    ? 'bg-theme-bg-card text-theme-text-muted cursor-not-allowed'
                    : hasActive && (session.status === 'running' || session.status === 'resting')
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-theme-accent text-white hover:bg-theme-accent-hover'
                )}
              >
                {hasAnyActiveSession && !hasActive
                  ? '训练中'
                  : hasActive && (session.status === 'running' || session.status === 'resting')
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
      {currentPlan && drills.length > 0 ? (
        <div className="mt-6 space-y-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-theme-text-muted">
              <Dumbbell className="h-3 w-3" />
              训练环节（{drills.length}）
            </div>
            {hasAnyActiveSession && (
              <div className="text-xs text-theme-warning">
                训练中：{session.status === 'running' ? '进行中' : '已暂停'}
              </div>
            )}
          </div>
          {drills.map((drill, idx) => {
            const isLast = idx === drills.length - 1;
            const sessionId = currentPlan.id;
            const isActive = session.templateId === sessionId && currentIndex === idx;
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
      ) : !currentPlan && plans.length > 0 ? (
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
      ) : !currentPlan && plans.length === 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-theme-border bg-theme-bg-secondary-muted p-8 text-center">
          <div className="mb-2 text-theme-text-secondary">还没有训练计划</div>
          <Link
            to="/import"
            className="inline-flex items-center gap-1 rounded-xl bg-theme-accent text-white px-4 py-2 text-sm font-medium hover:bg-theme-accent-hover"
          >
            去导入文档
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      {showRestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-theme-border bg-white p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-theme-accent" />
                <h3 className="text-lg font-semibold text-theme-text">设置休息时长</h3>
              </div>
              <button
                onClick={() => setShowRestModal(false)}
                className="rounded-lg p-1 text-theme-text-muted hover:bg-theme-bg-card"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {pendingPlan && (
              <div className="mt-3 text-sm text-theme-text-muted">
                训练计划：{pendingPlan.title}
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-theme-text-muted">休息时长</span>
                <span className="text-xl font-bold text-theme-accent">{formatDuration(restDuration)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="300"
                step="15"
                value={restDuration}
                onChange={(e) => setRestDuration(Number(e.target.value))}
                className="mt-3 w-full accent-theme-accent"
              />
              <div className="mt-2 flex justify-between text-xs text-theme-text-muted">
                <span>无休息</span>
                <span>5分钟</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
                {[0, 30, 60, 90].map((val) => (
                  <button
                    key={val}
                    onClick={() => setRestDuration(val)}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-xs font-medium transition-colors',
                      restDuration === val
                        ? 'bg-theme-accent text-white'
                        : 'bg-theme-bg-card text-theme-text-secondary hover:bg-theme-bg-card'
                    )}
                  >
                    {val === 0 ? '无休息' : formatDuration(val)}
                  </button>
                ))}
              </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowRestModal(false)}
                className="flex-1 rounded-xl border border-theme-border bg-theme-bg-card px-4 py-3 text-sm text-theme-text-secondary hover:bg-theme-bg-card"
              >
                取消
              </button>
              <button
                  onClick={() => {
                    if (pendingPlan && pendingSessionId) {
                      const existingRecord = records.find(r => r.planId === pendingPlan.id && r.status === 'in_progress' && r.userId === user?.id);
                      if (existingRecord) {
                        setActiveRecord(existingRecord.id);
                        startSession(pendingSessionId, pendingDrillIndex, restDuration);
                      } else {
                        addRecord({
                          planId: pendingPlan.id,
                          templateId: pendingPlan.templateId,
                          title: pendingPlan.title,
                          totalDrills: pendingPlan.drills?.length || 0,
                          completedDrills: pendingDrillIndex,
                          userId: user?.id || '',
                          status: 'in_progress' as const,
                          startTime: Date.now(),
                        });
                        setTimeout(() => {
                          const newRecord = records.find(r => r.planId === pendingPlan.id && r.status === 'in_progress' && r.userId === user?.id);
                          if (newRecord) {
                            setActiveRecord(newRecord.id);
                          }
                          startSession(pendingSessionId, pendingDrillIndex, restDuration);
                        }, 100);
                      }
                      setSessionPanelOpen(true);
                    }
                    setShowRestModal(false);
                  }}
                  className="flex-1 rounded-xl bg-theme-accent text-white px-4 py-3 text-sm font-semibold hover:bg-theme-accent-hover"
                >
                  开始训练
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
