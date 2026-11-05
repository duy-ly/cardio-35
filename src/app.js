import { WorkoutPhase } from './engine.js';
import { PHASE_COLORS, formatTimeMS, formatTimeMMSS, ICON, getFigureSvg, COLORS } from './ui.js';
import { SoundController } from './sound.js';

export class App {
  constructor(options = {}) {
    this.root = options.root;
    this.engine = options.engine;
    this.wakeLock = options.wakeLock;
    this.soundController =
      options.soundController ||
      new SoundController({ isMuted: options.isMuted });

    this.isMuted = this.soundController ? this.soundController.isMuted : false;
    this.activeCue = null;
    this.cueTimeout = null;
    this.wakeLockWarning = false;

    this.handleStart = this.handleStart.bind(this);
    this.handlePauseResume = this.handlePauseResume.bind(this);
    this.handleSkip = this.handleSkip.bind(this);
    this.handleMuteToggle = this.handleMuteToggle.bind(this);
    this.handleHome = this.handleHome.bind(this);
  }

  init() {
    this.setupEngineListeners();
    this.render();
  }

  setupEngineListeners() {
    this.engine.on('phaseChange', (phase) => {
      this.updateThemeColor(PHASE_COLORS[phase]);
      this.render();
    });

    this.engine.on('tick', () => {
      this.updateTimersAndBand();
    });

    this.engine.on('leadInTick', (sec) => {
      this.updateLeadInDisplay(sec);
    });

    this.engine.on('sound', ({ type, frequency }) => {
      if (this.soundController) {
        if (type === 'tick') {
          this.soundController.playTick();
        } else if (type === 'chime') {
          this.soundController.playChime();
        }
      }
    });

    this.engine.on('cue', (cue) => {
      if (this.soundController) {
        this.soundController.speak(cue.text);
      }
      if (
        cue.stamp ||
        ['HALFWAY', 'FINISHER', 'SWITCH_SIDES', 'COOLDOWN_START'].includes(cue.type)
      ) {
        this.showCue(cue);
      }
    });

    this.engine.on('pause', () => {
      this.render();
    });

    this.engine.on('resume', () => {
      this.render();
    });
  }

  updateThemeColor(color) {
    if (typeof document !== 'undefined') {
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = color;
    }
  }

  showCue(cue) {
    this.activeCue = cue;
    if (cue.type === 'SWITCH_SIDES') {
      this.renderActiveWorkout();
    } else {
      this.renderCueElement();
    }

    if (this.cueTimeout) {
      clearTimeout(this.cueTimeout);
    }
    this.cueTimeout = setTimeout(() => {
      this.activeCue = null;
      this.renderCueElement();
    }, 4000);
  }

  showWakeLockNotice(show) {
    this.wakeLockWarning = show;
    this.render();
  }

  handleStart() {
    if (this.soundController) {
      this.soundController.unlock();
    }
    this.engine.start();
    if (this.wakeLock) {
      this.wakeLock.request().then((ok) => {
        if (!ok) {
          this.showWakeLockNotice(true);
        }
      });
    }
  }

  handlePauseResume() {
    if (this.engine.isPaused) {
      this.engine.resume();
      if (this.wakeLock) {
        this.wakeLock.request().then((ok) => {
          if (!ok) {
            this.showWakeLockNotice(true);
          }
        });
      }
    } else {
      this.engine.pause();
      if (this.wakeLock) {
        this.wakeLock.release();
      }
    }
  }

  handleSkip() {
    this.engine.skip();
  }

  handleMuteToggle() {
    if (this.soundController) {
      this.isMuted = this.soundController.toggleMute();
    } else {
      this.isMuted = !this.isMuted;
    }
    this.render();
  }

  handleHome() {
    this.engine.reset();
  }

  renderCueElement() {
    const cueContainer = this.root.querySelector('.stamp-slot');
    if (!cueContainer) return;

    if (
      this.activeCue &&
      (this.activeCue.stamp ||
        ['HALFWAY', 'FINISHER', 'SWITCH_SIDES', 'COOLDOWN_START'].includes(
          this.activeCue.type
        ))
    ) {
      const stampText = (
        this.activeCue.stamp || this.activeCue.text
      ).toUpperCase();
      const iconHtml =
        this.activeCue.type === 'SWITCH_SIDES' ? `${ICON.swap('#fff')} ` : '';
      cueContainer.innerHTML = `<span class="stamp">${iconHtml}${stampText}</span>`;
      cueContainer.style.display = 'flex';
    } else {
      cueContainer.innerHTML = '';
      cueContainer.style.display = 'none';
    }
  }

  updateLeadInDisplay(sec) {
    const countEl = this.root.querySelector('.count');
    if (countEl && sec > 0) {
      countEl.textContent = sec;
    }
  }

  updateTimersAndBand() {
    const intervalRemaining = this.engine.currentIntervalRemaining;
    const sessionRemaining = this.engine.remainingSessionTime;
    const intervalDuration = this.engine.currentIntervalDuration;

    const countEl = this.root.querySelector('.count');
    if (countEl && this.engine.leadInSeconds === 0) {
      if (this.engine.state === WorkoutPhase.WARM_UP) {
        countEl.textContent = formatTimeMS(intervalRemaining);
      } else {
        countEl.textContent = String(intervalRemaining);
      }
    }

    const sessionLeftEl = this.root.querySelector('.session-left');
    if (sessionLeftEl) {
      sessionLeftEl.textContent = formatTimeMMSS(sessionRemaining);
    }

    const bandEl = this.root.querySelector('.band');
    if (bandEl && intervalDuration > 0) {
      const elapsed = intervalDuration - intervalRemaining;
      const pct = Math.min(100, Math.max(0, (elapsed / intervalDuration) * 100));
      bandEl.style.height = `${pct}%`;
    }
  }

  render() {
    const phase = this.engine.state;

    if (phase === WorkoutPhase.IDLE) {
      this.renderHome();
    } else if (phase === WorkoutPhase.FINISHED) {
      this.renderFinished();
    } else {
      this.renderActiveWorkout();
    }
  }

  renderHome() {
    this.root.innerHTML = `
      <div class="screen tc light" style="background:${COLORS.cream}">
        <div class="col">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="eyebrow">STANDING · NO GEAR</span>
            <button class="btn mute btn-mute" aria-label="Toggle sound">
              ${this.isMuted ? ICON.soundMuted(COLORS.navy) : ICON.sound(COLORS.navy)}
            </button>
          </div>
          <div class="wm1">CARDIO</div>
          <div class="wm2">30</div>
          <div style="flex:1"></div>
          <button class="start" aria-label="Start workout">
            START ${ICON.play('#fff', 36)}
          </button>
        </div>
      </div>
    `;

    this.root.querySelector('.btn-mute')?.addEventListener('click', this.handleMuteToggle);
    this.root.querySelector('.start')?.addEventListener('click', this.handleStart);
  }

  renderActiveWorkout() {
    const phase = this.engine.state;
    const isPaused = this.engine.isPaused;
    const bg = PHASE_COLORS[phase];
    const duration = this.engine.currentIntervalDuration;
    const remaining = this.engine.currentIntervalRemaining;
    const sessionLeft = formatTimeMMSS(this.engine.remainingSessionTime);
    const elapsed = duration - remaining;
    const bandHeight = duration > 0 ? (elapsed / duration) * 100 : 0;

    let topProgress = '';
    let contentHtml = '';

    if (phase === WorkoutPhase.GET_READY) {
      topProgress = 'WARM UP';
      contentHtml = `
        <div class="mid">
          <div class="lbl">GET READY</div>
          <div class="count rest tab">${remaining}</div>
        </div>
        <div class="lbl next-label">NEXT</div>
        <div class="name next-name" style="margin-top:.6cqh">Warm up</div>
      `;
    } else if (phase === WorkoutPhase.WARM_UP) {
      topProgress = 'WARM UP';
      const round1Name = this.engine.sequence ? this.engine.sequence[0].exercise.name : '';
      contentHtml = `
        <div class="mid">
          <div class="lbl">WARM UP</div>
          <div class="count warm tab">${formatTimeMS(remaining)}</div>
        </div>
        <div class="lbl next-label">FIRST</div>
        <div class="name next-name" style="margin-top:.6cqh">${round1Name}</div>
      `;
    } else if (phase === WorkoutPhase.WORK) {
      topProgress = `${this.engine.roundIndex}<small>/22</small>`;
      const exName = this.engine.currentExercise ? this.engine.currentExercise.name : '';
      const mode = this.engine.currentExercise?.id || 'jj';
      contentHtml = `
        <div class="count tab">${remaining}</div>
        <div class="stage">${getFigureSvg('#fff', mode)}</div>
        <div class="name exercise-name">${exName}</div>
      `;
    } else if (phase === WorkoutPhase.REST) {
      topProgress = `${this.engine.roundIndex}<small>/22</small>`;
      const nextExName = this.engine.nextExercise ? this.engine.nextExercise.name : '';
      contentHtml = `
        <div class="mid">
          <div class="lbl">REST</div>
          <div class="count rest tab">${remaining}</div>
          <div class="stamp-slot" style="display:none"></div>
        </div>
        <div class="lbl next-label">NEXT</div>
        <div class="name next-name" style="margin-top:.6cqh">${nextExName}</div>
      `;
    } else if (phase === WorkoutPhase.COOLDOWN) {
      topProgress = `${this.engine.stretchIndex}<small>/11</small>`;
      const stretch = this.engine.currentExercise;
      const stretchName = stretch ? stretch.name : '';
      const mode = stretch?.id || 'nk';
      const isSide2 = this.engine.stretchSide === 2;
      const mirrorClass = isSide2 ? 'mirror' : '';

      contentHtml = `
        <div class="stamp-slot" style="display:none;margin-top:1.6cqh"></div>
        <div class="count cool tab">${remaining}</div>
        <div class="stage">${getFigureSvg('#fff', mode, mirrorClass)}</div>
        <div class="name exercise-name">${stretchName}</div>
        ${isSide2 ? '<div class="lbl" style="margin-top:.8cqh">SIDE 2 OF 2</div>' : ''}
      `;
    }

    const warningHtml = this.wakeLockWarning
      ? `<div class="wake-lock-notice">Screen wake lock unavailable; screen may sleep.</div>`
      : '';

    this.root.innerHTML = `
      <div class="screen tc" data-phase="${phase}" style="background:${bg}">
        <div class="band" style="height:${bandHeight}%"></div>
        <div class="col">
          ${warningHtml}
          <div class="top">
            <span class="round-progress">${topProgress}</span>
            <span><small>LEFT </small><span class="tab session-left">${sessionLeft}</span></span>
          </div>
          ${contentHtml}
          <div class="ctrl">
            <button class="btn btn-mute" aria-label="Toggle sound">
              ${this.isMuted ? ICON.soundMuted('#fff') : ICON.sound('#fff')}
            </button>
            <button class="btn main btn-main" data-action="${isPaused ? 'resume' : 'pause'}" aria-label="${isPaused ? 'Resume workout' : 'Pause workout'}">
              ${isPaused ? ICON.play(bg, 32) : ICON.pause(bg)}
            </button>
            <button class="btn btn-skip" aria-label="Skip to next">
              ${ICON.skip('#fff')}
            </button>
          </div>
        </div>
      </div>
    `;

    this.renderCueElement();

    this.root.querySelector('.btn-mute')?.addEventListener('click', this.handleMuteToggle);
    this.root.querySelector('.btn-main')?.addEventListener('click', this.handlePauseResume);
    this.root.querySelector('.btn-skip')?.addEventListener('click', this.handleSkip);
  }

  renderFinished() {
    const totalTime = formatTimeMMSS(this.engine.elapsedSessionTime || 2340);
    this.root.innerHTML = `
      <div class="screen tc light" style="background:${COLORS.cream}">
        <div class="col">
          <div class="done">DONE.</div>
          <div class="total tab">${totalTime}</div>
          <div class="card stats">
            <div><span>ROUNDS</span><span>22</span></div>
            <div><span>STRETCHES</span><span>11</span></div>
          </div>
          <div style="flex:1"></div>
          <button class="home" aria-label="Return home">HOME</button>
        </div>
      </div>
    `;

    this.root.querySelector('.home')?.addEventListener('click', this.handleHome);
  }
}
