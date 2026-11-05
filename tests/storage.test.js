import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkoutStorage } from '../src/storage.js';

describe('WorkoutStorage', () => {
  let mockStorage;
  let store;

  beforeEach(() => {
    mockStorage = (() => {
      let items = {};
      return {
        getItem: vi.fn((key) => items[key] || null),
        setItem: vi.fn((key, value) => {
          items[key] = String(value);
        }),
        removeItem: vi.fn((key) => {
          delete items[key];
        }),
        clear: vi.fn(() => {
          items = {};
        }),
      };
    })();

    store = new WorkoutStorage(mockStorage);
  });

  describe('History & Completed Workouts', () => {
    it('saves a completed workout to storage with date and duration', () => {
      const fixedDate = new Date(2026, 10, 5, 10, 30); // 2026-11-05
      store.saveWorkout({ duration: 2340, date: fixedDate });

      const history = store.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        duration: 2340,
        date: '2026-11-05',
      });
      expect(typeof history[0].completedAt).toBe('number');
    });

    it('appends multiple completed workouts in chronological order', () => {
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 3) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 4) });

      const history = store.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].date).toBe('2026-11-03');
      expect(history[1].date).toBe('2026-11-04');
    });
  });

  describe('Error Resilience & Edge Cases', () => {
    it('handles empty storage gracefully without errors', () => {
      expect(store.getHistory()).toEqual([]);
    });

    it('handles corrupted JSON in storage without crashing', () => {
      mockStorage.getItem.mockReturnValueOnce('{ invalid json');
      expect(store.getHistory()).toEqual([]);
    });

    it('handles QuotaExceededError when saving workout without crashing', () => {
      mockStorage.setItem.mockImplementationOnce(() => {
        const error = new Error('The quota has been exceeded.');
        error.name = 'QuotaExceededError';
        throw error;
      });

      expect(() => {
        store.saveWorkout({ duration: 2340 });
      }).not.toThrow();
    });

    it('works safely when storage instance is null or undefined', () => {
      const nullStore = new WorkoutStorage(null);
      expect(nullStore.getHistory()).toEqual([]);
      expect(() => nullStore.saveWorkout({ duration: 2340 })).not.toThrow();
      expect(() => nullStore.clearHistory()).not.toThrow();
    });
  });

  describe('Streak Calculation', () => {
    it('returns 0 when there is no workout history', () => {
      expect(store.getStreak()).toBe(0);
    });

    it('returns 1 when there is a workout today', () => {
      const today = new Date(2026, 10, 5);
      store.saveWorkout({ duration: 2340, date: today });
      expect(store.getStreak(today)).toBe(1);
    });

    it('returns 1 when there was a workout yesterday and none today (streak alive)', () => {
      const today = new Date(2026, 10, 5);
      const yesterday = new Date(2026, 10, 4);
      store.saveWorkout({ duration: 2340, date: yesterday });
      expect(store.getStreak(today)).toBe(1);
    });

    it('returns 0 when the last workout was 2 or more days ago', () => {
      const today = new Date(2026, 10, 5);
      const twoDaysAgo = new Date(2026, 10, 3);
      store.saveWorkout({ duration: 2340, date: twoDaysAgo });
      expect(store.getStreak(today)).toBe(0);
    });

    it('calculates consecutive day streaks correctly ending today', () => {
      const today = new Date(2026, 10, 5);
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 1) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 2) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 3) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 4) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 5) });

      expect(store.getStreak(today)).toBe(5);
    });

    it('calculates consecutive day streaks ending yesterday when today is not yet done', () => {
      const today = new Date(2026, 10, 5);
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 2) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 3) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 4) });

      expect(store.getStreak(today)).toBe(3);
    });

    it('counts multiple workouts on the same day as 1 day for streak', () => {
      const today = new Date(2026, 10, 5);
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 4, 8, 0) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 4, 18, 0) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 5, 9, 0) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 5, 17, 0) });

      expect(store.getStreak(today)).toBe(2);
    });

    it('breaks streak when a day is missed', () => {
      const today = new Date(2026, 10, 5);
      // Workout on 1st, 2nd, skipped 3rd, 4th, 5th
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 1) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 2) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 4) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 5) });

      expect(store.getStreak(today)).toBe(2); // only 4th and 5th
    });
  });

  describe('7-Day History Calculation', () => {
    it('returns array of 7 false values when there is no history', () => {
      const today = new Date(2026, 10, 7);
      expect(store.getWeekHistory(today)).toEqual([
        false, false, false, false, false, false, false
      ]);
    });

    it('returns true only for days with a workout in the last 7 days ending today', () => {
      const today = new Date(2026, 10, 7);
      // Today is Nov 7. The 7 days are Nov 1, 2, 3, 4, 5, 6, 7.
      // Train on Nov 2 (index 1), Nov 5 (index 4), and Nov 7 (index 6)
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 2) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 5) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 7) });

      expect(store.getWeekHistory(today)).toEqual([
        false, true, false, false, true, false, true
      ]);
    });

    it('ignores workouts older than 7 days ago', () => {
      const today = new Date(2026, 10, 7);
      // 8 days ago: Oct 30
      store.saveWorkout({ duration: 2340, date: new Date(2026, 9, 30) });
      store.saveWorkout({ duration: 2340, date: new Date(2026, 10, 7) });

      expect(store.getWeekHistory(today)).toEqual([
        false, false, false, false, false, false, true
      ]);
    });
  });

  describe('Active Session Persistence & Recovery', () => {
    it('saves and restores an in-progress session within 2 hours', () => {
      const now = Date.now();
      const sessionData = {
        sequence: [{ round: 1, exercise: { name: 'Jumping Jacks' } }],
        state: 'WORK',
        roundIndex: 14,
        stretchIndex: 0,
        currentIntervalIndex: 27,
        currentIntervalRemaining: 35,
        currentIntervalDuration: 60,
        isPaused: true,
      };

      store.saveActiveSession(sessionData, now);

      const restored = store.getActiveSession(now + 30 * 60 * 1000); // 30 minutes later
      expect(restored).not.toBeNull();
      expect(restored.roundIndex).toBe(14);
      expect(restored.currentIntervalRemaining).toBe(35);
      expect(restored.savedAt).toBe(now);
    });

    it('discards a session older than 2 hours and clears it from storage', () => {
      const now = Date.now();
      const twoHoursOneSec = 2 * 60 * 60 * 1000 + 1000;
      store.saveActiveSession({ roundIndex: 5, state: 'WORK' }, now);

      const restored = store.getActiveSession(now + twoHoursOneSec);
      expect(restored).toBeNull();
      expect(mockStorage.removeItem).toHaveBeenCalledWith('cardio30_active_session');
    });

    it('returns null and does not crash when active session is corrupted', () => {
      mockStorage.getItem.mockImplementationOnce((key) => {
        if (key === 'cardio30_active_session') return '{ bad json';
        return null;
      });

      expect(store.getActiveSession()).toBeNull();
    });

    it('clears active session explicitly when clearActiveSession is called', () => {
      store.saveActiveSession({ roundIndex: 1 });
      store.clearActiveSession();

      expect(store.getActiveSession()).toBeNull();
      expect(mockStorage.removeItem).toHaveBeenCalledWith('cardio30_active_session');
    });
  });

  describe('install hint banner dismissal', () => {
    it('returns false by default when install hint has not been dismissed', () => {
      expect(store.isInstallHintDismissed()).toBe(false);
    });

    it('persists dismissal and returns true after dismissInstallHint is called', () => {
      store.dismissInstallHint();
      expect(mockStorage.setItem).toHaveBeenCalledWith('cardio30_install_hint_dismissed', 'true');
      expect(store.isInstallHintDismissed()).toBe(true);
    });
  });
});
