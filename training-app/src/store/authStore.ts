import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export type AuthUser = {
  id: string;
  nickname: string;
  role?: string;
  avatar?: string;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  initialized: boolean;
  login: (nickname: string) => Promise<{ ok: boolean; error?: string }>;
  wechatLogin: (code: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      initialized: true,

      login: async (nickname) => {
        const res = await api.post<{ token: string; user: AuthUser }>(
          '/auth/mock',
          { nickname }
        );
        if (res.error) return { ok: false, error: res.error };
        set({ user: res.data!.user, token: res.data!.token });
        return { ok: true };
      },

      wechatLogin: async (code) => {
        const res = await api.post<{ token: string; user: AuthUser }>(
          '/auth/wechat',
          { code }
        );
        if (res.error) return { ok: false, error: res.error };
        set({ user: res.data!.user, token: res.data!.token });
        return { ok: true };
      },

      logout: () => set({ user: null, token: null }),

      refreshUser: async () => {
        const res = await api.get<{ user: AuthUser }>('/auth/me');
        if (res.data) set({ user: res.data.user });
      },
    }),
    {
      name: 'coach-train-v1:auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
