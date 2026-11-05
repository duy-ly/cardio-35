// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkoutEngine, WorkoutPhase } from '../src/engine.js';
import { WakeLockController } from '../src/wake-lock.js';
import { WorkoutStorage } from '../src/storage.js';
import { App } from '../src/app.js';
import { formatTimeMS, formatTimeMMSS } from '../src/ui.js';

describe('UI Time Formatters', () => {
  it('formats m:ss correctly for warm-up and short timers', () => {
    expect(formatTimeMS(120)).toBe('2:00');
    expect(formatTimeMS(65)).toBe('1:05');
    expect(formatTimeMS(9)).toBe('0:09');
    expect(formatTimeMS(0)).toBe('0:00');
  });

  it('formats mm:ss correctly for session time left', () => {
    expect(formatTimeMMSS(2340)).toBe('39:00');
    expect(formatTimeMMSS(1002)).toBe('16:42');
    expect(formatTimeMMSS(59)).toBe('00:59');
    expect(formatTimeMMSS(0)).toBe('00:00');
  });
});

describe('App UI & Screen Flow', () => {
  let root;
  let engine;
  let wakeLock;
  let soundController;
  let storage;
  let app;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    root = document.createElement('div');
    document.body.appendChild(root);

    engine = new WorkoutEngine();
    storage = new WorkoutStorage(localStorage);

    wakeLock = {
      isActive: false,
      hasError: false,
      request: vi.fn().mockImplementation(async () => {
        wakeLock.isActive = true;
        return true;
      }),
      release: vi.fn().mockImplementation(async () => {
        wakeLock.isActive = false;
      }),
    };

    soundController = {
      isMuted: false,
      unlock: vi.fn(),
      playTick: vi.fn(),
      playChime: vi.fn(),
      speak: vi.fn(),
      cancelSpeech: vi.fn(),
      setMuted: vi.fn().mockImplementation((m) => {
        soundController.isMuted = m;
        return m;
      }),
      toggleMute: vi.fn().mockImplementation(() => {
        soundController.isMuted = !soundController.isMuted;
        return soundController.isMuted;
      }),
    };

    app = new App({ root, engine, wakeLock, soundController, storage });
    app.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders Home screen initially with CARDIO 30, START button, and no gear label', () => {
    expect(root.querySelector('.wm1')?.textContent).toBe('CARDIO');
    expect(root.querySelector('.wm2')?.textContent).toBe('30');
    expect(root.querySelector('.eyebrow')?.textContent).toContain('STANDING · NO GEAR');

    const startBtn = root.querySelector('button.start');
    expect(startBtn).not.toBeNull();
    expect(startBtn.textContent).toContain('START');
  });

  it('clicking START transitions to GET_READY and requests wake lock', async () => {
    const startBtn = root.querySelector('button.start');
    startBtn.click();

    expect(engine.state).toBe(WorkoutPhase.GET_READY);
    expect(wakeLock.request).toHaveBeenCalled();

    // Check GET_READY layout
    const screen = root.querySelector('.screen');
    expect(screen.dataset.phase).toBe('GET_READY');
    expect(root.querySelector('.lbl')?.textContent).toBe('GET READY');
    expect(root.querySelector('.count')?.textContent).toBe('10');
    expect(root.querySelector('.next-name')?.textContent).toBe('Warm up');
    expect(root.querySelector('.session-left')?.textContent).toBe('39:00');
  });

  it('transitions from GET_READY to WARM_UP with m:ss timer and no figure animation', () => {
    root.querySelector('button.start').click();
    vi.advanceTimersByTime(10000); // 10s GET_READY

    expect(engine.state).toBe(WorkoutPhase.WARM_UP);
    const screen = root.querySelector('.screen');
    expect(screen.dataset.phase).toBe('WARM_UP');
    expect(root.querySelector('.lbl')?.textContent).toBe('WARM UP');
    expect(root.querySelector('.count.warm')?.textContent).toBe('2:00');
    expect(root.querySelector('.next-label')?.textContent).toBe('FIRST');
    expect(root.querySelector('.next-name')?.textContent).toBe(engine.sequence[0].exercise.name);
    // Warm-up has no stage figure
    expect(root.querySelector('.stage')).toBeNull();
  });

  it('transitions to WORK screen with round progress, giant countdown, and control buttons', () => {
    root.querySelector('button.start').click();
    vi.advanceTimersByTime(10000); // GET_READY
    vi.advanceTimersByTime(120000); // WARM_UP

    expect(engine.state).toBe(WorkoutPhase.WORK);
    expect(engine.roundIndex).toBe(1);

    const screen = root.querySelector('.screen');
    expect(screen.dataset.phase).toBe('WORK');
    expect(root.querySelector('.round-progress')?.textContent).toBe('1/22');
    expect(root.querySelector('.count')?.textContent).toBe('60');
    expect(root.querySelector('.exercise-name')?.textContent.toUpperCase()).toBe(
      engine.sequence[0].exercise.name.toUpperCase()
    );

    // Controls present
    const pauseBtn = root.querySelector('button.btn-main');
    const skipBtn = root.querySelector('button.btn-skip');
    const muteBtn = root.querySelector('button.btn-mute');

    expect(pauseBtn).not.toBeNull();
    expect(skipBtn).not.toBeNull();
    expect(muteBtn).not.toBeNull();
  });

  it('clicking Pause pauses engine, releases wake lock, and toggles play icon', () => {
    root.querySelector('button.start').click();
    vi.advanceTimersByTime(10000); // GET_READY
    vi.advanceTimersByTime(1000); // 1s into warm-up

    const pauseBtn = root.querySelector('button.btn-main');
    pauseBtn.click();

    expect(engine.isPaused).toBe(true);
    expect(wakeLock.release).toHaveBeenCalled();
    const resumeBtn = root.querySelector('button.btn-main');
    expect(resumeBtn.dataset.action).toBe('resume');

    // Clicking resume resumes and requests wake lock
    resumeBtn.click();
    expect(engine.isPaused).toBe(false);
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it('clicking Skip advances interval and updates UI', () => {
    root.querySelector('button.start').click();
    vi.advanceTimersByTime(10000); // In WARM_UP

    const skipBtn = root.querySelector('button.btn-skip');
    skipBtn.click();

    // Now in Round 1 WORK
    expect(engine.state).toBe(WorkoutPhase.WORK);
    expect(root.querySelector('.round-progress')?.textContent).toBe('1/22');
  });

  it('shows wake lock warning notice when wake lock fails', async () => {
    root.querySelector('button.start').click();
    wakeLock.hasError = true;
    app.showWakeLockNotice(true);

    expect(root.querySelector('.wake-lock-notice')).not.toBeNull();
    expect(root.querySelector('.wake-lock-notice').textContent).toContain(
      'Screen wake lock unavailable; screen may sleep.'
    );
  });

  it('renders Finished screen when workout completes, and HOME button resets to Home screen', () => {
    root.querySelector('button.start').click();
    engine.finish();

    expect(engine.state).toBe(WorkoutPhase.FINISHED);
    expect(root.querySelector('.done')?.textContent).toBe('DONE.');
    expect(root.querySelector('.total')?.textContent).toBe('39:00');
    expect(root.textContent).toContain('ROUNDS');
    expect(root.textContent).toContain('22');
    expect(root.textContent).toContain('STRETCHES');
    expect(root.textContent).toContain('11');

    const homeBtn = root.querySelector('button.home');
    expect(homeBtn).not.toBeNull();
    homeBtn.click();

    // Reset back to Home
    expect(engine.state).toBe(WorkoutPhase.IDLE);
    expect(root.querySelector('.wm1')?.textContent).toBe('CARDIO');
  });

  it('unlocks SoundController on START button click', () => {
    const startBtn = root.querySelector('button.start');
    startBtn.click();
    expect(soundController.unlock).toHaveBeenCalled();
  });

  it('speaks cues and plays 3-2-1 countdown ticks and phase chimes via SoundController', () => {
    const startBtn = root.querySelector('button.start');
    startBtn.click(); // GET_READY start

    // Get Ready spoken
    expect(soundController.speak).toHaveBeenCalledWith('Get ready to warm up.');

    // 7 seconds in: 3 seconds remaining in GET_READY -> ticks
    vi.advanceTimersByTime(7000);
    expect(soundController.playTick).toHaveBeenCalled();

    // Advance 3 more seconds: transitions to WARM_UP -> chime played + warm-up cue spoken
    vi.advanceTimersByTime(3000);
    expect(soundController.playChime).toHaveBeenCalled();
    expect(soundController.speak).toHaveBeenCalledWith('Warm up. Move at your own pace.');

    // Advance 100 seconds (20s left in warm-up) -> announces First exercise
    vi.advanceTimersByTime(100000);
    expect(soundController.speak).toHaveBeenCalledWith(
      `First: ${engine.sequence[0].exercise.name}`
    );
  });

  it('renders black -3° tilted stamp for milestone cues and speaks milestone text', () => {
    root.querySelector('button.start').click();

    // Fast forward to round 11 REST (10s GET_READY + 120s WARM_UP + 10 rounds of 80s + 60s WORK)
    vi.advanceTimersByTime(10000 + 120000 + 10 * 80000 + 60000);

    expect(engine.state).toBe(WorkoutPhase.REST);
    expect(engine.roundIndex).toBe(11);

    // Spoke "Halfway there." and "Next: [round 12]"
    expect(soundController.speak).toHaveBeenCalledWith('Halfway there.');

    // Stamp element rendered with black background and -3deg tilt
    const stampEl = root.querySelector('.stamp');
    expect(stampEl).not.toBeNull();
    expect(stampEl.textContent).toContain('HALFWAY THERE');
  });

  it('renders SWITCH_SIDES stamp, plays chime, speaks Switch sides, mirrors figure, and shows SIDE 2 OF 2', () => {
    root.querySelector('button.start').click();

    // Fast forward to COOLDOWN (10s + 120s + 22*80s = 1890s)
    vi.advanceTimersByTime(10000 + 120000 + 22 * 80000);

    expect(engine.state).toBe(WorkoutPhase.COOLDOWN);
    expect(engine.stretchIndex).toBe(1); // Neck Side Stretch (40s, bilateral)

    // Stretch 1 side 1: not mirrored, no SIDE 2 OF 2
    expect(root.querySelector('.stage .fig.mirror')).toBeNull();
    expect(root.textContent).not.toContain('SIDE 2 OF 2');

    // Advance 20 seconds to halfway point (40s / 2 = 20s)
    vi.advanceTimersByTime(20000);

    // Switch sides speech and chime
    expect(soundController.speak).toHaveBeenCalledWith('Switch sides');
    expect(soundController.playChime).toHaveBeenCalled();

    // Stamp shown
    const stampEl = root.querySelector('.stamp');
    expect(stampEl).not.toBeNull();
    expect(stampEl.textContent).toContain('SWITCH SIDES');

    // Figure mirrored
    expect(root.querySelector('.stage .fig.mirror')).not.toBeNull();

    // SIDE 2 OF 2 displayed
    expect(root.textContent).toContain('SIDE 2 OF 2');
  });

  it('Mute button on Home screen toggles mute and updates icon', () => {
    const muteBtn = root.querySelector('.btn-mute');
    expect(muteBtn).not.toBeNull();
    expect(app.isMuted).toBe(false);

    // Click mute on Home
    muteBtn.click();
    expect(soundController.toggleMute).toHaveBeenCalled();
    expect(app.isMuted).toBe(true);

    // Icon should show muted state
    const mutedBtn = root.querySelector('.btn-mute');
    expect(mutedBtn.innerHTML).toContain('line'); // soundMuted icon has line elements

    // Click mute again to unmute
    mutedBtn.click();
    expect(app.isMuted).toBe(false);
  });

  it('Mute button on Workout screen toggles mute and updates icon', () => {
    root.querySelector('button.start').click();
    vi.advanceTimersByTime(10000); // In WARM_UP

    const muteBtn = root.querySelector('.btn-mute');
    expect(muteBtn).not.toBeNull();
    expect(app.isMuted).toBe(false);

    // Click mute on Workout screen
    muteBtn.click();
    expect(soundController.toggleMute).toHaveBeenCalled();
    expect(app.isMuted).toBe(true);

    // Re-rendered with soundMuted icon
    const workoutMuteBtn = root.querySelector('.btn-mute');
    expect(workoutMuteBtn.innerHTML).toContain('line');

    // Click again to unmute
    workoutMuteBtn.click();
    expect(app.isMuted).toBe(false);
  });

  describe('Streak, 7-Day History & Session Recovery on UI', () => {
    it('renders streak count and 7-day row on Home screen', () => {
      // Seed 2 consecutive days of training ending yesterday
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(today.getDate() - 2);

      storage.saveWorkout({ duration: 2340, date: twoDaysAgo });
      storage.saveWorkout({ duration: 2340, date: yesterday });

      // Re-render home
      app.render();

      const streakEl = root.querySelector('.streak');
      expect(streakEl).not.toBeNull();
      expect(streakEl.querySelector('b')?.textContent).toBe('2');
      expect(streakEl.querySelector('span')?.textContent).toBe('DAY STREAK');

      const weekEl = root.querySelector('.week');
      expect(weekEl).not.toBeNull();
      const squares = weekEl.querySelectorAll('i');
      expect(squares).toHaveLength(7);
      // Index 5 (yesterday) and index 4 (two days ago) should be .on
      expect(squares[5].classList.contains('on')).toBe(true);
      expect(squares[4].classList.contains('on')).toBe(true);
      // Today (index 6) not yet trained
      expect(squares[6].classList.contains('on')).toBe(false);
    });

    it('renders RESUME card on Home when active session was saved within 2 hours', () => {
      // Simulate active session in cardio round 14
      storage.saveActiveSession({
        sequence: [{ round: 1, exercise: { name: 'Jumping Jacks' } }],
        state: WorkoutPhase.WORK,
        roundIndex: 14,
        stretchIndex: 0,
        currentIntervalIndex: 27,
        currentIntervalRemaining: 35,
        currentIntervalDuration: 60,
        isPaused: true,
      });

      app.render();

      const resumeCard = root.querySelector('.card.resume');
      expect(resumeCard).not.toBeNull();
      expect(resumeCard.textContent).toContain('RESUME 14/22');
      expect(resumeCard.querySelector('i')).not.toBeNull();
    });

    it('renders RESUME · WARM UP card when session stopped in warm-up', () => {
      storage.saveActiveSession({
        sequence: [{ round: 1, exercise: { name: 'Jumping Jacks' } }],
        state: WorkoutPhase.WARM_UP,
        roundIndex: 0,
        stretchIndex: 0,
        currentIntervalIndex: 1,
        currentIntervalRemaining: 90,
        currentIntervalDuration: 120,
        isPaused: true,
      });

      app.render();

      const resumeCard = root.querySelector('.card.resume');
      expect(resumeCard).not.toBeNull();
      expect(resumeCard.textContent).toContain('RESUME · WARM UP');
    });

    it('renders RESUME 2/11 card when session stopped in cooldown stretch 2', () => {
      storage.saveActiveSession({
        sequence: [{ round: 1, exercise: { name: 'Jumping Jacks' } }],
        state: WorkoutPhase.COOLDOWN,
        roundIndex: 0,
        stretchIndex: 2,
        currentIntervalIndex: 46,
        currentIntervalRemaining: 15,
        currentIntervalDuration: 30,
        isPaused: true,
      });

      app.render();

      const resumeCard = root.querySelector('.card.resume');
      expect(resumeCard).not.toBeNull();
      expect(resumeCard.textContent).toContain('RESUME 2/11');
    });

    it('does not render RESUME card when active session is older than 2 hours', () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      storage.saveActiveSession(
        {
          state: WorkoutPhase.WORK,
          roundIndex: 10,
        },
        threeHoursAgo
      );

      app.render();
      expect(root.querySelector('.card.resume')).toBeNull();
    });

    it('clicking RESUME restores session in paused state, and tapping Play starts lead-in', async () => {
      // Start a workout, advance to round 1 WORK, 40s remaining
      engine.start();
      vi.advanceTimersByTime(10000); // GET_READY
      engine.skip(); // skip warm up to round 1 WORK
      vi.advanceTimersByTime(20000); // 20s elapsed, 40s remaining

      // Simulate app reload: new engine and app, reading from storage
      const reloadedEngine = new WorkoutEngine();
      const reloadedApp = new App({
        root,
        engine: reloadedEngine,
        wakeLock,
        storage,
      });
      reloadedApp.init();

      // Home should show RESUME 1/22
      const resumeCard = root.querySelector('.card.resume');
      expect(resumeCard).not.toBeNull();
      expect(resumeCard.textContent).toContain('RESUME 1/22');

      // Tap resume card
      resumeCard.click();

      // Workout should be active and paused
      expect(reloadedEngine.state).toBe(WorkoutPhase.WORK);
      expect(reloadedEngine.roundIndex).toBe(1);
      expect(reloadedEngine.currentIntervalRemaining).toBe(40);
      expect(reloadedEngine.isPaused).toBe(true);

      const mainBtn = root.querySelector('button.btn-main');
      expect(mainBtn.getAttribute('data-action')).toBe('resume');

      // Tap Play button: triggers resume with 3s lead-in
      mainBtn.click();
      expect(reloadedEngine.isPaused).toBe(false);
      expect(reloadedEngine.leadInSeconds).toBe(3);

      vi.advanceTimersByTime(3000); // Complete 3s lead-in
      expect(reloadedEngine.leadInSeconds).toBe(0);
      expect(reloadedEngine.currentIntervalRemaining).toBe(40);

      vi.advanceTimersByTime(1000);
      expect(reloadedEngine.currentIntervalRemaining).toBe(39);
    });

    it('tapping START on Home clears saved active session and starts a fresh workout', () => {
      storage.saveActiveSession({
        state: WorkoutPhase.WORK,
        roundIndex: 14,
      });

      app.render();
      expect(root.querySelector('.card.resume')).not.toBeNull();

      const startBtn = root.querySelector('button.start');
      startBtn.click();

      // Active session should be cleared in storage
      expect(storage.getActiveSession()).toBeNull();
      // Engine should start from beginning (GET_READY)
      expect(engine.state).toBe(WorkoutPhase.GET_READY);
    });

    it('completing a workout saves it to storage, updates Finished screen stats, and clears active session', () => {
      engine.start();
      engine.finish();

      // History should have 1 entry
      const history = storage.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].duration).toBe(2340);

      // Active session is cleared
      expect(storage.getActiveSession()).toBeNull();

      // Finished screen should show STREAK row in stats card and 7-day row
      const stats = root.querySelector('.card.stats');
      expect(stats.textContent).toContain('ROUNDS');
      expect(stats.textContent).toContain('22');
      expect(stats.textContent).toContain('STRETCHES');
      expect(stats.textContent).toContain('11');
      expect(stats.textContent).toContain('STREAK');
      expect(stats.textContent).toContain('1 DAY');

      const weekEl = root.querySelector('.week');
      expect(weekEl).not.toBeNull();
      const squares = weekEl.querySelectorAll('i');
      expect(squares[6].classList.contains('on')).toBe(true); // today is on

      // Return home: should now display updated streak on Home
      const homeBtn = root.querySelector('button.home');
      homeBtn.click();

      expect(engine.state).toBe(WorkoutPhase.IDLE);
      expect(root.querySelector('.streak b')?.textContent).toBe('1');
      const homeSquares = root.querySelectorAll('.week i');
      expect(homeSquares[6].classList.contains('on')).toBe(true);
    });
  });

  describe('Safari Install Hint Banner (Ticket 05)', () => {
    it('shows install hint banner on Home when not in standalone mode and not dismissed', () => {
      localStorage.clear();
      const testStorage = new WorkoutStorage(localStorage);
      const engine = new WorkoutEngine();
      const app = new App({ root, engine, storage: testStorage, isStandalone: false });
      app.init();

      const banner = root.querySelector('.install-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('Add to Home Screen');
      expect(banner.textContent).toMatch(/7 days|7-day/i);

      const dismissBtn = banner.querySelector('.btn-dismiss-install');
      expect(dismissBtn).not.toBeNull();
    });

    it('dismissing the banner hides it and persists dismissal to storage', () => {
      localStorage.clear();
      const testStorage = new WorkoutStorage(localStorage);
      const engine = new WorkoutEngine();
      const app = new App({ root, engine, storage: testStorage, isStandalone: false });
      app.init();

      const dismissBtn = root.querySelector('.btn-dismiss-install');
      expect(dismissBtn).not.toBeNull();
      dismissBtn.click();

      expect(testStorage.isInstallHintDismissed()).toBe(true);
      expect(root.querySelector('.install-banner')).toBeNull();
    });

    it('does not show install hint banner when running in standalone mode', () => {
      localStorage.clear();
      const testStorage = new WorkoutStorage(localStorage);
      const engine = new WorkoutEngine();
      const app = new App({ root, engine, storage: testStorage, isStandalone: true });
      app.init();

      expect(root.querySelector('.install-banner')).toBeNull();
    });

    it('does not show install hint banner when already dismissed in storage', () => {
      localStorage.clear();
      const testStorage = new WorkoutStorage(localStorage);
      testStorage.dismissInstallHint();
      const engine = new WorkoutEngine();
      const app = new App({ root, engine, storage: testStorage, isStandalone: false });
      app.init();

      expect(root.querySelector('.install-banner')).toBeNull();
    });
  });
});
