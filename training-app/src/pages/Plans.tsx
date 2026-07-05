import { useMemo, useState, useEffect } from 'react';
import { useTrainingStore, toDateKey } from '@/store/trainingStore';
import { useAuthStore } from '@/store/authStore';
import { formatDuration } from '@/utils/duration';
import { Plus,
  Calendar as CalendarIcon,
  Trash2,
  PlayCircle,
  CheckCircle2,
  Check,
  Clock,
  ChevronDown,
  RotateCcw,
  XCircle,
  Users,
  Share2,
  PauseCircle,
  ChevronLeft,
  ChevronRight,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { RecordStatus, PlanStatus } from '@/types';

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

function fmtDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

export function Plans() {
  const templates = useTrainingStore((s) => s.templates);
  const plans = useTrainingStore((s) => s.plans);
  const records = useTrainingStore((s) => s.records);
  const session = useTrainingStore((s) => s.session);
  const removePlan = useTrainingStore((s) => s.removePlan);
  const removeRecord = useTrainingStore((s) => s.removeRecord);
  const toggleRecordStatus = useTrainingStore((s) => s.toggleRecordStatus);
  const startSession = useTrainingStore((s) => s.startSession);
  const resumeSession = useTrainingStore((s) => s.resumeSession);
  const setActiveRecord = useTrainingStore((s) => s.setActiveRecord);
  const setActivePlan = useTrainingStore((s) => s.setActivePlan);
  const setSelectedPlanId = useTrainingStore((s) => s.setSelectedPlanId);
  const updatePlan = useTrainingStore((s) => s.updatePlan);
  const fetchPlansPage = useTrainingStore((s) => s.fetchPlansPage);
  const plansPage = useTrainingStore((s) => s.plansPage);
  const plansPageSize = useTrainingStore((s) => s.plansPageSize);
  const plansTotal = useTrainingStore((s) => s.plansTotal);
  const user = useAuthStore((s) => s.user);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelPlan, setConfirmDelPlan] = useState<string | null>(null);
  const [confirmTerminatePlan, setConfirmTerminatePlan] = useState<string | null>(null);
  const [confirmDelRecord, setConfirmDelRecord] = useState<string | null>(null);
  const [confirmToggleRecord, setConfirmToggleRecord] = useState<string | null>(null);
  const [expandedPlanDetails, setExpandedPlanDetails] = useState<Set<string>>(new Set());
  const [expandedPlanRecords, setExpandedPlanRecords] = useState<Set<string>>(new Set());
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState('');
  const [shareMenuOpen, setShareMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.share-menu-container')) {
        setShareMenuOpen(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const togglePlanDetails = (id: string) => {
    setExpandedPlanDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEditPlanDate = (planId: string, currentDate: string) => {
    setEditingPlanId(planId);
    setEditingDate(currentDate);
  };

  const handleSavePlanDate = () => {
    if (editingPlanId && editingDate) {
      updatePlan(editingPlanId, { date: editingDate });
    }
    setEditingPlanId(null);
    setEditingDate('');
  };

  const handleCancelEditPlanDate = () => {
    setEditingPlanId(null);
    setEditingDate('');
  };

  const togglePlanRecords = (id: string) => {
    setExpandedPlanRecords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleRecordExpanded = (id: string) => {
    setExpandedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addRecord = useTrainingStore((s) => s.addRecord);

  const handlePlanStart = async (planId: string, templateId: string) => {
    setActivePlan(planId);
    setSelectedPlanId(planId);
    const plan = plans.find(p => p.id === planId);
    const tpl = templates.find(t => t.id === templateId);
    
    if ((session.status === 'paused' || session.status === 'ready') && session.templateId === templateId) {
      resumeSession();
    } else if (session.status === 'idle') {
      if (plan && tpl) {
        const newRecordId = await addRecord({
          planId: plan.id,
          templateId: tpl.id,
          userId: user?.id || '',
          title: plan.title,
          status: 'in_progress',
          startTime: Date.now(),
          totalDrills: tpl.drills.length,
          completedDrills: 0,
        });
        setActiveRecord(newRecordId);
      }
      startSession(templateId, 0);
    }
  };

  const handleRecordStart = (recordId: string, templateId: string) => {
    setActiveRecord(recordId);
    if ((session.status === 'paused' || session.status === 'ready') && session.templateId === templateId) {
      resumeSession();
    } else if (session.status === 'idle') {
      startSession(templateId, 0);
    }
  };

  const recordsByPlanId = useMemo(() => {
    const map = new Map<string, typeof records>();
    for (const r of records) {
      if (!r.planId) continue;
      if (!map.has(r.planId)) map.set(r.planId, []);
      map.get(r.planId)!.push(r);
    }
    for (const [key, list] of map) {
      list.sort((a, b) => (b.startTime || b.createdAt) - (a.startTime || a.createdAt));
    }
    return map;
  }, [records]);

  const todayKey = toDateKey(new Date());

  const groupedPlans = useMemo(() => {
    const futurePlans = plans.filter((p) => (p.status === 'planned' || p.status === 'terminated') && p.date && p.date >= todayKey);
    const pastPlans = plans.filter((p) => (p.status === 'planned' || p.status === 'terminated') && p.date && p.date < todayKey);
    const completed = plans.filter((p) => p.status === 'completed');
    const skipped = plans.filter((p) => p.status === 'skipped');

    const futureByDate = new Map<string, typeof futurePlans>();
    for (const p of futurePlans) {
      if (!p.date) continue;
      if (!futureByDate.has(p.date)) futureByDate.set(p.date, []);
      futureByDate.get(p.date)!.push(p);
    }

    const pastByDate = new Map<string, typeof pastPlans>();
    for (const p of pastPlans) {
      if (!p.date) continue;
      if (!pastByDate.has(p.date)) pastByDate.set(p.date, []);
      pastByDate.get(p.date)!.push(p);
    }

    return {
      planned: Array.from(futureByDate.entries()).sort(([a], [b]) => a.localeCompare(b)),
      past: Array.from(pastByDate.entries()).sort(([a], [b]) => b.localeCompare(a)),
      completed: completed.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
      skipped: skipped.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
    };
  }, [plans, todayKey]);

  const hasAnyInProgress = records.some(r => r.status === 'in_progress' && r.userId === user?.id);

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-theme-text">训练日程</h1>
            <p className="mt-1 text-sm text-theme-text-muted">
              安排训练计划，查看训练记录
            </p>
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-theme-accent text-white px-3.5 py-2 text-sm font-semibold shadow-lg hover:bg-theme-accent-hover"
          >
            <Plus className="h-4 w-4" />
            新建计划
          </button>
        </div>
      </div>

      {editingPlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-lg font-semibold text-theme-text">编辑训练日期</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs text-theme-text-muted">训练计划</label>
                <div className="mt-1.5 rounded-xl border border-theme-border bg-theme-bg-card px-4 py-2 text-sm text-theme-text">
                  {plans.find(p => p.id === editingPlanId)?.title || '未知计划'}
                </div>
              </div>
              <div>
                <label className="text-xs text-theme-text-muted">训练日期</label>
                <input
                  type="date"
                  value={editingDate}
                  onChange={(e) => setEditingDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-theme-border bg-theme-bg-card px-4 py-2 text-sm text-theme-text focus:border-theme-accent focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={handleCancelEditPlanDate}
                className="flex flex-1 items-center justify-center rounded-xl border border-theme-border bg-theme-bg-card px-4 py-2.5 text-sm font-medium text-theme-text-secondary hover:border-theme-accent"
              >
                取消
              </button>
              <button
                onClick={handleSavePlanDate}
                disabled={!editingDate}
                className="flex flex-1 items-center justify-center rounded-xl bg-theme-accent text-white px-4 py-2.5 text-sm font-semibold hover:bg-theme-accent-hover disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {(plans.length === 0 && records.length === 0) ? (
        <div className="mx-4 mt-8 rounded-2xl border border-dashed border-theme-border bg-theme-bg-secondary-muted p-8 text-center">
          <CalendarIcon className="mx-auto h-10 w-10 text-theme-text-muted" />
          <div className="mt-3 text-theme-text-secondary">还没有训练日程</div>
          <div className="mt-1 text-xs text-theme-text-muted">
            点击右上角「新建计划」从模板创建一个训练日程
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-8 px-4">
          {groupedPlans.planned.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-theme-accent" />
                <span className="text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                  训练计划
                </span>
              </div>
              <div className="space-y-5">
                {groupedPlans.planned.map(([date, items]) => (
                  <div key={date}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                        {fmtDateLabel(date)}
                      </div>
                      {date === todayKey && (
                        <span className="rounded-full bg-theme-accent/20 px-2 py-0.5 text-[10px] font-medium text-theme-accent">
                          今天
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {items.map((plan) => {
                        const planRecords = recordsByPlanId.get(plan.id) || [];
                        return (
                          <PlanWithRecordsCard
                            key={plan.id}
                            plan={plan}
                            templates={templates}
                            records={planRecords}
                            isDetailsExpanded={expandedPlanDetails.has(plan.id)}
                            isRecordsExpanded={expandedPlanRecords.has(plan.id)}
                            onToggleDetails={() => togglePlanDetails(plan.id)}
                            onToggleRecords={() => togglePlanRecords(plan.id)}
                            onDeletePlan={() => setConfirmDelPlan(plan.id)}
                            onTerminatePlan={() => setConfirmTerminatePlan(plan.id)}
                            onStart={() => {
                              handlePlanStart(plan.id, plan.templateId);
                            }}
                            session={session}
                            expandedRecords={expandedRecords}
                            onToggleRecordExpanded={(id) => toggleRecordExpanded(id)}
                            onToggleRecordStatus={(id) => setConfirmToggleRecord(id)}
                            onDeleteRecord={(id) => setConfirmDelRecord(id)}
                            onRecordStart={(id, templateId) => {
                              handleRecordStart(id, templateId);
                            }}
                            currentUserId={user?.id}
                            onEditDate={handleEditPlanDate}
                            hasAnyInProgress={hasAnyInProgress}
                            shareMenuOpen={shareMenuOpen}
                            setShareMenuOpen={setShareMenuOpen}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(groupedPlans.completed.length > 0 || groupedPlans.skipped.length > 0 || groupedPlans.past.length > 0) && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-theme-text-muted" />
                <span className="text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                  计划历史
                </span>
              </div>
              <div className="space-y-3">
                {[...groupedPlans.completed, ...groupedPlans.skipped].map((plan) => {
                  const planRecords = recordsByPlanId.get(plan.id) || [];
                  return (
                    <PlanWithRecordsCard
                      key={plan.id}
                      plan={plan}
                      templates={templates}
                      records={planRecords}
                      isDetailsExpanded={expandedPlanDetails.has(plan.id)}
                      isRecordsExpanded={expandedPlanRecords.has(plan.id)}
                      onToggleDetails={() => togglePlanDetails(plan.id)}
                      onToggleRecords={() => togglePlanRecords(plan.id)}
                      onDeletePlan={() => setConfirmDelPlan(plan.id)}
                      onTerminatePlan={() => setConfirmTerminatePlan(plan.id)}
                      onStart={() => {
                        handlePlanStart(plan.id, plan.templateId);
                      }}
                      session={session}
                      expandedRecords={expandedRecords}
                      onToggleRecordExpanded={(id) => toggleRecordExpanded(id)}
                      onToggleRecordStatus={(id) => setConfirmToggleRecord(id)}
                      onDeleteRecord={(id) => setConfirmDelRecord(id)}
                      onRecordStart={(id, templateId) => {
                        handleRecordStart(id, templateId);
                      }}
                      currentUserId={user?.id}
                      onEditDate={handleEditPlanDate}
                      hasAnyInProgress={hasAnyInProgress}
                      shareMenuOpen={shareMenuOpen}
                      setShareMenuOpen={setShareMenuOpen}
                    />
                  );
                })}
                {groupedPlans.past.map(([date, items]) => (
                  <div key={date}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                        {fmtDateLabel(date)}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {items.map((plan) => {
                        const planRecords = recordsByPlanId.get(plan.id) || [];
                        return (
                          <PlanWithRecordsCard
                            key={plan.id}
                            plan={plan}
                            templates={templates}
                            records={planRecords}
                            isDetailsExpanded={expandedPlanDetails.has(plan.id)}
                            isRecordsExpanded={expandedPlanRecords.has(plan.id)}
                            onToggleDetails={() => togglePlanDetails(plan.id)}
                            onToggleRecords={() => togglePlanRecords(plan.id)}
                            onDeletePlan={() => setConfirmDelPlan(plan.id)}
                            onTerminatePlan={() => setConfirmTerminatePlan(plan.id)}
                            onStart={() => {
                              handlePlanStart(plan.id, plan.templateId);
                            }}
                            session={session}
                            expandedRecords={expandedRecords}
                            onToggleRecordExpanded={(id) => toggleRecordExpanded(id)}
                            onToggleRecordStatus={(id) => setConfirmToggleRecord(id)}
                            onDeleteRecord={(id) => setConfirmDelRecord(id)}
                            onRecordStart={(id, templateId) => {
                              handleRecordStart(id, templateId);
                            }}
                            currentUserId={user?.id}
                            onEditDate={handleEditPlanDate}
                            hasAnyInProgress={hasAnyInProgress}
                            shareMenuOpen={shareMenuOpen}
                            setShareMenuOpen={setShareMenuOpen}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
        open={!!confirmDelPlan}
        title="删除该计划？"
        description="删除后无法恢复，关联的训练记录也将被删除。"
        confirmText="删除"
        onConfirm={() => {
          if (confirmDelPlan) {
            const plan = plans.find(p => p.id === confirmDelPlan);
            const planRecords = recordsByPlanId.get(confirmDelPlan) || [];
            if (planRecords.some(r => r.status === 'in_progress')) {
              alert('无法删除包含正在训练记录的计划，请先结束训练。');
              setConfirmDelPlan(null);
              return;
            }
            if (plan?.status !== 'terminated') {
              updatePlan(confirmDelPlan, { status: 'terminated' as PlanStatus });
            }
            removePlan(confirmDelPlan);
          }
          setConfirmDelPlan(null);
        }}
        onCancel={() => setConfirmDelPlan(null)}
      />

      <ConfirmDialog
        open={!!confirmTerminatePlan}
        title={confirmTerminatePlan ? (plans.find(p => p.id === confirmTerminatePlan)?.status === 'terminated' ? '重新分享该计划？' : '取消分享该计划？') : ''}
        description={confirmTerminatePlan ? (plans.find(p => p.id === confirmTerminatePlan)?.status === 'terminated' ? '重新分享后，之前的分享链接将再次生效。' : '取消分享后，分享链接将失效，但历史训练记录仍会保留。') : ''}
        confirmText={confirmTerminatePlan ? (plans.find(p => p.id === confirmTerminatePlan)?.status === 'terminated' ? '重新分享' : '取消分享') : ''}
        onConfirm={() => {
          if (confirmTerminatePlan) {
            const plan = plans.find(p => p.id === confirmTerminatePlan);
            const newStatus = plan?.status === 'terminated' ? ('planned' as PlanStatus) : ('terminated' as PlanStatus);
            updatePlan(confirmTerminatePlan, { status: newStatus });
          }
          setConfirmTerminatePlan(null);
        }}
        onCancel={() => setConfirmTerminatePlan(null)}
      />

      <ConfirmDialog
        open={!!confirmDelRecord}
        title="删除该记录？"
        description="删除后无法恢复。"
        confirmText="删除"
        onConfirm={() => {
          if (confirmDelRecord) {
            const record = records.find(r => r.id === confirmDelRecord);
            if (record?.status === 'in_progress') {
              alert('无法删除正在训练的记录，请先结束训练。');
              setConfirmDelRecord(null);
              return;
            }
            removeRecord(confirmDelRecord);
          }
          setConfirmDelRecord(null);
        }}
        onCancel={() => setConfirmDelRecord(null)}
      />

      <ConfirmDialog
        open={!!confirmToggleRecord}
        title="标记为已完成？"
        description="确定要标记该训练记录为已完成吗？"
        confirmText="完成"
        onConfirm={() => {
          if (confirmToggleRecord) toggleRecordStatus(confirmToggleRecord);
          setConfirmToggleRecord(null);
        }}
        onCancel={() => setConfirmToggleRecord(null)}
      />

      {plansTotal > plansPageSize && (
        <div className="mx-auto mt-8 flex items-center justify-center gap-2 px-4">
          <button
            onClick={() => fetchPlansPage(Math.max(1, plansPage - 1))}
            disabled={plansPage <= 1}
            className={cn(
              'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              plansPage <= 1
                ? 'bg-theme-bg-card text-theme-text-muted cursor-not-allowed'
                : 'bg-theme-bg-card text-theme-text-secondary hover:bg-theme-bg-card'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </button>
          <span className="text-sm text-theme-text-muted">
            第 {plansPage} 页 / 共 {Math.ceil(plansTotal / plansPageSize)} 页
          </span>
          <button
            onClick={() => fetchPlansPage(Math.min(Math.ceil(plansTotal / plansPageSize), plansPage + 1))}
            disabled={plansPage >= Math.ceil(plansTotal / plansPageSize)}
            className={cn(
              'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              plansPage >= Math.ceil(plansTotal / plansPageSize)
                ? 'bg-theme-bg-card text-theme-text-muted cursor-not-allowed'
                : 'bg-theme-bg-card text-theme-text-secondary hover:bg-theme-bg-card'
            )}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function PlanWithRecordsCard({
  plan,
  templates,
  records,
  isDetailsExpanded,
  isRecordsExpanded,
  onToggleDetails,
  onToggleRecords,
  onDeletePlan,
  onTerminatePlan,
  onStart,
  session,
  expandedRecords,
  onToggleRecordExpanded,
  onToggleRecordStatus,
  onDeleteRecord,
  onRecordStart,
  currentUserId,
  onEditDate,
  hasAnyInProgress,
  shareMenuOpen,
  setShareMenuOpen,
}: {
  plan: import('@/types').TrainingPlan;
  templates: import('@/types').Template[];
  records: import('@/types').TrainingRecord[];
  isDetailsExpanded: boolean;
  isRecordsExpanded: boolean;
  onToggleDetails: () => void;
  onToggleRecords: () => void;
  onDeletePlan: () => void;
  onTerminatePlan: () => void;
  onStart: () => void;
  session: import('@/types').SessionState;
  expandedRecords: Set<string>;
  onToggleRecordExpanded: (id: string) => void;
  onToggleRecordStatus: (id: string) => void;
  onDeleteRecord: (id: string) => void;
  onRecordStart: (id: string, templateId: string) => void;
  currentUserId?: string;
  onEditDate: (planId: string, date: string) => void;
  hasAnyInProgress?: boolean;
  shareMenuOpen: string | null;
  setShareMenuOpen: (id: string | null) => void;
}) {
  const tpl = templates.find((t) => t.id === plan.templateId);
  const isCompleted = plan.status === 'completed';
  const isPlanned = plan.status === 'planned';
  const isSkipped = plan.status === 'skipped';
  const isTerminated = plan.status === 'terminated';

  const total = tpl ? tpl.drills.reduce((a, d) => a + d.duration, 0) : 0;

  const inProgressRecord = records.find(r => r.status === 'in_progress' && r.userId === currentUserId);

  return (
    <div
      className={cn(
        'rounded-2xl border',
        isCompleted || isSkipped
          ? 'border-theme-border bg-theme-bg-secondary-muted opacity-70'
          : inProgressRecord
          ? 'border-theme-accent/30 bg-theme-accent/5'
          : 'border-theme-border bg-theme-bg-card-light'
      )}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                'truncate text-base font-semibold',
                isCompleted || isSkipped ? 'text-theme-text-muted' : 'text-theme-text',
                isCompleted && 'line-through'
              )}
            >
              {plan.title}
            </h3>
            {isCompleted && (
              <span className="rounded-full bg-theme-accent/20 px-2 py-0.5 text-[10px] font-medium text-theme-accent">
                已完成
              </span>
            )}
            {isSkipped && (
              <span className="rounded-full bg-theme-border px-2 py-0.5 text-[10px] font-medium text-theme-text-muted">
                已跳过
              </span>
            )}
            {inProgressRecord && !isCompleted && !isSkipped && !isTerminated && (
              <span className="rounded-full bg-theme-accent/20 px-2 py-0.5 text-[10px] font-medium text-theme-accent">
                训练中
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-theme-text-muted">
            {(isPlanned || isTerminated) && plan.date && (
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {fmtDateLabel(plan.date)}
              </span>
            )}
            {records.length > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {records.length} 次训练记录
              </span>
            )}
            {tpl && (
              <>
                <span>{tpl.drills.length} 个环节</span>
                <span>·</span>
                <span>总时长 {formatDuration(total)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
            {(isPlanned || isTerminated) && tpl && !inProgressRecord && !hasAnyInProgress && (
              <button
                onClick={onStart}
                className="rounded-lg bg-theme-accent p-2 text-white hover:bg-theme-accent-hover"
                aria-label="开始训练"
                title="开始训练"
              >
                <PlayCircle className="h-4 w-4" />
              </button>
            )}
            <div className="relative share-menu-container">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShareMenuOpen(shareMenuOpen === plan.id ? null : plan.id);
                }}
                className={cn(
                  'rounded-lg p-2 transition-colors',
                  shareMenuOpen === plan.id
                    ? 'bg-theme-accent/10 text-theme-accent'
                    : 'bg-theme-bg-card text-theme-text-secondary hover:bg-theme-bg-card'
                )}
                aria-label="分享计划"
                title="分享计划"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {shareMenuOpen === plan.id && (
                <div className="absolute right-0 top-full mt-1 w-32 rounded-xl border border-theme-border bg-white shadow-lg py-1 z-10">
                  {plan.status !== 'terminated' ? (
                    <>
                      <button
                        onClick={() => {
                          const shareUrl = `${window.location.origin}${window.location.pathname.replace('/schedule', '')}/share/${plan.id}`;
                          navigator.clipboard.writeText(shareUrl).then(() => {
                            alert('分享链接已复制到剪贴板');
                          }).catch(() => {
                            alert('复制失败，请手动复制链接');
                          });
                          setShareMenuOpen(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-theme-text-secondary hover:bg-theme-bg-card"
                      >
                        <Share2 className="h-3 w-3" />
                        分享链接
                      </button>
                      {!inProgressRecord && (
                        <button
                          onClick={() => {
                            onTerminatePlan();
                            setShareMenuOpen(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-theme-danger hover:bg-theme-bg-card"
                        >
                          <XCircle className="h-3 w-3" />
                          取消分享
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        onTerminatePlan();
                        setShareMenuOpen(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-theme-accent hover:bg-theme-bg-card"
                    >
                      <Share2 className="h-3 w-3" />
                      重新分享
                    </button>
                  )}
                </div>
              )}
            </div>
            {(isPlanned || isTerminated) && !inProgressRecord && (
              <button
                onClick={() => onEditDate(plan.id, plan.date || '')}
                className="rounded-lg bg-theme-bg-card p-2 text-theme-text-secondary hover:bg-theme-bg-card"
                aria-label="编辑计划"
                title="编辑训练日期"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onDeletePlan}
              disabled={!!inProgressRecord}
              className={cn(
                'rounded-lg p-2 transition-colors',
                !!inProgressRecord
                  ? 'bg-theme-bg-card-subtle text-theme-text-muted cursor-not-allowed'
                  : 'bg-theme-bg-card text-theme-danger hover:bg-theme-danger/20'
              )}
              aria-label="删除"
              title={inProgressRecord ? '无法删除正在训练的计划' : '删除'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
      </div>

      {tpl && tpl.drills.length > 0 && (
        <>
          <button
            onClick={onToggleDetails}
            className="flex w-full items-center justify-between border-t border-theme-border px-4 py-2.5 text-xs text-theme-text-muted hover:bg-theme-bg-card-hover-light"
          >
            <span>{tpl.drills.length} 个训练环节</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', isDetailsExpanded && 'rotate-180')}
            />
          </button>
          {isDetailsExpanded && (
            <div className="border-t border-theme-border px-4 py-2">
              {tpl.drills.map((drill, idx) => (
                <div
                  key={drill.id}
                  className={cn(
                    'flex items-center gap-2 py-1.5 text-sm',
                    'text-theme-text-secondary'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
                      'bg-theme-bg-card text-theme-text-muted'
                    )}
                  >
                    {idx + 1}
                  </span>
                  <span>{drill.title}</span>
                  <span className="ml-auto text-xs text-theme-text-muted">
                    {formatDuration(drill.duration)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {records.length > 0 && (
        <div className="border-t border-theme-border">
          <button
            onClick={onToggleRecords}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs text-theme-text-muted hover:bg-theme-bg-card-hover-light"
          >
            <span>查看 {records.length} 次训练记录</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', isRecordsExpanded && 'rotate-180')}
            />
          </button>
          {isRecordsExpanded && (
            <div className="border-t border-theme-border bg-theme-bg-secondary-subtle px-4 py-2 space-y-2">
              {records.map((record) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  templates={templates}
                  isExpanded={expandedRecords.has(record.id)}
                  onToggleExpand={() => onToggleRecordExpanded(record.id)}
                  onToggleStatus={() => onToggleRecordStatus(record.id)}
                  onDelete={() => onDeleteRecord(record.id)}
                  onStart={() => onRecordStart(record.id, record.templateId)}
                  session={session}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecordCard({
  record,
  templates,
  isExpanded,
  onToggleExpand,
  onToggleStatus,
  onDelete,
  onStart,
  session,
  currentUserId,
}: {
  record: import('@/types').TrainingRecord;
  templates: import('@/types').Template[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onStart: () => void;
  session: import('@/types').SessionState;
  currentUserId?: string;
}) {
  const tpl = templates.find((t) => t.id === record.templateId);
  const isCompleted = record.status === 'completed';
  const isSkipped = record.status === 'skipped';
  const isInProgress = record.status === 'in_progress';
  const isOthersRecord = !!record.executor && record.executor.id !== currentUserId;
  
  const pauseSession = useTrainingStore((s) => s.pauseSession);
  const resumeSession = useTrainingStore((s) => s.resumeSession);

  const total = tpl ? tpl.drills.reduce((a, d) => a + d.duration, 0) : 0;

  return (
    <div
      className={cn(
        'rounded-xl border',
        isCompleted || isSkipped
          ? 'border-theme-border bg-theme-bg-secondary-muted'
          : isInProgress
          ? 'border-theme-accent/30 bg-theme-accent/5'
          : 'border-theme-border bg-theme-bg-card-light'
      )}
    >
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4
              className={cn(
                'truncate text-sm font-medium',
                isCompleted || isSkipped ? 'text-theme-text-muted' : 'text-theme-text',
                isCompleted && 'line-through'
              )}
            >
              {record.title}
            </h4>
            {isInProgress && (
              <span className="rounded-full bg-theme-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-theme-accent">
                训练中
              </span>
            )}
            {isCompleted && (
              <span className="rounded-full bg-theme-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-theme-accent">
                已完成
              </span>
            )}
            {isSkipped && (
              <span className="rounded-full bg-theme-border px-1.5 py-0.5 text-[10px] font-medium text-theme-text-muted">
                已跳过
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-theme-text-muted">
            {isOthersRecord && record.executor && (
              <span className="flex items-center gap-1 rounded-full bg-theme-accent/15 px-2 py-0.5 text-[11px] font-medium text-theme-accent">
                <Users className="h-3 w-3" />
                {record.executor.avatar ? (
                  <img
                    src={record.executor.avatar}
                    alt={record.executor.nickname}
                    className="h-3.5 w-3.5 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-theme-accent/40 text-[9px] text-white">
                    {record.executor.nickname?.slice(0, 1) || '?'}
                  </span>
                )}
                {record.executor.nickname} 执行
              </span>
            )}
            {record.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {fmtDateTime(record.startTime)}
              </span>
            )}
            {record.durationSeconds && (
              <span>{formatDuration(record.durationSeconds)}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isOthersRecord && !isCompleted && !isSkipped && tpl && !isInProgress && (
            <button
              onClick={onStart}
              className="rounded-md bg-theme-accent/20 p-1.5 text-theme-accent hover:bg-theme-accent/30"
              aria-label="开始训练"
              title="开始训练"
            >
              <PlayCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {!isOthersRecord && isInProgress && session.templateId === record.templateId && (
            <button
              onClick={() => {
                if (session.status === 'running') {
                  pauseSession();
                } else if (session.status === 'paused' || session.status === 'ready') {
                  resumeSession();
                }
              }}
              className={cn(
                'rounded-md p-1.5',
                session.status === 'running'
                  ? 'bg-theme-warning/20 text-theme-warning hover:bg-theme-warning/30'
                  : 'bg-theme-accent-light text-theme-text hover:bg-theme-accent/30'
              )}
              aria-label={session.status === 'running' ? '暂停训练' : '继续训练'}
              title={session.status === 'running' ? '暂停训练' : '继续训练'}
            >
              {session.status === 'running' ? (
                <PauseCircle className="h-3.5 w-3.5" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {!isOthersRecord && !isCompleted && !isSkipped && !isInProgress && (
            <button
              onClick={onToggleStatus}
              className="rounded-md bg-theme-accent/20 p-1.5 text-theme-accent hover:bg-theme-accent/30"
              aria-label="标记为已完成"
              title="标记为已完成"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
          {!isInProgress && !isOthersRecord && (
            <button
              onClick={onDelete}
              className="rounded-md bg-theme-bg-card p-1.5 text-theme-danger hover:bg-theme-danger/20"
              aria-label="删除"
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {tpl && tpl.drills.length > 0 && (
        <>
          <button
            onClick={onToggleExpand}
            className="flex w-full items-center justify-between border-t border-theme-border px-3 py-2 text-[10px] text-theme-text-muted hover:bg-theme-bg-card-hover-light"
          >
            <span>{tpl.drills.length} 个训练环节</span>
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
            />
          </button>
          {isExpanded && (
            <div className="border-t border-theme-border px-3 py-1.5">
              {tpl.drills.map((drill, idx) => {
                const isDone = record.status === 'completed'
                  ? true
                  : (record.completedDrills != null && idx < record.completedDrills);
                return (
                  <div
                    key={drill.id}
                    className={cn(
                      'flex items-center gap-2 py-1 text-xs',
                      isDone ? 'text-theme-text-muted' : 'text-theme-text-secondary'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]',
                        isDone
                          ? 'bg-theme-accent-light text-theme-text'
                          : 'bg-theme-bg-card text-theme-text-muted'
                      )}
                    >
                      {isDone ? <Check className="h-2.5 w-2.5" /> : idx + 1}
                    </span>
                    <span className={cn(isDone && 'line-through')}>{drill.title}</span>
                    <span className="ml-auto text-[10px] text-theme-text-muted">
                      {formatDuration(drill.duration)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlanPicker({
  templates,
  onClose,
  onCreated,
}: {
  templates: import('@/types').Template[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null
  );
  const [date, setDate] = useState(toDateKey(new Date()));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const addPlan = useTrainingStore((s) => s.addPlan);

  const handleCreate = () => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    addPlan({
      templateId: tpl.id,
      title: title || tpl.name,
      date,
      status: 'planned',
      note: note || undefined,
    });
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="text-lg font-semibold text-theme-text">新建训练计划</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs text-theme-text-muted">选择模板</label>
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    t.id === selectedTemplateId
                      ? 'border-theme-accent bg-theme-accent-light text-theme-text'
                      : 'border-theme-border bg-theme-bg-card text-theme-text-secondary hover:border-theme-accent'
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-theme-text-muted">计划日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-theme-border bg-theme-bg-card px-3 py-2 text-sm text-theme-text focus:border-theme-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-theme-text-muted">标题（可选）</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="留空则使用模板名称"
              className="mt-1.5 w-full rounded-xl border border-theme-border bg-theme-bg-card px-3 py-2 text-sm text-theme-text focus:border-theme-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-theme-text-muted">备注（可选）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="添加备注信息..."
              className="mt-1.5 w-full rounded-xl border border-theme-border bg-theme-bg-card px-4 py-2 text-sm text-theme-text focus:border-theme-accent focus:outline-none resize-none"
              rows={2}
            />
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex flex-1 items-center justify-center rounded-xl border border-theme-border bg-theme-bg-card px-4 py-2.5 text-sm font-medium text-theme-text-secondary hover:border-theme-accent"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedTemplateId || !date}
            className="flex flex-1 items-center justify-center rounded-xl bg-theme-accent text-white px-4 py-2.5 text-sm font-semibold hover:bg-theme-accent-hover disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
