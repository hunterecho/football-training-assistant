import { describe, it, expect } from 'vitest';
import { toDateKey } from './trainingStore';

describe('Training Store', () => {
  describe('toDateKey', () => {
    it('should format date correctly', () => {
      const date = new Date(2024, 0, 15);
      expect(toDateKey(date)).toBe('2024-01-15');
    });

    it('should handle single digit months and days', () => {
      const date = new Date(2024, 5, 5);
      expect(toDateKey(date)).toBe('2024-06-05');
    });

    it('should handle December 31st', () => {
      const date = new Date(2024, 11, 31);
      expect(toDateKey(date)).toBe('2024-12-31');
    });
  });
});
