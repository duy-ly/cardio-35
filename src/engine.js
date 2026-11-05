import {
  WORK_DURATION_SEC,
  REST_DURATION_SEC,
  WARM_UP_DURATION_SEC,
  GET_READY_DURATION_SEC,
  CARDIO_POOL,
  COOLDOWN_STRETCHES,
  TOTAL_SESSION_SEC,
  generateWorkoutSequence,
} from './generator.js';

export const WorkoutPhase = Object.freeze({
  IDLE: 'IDLE',
  GET_READY: 'GET_READY',
  WARM_UP: 'WARM_UP',
  WORK: 'WORK',
  REST: 'REST',
  COOLDOWN: 'COOLDOWN',
  FINISHED: 'FINISHED',
});

export class WorkoutEngine {
  constructor(options = {}) {
    this.pool = options.pool || CARDIO_POOL;
    this.stretches = options.stretches || COOLDOWN_STRETCHES;
    this.sequence = options.sequence || null;
    this.rng = options.rng || Math.random;

    this.state = WorkoutPhase.IDLE;
    this.isPaused = false;
    this.leadInSeconds = 0;

    this.intervals = [];
    this.currentIntervalIndex = -1;
    this.currentIntervalRemaining = 0;
    this.currentIntervalDuration = 0;

    this.timerId = null;
    this.listeners = {
      phaseChange: [],
      tick: [],
      cue: [],
      sound: [],
      leadInTick: [],
      pause: [],
      resume: [],
    };
  }

  on(event, handler) {
    if (this.listeners[event]) {
      this.listeners[event].push(handler);
    }
  }

  off(event, handler) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      for (const handler of this.listeners[event]) {
        handler(...args);
      }
    }
  }

  buildSchedule() {
    if (!this.sequence) {
      this.sequence = generateWorkoutSequence(this.pool, 22, this.rng);
    }

    const intervals = [];

    // 1. GET_READY (10s)
    intervals.push({
      phase: WorkoutPhase.GET_READY,
      duration: GET_READY_DURATION_SEC,
      countsTowardSession: false,
      exercise: null,
      nextExercise: { name: 'Warm up' },
      roundIndex: 0,
      stretchIndex: 0,
      isBilateral: false,
    });

    // 2. WARM_UP (120s)
    intervals.push({
      phase: WorkoutPhase.WARM_UP,
      duration: WARM_UP_DURATION_SEC,
      countsTowardSession: true,
      exercise: { name: 'Warm up' },
      nextExercise: this.sequence[0].exercise,
      roundIndex: 0,
      stretchIndex: 0,
      isBilateral: false,
    });

    // 3. 22 Cardio Rounds (60s WORK / 20s REST)
    for (let r = 0; r < this.sequence.length; r++) {
      const currentRound = this.sequence[r];
      const roundNum = currentRound.round;

      // WORK
      intervals.push({
        phase: WorkoutPhase.WORK,
        duration: WORK_DURATION_SEC,
        countsTowardSession: true,
        exercise: currentRound.exercise,
        nextExercise: currentRound.exercise,
        roundIndex: roundNum,
        isFinisher: currentRound.isFinisher,
        stretchIndex: 0,
        isBilateral: false,
      });

      // REST
      const nextEx =
        r + 1 < this.sequence.length
          ? this.sequence[r + 1].exercise
          : this.stretches[0];

      intervals.push({
        phase: WorkoutPhase.REST,
        duration: REST_DURATION_SEC,
        countsTowardSession: true,
        exercise: null,
        nextExercise: nextEx,
        roundIndex: roundNum,
        isFinisher: currentRound.isFinisher,
        stretchIndex: 0,
        isBilateral: false,
      });
    }

    // 4. Cooldown (11 stretches)
    for (let s = 0; s < this.stretches.length; s++) {
      const stretch = this.stretches[s];
      const nextStretch = s + 1 < this.stretches.length ? this.stretches[s + 1] : null;

      intervals.push({
        phase: WorkoutPhase.COOLDOWN,
        duration: stretch.duration,
        countsTowardSession: true,
        exercise: stretch,
        nextExercise: nextStretch,
        roundIndex: 0,
        stretchIndex: s + 1,
        isBilateral: stretch.bilateral || false,
      });
    }

    return intervals;
  }

  get currentInterval() {
    if (this.currentIntervalIndex >= 0 && this.currentIntervalIndex < this.intervals.length) {
      return this.intervals[this.currentIntervalIndex];
    }
    return null;
  }

  get remainingSessionTime() {
    if (this.state === WorkoutPhase.IDLE) {
      return TOTAL_SESSION_SEC;
    }
    if (this.state === WorkoutPhase.FINISHED) {
      return 0;
    }

    let remaining = 0;
    if (this.currentInterval && this.currentInterval.countsTowardSession) {
      remaining += this.currentIntervalRemaining;
    }

    for (let i = this.currentIntervalIndex + 1; i < this.intervals.length; i++) {
      if (this.intervals[i].countsTowardSession) {
        remaining += this.intervals[i].duration;
      }
    }

    return remaining;
  }

  get elapsedSessionTime() {
    return TOTAL_SESSION_SEC - this.remainingSessionTime;
  }

  get currentExercise() {
    return this.currentInterval ? this.currentInterval.exercise : null;
  }

  get nextExercise() {
    return this.currentInterval ? this.currentInterval.nextExercise : null;
  }

  get roundIndex() {
    return this.currentInterval ? this.currentInterval.roundIndex : 0;
  }

  get stretchIndex() {
    return this.currentInterval ? this.currentInterval.stretchIndex : 0;
  }

  get stretchSide() {
    if (this.state !== WorkoutPhase.COOLDOWN || !this.currentInterval?.isBilateral) {
      return 0;
    }
    const elapsed = this.currentIntervalDuration - this.currentIntervalRemaining;
    const half = this.currentIntervalDuration / 2;
    return elapsed >= half ? 2 : 1;
  }

  start() {
    if (this.state !== WorkoutPhase.IDLE) return;

    this.intervals = this.buildSchedule();
    this.goToInterval(0);
    this.startTimer();
  }

  goToInterval(index) {
    if (index >= this.intervals.length) {
      this.finish();
      return;
    }

    this.currentIntervalIndex = index;
    const interval = this.intervals[index];
    this.state = interval.phase;
    this.currentIntervalDuration = interval.duration;
    this.currentIntervalRemaining = interval.duration;

    if (index > 0) {
      this.emit('sound', { type: 'chime', frequency: 880 });
    }

    this.emit('phaseChange', this.state, interval);
    this.checkIntervalStartCues(interval);
  }

  checkIntervalStartCues(interval) {
    if (interval.phase === WorkoutPhase.GET_READY) {
      this.emit('cue', { type: 'GET_READY_START', text: 'Get ready to warm up.' });
    } else if (interval.phase === WorkoutPhase.WARM_UP) {
      this.emit('cue', { type: 'WARM_UP_START', text: 'Warm up. Move at your own pace.' });
    } else if (interval.phase === WorkoutPhase.COOLDOWN) {
      if (interval.stretchIndex === 1) {
        this.emit('cue', {
          type: 'COOLDOWN_START',
          text: 'Cooldown time. Great work.',
          stamp: 'COOLDOWN TIME',
        });
      }
      this.emit('cue', { type: 'STRETCH_START', text: interval.exercise.name });
    } else if (interval.phase === WorkoutPhase.REST) {
      // Milestone cues in rest
      if (interval.roundIndex === 11) {
        this.emit('cue', {
          type: 'HALFWAY',
          text: 'Halfway there.',
          stamp: 'HALFWAY THERE',
        });
      } else if (interval.roundIndex === 16) {
        this.emit('cue', {
          type: 'FINISHER',
          text: 'Last 6 rounds. Final push.',
          stamp: 'LAST 6 ROUNDS',
        });
      }

      const nextName = interval.nextExercise ? interval.nextExercise.name : '';
      this.emit('cue', {
        type: 'NEXT_EXERCISE',
        text: `Next: ${nextName}`,
      });
    }
  }

  startTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    this.timerId = setInterval(() => this.tick(), 1000);
  }

  tick() {
    if (this.isPaused) return;

    if (this.leadInSeconds > 0) {
      this.leadInSeconds--;
      this.emit('sound', { type: 'tick', frequency: 440 });
      this.emit('leadInTick', this.leadInSeconds);
      return;
    }

    this.currentIntervalRemaining--;
    this.emit('tick', {
      intervalRemaining: this.currentIntervalRemaining,
      sessionRemaining: this.remainingSessionTime,
    });

    if (
      this.currentIntervalRemaining <= 3 &&
      this.currentIntervalRemaining >= 1
    ) {
      this.emit('sound', { type: 'tick', frequency: 440 });
    }

    // Check mid-interval cues
    if (this.currentInterval) {
      // Warm up: with 20 seconds left, announce first round exercise
      if (
        this.currentInterval.phase === WorkoutPhase.WARM_UP &&
        this.currentIntervalRemaining === 20
      ) {
        this.emit('cue', {
          type: 'FIRST_EXERCISE',
          text: `First: ${this.sequence[0].exercise.name}`,
        });
      }

      // Bilateral stretch: switch sides at half
      if (
        this.currentInterval.phase === WorkoutPhase.COOLDOWN &&
        this.currentInterval.isBilateral &&
        this.currentIntervalRemaining === this.currentIntervalDuration / 2
      ) {
        this.emit('sound', { type: 'chime', frequency: 880 });
        this.emit('cue', {
          type: 'SWITCH_SIDES',
          text: 'Switch sides',
          stamp: 'SWITCH SIDES',
        });
      }
    }

    if (this.currentIntervalRemaining <= 0) {
      this.goToInterval(this.currentIntervalIndex + 1);
    }
  }

  pause() {
    if (this.isPaused || this.state === WorkoutPhase.IDLE || this.state === WorkoutPhase.FINISHED) {
      return;
    }
    this.isPaused = true;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.emit('pause');
  }

  resume(skipLeadIn = false) {
    if (!this.isPaused || this.state === WorkoutPhase.IDLE || this.state === WorkoutPhase.FINISHED) {
      return;
    }
    this.isPaused = false;
    this.emit('resume');

    if (skipLeadIn) {
      this.leadInSeconds = 0;
      this.startTimer();
    } else {
      this.leadInSeconds = 3;
      this.emit('leadInTick', 3);
      this.startTimer();
    }
  }

  skip() {
    if (this.state === WorkoutPhase.IDLE || this.state === WorkoutPhase.FINISHED) {
      return;
    }
    // Cancel any lead-in if resuming
    this.leadInSeconds = 0;
    this.goToInterval(this.currentIntervalIndex + 1);
  }

  finish() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.state = WorkoutPhase.FINISHED;
    this.isPaused = false;
    this.emit('sound', { type: 'chime', frequency: 880 });
    this.emit('cue', { type: 'WORKOUT_COMPLETE', text: 'Workout complete.' });
    this.emit('phaseChange', this.state, null);
  }

  serializeSession() {
    if (this.state === WorkoutPhase.IDLE || this.state === WorkoutPhase.FINISHED) {
      return null;
    }
    return {
      sequence: this.sequence,
      state: this.state,
      currentIntervalIndex: this.currentIntervalIndex,
      currentIntervalRemaining: this.currentIntervalRemaining,
      currentIntervalDuration: this.currentIntervalDuration,
      roundIndex: this.roundIndex,
      stretchIndex: this.stretchIndex,
      isPaused: this.isPaused,
    };
  }

  restoreSession(saved) {
    if (!saved) return;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    this.sequence = saved.sequence;
    this.intervals = this.buildSchedule();
    this.currentIntervalIndex = saved.currentIntervalIndex >= 0 ? saved.currentIntervalIndex : 0;
    this.state = saved.state || (this.currentInterval ? this.currentInterval.phase : WorkoutPhase.IDLE);
    this.currentIntervalRemaining = saved.currentIntervalRemaining;
    this.currentIntervalDuration =
      saved.currentIntervalDuration || (this.currentInterval ? this.currentInterval.duration : 0);
    this.isPaused = true;
    this.leadInSeconds = 0;

    this.emit('phaseChange', this.state, this.currentInterval);
    this.emit('pause');
  }

  reset() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.state = WorkoutPhase.IDLE;
    this.isPaused = false;
    this.leadInSeconds = 0;
    this.intervals = [];
    this.currentIntervalIndex = -1;
    this.currentIntervalRemaining = 0;
    this.currentIntervalDuration = 0;
    this.emit('phaseChange', this.state, null);
  }
}
