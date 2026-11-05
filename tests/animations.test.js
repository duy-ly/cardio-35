// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getFigureSvg, SIDE_VIEW } from '../src/ui.js';
import { WorkoutEngine, WorkoutPhase } from '../src/engine.js';
import { App } from '../src/app.js';
import { CARDIO_POOL, COOLDOWN_STRETCHES } from '../src/generator.js';

describe('Exercise Animation Rig - SVG Structure', () => {
  it('renders the complete SVG figure rig with all limbs, joints, and shadow', () => {
    const svgHtml = getFigureSvg('#fff', 'jj');
    const container = document.createElement('div');
    container.innerHTML = svgHtml;
    const svg = container.querySelector('svg.fig');

    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 250');
    expect(svg.getAttribute('aria-hidden')).toBe('true');

    // Floor shadow
    const shadow = svg.querySelector('ellipse.shadow');
    expect(shadow).not.toBeNull();
    expect(shadow.getAttribute('cx')).toBe('100');
    expect(shadow.getAttribute('cy')).toBe('236');
    expect(shadow.getAttribute('rx')).toBe('46');
    expect(shadow.getAttribute('ry')).toBe('6');
    expect(shadow.getAttribute('opacity')).toBe('.2');

    // Body container
    const body = svg.querySelector('g.body');
    expect(body).not.toBeNull();
    expect(body.getAttribute('stroke')).toBe('#fff');
    expect(body.getAttribute('stroke-width')).toBe('15');
    expect(body.getAttribute('stroke-linecap')).toBe('round');
    expect(body.getAttribute('stroke-linejoin')).toBe('round');

    // Legs and shins (hip pivot at 100,140, knee pivot at 0,42)
    const legR = body.querySelector('.leg-r');
    const legL = body.querySelector('.leg-l');
    const shinR = body.querySelector('.shin-r');
    const shinL = body.querySelector('.shin-l');
    expect(legR).not.toBeNull();
    expect(legL).not.toBeNull();
    expect(shinR).not.toBeNull();
    expect(shinL).not.toBeNull();

    // Upper body and chest hierarchy (hip pivot, chest sliding group, neck/head)
    const upper = body.querySelector('.upper');
    const chest = body.querySelector('.chest');
    const head = body.querySelector('.head');
    expect(upper).not.toBeNull();
    expect(chest).not.toBeNull();
    expect(head).not.toBeNull();
    expect(head.getAttribute('cx')).toBe('100');
    expect(head.getAttribute('cy')).toBe('40');
    expect(head.getAttribute('r')).toBe('17');

    // Arms and forearms (shoulder pivot at 100,74, elbow pivot at 0,31)
    const armR = chest.querySelector('.arm-r');
    const armL = chest.querySelector('.arm-l');
    const foreR = chest.querySelector('.fore-r');
    const foreL = chest.querySelector('.fore-l');
    expect(armR).not.toBeNull();
    expect(armL).not.toBeNull();
    expect(foreR).not.toBeNull();
    expect(foreL).not.toBeNull();
  });

  it('maps all 10 front-to-back movements to side view and the other 9 to front view', () => {
    const expectedSideViewIds = [
      'bk', // Butt Kicks
      'sj', // Squat Jumps
      'hk', // High Knees
      'rl', // Reverse Lunge & Knee Drive
      'qs', // Standing Quad Stretch
      'cs', // Standing Calf Stretch
      'hf', // Kneeling Hip Flexor Stretch
      'hs', // Seated Single-Leg Hamstring Stretch
      'fg', // Seated Figure-4 Glute Stretch
      'cp', // Child's Pose
    ];

    const expectedFrontViewIds = [
      'jj', // Jumping Jacks
      'sk', // Skater Step & Floor Touch
      'jr', // Jump Rope
      'kc', // Standing Cross-Body Knee Crunch
      'nk', // Neck Side Stretch
      'co', // Standing Chest & Shoulder Opener
      'oss', // Overhead Side Stretch
      'bf', // Seated Butterfly Stretch
      'tw', // Seated Spinal Twist
    ];

    // Total must be 19 movements
    expect(expectedSideViewIds.length + expectedFrontViewIds.length).toBe(19);

    // Verify SIDE_VIEW constant
    expect([...SIDE_VIEW].sort()).toEqual([...expectedSideViewIds].sort());

    const container = document.createElement('div');

    for (const id of expectedSideViewIds) {
      container.innerHTML = getFigureSvg('#fff', id);
      const svg = container.querySelector('svg.fig');
      expect(svg.classList.contains('side')).toBe(true);
      expect(svg.classList.contains(id)).toBe(true);

      // Also verify object passing works
      container.innerHTML = getFigureSvg('#fff', { id });
      const svgObj = container.querySelector('svg.fig');
      expect(svgObj.classList.contains('side')).toBe(true);
      expect(svgObj.classList.contains(id)).toBe(true);
    }

    for (const id of expectedFrontViewIds) {
      container.innerHTML = getFigureSvg('#fff', id);
      const svg = container.querySelector('svg.fig');
      expect(svg.classList.contains('side')).toBe(false);
      expect(svg.classList.contains(id)).toBe(true);

      // Also verify object passing works
      container.innerHTML = getFigureSvg('#fff', { id });
      const svgObj = container.querySelector('svg.fig');
      expect(svgObj.classList.contains('side')).toBe(false);
      expect(svgObj.classList.contains(id)).toBe(true);
    }
  });

  it('supports extra classes including bilateral mirror', () => {
    const normalSvg = getFigureSvg('#fff', 'qs', '');
    expect(normalSvg).toContain('class="fig qs side"');
    expect(normalSvg).not.toContain('mirror');

    const mirroredSvg = getFigureSvg('#fff', 'qs', 'mirror');
    expect(mirroredSvg).toContain('class="fig qs side mirror"');
  });
});

describe('App Phase Figure Rendering & Bilateral Mirroring', () => {
  let root;
  let engine;
  let app;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    document.body.appendChild(root);
    engine = new WorkoutEngine();
    app = new App({ root, engine });
    app.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('Warm-up and Rest screens have no exercise animation', () => {
    root.querySelector('button.start').click();

    // GET_READY -> advance to WARM_UP
    vi.advanceTimersByTime(10000);
    expect(engine.state).toBe(WorkoutPhase.WARM_UP);
    expect(root.querySelector('.stage')).toBeNull();
    expect(root.querySelector('.fig')).toBeNull();

    // Advance through 120s WARM_UP to round 1 WORK
    vi.advanceTimersByTime(120000);
    expect(engine.state).toBe(WorkoutPhase.WORK);
    expect(root.querySelector('.stage')).not.toBeNull();
    expect(root.querySelector('.fig')).not.toBeNull();

    // Advance 60s to REST
    vi.advanceTimersByTime(60000);
    expect(engine.state).toBe(WorkoutPhase.REST);
    expect(root.querySelector('.stage')).toBeNull();
    expect(root.querySelector('.fig')).toBeNull();
  });

  it('Work screen displays active cardio exercise animation class and correct side view', () => {
    root.querySelector('button.start').click();
    vi.advanceTimersByTime(10000); // GET_READY -> WARM_UP
    vi.advanceTimersByTime(120000); // WARM_UP -> WORK round 1

    expect(engine.state).toBe(WorkoutPhase.WORK);
    const activeEx = engine.currentExercise;
    const fig = root.querySelector('svg.fig');
    expect(fig).not.toBeNull();
    expect(fig.classList.contains(activeEx.id)).toBe(true);
    if (SIDE_VIEW.includes(activeEx.id)) {
      expect(fig.classList.contains('side')).toBe(true);
    } else {
      expect(fig.classList.contains('side')).toBe(false);
    }
  });

  it('Cooldown screen mirrors bilateral stretch on side 2 and does not mirror on side 1', () => {
    root.querySelector('button.start').click();

    // Fast-forward to cooldown by skipping intervals until COOLDOWN
    while (engine.state !== WorkoutPhase.COOLDOWN) {
      engine.skip();
    }

    expect(engine.state).toBe(WorkoutPhase.COOLDOWN);
    const stretch = engine.currentExercise;
    expect(stretch.bilateral).toBe(true); // Neck stretch is bilateral

    // Side 1
    expect(engine.stretchSide).toBe(1);
    let fig = root.querySelector('svg.fig');
    expect(fig).not.toBeNull();
    expect(fig.classList.contains(stretch.id)).toBe(true);
    expect(fig.classList.contains('mirror')).toBe(false);

    // Advance to half duration when side switches
    vi.advanceTimersByTime((stretch.duration / 2) * 1000);
    expect(engine.stretchSide).toBe(2);
    fig = root.querySelector('svg.fig');
    expect(fig).not.toBeNull();
    expect(fig.classList.contains(stretch.id)).toBe(true);
    expect(fig.classList.contains('mirror')).toBe(true);
  });
});

describe('CSS Keyframes & Figure Styles', () => {
  const cssPath = path.resolve(__dirname, '../css/app.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('defines timing variables with --slow scaling for all 19 movements', () => {
    expect(cssContent).toMatch(/--slow:\s*1;/);
    const movementIds = [
      'jj', 'bk', 'sj', 'hk', 'sk', 'rl', 'jr', 'kc',
      'nk', 'co', 'oss', 'qs', 'cs', 'hf', 'hs', 'bf', 'fg', 'tw', 'cp'
    ];
    for (const id of movementIds) {
      expect(cssContent).toMatch(new RegExp(`--${id}:\\s*calc\\([^;]+var\\(--slow\\)[^;]*\\);`));
    }
  });

  it('defines base figure rig styles and side view opacity for far limbs', () => {
    expect(cssContent).toContain('.fig {');
    expect(cssContent).toContain('.shadow {');
    expect(cssContent).toContain('.head {');
    // Far arm and leg at 50% opacity in side view
    expect(cssContent).toMatch(/\.side\s+\.leg-r,\s*\.side\s+\.arm-r\s*\{[^}]*opacity:\s*(\.5|0\.5);/);
    // Mirroring
    expect(cssContent).toMatch(/\.mirror\s*\{[^}]*transform:\s*scaleX\(-1\);/);
  });

  it('defines keyframes and animation bindings for all 8 cardio movements', () => {
    const cardioKeyframes = [
      'jjArmL', 'jjArmR', 'jjLegL', 'jjLegR', 'jjBody', 'jjShadow',
      'bkThigh', 'bkShin', 'bkArm', 'bkBody', 'bkShadow',
      'sjBody', 'sjThigh', 'sjShin', 'sjUpper', 'sjArm', 'sjShadow',
      'hkThigh', 'hkShin', 'hkArm',
      'skBody', 'skShadow', 'skUpper', 'skChest', 'skLegL', 'skShinL', 'skLegR', 'skShinR', 'skArmL', 'skArmR',
      'rlBody', 'rlShadow', 'rlUpper', 'rlThigh', 'rlShin', 'rlArm',
      'jrBody', 'jrArmL', 'jrForeL', 'jrArmR', 'jrForeR',
      'kcUpper', 'kcChest', 'kcLegL', 'kcShinL', 'kcLegR', 'kcShinR', 'kcArmL', 'kcForeL', 'kcArmR', 'kcForeR',
    ];

    for (const kf of cardioKeyframes) {
      expect(cssContent).toContain(`@keyframes ${kf}`);
    }

    // Verify class bindings for each of 8 cardio movements
    const cardioIds = ['jj', 'bk', 'sj', 'hk', 'sk', 'rl', 'jr', 'kc'];
    for (const id of cardioIds) {
      expect(cssContent).toMatch(new RegExp(`\\.${id}\\s+\\.[a-z\\-]+`));
    }
  });

  it('defines keyframes and animation bindings for all 11 cooldown stretches', () => {
    const stretchKeyframes = [
      'nkHead', 'nkArmL', 'nkForeL', 'nkArmR',
      'coArmL', 'coForeL', 'coArmR', 'coForeR', 'coBody',
      'ossLean',
      'qsThigh', 'qsShin',
      'csBody', 'csLean', 'csFront', 'csShin',
      'hfBody', 'hfUpper', 'hfBack', 'hfBackShin', 'hfShin',
      'hsUpper', 'hsArm', 'hsFore',
      'bfLegL', 'bfLegR', 'bfChest', 'bfArmL', 'bfForeL', 'bfArmR', 'bfForeR',
      'fgUpper',
      'twUpper', 'twArmL', 'twForeL', 'twArmR',
      'cpUpper', 'cpArm',
    ];

    for (const kf of stretchKeyframes) {
      expect(cssContent).toContain(`@keyframes ${kf}`);
    }

    // Verify class bindings for each of 11 stretch movements
    const stretchIds = ['nk', 'co', 'oss', 'qs', 'cs', 'hf', 'hs', 'bf', 'fg', 'tw', 'cp'];
    for (const id of stretchIds) {
      expect(cssContent).toMatch(new RegExp(`\\.${id}\\s+\\.[a-z\\-]+`));
    }
  });

  it('validates that all 19 movements in CARDIO_POOL and COOLDOWN_STRETCHES are wired up with keyframes and view classes', () => {
    expect(CARDIO_POOL.length).toBe(8);
    expect(COOLDOWN_STRETCHES.length).toBe(11);

    const container = document.createElement('div');

    for (const cardio of CARDIO_POOL) {
      container.innerHTML = getFigureSvg('#fff', cardio.id);
      const svg = container.querySelector('svg.fig');
      expect(svg.classList.contains(cardio.id)).toBe(true);
      expect(svg.classList.contains('side')).toBe(cardio.view === 'side');
      expect(cssContent).toMatch(new RegExp(`\\.${cardio.id}\\s+\\.[a-z\\-]+`));
    }

    for (const stretch of COOLDOWN_STRETCHES) {
      container.innerHTML = getFigureSvg('#fff', stretch.id);
      const svg = container.querySelector('svg.fig');
      expect(svg.classList.contains(stretch.id)).toBe(true);
      expect(svg.classList.contains('side')).toBe(stretch.view === 'side');
      expect(cssContent).toMatch(new RegExp(`\\.${stretch.id}\\s+\\.[a-z\\-]+`));

      if (stretch.bilateral) {
        container.innerHTML = getFigureSvg('#fff', stretch.id, 'mirror');
        const mirrorSvg = container.querySelector('svg.fig');
        expect(mirrorSvg.classList.contains('mirror')).toBe(true);
      }
    }
  });
});
