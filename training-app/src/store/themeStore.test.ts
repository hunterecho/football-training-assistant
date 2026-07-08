import { describe, it, expect } from 'vitest';
import { themes, ThemeName } from './themeStore';

describe('Theme Store', () => {
  describe('themes configuration', () => {
    it('should have 4 themes defined', () => {
      expect(Object.keys(themes).length).toBe(4);
    });

    it('should have day theme as default (vipOnly: false)', () => {
      expect(themes.day.vipOnly).toBe(false);
    });

    it('should have night theme as vipOnly', () => {
      expect(themes.night.vipOnly).toBe(true);
    });

    it('should have football theme as vipOnly', () => {
      expect(themes.football.vipOnly).toBe(true);
    });

    it('should have baseball theme as free (vipOnly: false)', () => {
      expect(themes.baseball.vipOnly).toBe(false);
    });

    it('should have required color properties for each theme', () => {
      const requiredColors = ['bg', 'bgSecondary', 'bgCard', 'text', 'textSecondary', 'accent', 'accentHover', 'border'];
      
      (Object.keys(themes) as ThemeName[]).forEach((themeName) => {
        const theme = themes[themeName];
        requiredColors.forEach((colorKey) => {
          expect(theme.colors[colorKey as keyof typeof theme.colors]).toBeDefined();
          expect(typeof theme.colors[colorKey as keyof typeof theme.colors]).toBe('string');
        });
      });
    });

    it('should have football theme with green background', () => {
      expect(themes.football.colors.bg).toBe('#065f46');
      expect(themes.football.colors.accent).toBe('#f59e0b');
    });

    it('should have night theme with dark background', () => {
      expect(themes.night.colors.bg).toBe('#0f172a');
      expect(themes.night.colors.text).toBe('#f1f5f9');
    });

    it('should have baseball theme with mud accent color', () => {
      expect(themes.baseball.colors.accent).toBe('#8B5A2B');
    });
  });
});
