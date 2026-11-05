import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkoutEngine, WorkoutPhase } from '../src/engine.js';
import { TOTAL_SESSION_SEC } from '../src/generator.js';

describe('WorkoutEngine - Initial & Get Ready', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in IDLE state with full session time (2340s)', () => {
    const engine = new WorkoutEngine();
    expect(engine.state).toBe(WorkoutPhase.IDLE);
    expect(engine.remainingSessionTime).toBe(TOTAL_SESSION_SEC);
    expect(engine.elapsedSessionTime).toBe(0);
    expect(engine.isPaused).toBe(false);
  });

  it('transitions to GET_READY for 10 seconds without decrementing session time', () => {
    const engine = new WorkoutEngine();
    const phaseChanges = [];
    engine.on('phaseChange', (state) => phaseChanges.push(state));

    engine.start();

    expect(engine.state).toBe(WorkoutPhase.GET_READY);
    expect(engine.currentIntervalDuration).toBe(10);
    expect(engine.currentIntervalRemaining).toBe(10);
    expect(engine.remainingSessionTime).toBe(2340);
    expect(phaseChanges).toContain(WorkoutPhase.GET_READY);

    // Advance 5 seconds
    vi.advanceTimersByTime(5000);
    expect(engine.state).toBe(WorkoutPhase.GET_READY);
    expect(engine.currentIntervalRemaining).toBe(5);
    expect(engine.remainingSessionTime).toBe(2340); // session time unchanged!

    // Advance 5 more seconds to reach 10 seconds total
    vi.advanceTimersByTime(5000);
    expect(engine.state).toBe(WorkoutPhase.WARM_UP);
  });
});

describe('WorkoutEngine - Warm-up & Transition to Round 1', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs 120s warm-up counting toward session time, emits cues, and goes straight into round 1', () => {
    const engine = new WorkoutEngine();
    const cues = [];
    engine.on('cue', (c) => cues.push(c));

    engine.start();
    // Finish GET_READY (10s)
    vi.advanceTimersByTime(10000);

    expect(engine.state).toBe(WorkoutPhase.WARM_UP);
    expect(engine.currentIntervalDuration).toBe(120);
    expect(engine.currentIntervalRemaining).toBe(120);
    expect(engine.remainingSessionTime).toBe(2340);
    expect(cues).toContainEqual({
      type: 'WARM_UP_START',
      text: 'Warm up. Move at your own pace.',
    });

    // Advance 100 seconds (20s left in warm up)
    vi.advanceTimersByTime(100000);
    expect(engine.currentIntervalRemaining).toBe(20);
    expect(engine.remainingSessionTime).toBe(2240);
    expect(cues).toContainEqual({
      type: 'FIRST_EXERCISE',
      text: `First: ${engine.sequence[0].exercise.name}`,
    });

    // Advance remaining 20 seconds of warm up
    vi.advanceTimersByTime(20000);

    // Warm up goes STRAIGHT into round 1 WORK with no rest in between!
    expect(engine.state).toBe(WorkoutPhase.WORK);
    expect(engine.roundIndex).toBe(1);
    expect(engine.currentIntervalDuration).toBe(60);
    expect(engine.currentIntervalRemaining).toBe(60);
    expect(engine.remainingSessionTime).toBe(2220); // 1760 cardio + 460 cooldown = 2220
    expect(engine.currentExercise.id).toBe(engine.sequence[0].exercise.id);
  });
});

describe('WorkoutEngine - Full Session, Cooldown & Milestone Cues', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cycles through 22 rounds, triggers milestone cues, runs 11 stretches, and finishes at 2340s total', () => {
    const engine = new WorkoutEngine();
    const cues = [];
    engine.on('cue', (c) => cues.push(c));

    engine.start();
    vi.advanceTimersByTime(10000); // GET_READY: 10s
    vi.advanceTimersByTime(120000); // WARM_UP: 120s

    // Verify 22 rounds of 60s WORK and 20s REST
    for (let r = 1; r <= 22; r++) {
      expect(engine.state).toBe(WorkoutPhase.WORK);
      expect(engine.roundIndex).toBe(r);
      expect(engine.currentExercise.id).toBe(engine.sequence[r - 1].exercise.id);

      // Advance 60s work
      vi.advanceTimersByTime(60000);

      expect(engine.state).toBe(WorkoutPhase.REST);
      expect(engine.roundIndex).toBe(r);

      if (r === 11) {
        expect(cues).toContainEqual({
          type: 'HALFWAY',
          text: 'Halfway there.',
        });
      }

      if (r === 16) {
        expect(cues).toContainEqual({
          type: 'FINISHER',
          text: 'Last 6 rounds. Final push.',
        });
      }

      // Check next exercise during rest
      if (r < 22) {
        expect(engine.nextExercise.id).toBe(engine.sequence[r].exercise.id);
      } else {
        expect(engine.nextExercise.name).toBe('Neck Side Stretch');
      }

      // Advance 20s rest
      vi.advanceTimersByTime(20000);
    }

    // Now engine should enter COOLDOWN
    expect(engine.state).toBe(WorkoutPhase.COOLDOWN);
    expect(engine.stretchIndex).toBe(1);
    expect(engine.currentExercise.name).toBe('Neck Side Stretch');
    expect(cues).toContainEqual({
      type: 'COOLDOWN_START',
      text: 'Cooldown time. Great work.',
    });

    // Advance through the 11 stretches
    let bilateralSwitches = 0;
    for (let s = 1; s <= 11; s++) {
      expect(engine.state).toBe(WorkoutPhase.COOLDOWN);
      expect(engine.stretchIndex).toBe(s);
      const stretch = engine.stretches[s - 1];

      if (stretch.bilateral) {
        expect(engine.stretchSide).toBe(1);
        // Advance to halfway point
        vi.advanceTimersByTime((stretch.duration / 2) * 1000);
        expect(engine.stretchSide).toBe(2);
        bilateralSwitches++;
        // Advance remaining half
        vi.advanceTimersByTime((stretch.duration / 2) * 1000);
      } else {
        expect(engine.stretchSide).toBe(0);
        vi.advanceTimersByTime(stretch.duration * 1000);
      }
    }

    // 8 out of 11 stretches are bilateral, so exactly 8 switch cues
    expect(bilateralSwitches).toBe(8);
    const switchCues = cues.filter((c) => c.type === 'SWITCH_SIDES');
    expect(switchCues).toHaveLength(8);

    // Workout reaches FINISHED
    expect(engine.state).toBe(WorkoutPhase.FINISHED);
    expect(engine.remainingSessionTime).toBe(0);
    expect(engine.elapsedSessionTime).toBe(2340);
    expect(cues).toContainEqual({
      type: 'WORKOUT_COMPLETE',
      text: 'Workout complete.',
    });
  });
});

describe('WorkoutEngine - Pause, Resume & Skip Controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves phase time on pause and resumes with a 3-second lead-in', () => {
    const engine = new WorkoutEngine();
    const leadIns = [];
    engine.on('leadInTick', (s) => leadIns.push(s));

    engine.start();
    vi.advanceTimersByTime(10000); // Finish GET_READY
    vi.advanceTimersByTime(30000); // 30s into warm-up

    expect(engine.currentIntervalRemaining).toBe(90);
    expect(engine.remainingSessionTime).toBe(2310);

    // Pause workout
    engine.pause();
    expect(engine.isPaused).toBe(true);

    // Advance time while paused: should not change anything
    vi.advanceTimersByTime(10000);
    expect(engine.currentIntervalRemaining).toBe(90);
    expect(engine.remainingSessionTime).toBe(2310);

    // Resume workout: runs 3-second lead-in (3, 2, 1)
    engine.resume();
    expect(engine.isPaused).toBe(false);
    expect(engine.leadInSeconds).toBe(3);

    // 1 second of lead-in: countdown 2
    vi.advanceTimersByTime(1000);
    expect(engine.leadInSeconds).toBe(2);
    expect(engine.currentIntervalRemaining).toBe(90); // interval timer still frozen!
    expect(engine.remainingSessionTime).toBe(2310);

    // 2nd second of lead-in: countdown 1
    vi.advanceTimersByTime(1000);
    expect(engine.leadInSeconds).toBe(1);
    expect(engine.currentIntervalRemaining).toBe(90);

    // 3rd second of lead-in: countdown 0, lead-in finishes
    vi.advanceTimersByTime(1000);
    expect(engine.leadInSeconds).toBe(0);
    expect(engine.currentIntervalRemaining).toBe(90);

    // Now normal interval ticking resumes: 1s ticks interval to 89
    vi.advanceTimersByTime(1000);
    expect(engine.currentIntervalRemaining).toBe(89);
    expect(engine.remainingSessionTime).toBe(2309);
  });

  it('Skip during warm-up moves straight to round 1 and updates remaining session time', () => {
    const engine = new WorkoutEngine();
    engine.start();
    vi.advanceTimersByTime(10000); // Finish GET_READY, now in WARM_UP
    expect(engine.state).toBe(WorkoutPhase.WARM_UP);
    expect(engine.remainingSessionTime).toBe(2340);

    // Skip warm-up immediately
    engine.skip();

    expect(engine.state).toBe(WorkoutPhase.WORK);
    expect(engine.roundIndex).toBe(1);
    expect(engine.currentIntervalRemaining).toBe(60);
    // Warm up was 120s; skipping it means session remaining is now 1760 + 460 = 2220s!
    expect(engine.remainingSessionTime).toBe(2220);
  });

  it('Skip during round 1 WORK jumps to REST with session time updated', () => {
    const engine = new WorkoutEngine();
    engine.start();
    vi.advanceTimersByTime(10000); // Finish GET_READY
    engine.skip(); // Skip warm up to Round 1 WORK

    expect(engine.state).toBe(WorkoutPhase.WORK);
    expect(engine.roundIndex).toBe(1);
    expect(engine.remainingSessionTime).toBe(2220);

    // Advance 10 seconds of WORK
    vi.advanceTimersByTime(10000);
    expect(engine.currentIntervalRemaining).toBe(50);
    expect(engine.remainingSessionTime).toBe(2210);

    // Skip remaining 50 seconds of WORK -> moves to REST
    engine.skip();
    expect(engine.state).toBe(WorkoutPhase.REST);
    expect(engine.roundIndex).toBe(1);
    expect(engine.currentIntervalRemaining).toBe(20);
    // 20s rest + 21 * 80s cardio + 460s cooldown = 20 + 1680 + 460 = 2160s!
    expect(engine.remainingSessionTime).toBe(2160);
  });
});
