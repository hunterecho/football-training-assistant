import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'day' | 'night' | 'football' | 'baseball';

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
}

export interface ThemeConfig {
  name: ThemeName;
  label: string;
  icon: string;
  vipOnly: boolean;
  colors: {
    bg: string;
    bgSecondary: string;
    bgCard: string;
    bgHover: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentLight: string;
    border: string;
    borderLight: string;
    success: string;
    warning: string;
    danger: string;
    scrollbar: string;
    bgSecondaryMuted: string;
    bgSecondarySubtle: string;
    bgCardMuted: string;
    bgCardLight: string;
    bgCardSubtle: string;
    bgCardFaint: string;
    bgCardHoverLight: string;
    bgCardVeryFaint: string;
    bgCardExtraFaint: string;
    bgSecondaryLight: string;
    bgBottomNav: string;
    bgBottomNavLight: string;
  };
}

export const themes: Record<ThemeName, ThemeConfig> = {
  day: {
    name: 'day',
    label: '简约模式',
    icon: '☀️',
    vipOnly: false,
    colors: {
      bg: '#ffffff',
      bgSecondary: '#f7f7f7',
      bgCard: '#fafafa',
      bgHover: '#f0f0f0',
      text: '#333333',
      textSecondary: '#666666',
      textMuted: '#999999',
      accent: '#10894E',
      accentHover: '#0E7A43',
      accentLight: '#E6F5ED',
      border: '#e5e5e5',
      borderLight: '#f0f0f0',
      success: '#10894E',
      warning: '#FF9500',
      danger: '#FF4D4F',
      scrollbar: '#d1d5db',
      bgSecondaryMuted: '#e8e8e8',
      bgSecondarySubtle: '#f0f0f0',
      bgCardMuted: '#f5f5f5',
      bgCardLight: '#ffffffcc',
      bgCardSubtle: '#f5f5f5',
      bgCardFaint: '#fafafa',
      bgCardHoverLight: '#f5f5f5',
      bgCardVeryFaint: '#fafafa',
      bgCardExtraFaint: '#f0f0f0',
      bgSecondaryLight: '#f7f7f7cc',
      bgBottomNav: '#ffffffcc',
      bgBottomNavLight: '#ffffff80',
    },
  },
  night: {
    name: 'night',
    label: '夜晚模式',
    icon: '🌙',
    vipOnly: true,
    colors: {
      bg: '#0f172a',
      bgSecondary: '#1e293b',
      bgCard: '#1e293b',
      bgHover: '#334155',
      text: '#f1f5f9',
      textSecondary: '#cbd5e1',
      textMuted: '#64748b',
      accent: '#8b5cf6',
      accentHover: '#7c3aed',
      accentLight: '#1e1b4b',
      border: '#334155',
      borderLight: '#1e293b',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      scrollbar: '#475569',
      bgSecondaryMuted: '#0f172a',
      bgSecondarySubtle: '#0f172a',
      bgCardMuted: '#1e293b',
      bgCardLight: '#1e293bcc',
      bgCardSubtle: '#1e293b',
      bgCardFaint: '#0f172a',
      bgCardHoverLight: '#334155',
      bgCardVeryFaint: '#0f172a',
      bgCardExtraFaint: '#0f172a',
      bgSecondaryLight: '#1e293bcc',
      bgBottomNav: '#1e293bcc',
      bgBottomNavLight: '#1e293b80',
    },
  },
  football: {
    name: 'football',
    label: '足球模式',
    icon: '⚽',
    vipOnly: true,
    colors: {
      bg: '#065f46',
      bgSecondary: '#047857',
      bgCard: '#ffffff',
      bgHover: '#f0fdf4',
      text: '#064e3b',
      textSecondary: '#059669',
      textMuted: '#34d399',
      accent: '#f59e0b',
      accentHover: '#d97706',
      accentLight: '#fffbeb',
      border: '#d1fae5',
      borderLight: '#a7f3d0',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
      scrollbar: '#047857',
      bgSecondaryMuted: '#065f46',
      bgSecondarySubtle: '#065f46',
      bgCardMuted: '#f0fdf4',
      bgCardLight: '#ffffffcc',
      bgCardSubtle: '#f0fdf4',
      bgCardFaint: '#f0fdf4',
      bgCardHoverLight: '#d1fae5',
      bgCardVeryFaint: '#f0fdf4',
      bgCardExtraFaint: '#d1fae5',
      bgSecondaryLight: '#047857cc',
      bgBottomNav: '#ffffffcc',
      bgBottomNavLight: '#ffffff80',
    },
  },
  baseball: {
    name: 'baseball',
    label: '棒球模式',
    icon: '⚾',
    vipOnly: false,
    colors: {
      bg: '#ffffff',
      bgSecondary: '#f7f7f7',
      bgCard: '#fafafa',
      bgHover: '#f0f0f0',
      text: '#333333',
      textSecondary: '#666666',
      textMuted: '#999999',
      accent: '#8B5A2B',
      accentHover: '#6B4423',
      accentLight: '#fdf6e3',
      border: '#e5e5e5',
      borderLight: '#f0f0f0',
      success: '#8B5A2B',
      warning: '#FF9500',
      danger: '#FF4D4F',
      scrollbar: '#d1d5db',
      bgSecondaryMuted: '#e8e8e8',
      bgSecondarySubtle: '#f0f0f0',
      bgCardMuted: '#f5f5f5',
      bgCardLight: '#ffffffcc',
      bgCardSubtle: '#f5f5f5',
      bgCardFaint: '#fafafa',
      bgCardHoverLight: '#f5f5f5',
      bgCardVeryFaint: '#fafafa',
      bgCardExtraFaint: '#f0f0f0',
      bgSecondaryLight: '#f7f7f7cc',
      bgBottomNav: '#ffffffcc',
      bgBottomNavLight: '#ffffff80',
    },
  },
};

interface ThemeStore {
  currentTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  getThemeConfig: () => ThemeConfig;
  applyTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentTheme: 'day',
      setTheme: (theme) => {
        set({ currentTheme: theme });
        get().applyTheme();
      },
      getThemeConfig: () => {
        return themes[get().currentTheme];
      },
      applyTheme: () => {
        const config = themes[get().currentTheme];
        const root = document.documentElement;
        Object.entries(config.colors).forEach(([key, value]) => {
          root.style.setProperty(`--color-${key}`, value);
        });
        root.style.setProperty(`--color-accent-rgb`, hexToRgb(config.colors.accent));
      },
    }),
    {
      name: 'training-theme',
    }
  )
);