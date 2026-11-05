export const STORAGE_KEYS = {
  HISTORY: 'cardio30_history',
  ACTIVE_SESSION: 'cardio30_active_session',
};

export const MAX_ACTIVE_SESSION_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

export function toLocalDateString(d = new Date()) {
  const dateObj = d instanceof Date ? d : new Date(d);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class WorkoutStorage {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
  }

  getHistory() {
    if (!this.storage) return [];
    try {
      const data = this.storage.getItem(STORAGE_KEYS.HISTORY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  saveWorkout({ duration = 0, date = new Date(), completedAt = Date.now() } = {}) {
    if (!this.storage) return null;
    const dateStr = toLocalDateString(date);
    const history = this.getHistory();
    const entry = {
      date: dateStr,
      duration,
      completedAt: typeof completedAt === 'number' ? completedAt : Date.now(),
    };
    history.push(entry);
    try {
      this.storage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
      return entry;
    } catch {
      return null;
    }
  }

  clearHistory() {
    if (!this.storage) return;
    try {
      this.storage.removeItem(STORAGE_KEYS.HISTORY);
    } catch {}
  }

  getStreak(referenceDate = new Date()) {
    const history = this.getHistory();
    if (!history.length) return 0;

    const trainedDates = new Set(history.map((item) => item.date));
    const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

    // Normalize to local midnight
    const cursor = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

    const todayStr = toLocalDateString(cursor);
    const trainedToday = trainedDates.has(todayStr);

    let streak = 0;

    if (trainedToday) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
      while (trainedDates.has(toLocalDateString(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      return streak;
    }

    // If not trained today, check if trained yesterday (streak remains alive)
    cursor.setDate(cursor.getDate() - 1);
    if (!trainedDates.has(toLocalDateString(cursor))) {
      return 0;
    }

    while (trainedDates.has(toLocalDateString(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  getWeekHistory(referenceDate = new Date()) {
    const history = this.getHistory();
    const trainedDates = new Set(history.map((item) => item.date));
    const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - i);
      week.push(trainedDates.has(toLocalDateString(d)));
    }
    return week;
  }

  saveActiveSession(sessionData, savedAt = Date.now()) {
    if (!this.storage) return null;
    const data = {
      ...sessionData,
      savedAt: typeof savedAt === 'number' ? savedAt : Date.now(),
    };
    try {
      this.storage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(data));
      return data;
    } catch {
      return null;
    }
  }

  getActiveSession(now = Date.now()) {
    if (!this.storage) return null;
    try {
      const dataStr = this.storage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
      if (!dataStr) return null;
      const session = JSON.parse(dataStr);
      if (!session || typeof session.savedAt !== 'number') {
        this.clearActiveSession();
        return null;
      }
      if (now - session.savedAt > MAX_ACTIVE_SESSION_AGE_MS) {
        this.clearActiveSession();
        return null;
      }
      return session;
    } catch {
      this.clearActiveSession();
      return null;
    }
  }

  clearActiveSession() {
    if (!this.storage) return;
    try {
      this.storage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    } catch {}
  }
}
