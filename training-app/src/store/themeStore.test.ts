import { describe, it, expect } from 'vitest';
import { themes, ThemeName } from './themeStore';

describe('Theme Store', () => {
  describe('themes configuration', () => {
    it('should have 2 themes defined', () => {
      expect(Object.keys(themes).length).toBe(2);
    });

    it('should have day theme as default (vipOnly: false)', () => {
      expect(themes.day.vipOnly).toBe(false);
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

    it('should have day theme with green accent color', () => {
      expect(themes.day.colors.accent).toBe('#10894E');
    });

    it('should have baseball theme with mud accent color', () => {
      expect(themes.baseball.colors.accent).toBe('#8B5A2B');
    });
  });
});