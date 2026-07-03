import { describe, it, expect } from 'vitest';
import { formatDuration, formatDurationChinese, parseDuration, totalDuration, uid } from '@/utils/duration';

describe('duration utils', () => {
  describe('formatDuration', () => {
    it('should format 0 seconds correctly', () => {
      expect(formatDuration(0)).toBe('00:00');
    });

    it('should format 59 seconds correctly', () => {
      expect(formatDuration(59)).toBe('00:59');
    });

    it('should format 60 seconds correctly', () => {
      expect(formatDuration(60)).toBe('01:00');
    });

    it('should format 125 seconds correctly', () => {
      expect(formatDuration(125)).toBe('02:05');
    });

    it('should handle negative seconds', () => {
      expect(formatDuration(-5)).toBe('00:00');
    });
  });

  describe('formatDurationChinese', () => {
    it('should format 0 seconds correctly', () => {
      expect(formatDurationChinese(0)).toBe('0 秒');
    });

    it('should format 30 seconds correctly', () => {
      expect(formatDurationChinese(30)).toBe('30 秒');
    });

    it('should format 60 seconds correctly', () => {
      expect(formatDurationChinese(60)).toBe('1 分钟');
    });

    it('should format 95 seconds correctly', () => {
      expect(formatDurationChinese(95)).toBe('1 分 35 秒');
    });
  });

  describe('parseDuration', () => {
    it('should parse pure numbers', () => {
      expect(parseDuration('30')).toBe(30);
      expect(parseDuration('60')).toBe(60);
    });

    it('should parse Chinese duration with minutes', () => {
      expect(parseDuration('1min')).toBe(60);
      expect(parseDuration('1minute')).toBe(60);
    });

    it('should parse Chinese duration with seconds', () => {
      expect(parseDuration('30s')).toBe(30);
      expect(parseDuration('30sec')).toBe(30);
    });

    it('should parse mixed Chinese duration', () => {
      expect(parseDuration('1分30秒')).toBe(90);
      expect(parseDuration('2分 45 秒')).toBe(165);
    });

    it('should parse English duration', () => {
      expect(parseDuration('1min')).toBe(60);
      expect(parseDuration('1minute')).toBe(60);
      expect(parseDuration('30s')).toBe(30);
      expect(parseDuration('30sec')).toBe(30);
    });

    it('should return null for invalid input', () => {
      expect(parseDuration('')).toBe(null);
      expect(parseDuration('abc')).toBe(null);
    });
  });

  describe('totalDuration', () => {
    it('should format seconds only', () => {
      expect(totalDuration(30)).toBe('30 秒');
    });

    it('should format minutes and seconds', () => {
      expect(totalDuration(95)).toBe('1 分 35 秒');
    });

    it('should format hours, minutes and seconds', () => {
      expect(totalDuration(3725)).toBe('1 时 2 分 5 秒');
    });
  });

  describe('uid', () => {
    it('should generate unique ids', () => {
      const id1 = uid();
      const id2 = uid();
      expect(id1).not.toBe(id2);
    });

    it('should generate ids with prefix', () => {
      const id = uid('plan');
      expect(id.startsWith('plan_')).toBe(true);
    });
  });
});