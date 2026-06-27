import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Template, SessionState, Cue, TrainingRecord, RecordStatus } from '@/types';
import { defaultTemplate } from '@/data/defaultTemplate';
import { uid } from '@/utils/duration';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';

type TrainingStore = {
  templates: Template[];
  records: TrainingRecord[];
  session: SessionState;
  activeTemplateId: string | null;
  activeRecordId: string | null;
  synced: boolean;
  sessionPanelOpen: boolean;

  setTemplates: (t: Template[]) => void;
  addTemplate: (t: Template) => void;
  updateTemplate: (id: string, patch: Partial<Template>) => void;
  removeTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => void;

  setActiveTemplate: (id: string | null) => void;
  setActiveRecord: (id: string | null) => void;
  setSessionPanelOpen: (open: boolean) => void;

  addRecord: (record: Omit<TrainingRecord, 'id' | 'createdAt'>) => string;
  updateRecord: (id: string, patch: Partial<TrainingRecord>) => void;
  removeRecord: (id: string) => void;
  setRecords: (records: TrainingRecord[]) => void;
  toggleRecordStatus: (id: string) => void;
  getRecordByDate: (date: string) => TrainingRecord | undefined;

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

const mapRecordFromServer = (r: any): TrainingRecord => ({
  id: r.id,
  templateId: r.template_id,
  title: r.title,
  date: r.date,
  status: r.status ?? 'planned',
  startTime: r.start_time ? new Date(r.start_time).getTime() : undefined,
  endTime: r.end_time ? new Date(r.end_time).getTime() : undefined,
  durationSeconds: r.duration_seconds,
  completedDrills: r.completed_drills,
  totalDrills: r.total_drills,
  note: r.note,
  createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  completedAt: r.completed_at ? new Date(r.completed_at).getTime() : undefined,
});

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      templates: [defaultTemplate],
      records: [],
      session: initialSession,
      activeTemplateId: defaultTemplate.id,
      activeRecordId: null,
      synced: false,
      sessionPanelOpen: false,

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
          const records = s.records.filter((r) => r.templateId !== id);
          return { templates: next, activeTemplateId: active, records };
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
      setActiveRecord: (id) => set({ activeRecordId: id }),
      setSessionPanelOpen: (open) => set({ sessionPanelOpen: open }),

      addRecord: (record) => {
        const id = uid('record');
        const newRecord: TrainingRecord = {
          id,
          templateId: record.templateId,
          title: record.title,
          date: record.date,
          status: record.status ?? 'planned',
          startTime: record.startTime,
          endTime: record.endTime,
          durationSeconds: record.durationSeconds,
          completedDrills: record.completedDrills,
          totalDrills: record.totalDrills,
          note: record.note,
          createdAt: Date.now(),
          completedAt: record.completedAt,
        };
        set((s) => ({ records: [newRecord, ...s.records], activeRecordId: id }));
        const token = useAuthStore.getState().token;
        if (token) {
          api.post('/records', {
            template_id: record.templateId,
            title: record.title,
            date: record.date,
            status: record.status,
            start_time: record.startTime ? new Date(record.startTime).toISOString() : undefined,
            end_time: record.endTime ? new Date(record.endTime).toISOString() : undefined,
            duration_seconds: record.durationSeconds,
            completed_drills: record.completedDrills,
            total_drills: record.totalDrills,
            note: record.note,
          });
        }
        return id;
      },
      updateRecord: (id, patch) => {
        set((s) => ({
          records: s.records.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
        const token = useAuthStore.getState().token;
        if (token) {
          const body: Record<string, unknown> = {};
          if (patch.status) body.status = patch.status;
          if (patch.date) body.date = patch.date;
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
        get().updateRecord(id, {
          status: newStatus,
          endTime: newEndTime,
          durationSeconds: newDuration,
          completedAt: newStatus === 'completed' ? now : undefined,
        });
        const current = get();
        if (current.activeRecordId === id) {
          set({ activeRecordId: null, session: initialSession });
        }
      },
      getRecordByDate: (date) => get().records.find((r) => r.date === date),

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
        const [tplRes, recordRes] = await Promise.all([
          api.get<any>('/templates'),
          api.get<any>('/records'),
        ]);
        if (tplRes.data) {
          const list = (tplRes.data as any).templates ?? [];
          set((s) => ({ ...s, templates: list.map(mapTemplateFromServer) }));
        }
        if (recordRes.data) {
          const list = (recordRes.data as any).records ?? [];
          set((s) => ({ ...s, records: list.map(mapRecordFromServer) }));
        }
        set({ synced: true });

        const current = get();
        if (current.session.status === 'idle') {
          const inProgressRecord = current.records.find(
            (r) => r.status === 'in_progress'
          );
          if (inProgressRecord && inProgressRecord.startTime && inProgressRecord.templateId) {
            const tpl = current.templates.find(
              (t) => t.id === inProgressRecord.templateId
            );
            if (tpl) {
              const elapsed = (Date.now() - inProgressRecord.startTime) / 1000;
              let remaining = 0;
              let drillIndex = 0;
              let accumulated = 0;
              for (let i = 0; i < tpl.drills.length; i++) {
                accumulated += tpl.drills[i].duration;
                if (elapsed < accumulated) {
                  drillIndex = i;
                  remaining = accumulated - elapsed;
                  break;
                }
              }
              if (drillIndex >= tpl.drills.length) {
                drillIndex = tpl.drills.length - 1;
                remaining = 0;
              }
              set({
                session: {
                  ...initialSession,
                  templateId: tpl.id,
                  drillIndex,
                  remaining,
                  status: 'paused',
                  startedAt: inProgressRecord.startTime,
                  lastTickTs: null,
                  drillStartedAt: null,
                },
                activeRecordId: inProgressRecord.id,
              });
            }
          }
        }
      },
    }),
    {
      name: 'coach-train-v2:training',
      partialize: (state) => ({
        templates: state.templates,
        records: state.records,
        activeTemplateId: state.activeTemplateId,
        activeRecordId: state.activeRecordId,
        session: state.session.status !== 'idle' ? state.session : initialSession,
      }),
    }
  )
);