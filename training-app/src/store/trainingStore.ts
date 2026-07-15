import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Template, SessionState, SessionStatus, Cue, TrainingRecord, TrainingPlan, RecordStatus, PlanStatus, Drill } from '@/types';
import { uid } from '@/utils/duration';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';

let syncPromise: Promise<void> | null = null;

type TrainingStore = {
  templates: Template[];
  plans: TrainingPlan[];
  records: TrainingRecord[];
  session: SessionState;
  activeTemplateId: string | null;
  activePlanId: string | null;
  activeRecordId: string | null;
  synced: boolean;
  sessionPanelOpen: boolean;
  selectedPlanId: string | null;

  plansPage: number;
  plansPageSize: number;
  plansTotal: number;
  templatesPage: number;
  templatesPageSize: number;
  templatesTotal: number;

  setTemplates: (t: Template[]) => void;
  addTemplate: (t: Template) => void;
  updateTemplate: (id: string, patch: Partial<Template>) => void;
  removeTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => void;

  setActiveTemplate: (id: string | null) => void;
  setActivePlan: (id: string | null) => void;
  setActiveRecord: (id: string | null) => void;
  setSessionPanelOpen: (open: boolean) => void;
  setSelectedPlanId: (id: string | null) => void;

  addPlan: (plan: Omit<TrainingPlan, 'id' | 'createdAt'>) => Promise<string>;
  updatePlan: (id: string, patch: Partial<TrainingPlan>) => void;
  removePlan: (id: string) => void;
  setPlans: (plans: TrainingPlan[]) => void;
  togglePlanStatus: (id: string) => void;
  getPlanByDate: (date: string) => TrainingPlan | undefined;
  fetchPlansPage: (page: number, pageSize?: number) => Promise<void>;

  addRecord: (record: Omit<TrainingRecord, 'id' | 'createdAt'>) => Promise<string>;
  updateRecord: (id: string, patch: Partial<TrainingRecord>) => void;
  removeRecord: (id: string) => void;
  setRecords: (records: TrainingRecord[]) => void;
  toggleRecordStatus: (id: string) => void;

  startSession: (templateId: string, startIndex?: number, restDuration?: number) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  nextDrill: () => void;
  prevDrill: () => void;
  skipToDrill: (index: number) => void;
  setRemaining: (seconds: number) => void;
  finishCurrentDrill: () => void;
  resetSession: () => void;
  cancelSession: () => void;
  resetCurrentDrill: () => void;
  tick: (nowTs: number) => void;
  startRest: () => void;
  finishRest: () => void;

  syncFromServer: (sharePlanId?: string) => Promise<void>;
  fetchSharePlan: (planId: string) => Promise<{ plan: TrainingPlan } | null>;
  sharePlanId: string | null;
  setSharePlanId: (id: string | null) => void;
};

const initialSession: SessionState = {
  templateId: null,
  drillIndex: 0,
  remaining: 0,
  status: 'idle',
  previousStatus: null,
  startedAt: null,
  lastTickTs: null,
  drillStartedAt: null,
  restDuration: 0,
  restRemaining: 0,
};

export const toDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const mapTemplateFromServer = (t: { id: string; name: string; description?: string; drills?: { id?: string; title?: string; duration?: number; summary?: string; cues?: { id?: string; text?: string; trigger?: string; seconds?: number }[] }[]; created_at?: string; rest_duration?: number }): Template => ({
  id: t.id,
  name: t.name,
  description: t.description,
  restDuration: t.rest_duration ?? undefined,
  drills: (t.drills ?? []).map((d) => ({
    id: d.id ?? uid('drill'),
    title: d.title ?? '',
    duration: d.duration ?? 0,
    summary: d.summary ?? '',
    cues: (d.cues ?? []).map((c) => ({
      id: c.id ?? uid('cue'),
      text: c.text ?? '',
      trigger: (c.trigger ?? 'start') as Cue['trigger'],
      seconds: c.seconds,
    })),
  })),
  createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
});

const mapPlanFromServer = (p: { id: string; user_id?: string; template_id?: string; title: string; date?: string; status?: string; note?: string; drills?: Drill[]; source_plan_id?: string; sharer_name?: string; created_at?: string; completed_at?: string }): TrainingPlan => ({
  id: p.id,
  userId: p.user_id,
  templateId: p.template_id,
  title: p.title,
  date: p.date,
  status: (p.status ?? 'planned') as PlanStatus,
  note: p.note,
  drills: p.drills,
  sourcePlanId: p.source_plan_id,
  sharerName: p.sharer_name,
  createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
  completedAt: p.completed_at ? new Date(p.completed_at).getTime() : undefined,
});

const mapRecordFromServer = (r: { id: string; plan_id: string; template_id?: string; user_id: string; title: string; status?: string; start_time?: string; end_time?: string; duration_seconds?: number; completed_drills?: number; total_drills?: number; note?: string; created_at?: string; completed_at?: string; executor?: { id: string; nickname: string; avatar: string | null }; source_plan_id?: string; sharer_name?: string; sharer_id?: string }): TrainingRecord => ({
  id: r.id,
  planId: r.plan_id,
  templateId: r.template_id,
  userId: r.user_id,
  title: r.title,
  status: (r.status ?? 'planned') as RecordStatus,
  startTime: r.start_time ? new Date(r.start_time).getTime() : undefined,
  endTime: r.end_time ? new Date(r.end_time).getTime() : undefined,
  durationSeconds: r.duration_seconds,
  completedDrills: r.completed_drills,
  totalDrills: r.total_drills,
  note: r.note,
  createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  completedAt: r.completed_at ? new Date(r.completed_at).getTime() : undefined,
  executor: r.executor
    ? {
        id: r.executor.id,
        nickname: r.executor.nickname,
        avatar: r.executor.avatar ?? null,
      }
    : undefined,
  sourcePlanId: r.source_plan_id,
  sharerName: r.sharer_name,
  sharerId: r.sharer_id,
});

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      templates: [],
      plans: [],
      records: [],
      session: initialSession,
      activeTemplateId: null,
      activePlanId: null,
      activeRecordId: null,
      synced: false,
      sessionPanelOpen: false,
      selectedPlanId: null,
      sharePlanId: null,
      plansPage: 1,
      plansPageSize: 20,
      plansTotal: 0,
      templatesPage: 1,
      templatesPageSize: 20,
      templatesTotal: 0,

      setTemplates: (t) => set({ templates: t }),
      setSharePlanId: (id) => set({ sharePlanId: id }),
      addTemplate: async (t) => {
        const tempId = t.id;
        set((s) => ({ templates: [...s.templates, t] }));
        const token = useAuthStore.getState().token;
        if (token) {
          const res = await api.post<{ template: { id: string; name: string; description?: string; drills?: { id?: string; title?: string; duration?: number; summary?: string; cues?: { id?: string; text?: string; trigger?: string; seconds?: number }[] }[]; created_at?: string } }>('/templates', {
            name: t.name,
            description: t.description,
            drills: t.drills,
          });
          if (res.error) {
            set((s) => ({ templates: s.templates.filter((x) => x.id !== tempId) }));
            return;
          }
          if (res.data?.template) {
            const serverT = mapTemplateFromServer(res.data.template);
            set((s) => ({
              templates: s.templates.map((x) => (x.id === tempId ? serverT : x)),
              activeTemplateId: s.activeTemplateId === tempId ? serverT.id : s.activeTemplateId,
            }));
          }
        }
      },
      updateTemplate: (id, patch) => {
        set((s) => ({
          templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
        const token = useAuthStore.getState().token;
        if (token) {
          const t = get().templates.find((x) => x.id === id);
          if (t) {
            api.patch(`/templates/${id}`, {
              name: t.name,
              description: t.description,
              drills: t.drills,
            });
          }
        }
      },
      removeTemplate: (id) => {
        set((s) => {
          const next = s.templates.filter((t) => t.id !== id);
          const active =
            s.activeTemplateId === id ? next[0]?.id ?? null : s.activeTemplateId;
          const plans = s.plans.filter((p) => p.templateId !== id);
          const records = s.records.filter((r) => r.templateId !== id);
          return { templates: next, activeTemplateId: active, plans, records };
        });
        const token = useAuthStore.getState().token;
        if (token) {
          api.delete(`/templates/${id}`);
        }
      },
      duplicateTemplate: (id) =>
        set((s) => {
          const t = s.templates.find((x) => x.id === id);
          if (!t) return {};
          const copy: Template = {
            ...t,
            id: uid('tpl'),
            name: `${t.name} 副本`,
            createdAt: Date.now(),
            drills: t.drills.map((d) => ({
              ...d,
              id: uid('drill'),
              cues: d.cues.map((c: Cue) => ({ ...c, id: uid('cue') })),
            })),
          };
          const token = useAuthStore.getState().token;
          if (token) {
            api.post('/templates', {
              name: copy.name,
              description: copy.description,
              drills: copy.drills,
            });
          }
          return { templates: [...s.templates, copy] };
        }),

      setActiveTemplate: (id) => set({ activeTemplateId: id }),
      setActivePlan: (id) => set({ activePlanId: id }),
      setActiveRecord: (id) => set({ activeRecordId: id }),
      setSessionPanelOpen: (open) => set({ sessionPanelOpen: open }),
      setSelectedPlanId: (id) => set({ selectedPlanId: id }),

      addPlan: async (plan) => {
        const tempId = uid('plan');
        const newPlan: TrainingPlan = {
          id: tempId,
          templateId: plan.templateId,
          title: plan.title,
          date: plan.date,
          status: plan.status ?? 'planned',
          note: plan.note,
          createdAt: Date.now(),
          completedAt: plan.completedAt,
        };
        set((s) => ({ plans: [newPlan, ...s.plans], activePlanId: tempId }));
        const token = useAuthStore.getState().token;
        if (token) {
          const res = await api.post<{ plan: { id: string; user_id?: string; template_id?: string; title: string; date?: string; status?: string; note?: string; drills?: Drill[]; source_plan_id?: string; sharer_name?: string; created_at?: string; completed_at?: string } }>('/plans', {
            template_id: plan.templateId,
            title: plan.title,
            date: plan.date,
            status: plan.status,
            note: plan.note,
          });
          if (res.error) {
            set((s) => ({
              plans: s.plans.filter((p) => p.id !== tempId),
              activePlanId: s.activePlanId === tempId ? null : s.activePlanId,
            }));
            return tempId;
          }
          if (res.data?.plan) {
            const serverPlan = mapPlanFromServer(res.data.plan);
            set((s) => ({
              plans: s.plans.map((p) => (p.id === tempId ? serverPlan : p)),
              activePlanId: s.activePlanId === tempId ? serverPlan.id : s.activePlanId,
            }));
            return serverPlan.id;
          }
        }
        return tempId;
      },
      updatePlan: (id, patch) => {
        set((s) => ({
          plans: s.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
        const token = useAuthStore.getState().token;
        if (token) {
          const body: Record<string, unknown> = {};
          if (patch.status) body.status = patch.status;
          if (patch.date) body.date = patch.date;
          if (patch.note !== undefined) body.note = patch.note;
          if (patch.completedAt !== undefined) body.completed_at = new Date(patch.completedAt).toISOString();
          if (Object.keys(body).length > 0) {
            api.patch(`/plans/${id}`, body);
          }
        }
      },
      removePlan: (id) => {
        set((s) => {
          const plans = s.plans.filter((p) => p.id !== id);
          const activePlanId = s.activePlanId === id ? null : s.activePlanId;
          const records = s.records.filter((r) => r.planId !== id);
          return { plans, activePlanId, records };
        });
        const token = useAuthStore.getState().token;
        if (token) {
          api.delete(`/plans/${id}`);
        }
      },
      setPlans: (plans) => set({ plans }),
      fetchPlansPage: async (page, pageSize = 20) => {
        const token = useAuthStore.getState().token;
        if (!token) return;
        const res = await api.get<{ plans: unknown[]; page?: number; pageSize?: number; total?: number }>(`/plans?page=${page}&pageSize=${pageSize}`);
        if (res.data) {
          const list = res.data.plans ?? [];
          set({
            plans: list.map(mapPlanFromServer),
            plansPage: res.data.page ?? page,
            plansPageSize: res.data.pageSize ?? pageSize,
            plansTotal: res.data.total ?? 0,
          });
        }
      },
      togglePlanStatus: (id) => {
        const plan = get().plans.find((p) => p.id === id);
        if (!plan) return;
        const newStatus: PlanStatus = plan.status === 'completed' ? 'planned' : 'completed';
        get().updatePlan(id, {
          status: newStatus,
          completedAt: newStatus === 'completed' ? Date.now() : undefined,
        });
      },
      getPlanByDate: (date) => get().plans.find((p) => p.date === date),

      addRecord: async (record) => {
        const tempId = uid('record');
        const newRecord: TrainingRecord = {
          id: tempId,
          planId: record.planId,
          templateId: record.templateId,
          userId: record.userId,
          title: record.title,
          status: record.status ?? 'planned',
          startTime: record.startTime,
          endTime: record.endTime,
          durationSeconds: record.durationSeconds,
          completedDrills: record.completedDrills,
          totalDrills: record.totalDrills,
          note: record.note,
          createdAt: Date.now(),
          completedAt: record.completedAt,
          sourcePlanId: record.sourcePlanId,
          sharerName: record.sharerName,
          sharerId: record.sharerId,
        };
        set((s) => ({ records: [newRecord, ...s.records], activeRecordId: tempId }));
        const token = useAuthStore.getState().token;
        if (token) {
          const res = await api.post<{ record: { id: string; plan_id: string; template_id?: string; user_id: string; title: string; status?: string; start_time?: string; end_time?: string; duration_seconds?: number; completed_drills?: number; total_drills?: number; note?: string; created_at?: string; completed_at?: string; executor?: { id: string; nickname: string; avatar: string | null }; source_plan_id?: string; sharer_name?: string; sharer_id?: string } }>('/records', {
            plan_id: record.planId,
            template_id: record.templateId,
            title: record.title,
            status: record.status,
            start_time: record.startTime ? new Date(record.startTime).toISOString() : undefined,
            end_time: record.endTime ? new Date(record.endTime).toISOString() : undefined,
            duration_seconds: record.durationSeconds,
            completed_drills: record.completedDrills,
            total_drills: record.totalDrills,
            note: record.note,
            source_plan_id: record.sourcePlanId,
            sharer_name: record.sharerName,
            sharer_id: record.sharerId,
          });
          if (res.error) {
            set((s) => ({
              records: s.records.filter((r) => r.id !== tempId),
              activeRecordId: s.activeRecordId === tempId ? null : s.activeRecordId,
            }));
            return tempId;
          }
          if (res.data?.record) {
            const serverRecord = mapRecordFromServer(res.data.record);
            set((s) => ({
              records: s.records.map((r) => (r.id === tempId ? serverRecord : r)),
              activeRecordId: s.activeRecordId === tempId ? serverRecord.id : s.activeRecordId,
            }));
            return serverRecord.id;
          }
        }
        return tempId;
      },
      updateRecord: (id, patch) => {
        set((s) => ({
          records: s.records.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
        const token = useAuthStore.getState().token;
        if (token) {
          const body: Record<string, unknown> = {};
          if (patch.status) body.status = patch.status;
          if (patch.startTime !== undefined) body.start_time = new Date(patch.startTime).toISOString();
          if (patch.endTime !== undefined) body.end_time = new Date(patch.endTime).toISOString();
          if (patch.durationSeconds !== undefined) body.duration_seconds = patch.durationSeconds;
          if (patch.completedDrills !== undefined) body.completed_drills = patch.completedDrills;
          if (patch.totalDrills !== undefined) body.total_drills = patch.totalDrills;
          if (patch.note !== undefined) body.note = patch.note;
          if (patch.completedAt !== undefined) body.completed_at = new Date(patch.completedAt).toISOString();
          if (Object.keys(body).length > 0) {
            api.patch(`/records/${id}`, body);
          }
        }
      },
      removeRecord: (id) => {
        set((s) => {
          const records = s.records.filter((r) => r.id !== id);
          const activeRecordId = s.activeRecordId === id ? null : s.activeRecordId;
          return { records, activeRecordId };
        });
        const token = useAuthStore.getState().token;
        if (token) {
          api.delete(`/records/${id}`);
        }
      },
      setRecords: (records) => set({ records }),
      toggleRecordStatus: (id) => {
        const record = get().records.find((r) => r.id === id);
        if (!record) return;
        const newStatus: RecordStatus = record.status === 'completed' ? 'in_progress' : 'completed';
        const now = Date.now();
        const newEndTime = newStatus === 'completed' ? now : undefined;
        const newDuration = newStatus === 'completed' && record.startTime ? Math.round((now - record.startTime) / 1000) : record.durationSeconds;
        const current = get();
        const tpl = record.templateId ? current.templates.find((t) => t.id === record.templateId) : null;
        const plan = current.plans.find((p) => p.id === record.planId);
        const totalDrills = tpl?.drills.length ?? plan?.drills.length ?? record.totalDrills ?? 0;
        const completedDrills = newStatus === 'completed' ? totalDrills : record.completedDrills;
        get().updateRecord(id, {
          status: newStatus,
          endTime: newEndTime,
          durationSeconds: newDuration,
          completedDrills,
          totalDrills,
          completedAt: newStatus === 'completed' ? now : undefined,
        });
        if (current.activeRecordId === id) {
          set({ activeRecordId: null, session: initialSession });
        }
      },

      startSession: (templateId, startIndex = 0, restDuration?: number) => {
        const current = get();
        const tpl = current.templates.find((t) => t.id === templateId);
        const plan = current.plans.find((p) => p.id === templateId);
        const drills = tpl?.drills ?? plan?.drills ?? [];
        const drill = drills[startIndex];
        if (!drill) return;
        const effectiveRestDuration = restDuration ?? tpl?.restDuration ?? plan?.restDuration ?? 0;
        set({
          activeTemplateId: templateId,
          session: {
            templateId,
            drillIndex: startIndex,
            remaining: drill.duration,
            status: 'running',
            previousStatus: null,
            startedAt: Date.now(),
            lastTickTs: Date.now(),
            drillStartedAt: Date.now(),
            restDuration: effectiveRestDuration,
            restRemaining: 0,
          },
        });
      },

      startRest: () => {
        const { session } = get();
        if (session.status !== 'finished' || session.restDuration <= 0) return;
        set((s) => ({
          session: {
            ...s.session,
            status: 'resting',
            restRemaining: s.session.restDuration,
            lastTickTs: Date.now(),
          },
        }));
      },

      finishRest: () => {
        const { session } = get();
        if (session.status !== 'resting') return;
        get().nextDrill();
      },

      pauseSession: () => {
        const { session, activeRecordId, records } = get();
        if (session.status !== 'running' && session.status !== 'resting') return;
        const record = activeRecordId ? records.find((r) => r.id === activeRecordId) : null;
        if (record && record.startTime) {
          const elapsedSec = Math.round((Date.now() - record.startTime) / 1000);
          const completedDrills = session.status === 'resting' ? session.drillIndex + 1 : session.drillIndex;
          get().updateRecord(record.id, {
            status: 'paused' as RecordStatus,
            durationSeconds: elapsedSec,
            completedDrills,
          });
        }
        set((s) => ({
          session: {
            ...s.session,
            status: 'paused',
            previousStatus: s.session.status,
            remaining: Math.max(0, s.session.remaining),
            restRemaining: Math.max(0, s.session.restRemaining),
          },
        }));
      },

      resumeSession: () =>
        set((s) => {
          if (s.session.status !== 'paused' && s.session.status !== 'ready') return {};
          const now = Date.now();
          let resumeStatus: SessionStatus = 'running';
          if (s.session.status === 'paused' && s.session.previousStatus) {
            resumeStatus = s.session.previousStatus;
          } else if (s.session.restRemaining > 0) {
            resumeStatus = 'resting';
          }
          return {
            session: {
              ...s.session,
              status: resumeStatus,
              previousStatus: null,
              lastTickTs: now,
              drillStartedAt: now,
            },
          };
        }),

      nextDrill: () => {
        const { session, activeRecordId, records } = get();
        if (!session.templateId) return;
        const current = get();
        const tpl = current.templates.find((t) => t.id === session.templateId);
        const plan = current.plans.find((p) => p.id === session.templateId);
        const drills = tpl?.drills ?? plan?.drills ?? [];
        if (drills.length === 0) return;
        const nextIdx = Math.min(session.drillIndex + 1, drills.length - 1);
        const drill = drills[nextIdx];
        
        const isFinished = nextIdx === session.drillIndex;
        if (activeRecordId && !isFinished) {
          const record = records.find((r) => r.id === activeRecordId);
          if (record && record.startTime) {
            const elapsedSec = Math.round((Date.now() - record.startTime) / 1000);
            get().updateRecord(record.id, {
              status: 'in_progress' as RecordStatus,
              durationSeconds: elapsedSec,
              completedDrills: nextIdx,
            });
          }
        }
        
        set((s) => ({
          session: {
            ...s.session,
            drillIndex: nextIdx,
            remaining: isFinished ? 0 : drill.duration,
            drillStartedAt: Date.now(),
            lastTickTs: Date.now(),
            status: isFinished ? 'finished' : 'running',
          },
        }));
      },

      prevDrill: () => {
        const state = get();
        if (!state.session.templateId) return;
        const tpl = state.templates.find((t) => t.id === state.session.templateId);
        const plan = state.plans.find((p) => p.id === state.session.templateId);
        const drills = tpl?.drills ?? plan?.drills ?? [];
        if (drills.length === 0) return;
        const idx = Math.max(state.session.drillIndex - 1, 0);
        const drill = drills[idx];
        
        if (state.activeRecordId) {
          get().updateRecord(state.activeRecordId, {
            completedDrills: Math.max(0, idx),
          });
        }
        
        set({
          session: {
            ...state.session,
            drillIndex: idx,
            remaining: drill.duration,
            drillStartedAt: Date.now(),
            lastTickTs: Date.now(),
            status: 'running',
          },
        });
      },

      skipToDrill: (index) =>
        set((s) => {
          if (!s.session.templateId) return {};
          const tpl = s.templates.find((t) => t.id === s.session.templateId);
          const plan = s.plans.find((p) => p.id === s.session.templateId);
          const drills = tpl?.drills ?? plan?.drills ?? [];
          if (drills.length === 0) return {};
          const drill = drills[index];
          if (!drill) return {};
          return {
            session: {
              ...s.session,
              drillIndex: index,
              completedDrills: index,
              remaining: drill.duration,
              drillStartedAt: Date.now(),
              lastTickTs: Date.now(),
              status: 'running',
            },
          };
        }),

      setRemaining: (seconds) =>
        set((s) => ({ session: { ...s.session, remaining: Math.max(0, seconds) } })),

      finishCurrentDrill: () => get().nextDrill(),

      resetSession: () => set({ session: initialSession }),

      cancelSession: () => {
        const { activeRecordId, removeRecord, records } = get();
        const currentUserId = useAuthStore.getState().user?.id;
        if (activeRecordId) {
          const record = records.find((r) => r.id === activeRecordId);
          if (record && record.userId === currentUserId) {
            if (record.status === 'in_progress' || record.status === 'paused') {
              removeRecord(activeRecordId);
            }
          }
        }
        set({ session: initialSession, activeRecordId: null });
      },

      resetCurrentDrill: () => {
        const { session, templates, plans } = get();
        if (!session.templateId) return;
        const tpl = templates.find((t) => t.id === session.templateId);
        const plan = plans.find((p) => p.id === session.templateId);
        const drills = tpl?.drills ?? plan?.drills ?? [];
        if (drills.length === 0) return;
        const drill = drills[session.drillIndex];
        if (!drill) return;
        set({
          session: {
            ...session,
            remaining: drill.duration,
            status: 'paused',
            drillStartedAt: Date.now(),
            lastTickTs: null,
          },
        });
      },

      tick: (nowTs) => {
        const s = get();
        if (s.session.status === 'running') {
          const lastTs = s.session.lastTickTs ?? nowTs;
          const deltaMs = Math.max(0, nowTs - lastTs);
          const deltaSec = deltaMs / 1000;
          const remaining = Math.max(0, s.session.remaining - deltaSec);
          if (remaining <= 0) {
            const current = get();
            const tpl = current.templates.find((t) => t.id === current.session.templateId);
            const plan = current.plans.find((p) => p.id === current.session.templateId);
            const drills = tpl?.drills ?? plan?.drills ?? [];
            const completedDrills = current.session.drillIndex + 1;
            
            if (current.activeRecordId) {
              const record = current.records.find((r) => r.id === current.activeRecordId);
              if (record && record.startTime) {
                const elapsedSec = Math.round((Date.now() - record.startTime) / 1000);
                get().updateRecord(record.id, {
                  durationSeconds: elapsedSec,
                  completedDrills,
                });
              }
            }
            
            if (current.session.drillIndex < drills.length - 1 && current.session.restDuration > 0) {
              set((state) => ({
                session: {
                  ...state.session,
                  remaining: 0,
                  restRemaining: state.session.restDuration,
                  lastTickTs: nowTs,
                  status: 'resting',
                },
              }));
            } else {
              get().finishCurrentDrill();
            }
          } else {
            set((state) => ({
              session: {
                ...state.session,
                remaining,
                lastTickTs: nowTs,
              },
            }));
          }
        }
        if (s.session.status === 'resting') {
          const lastTs = s.session.lastTickTs ?? nowTs;
          const deltaMs = Math.max(0, nowTs - lastTs);
          const deltaSec = deltaMs / 1000;
          const restRemaining = Math.max(0, s.session.restRemaining - deltaSec);
          if (restRemaining <= 0) {
            get().nextDrill();
          } else {
            set((state) => ({
              session: {
                ...state.session,
                restRemaining,
                lastTickTs: nowTs,
              },
            }));
          }
        }
      },

      syncFromServer: async (sharePlanId?: string) => {
        const token = useAuthStore.getState().token;
        if (!token) return;
        
        const currentState = get();
        const effectiveSharePlanId = sharePlanId ?? currentState.sharePlanId;
        
        if (syncPromise) {
          return syncPromise;
        }
        
        syncPromise = (async () => {
          try {
            const planUrl = effectiveSharePlanId ? `/plans?sharePlanId=${effectiveSharePlanId}` : '/plans';
            const [planRes, recordRes, templateRes] = await Promise.all([
              api.get<{ plans: unknown[] }>(planUrl),
              api.get<{ records: unknown[] }>('/records'),
              api.get<{ templates: unknown[] }>('/templates'),
            ]);
            if (planRes.data) {
              const list = planRes.data.plans ?? [];
              set((s) => ({ ...s, plans: list.map(mapPlanFromServer) }));
            }
            if (recordRes.data) {
              const list = recordRes.data.records ?? [];
              set((s) => ({ ...s, records: list.map(mapRecordFromServer) }));
            }
            if (templateRes.data) {
              const list = templateRes.data.templates ?? [];
              set((s) => ({ ...s, templates: list.map(mapTemplateFromServer) }));
            }
            set({ synced: true });
            
            const current = get();
            const currentUserId = useAuthStore.getState().user?.id;
            if (current.session.status === 'idle') {
              const activeRecords = current.records.filter(
                (r) => (r.status === 'in_progress' || r.status === 'paused') && r.userId === currentUserId
              );
              
              if (activeRecords.length > 0) {
                const todayKey = new Date().toISOString().split('T')[0];
                
                const sortedPlansWithRecords = [...activeRecords]
                  .map(record => {
                    const plan = current.plans.find((p) => p.id === record.planId);
                    return { record, plan };
                  })
                  .filter(({ plan }) => plan)
                  .sort((a, b) => {
                    const aIsShared = !!a.plan?.sourcePlanId;
                    const bIsShared = !!b.plan?.sourcePlanId;
                    if (aIsShared !== bIsShared) {
                      return aIsShared ? -1 : 1;
                    }
                    const aIsToday = a.plan?.date === todayKey;
                    const bIsToday = b.plan?.date === todayKey;
                    if (aIsToday !== bIsToday) {
                      return aIsToday ? -1 : 1;
                    }
                    const aIsPast = a.plan?.date && a.plan.date < todayKey;
                    const bIsPast = b.plan?.date && b.plan.date < todayKey;
                    if (aIsPast !== bIsPast) {
                      return aIsPast ? 1 : -1;
                    }
                    return (a.plan?.date || '').localeCompare(b.plan?.date || '');
                  });
                
                const bestMatch = sortedPlansWithRecords[0];
                if (bestMatch) {
                  const { record, plan } = bestMatch;
                  const drills = plan?.drills ?? [];
                  
                  if (drills.length > 0) {
                    const completedCount = Math.max(0, record.completedDrills ?? 0);
                    const drillIndex = Math.min(completedCount, Math.max(0, drills.length - 1));
                    const drill = drills[drillIndex];
                    const remaining = drill ? drill.duration : 0;
                    const isLastFinished = completedCount >= drills.length;
                    set({
                      session: {
                        ...initialSession,
                        templateId: record.planId,
                        drillIndex,
                        remaining,
                        status: isLastFinished ? 'finished' : 'ready',
                        startedAt: record.startTime ?? null,
                        lastTickTs: null,
                        drillStartedAt: null,
                        restDuration: record.restDuration ?? 0,
                      },
                      activeRecordId: record.id,
                    });
                  }
                }
              }
            }
          } finally {
            syncPromise = null;
          }
        })();
        
        return syncPromise;
      },

      fetchSharePlan: async (planId: string) => {
        try {
          const res = await api.get<{ plan: { id: string; user_id?: string; template_id?: string; title: string; date?: string; status?: string; note?: string; drills?: Drill[]; source_plan_id?: string; sharer_name?: string; created_at?: string; completed_at?: string } }>(`/records/share/${planId}`);
          if (res.data) {
            const plan = mapPlanFromServer(res.data.plan);
            return { plan };
          }
        } catch {
          return null;
        }
        return null;
      },
    }),
    {
      name: 'coach-train-v2:training',
      partialize: (state) => ({
        templates: state.templates,
        plans: state.plans,
        records: state.records,
        activeTemplateId: state.activeTemplateId,
        activePlanId: state.activePlanId,
        activeRecordId: state.activeRecordId,
        sharePlanId: state.sharePlanId,
        session: state.session.status !== 'idle' ? state.session : initialSession,
      }),
    }
  )
);