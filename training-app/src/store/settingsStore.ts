import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings } from '@/types';
import { api } from '@/lib/api';

const DEFAULT_SETTINGS: Settings = {
  speechRate: 0.95,
  speechVolume: 0.85,
  speechEnabled: true,
  soundEnabled: true,
  speechVoiceIndex: 0,
  keepScreenAwake: true,
  llm: {
    provider: 'none',
    endpoint: '',
    apiKey: '',
    model: '',
  },
};

type SettingsStore = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  updateLLM: (patch: Partial<Settings['llm']>) => void;
  reset: () => void;
  loadFromBackend: () => Promise<void>;
  saveToBackend: () => Promise<void>;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) => {
        const newSettings = { ...get().settings, ...patch };
        set({ settings: newSettings });
      },
      updateLLM: (patch) => {
        const newSettings = {
          ...get().settings,
          llm: { ...get().settings.llm, ...patch },
        };
        set({ settings: newSettings });
      },
      reset: () => set({ settings: DEFAULT_SETTINGS }),
      loadFromBackend: async () => {
        const result = await api.get<{ settings: Partial<Settings> }>('/settings/user');
        if (result.data?.settings) {
          const merged = { ...get().settings, ...result.data.settings };
          if (result.data.settings.llm) {
            merged.llm = { ...get().settings.llm, ...result.data.settings.llm };
          }
          set({ settings: merged });
        }
      },
      saveToBackend: async () => {
        const settings = get().settings;
        await api.post('/settings/user', { settings });
      },
    }),
    {
      name: 'coach-train-v1:settings',
    }
  )
);
