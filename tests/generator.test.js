import { describe, it, expect } from 'vitest';
import {
  WORK_DURATION_SEC,
  REST_DURATION_SEC,
  CARDIO_TARGET_SEC,
  ROUND_COUNT,
  CARDIO_DURATION_SEC,
  WARM_UP_DURATION_SEC,
  GET_READY_DURATION_SEC,
  TOTAL_SESSION_SEC,
  CARDIO_POOL,
  COOLDOWN_STRETCHES,
  COOLDOWN_TOTAL_SEC,
  computeRoundCount,
  generateWorkoutSequence,
} from '../src/generator.js';

describe('Workout Constants & Fixed Cardio Rule', () => {
  it('computes round count as floor(1800 / 80) = 22, independent of pool size', () => {
    expect(WORK_DURATION_SEC).toBe(60);
    expect(REST_DURATION_SEC).toBe(20);
    expect(CARDIO_TARGET_SEC).toBe(1800);
    expect(ROUND_COUNT).toBe(22);
    expect(CARDIO_DURATION_SEC).toBe(1760); // 22 * 80s = 29:20
    expect(computeRoundCount(1800, 60, 20)).toBe(22);
  });

  it('defines the 8-movement cardio pool and 11 cooldown stretches totalling 2340s (39:00)', () => {
    expect(CARDIO_POOL).toHaveLength(8);
    expect(CARDIO_POOL.map((m) => m.name)).toEqual([
      'Jumping Jacks',
      'Butt Kicks',
      'Squat Jumps',
      'High Knees',
      'Skater Step & Floor Touch',
      'Reverse Lunge & Knee Drive',
      'Jump Rope',
      'Standing Cross-Body Knee Crunch',
    ]);

    expect(COOLDOWN_STRETCHES).toHaveLength(11);
    const sumCooldown = COOLDOWN_STRETCHES.reduce((acc, s) => acc + s.duration, 0);
    expect(sumCooldown).toBe(460);
    expect(COOLDOWN_TOTAL_SEC).toBe(460);

    expect(GET_READY_DURATION_SEC).toBe(10);
    expect(WARM_UP_DURATION_SEC).toBe(120);

    // 120s warm-up + 1760s cardio + 460s cooldown = 2340s (39:00)
    expect(TOTAL_SESSION_SEC).toBe(2340);
  });
});

describe('Workout Sequence Generator', () => {
  it('builds 22 rounds in passes with Fisher-Yates and no repeated movements across pass boundaries', () => {
    // Run multiple iterations to test random shuffles and boundary collision resolution
    for (let run = 0; run < 100; run++) {
      const sequence = generateWorkoutSequence();
      expect(sequence).toHaveLength(22);

      // Verify pass 1 (rounds 1–8) has all 8 movements
      const pass1 = sequence.slice(0, 8).map((r) => r.exercise.id);
      expect(new Set(pass1).size).toBe(8);

      // Verify pass 2 (rounds 9–16) has all 8 movements
      const pass2 = sequence.slice(8, 16).map((r) => r.exercise.id);
      expect(new Set(pass2).size).toBe(8);

      // Verify pass 3 (rounds 17–22) has 6 different movements
      const pass3 = sequence.slice(16, 22).map((r) => r.exercise.id);
      expect(new Set(pass3).size).toBe(6);

      // Finisher flag is true for rounds 17–22
      for (const r of sequence) {
        if (r.round >= 17) {
          expect(r.isFinisher).toBe(true);
        } else {
          expect(r.isFinisher).toBe(false);
        }
      }

      // Verify no movement runs in two rounds in a row anywhere, including pass boundaries
      for (let i = 0; i < sequence.length - 1; i++) {
        expect(sequence[i].exercise.id).not.toBe(sequence[i + 1].exercise.id);
      }

      // Check distribution: each movement runs 2 or 3 times
      const counts = {};
      for (const r of sequence) {
        counts[r.exercise.id] = (counts[r.exercise.id] || 0) + 1;
      }
      for (const id of Object.keys(counts)) {
        expect([2, 3]).toContain(counts[id]);
      }
    }
  });

  it('keeps round count 22 with smaller and larger pools, cutting the last pass at round 22', () => {
    const smallPool = [
      { id: 'm1', name: 'Move 1' },
      { id: 'm2', name: 'Move 2' },
      { id: 'm3', name: 'Move 3' },
      { id: 'm4', name: 'Move 4' },
      { id: 'm5', name: 'Move 5' },
    ];

    const largePool = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i + 1}`,
      name: `Move ${i + 1}`,
    }));

    for (const pool of [smallPool, largePool]) {
      const seq = generateWorkoutSequence(pool);
      expect(seq).toHaveLength(22);

      // Check full passes
      const fullPassCount = Math.floor(22 / pool.length);
      for (let p = 0; p < fullPassCount; p++) {
        const pass = seq.slice(p * pool.length, (p + 1) * pool.length).map((r) => r.exercise.id);
        expect(new Set(pass).size).toBe(pool.length);
      }

      // Check remainder in the last cut pass
      const remainder = 22 % pool.length;
      if (remainder > 0) {
        const lastCut = seq.slice(fullPassCount * pool.length, 22).map((r) => r.exercise.id);
        expect(lastCut).toHaveLength(remainder);
        expect(new Set(lastCut).size).toBe(remainder);
      }

      // No consecutive duplicates
      for (let i = 0; i < seq.length - 1; i++) {
        expect(seq[i].exercise.id).not.toBe(seq[i + 1].exercise.id);
      }
    }
  });
});
