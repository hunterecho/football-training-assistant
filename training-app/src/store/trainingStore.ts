import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Template, SessionState, Cue, TrainingPlan, PlanStatus } from '@/types';
import { defaultTemplate } from '@/data/defaultTemplate';
import { uid } from '@/utils/duration';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';

type TrainingStore = {
  templates: Template[];
  plans: TrainingPlan[];
  session: SessionState;
  activeTemplateId: string | null;
  activePlanId: string | null;
  synced: boolean;

  setTemplates: (t: Template[]) => void;
  addTemplate: (t: Template) => void;
  updateTemplate: (id: string, patch: Partial<Template>) => void;
  removeTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => void;

  setActiveTemplate: (id: string | null) => void;
  setActivePlan: (id: string | null) => void;

  addPlan: (plan: Omit<TrainingPlan, 'id' | 'createdAt' | 'status'> & { status?: PlanStatus }) => string;
  updatePlan: (id: string, patch: Partial<TrainingPlan>) => void;
  removePlan: (id: string) => void;
  completePlan: (id: string) => void;
  getPlanByDate: (date: string) => TrainingPlan | undefined;

  startSession: (templateId: string, startIndex?: number) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  nextDrill: () => void;
  prevDrill: () => void;
  skipToDrill: (index: number) => void;
  setRemaining: (seconds: number) => void;
  finishCurrentDrill: () => void;
  resetSession: () => void;
  tick: (nowTs: number) => void;

  syncFromServer: () => Promise<void>;
};

const initialSession: SessionState = {
  templateId: null,
  drillIndex: 0,
  remaining: 0,
  status: 'idle',
  startedAt: null,
  lastTickTs: null,
  drillStartedAt: null,
};

export const toDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const mapTemplateFromServer = (t: any): Template => ({
  id: t.id,
  name: t.name,
  description: t.description,
  drills: (t.drills ?? []).map((d: any) => ({
    id: d.id ?? uid('drill'),
    title: d.title ?? '',
    duration: d.duration ?? 0,
    cues: (d.cues ?? []).map((c: any) => ({
      id: c.id ?? uid('cue'),
      text: c.text ?? '',
      trigger: c.trigger ?? 'start',
      seconds: c.seconds,
    })),
  })),
  createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
});

const mapPlanFromServer = (p: any): TrainingPlan => ({
  id: p.id,
  templateId: p.template_id,
  title: p.title,
  date: p.date,
  note: p.note,
  status: p.status ?? 'planned',
  createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
  completedAt: p.completed_at ? new Date(p.completed_at).getTime() : undefined,
});

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      templates: [defaultTemplate],
      plans: [],
      session: initialSession,
      activeTemplateId: defaultTemplate.id,
      activePlanId: null,
      synced: false,

      setTemplates: (t) => set({ templates: t }),
      addTemplate: (t) => {
        set((s) => ({ templates: [...s.templates, t] }));
        const token = useAuthStore.getState().token;
        if (token) {
          api.post('/templates', {
            name: t.name,
            description: t.description,
            drills: t.drills,
          });
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
          return { templates: next, activeTemplateId: active, plans };
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

      addPlan: (plan) => {
        const id = uid('plan');
        const newPlan: TrainingPlan = {
          id,
          templateId: plan.templateId,
          title: plan.title,
          date: plan.date,
          note: plan.note,
          status: plan.status ?? 'planned',
          createdAt: Date.now(),
        };
        set((s) => ({ plans: [...s.plans, newPlan], activePlanId: id }));
        const token = useAuthStore.getState().token;
        if (token) {
          api.post('/plans', {
            template_id: plan.templateId,
            title: plan.title,
            date: plan.date,
            note: plan.note,
          });
        }
        return id;
      },
      updatePlan: (id, patch) => {
        set((s) => ({
          plans: s.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
        const token = useAuthStore.getState().token;
        if (token) {
          const p = get().plans.find((x) => x.id === id);
          if (p) {
            api.patch(`/plans/${id}`, {
              title: p.title,
              date: p.date,
              note: p.note,
              status: p.status,
            });
          }
        }
      },
      removePlan: (id) => {
        set((s) => {
          const plans = s.plans.filter((p) => p.id !== id);
          const activePlanId = s.activePlanId === id ? null : s.activePlanId;
          return { plans, activePlanId };
        });
        const token = useAuthStore.getState().token;
        if (token) {
          api.delete(`/plans/${id}`);
        }
      },
      completePlan: (id) => {
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === id
              ? { ...p, status: 'completed' as PlanStatus, completedAt: Date.now() }
              : p
          ),
        }));
        const token = useAuthStore.getState().token;
        if (token) {
          api.patch(`/plans/${id}`, {
            status: 'completed',
            completed_at: new Date().toISOString(),
          });
        }
      },
      getPlanByDate: (date) => get().plans.find((p) => p.date === date),

      startSession: (templateId, startIndex = 0) => {
        const tpl = get().templates.find((t) => t.id === templateId);
        if (!tpl) return;
        const drill = tpl.drills[startIndex];
        if (!drill) return;
        set({
          activeTemplateId: templateId,
          session: {
            templateId,
            drillIndex: startIndex,
            remaining: drill.duration,
            status: 'running',
            startedAt: Date.now(),
            lastTickTs: Date.now(),
            drillStartedAt: Date.now(),
          },
        });
      },

      pauseSession: () =>
        set((s) => {
          if (s.session.status !== 'running') return {};
          return {
            session: {
              ...s.session,
              status: 'paused',
              remaining: Math.max(0, s.session.remaining),
            },
          };
        }),

      resumeSession: () =>
        set((s) => {
          if (s.session.status !== 'paused') return {};
          return {
            session: {
              ...s.session,
              status: 'running',
              lastTickTs: Date.now(),
            },
          };
        }),

      nextDrill: () =>
        set((s) => {
          if (!s.session.templateId) return {};
          const tpl = s.templates.find((t) => t.id === s.session.templateId);
          if (!tpl) return {};
          const nextIdx = Math.min(s.session.drillIndex + 1, tpl.drills.length - 1);
          const drill = tpl.drills[nextIdx];
          return {
            session: {
              ...s.session,
              drillIndex: nextIdx,
              remaining: drill.duration,
              drillStartedAt: Date.now(),
              lastTickTs: Date.now(),
              status: nextIdx === s.session.drillIndex ? 'finished' : 'running',
            },
          };
        }),

      prevDrill: () =>
        set((s) => {
          if (!s.session.templateId) return {};
          const tpl = s.templates.find((t) => t.id === s.session.templateId);
          if (!tpl) return {};
          const idx = Math.max(s.session.drillIndex - 1, 0);
          const drill = tpl.drills[idx];
          return {
            session: {
              ...s.session,
              drillIndex: idx,
              remaining: drill.duration,
              drillStartedAt: Date.now(),
              lastTickTs: Date.now(),
              status: 'running',
            },
          };
        }),

      skipToDrill: (index) =>
        set((s) => {
          if (!s.session.templateId) return {};
          const tpl = s.templates.find((t) => t.id === s.session.templateId);
          if (!tpl) return {};
          const drill = tpl.drills[index];
          if (!drill) return {};
          return {
            session: {
              ...s.session,
              drillIndex: index,
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

      tick: (nowTs) =>
        set((s) => {
          if (s.session.status !== 'running') return {};
          const lastTs = s.session.lastTickTs ?? nowTs;
          const deltaMs = Math.max(0, nowTs - lastTs);
          const deltaSec = deltaMs / 1000;
          const remaining = Math.max(0, s.session.remaining - deltaSec);
          const next: SessionState = {
            ...s.session,
            remaining,
            lastTickTs: nowTs,
            status: remaining <= 0 ? 'finished' : 'running',
          };
          return { session: next };
        }),

      syncFromServer: async () => {
        const token = useAuthStore.getState().token;
        if (!token) return;
        const [tplRes, planRes] = await Promise.all([
          api.get<any>('/templates'),
          api.get<any>('/plans'),
        ]);
        if (tplRes.data) {
          const list = (tplRes.data as any).templates ?? [];
          set((s) => ({ ...s, templates: list.map(mapTemplateFromServer) }));
        }
        if (planRes.data) {
          const list = (planRes.data as any).plans ?? [];
          set((s) => ({ ...s, plans: list.map(mapPlanFromServer) }));
        }
        set({ synced: true });
      },
    }),
    {
      name: 'coach-train-v2:training',
      partialize: (state) => ({
        templates: state.templates,
        plans: state.plans,
        activeTemplateId: state.activeTemplateId,
        activePlanId: state.activePlanId,
      }),
    }
  )
);
