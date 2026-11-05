import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkoutEngine, WorkoutPhase, createInterval } from '../src/engine.js';
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

  it('transitions to GET_READY for 10 seconds without decrementing session time and emits GET_READY_START cue', () => {
    const engine = new WorkoutEngine();
    const phaseChanges = [];
    const cues = [];
    const sounds = [];
    engine.on('phaseChange', (state) => phaseChanges.push(state));
    engine.on('cue', (cue) => cues.push(cue));
    engine.on('sound', (s) => sounds.push(s));

    engine.start();

    expect(engine.state).toBe(WorkoutPhase.GET_READY);
    expect(engine.currentIntervalDuration).toBe(10);
    expect(engine.currentIntervalRemaining).toBe(10);
    expect(engine.remainingSessionTime).toBe(2340);
    expect(phaseChanges).toContain(WorkoutPhase.GET_READY);
    expect(cues).toContainEqual({
      type: 'GET_READY_START',
      text: 'Get ready to warm up.',
    });

    // Advance 7 seconds (3s left: 10 - 7 = 3)
    vi.advanceTimersByTime(7000);
    expect(engine.currentIntervalRemaining).toBe(3);
    expect(sounds).toContainEqual({ type: 'tick', frequency: 440 });

    // Advance 1s (2s left)
    vi.advanceTimersByTime(1000);
    expect(engine.currentIntervalRemaining).toBe(2);

    // Advance 1s (1s left)
    vi.advanceTimersByTime(1000);
    expect(engine.currentIntervalRemaining).toBe(1);

    // Advance 1s to reach 10 seconds total -> transitions to WARM_UP
    vi.advanceTimersByTime(1000);
    expect(engine.state).toBe(WorkoutPhase.WARM_UP);
    expect(sounds).toContainEqual({ type: 'chime', frequency: 880 });
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
          stamp: 'HALFWAY THERE',
        });
      }

      if (r === 16) {
        expect(cues).toContainEqual({
          type: 'FINISHER',
          text: 'Last 6 rounds. Final push.',
          stamp: 'LAST 6 ROUNDS',
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
      stamp: 'COOLDOWN TIME',
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

  it('milestone cues fire exactly once at their designated round and nowhere else', () => {
    const engine = new WorkoutEngine();
    const milestoneCues = [];
    engine.on('cue', (c) => {
      if (['HALFWAY', 'FINISHER', 'COOLDOWN_START'].includes(c.type)) {
        milestoneCues.push({
          type: c.type,
          text: c.text,
          stamp: c.stamp,
          round: engine.roundIndex,
          stretch: engine.stretchIndex,
          phase: engine.state,
        });
      }
    });

    engine.start();
    // Advance through entire workout (10s + 120s + 1760s + 460s = 2350s)
    vi.advanceTimersByTime(2350000);

    // HALFWAY: fired once, in REST after round 11
    const halfwayCues = milestoneCues.filter((c) => c.type === 'HALFWAY');
    expect(halfwayCues).toHaveLength(1);
    expect(halfwayCues[0]).toEqual({
      type: 'HALFWAY',
      text: 'Halfway there.',
      stamp: 'HALFWAY THERE',
      round: 11,
      stretch: 0,
      phase: WorkoutPhase.REST,
    });

    // FINISHER: fired once, in REST after round 16 (before round 17)
    const finisherCues = milestoneCues.filter((c) => c.type === 'FINISHER');
    expect(finisherCues).toHaveLength(1);
    expect(finisherCues[0]).toEqual({
      type: 'FINISHER',
      text: 'Last 6 rounds. Final push.',
      stamp: 'LAST 6 ROUNDS',
      round: 16,
      stretch: 0,
      phase: WorkoutPhase.REST,
    });

    // COOLDOWN_START: fired once, at start of COOLDOWN stretch 1
    const cooldownCues = milestoneCues.filter((c) => c.type === 'COOLDOWN_START');
    expect(cooldownCues).toHaveLength(1);
    expect(cooldownCues[0]).toEqual({
      type: 'COOLDOWN_START',
      text: 'Cooldown time. Great work.',
      stamp: 'COOLDOWN TIME',
      round: 0,
      stretch: 1,
      phase: WorkoutPhase.COOLDOWN,
    });
  });

  it('SWITCH_SIDES fires at exact half duration for bilateral stretches only, and never for non-bilateral stretches', () => {
    const engine = new WorkoutEngine();
    const switchEvents = [];
    engine.on('cue', (c) => {
      if (c.type === 'SWITCH_SIDES') {
        switchEvents.push({
          stretch: engine.currentExercise.name,
          remaining: engine.currentIntervalRemaining,
          duration: engine.currentIntervalDuration,
          side: engine.stretchSide,
        });
      }
    });

    engine.start();
    // Fast forward to COOLDOWN (skip GET_READY, WARM_UP, and 22 rounds)
    vi.advanceTimersByTime(10000 + 120000 + 1760000);

    expect(engine.state).toBe(WorkoutPhase.COOLDOWN);

    const nonBilateralNames = [
      'Standing Chest & Shoulder Opener',
      'Seated Butterfly Stretch',
      "Child's Pose",
    ];

    const bilateralExpected = [
      { name: 'Neck Side Stretch', half: 20 },
      { name: 'Overhead Side Stretch', half: 20 },
      { name: 'Standing Quad Stretch', half: 25 },
      { name: 'Standing Calf Stretch', half: 25 },
      { name: 'Kneeling Hip Flexor Stretch', half: 25 },
      { name: 'Seated Single-Leg Hamstring Stretch', half: 25 },
      { name: 'Seated Figure-4 Glute Stretch', half: 25 },
      { name: 'Seated Spinal Twist', half: 20 },
    ];

    for (let s = 1; s <= 11; s++) {
      const stretch = engine.currentExercise;
      const duration = stretch.duration;

      for (let sec = 0; sec < duration; sec++) {
        vi.advanceTimersByTime(1000);
      }
    }

    // Verify exactly 8 SWITCH_SIDES events
    expect(switchEvents).toHaveLength(8);

    for (let i = 0; i < bilateralExpected.length; i++) {
      const expected = bilateralExpected[i];
      const actual = switchEvents[i];
      expect(actual.stretch).toBe(expected.name);
      expect(actual.remaining).toBe(expected.half);
      expect(actual.side).toBe(2);
    }

    // Non-bilateral stretches must never appear in switchEvents
    for (const nonBilateral of nonBilateralNames) {
      expect(switchEvents.some((ev) => ev.stretch === nonBilateral)).toBe(false);
    }
  });

  it('emits NEXT_EXERCISE cue during each rest interval', () => {
    const engine = new WorkoutEngine();
    const nextCues = [];
    engine.on('cue', (c) => {
      if (c.type === 'NEXT_EXERCISE') {
        nextCues.push({
          round: engine.roundIndex,
          text: c.text,
        });
      }
    });

    engine.start();
    // Pass GET_READY and WARM_UP
    vi.advanceTimersByTime(10000 + 120000);

    // Run 22 rounds
    for (let r = 1; r <= 22; r++) {
      // 60s work
      vi.advanceTimersByTime(60000);
      // REST interval entered!
      const expectedNext =
        r < 22 ? engine.sequence[r].exercise.name : 'Neck Side Stretch';
      expect(nextCues).toContainEqual({
        round: r,
        text: `Next: ${expectedNext}`,
      });
      // 20s rest
      vi.advanceTimersByTime(20000);
    }

    expect(nextCues).toHaveLength(22);
  });

  it('emits 440 Hz ticks for 3-2-1 countdown and 880 Hz chimes on phase transitions and switch sides', () => {
    const engine = new WorkoutEngine();
    const sounds = [];
    engine.on('sound', (s) => sounds.push(s));

    engine.start(); // starts GET_READY

    // 10s GET_READY: at remaining 3, 2, 1, ticks should fire
    vi.advanceTimersByTime(7000); // 3s remaining
    expect(sounds[sounds.length - 1]).toEqual({ type: 'tick', frequency: 440 });

    vi.advanceTimersByTime(1000); // 2s remaining
    expect(sounds[sounds.length - 1]).toEqual({ type: 'tick', frequency: 440 });

    vi.advanceTimersByTime(1000); // 1s remaining
    expect(sounds[sounds.length - 1]).toEqual({ type: 'tick', frequency: 440 });

    // Transition to WARM_UP: chime should fire!
    vi.advanceTimersByTime(1000);
    expect(engine.state).toBe(WorkoutPhase.WARM_UP);
    expect(sounds[sounds.length - 1]).toEqual({ type: 'chime', frequency: 880 });
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

describe('WorkoutEngine - Session Serialization & Restoration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes active workout state accurately', () => {
    const engine = new WorkoutEngine();
    engine.start();
    vi.advanceTimersByTime(10000); // 10s GET_READY -> WARM_UP
    vi.advanceTimersByTime(40000); // 40s into warm-up

    const snapshot = engine.serializeSession();
    expect(snapshot.state).toBe(WorkoutPhase.WARM_UP);
    expect(snapshot.currentIntervalRemaining).toBe(80);
    expect(snapshot.currentIntervalDuration).toBe(120);
    expect(snapshot.sequence).toEqual(engine.sequence);
    expect(snapshot.currentIntervalIndex).toBe(1);
    expect(snapshot.roundIndex).toBe(0);
  });

  it('restores in-progress cardio session in paused state', () => {
    const originalEngine = new WorkoutEngine();
    originalEngine.start();
    vi.advanceTimersByTime(10000); // GET_READY
    originalEngine.skip(); // Skip WARM_UP to Round 1 WORK
    vi.advanceTimersByTime(25000); // 25s into round 1 WORK (35s remaining)

    const savedState = originalEngine.serializeSession();

    // Create a new engine (simulating app reload)
    const newEngine = new WorkoutEngine();
    const phaseEvents = [];
    const pauseEvents = [];
    newEngine.on('phaseChange', (state) => phaseEvents.push(state));
    newEngine.on('pause', () => pauseEvents.push(true));

    newEngine.restoreSession(savedState);

    expect(newEngine.state).toBe(WorkoutPhase.WORK);
    expect(newEngine.roundIndex).toBe(1);
    expect(newEngine.currentIntervalRemaining).toBe(35);
    expect(newEngine.currentIntervalDuration).toBe(60);
    expect(newEngine.isPaused).toBe(true);
    expect(newEngine.sequence).toEqual(savedState.sequence);
    expect(newEngine.currentExercise.name).toBe(savedState.sequence[0].exercise.name);
    expect(phaseEvents).toContain(WorkoutPhase.WORK);
    expect(pauseEvents).toHaveLength(1);

    // Resuming runs 3-second lead-in then continues interval
    newEngine.resume();
    expect(newEngine.isPaused).toBe(false);
    expect(newEngine.leadInSeconds).toBe(3);

    vi.advanceTimersByTime(3000); // Complete 3s lead-in
    expect(newEngine.leadInSeconds).toBe(0);
    expect(newEngine.currentIntervalRemaining).toBe(35);

    vi.advanceTimersByTime(1000); // 1s of interval
    expect(newEngine.currentIntervalRemaining).toBe(34);
  });

  it('restores in-progress cooldown stretch accurately', () => {
    const engine = new WorkoutEngine();
    engine.start();
    // Reconstruct a saved state at stretch 3/11
    const dummySequence = engine.buildSchedule();
    const stretch3Index = dummySequence.findIndex(
      (inv) => inv.phase === WorkoutPhase.COOLDOWN && inv.stretchIndex === 3
    );

    const saved = {
      sequence: engine.sequence,
      state: WorkoutPhase.COOLDOWN,
      currentIntervalIndex: stretch3Index,
      currentIntervalRemaining: 20,
      currentIntervalDuration: 40,
      roundIndex: 0,
      stretchIndex: 3,
      isPaused: true,
    };

    const newEngine = new WorkoutEngine();
    newEngine.restoreSession(saved);

    expect(newEngine.state).toBe(WorkoutPhase.COOLDOWN);
    expect(newEngine.stretchIndex).toBe(3);
    expect(newEngine.currentIntervalRemaining).toBe(20);
    expect(newEngine.isPaused).toBe(true);
  });

  it('createInterval factory assigns defaults and custom properties cleanly', () => {
    const defaultInterval = createInterval({ phase: WorkoutPhase.WORK, duration: 60 });
    expect(defaultInterval).toEqual({
      phase: WorkoutPhase.WORK,
      duration: 60,
      countsTowardSession: true,
      exercise: null,
      nextExercise: null,
      roundIndex: 0,
      stretchIndex: 0,
      isBilateral: false,
    });

    const customInterval = createInterval({
      phase: WorkoutPhase.GET_READY,
      duration: 10,
      countsTowardSession: false,
      nextExercise: { name: 'Warm up' },
      roundIndex: 5,
      isFinisher: true,
    });
    expect(customInterval.countsTowardSession).toBe(false);
    expect(customInterval.nextExercise).toEqual({ name: 'Warm up' });
    expect(customInterval.roundIndex).toBe(5);
    expect(customInterval.isFinisher).toBe(true);
  });
});
