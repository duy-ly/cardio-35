import { CARDIO_POOL, COOLDOWN_STRETCHES } from './generator.js';

export const COLORS = Object.freeze({
  cream: '#FFF6EE',
  coral: '#F25533',
  navy: '#1F2A44',
  rasp: '#D6336C',
  orange: '#FF4F1F',
  teal: '#0E9F89',
  violet: '#6D5DF6',
});

export const PHASE_COLORS = Object.freeze({
  IDLE: COLORS.cream,
  GET_READY: COLORS.teal,
  WARM_UP: COLORS.rasp,
  WORK: COLORS.orange,
  REST: COLORS.teal,
  COOLDOWN: COLORS.violet,
  FINISHED: COLORS.cream,
});

export function formatTimeMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function formatTimeMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const ICON = {
  pause: (c = '#fff') =>
    `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill="${c}"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill="${c}"/></svg>`,
  play: (c = '#fff', s = 26) =>
    `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.2-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z" fill="${c}"/></svg>`,
  skip: (c = '#fff') =>
    `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 5.5v13a1 1 0 0 0 1.55.83l9.2-6.5a1 1 0 0 0 0-1.66l-9.2-6.5A1 1 0 0 0 5 5.5z" fill="${c}"/><rect x="17" y="5" width="3" height="14" rx="1.2" fill="${c}"/></svg>`,
  sound: (c = '#fff') =>
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="${c}"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`,
  soundMuted: (c = '#fff') =>
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="${c}"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>`,
  swap: (c = '#fff') =>
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>`,
};

export function renderWeek(days = []) {
  return `<div class="week">${days.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</div>`;
}

export const SIDE_VIEW = Object.freeze(
  [...CARDIO_POOL, ...COOLDOWN_STRETCHES]
    .filter((m) => m.view === 'side')
    .map((m) => m.id)
);

const limb = (side, upper, lower, len) =>
  `<g class="${upper}-${side}"><line x1="0" y1="0" x2="0" y2="${len}"/><g transform="translate(0,${len})"><g class="${lower}-${side}"><line x1="0" y1="0" x2="0" y2="${len}"/></g></g></g>`;

export function getFigureSvg(color = '#fff', mode = 'jj', extra = '') {
  const modeId = typeof mode === 'object' && mode !== null ? mode.id : mode;
  const isSide = SIDE_VIEW.includes(modeId);
  const classList = ['fig', modeId, isSide ? 'side' : '', extra].filter(Boolean).join(' ');

  return `<svg class="${classList}" viewBox="0 0 200 250" aria-hidden="true">
    <ellipse class="shadow" cx="100" cy="236" rx="46" ry="6" fill="${color}" opacity=".2"/>
    <g class="body" stroke="${color}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <g transform="translate(100,140)">${limb('r', 'leg', 'shin', 42)}</g>
      <g transform="translate(100,140)">${limb('l', 'leg', 'shin', 42)}</g>
      <g transform="translate(100,140)"><g class="upper"><g transform="translate(-100,-140)">
        <line x1="100" y1="100" x2="100" y2="140"/>
        <g class="chest">
          <g transform="translate(100,74)">${limb('r', 'arm', 'fore', 31)}</g>
          <line x1="100" y1="66" x2="100" y2="106"/>
          <g transform="translate(100,74)">${limb('l', 'arm', 'fore', 31)}</g>
          <circle class="head" cx="100" cy="40" r="17" fill="${color}" stroke="none"/>
        </g>
      </g></g></g>
    </g>
  </svg>`;
}
