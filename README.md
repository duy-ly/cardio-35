# Cardio 30

A portrait-first, distraction-free Progressive Web Application (PWA) for a hands-free 39-minute home fitness routine on an exercise mat. Built specifically for mobile phones and iPads in portrait mode.

- **Production URL**: [https://duy-ly.github.io/cardio-35/](https://duy-ly.github.io/cardio-35/)
- **Repository**: [duy-ly/cardio-35](https://github.com/duy-ly/cardio-35)

---

## Workout Structure

- **2-Minute Free Warm-Up**: 2-minute timer before the workout begins. No set movement; warm up your own way.
- **30-Minute Standing Cardio**: 22 rounds of 60 seconds work followed by 20 seconds rest. Loops through a curated pool of 8 standing and jumping movements (no equipment, no floor exercises, no weights), shuffled each pass so the routine stays fresh.
- **8-Minute Cooldown**: 11 targeted standing, kneeling, and seated stretches covering every major muscle group, with gentle audio cues and half-time side switches.

---

## Key Features

- **Offline-First PWA**: Built with a custom service worker (`sw.js`) that precaches every asset on the first visit. Reloads and runs workouts completely offline without an internet connection.
- **Installable**: Full standalone experience with `manifest.json` and iOS touch icons. When opened in a browser tab, a dismissible hint banner provides "Share → Add to Home Screen" instructions and 7-day Safari storage warning.
- **Persistent Storage**: Automatically requests persistent client storage (`navigator.storage.persist()`) to preserve workout streak and history.
- **Screen Wake Lock**: Automatically keeps device screens awake during active workouts and safely releases the lock when paused or completed.
- **High-Contrast Phase Colors**: Full-bleed background color feedback readable from across the room:
  - Cream (`#FFF6EE`): Home & Finished
  - Raspberry (`#D6336C`): Warm-up
  - Orange (`#FF4F1F`): Work
  - Teal (`#0E9F89`): Get Ready & Rest
  - Violet (`#6D5DF6`): Cooldown
- **Vector Figure Rig**: Lightweight inline SVG rig animating all 19 movements using pure CSS `@keyframes` with no external video or web font dependencies.
- **Web Audio & Speech**: Crisp synthesized countdown ticks, chimes, and Web Speech API cues that blend over background music (Spotify/Apple Music).
- **Session Recovery & History**: Automatically saves in-progress workouts to survive accidental reloads (resumable within 2 hours) and tracks streaks and 7-day workout history in `localStorage`.
- **Landscape Overlay**: Viewport-adaptive CSS shows a full-screen "Rotate to portrait" overlay if rotated, while the workout timer and audio cues continue running uninterrupted behind it.

---

## Target Devices

Designed and verified in portrait mode:
- **iPhone 14 Pro Max** (430 × 932 pt)
- **iPad 10th gen** (820 × 1180 pt)

All controls have touch targets $\ge 44 \times 44\text{ pt}$ and fit within device safe areas with zero vertical page scrolling.

---

## Local Development

No compilation or build step required. Built with standard ES6 modules, HTML5, and CSS:

```bash
# Clone the repository
git clone https://github.com/duy-ly/cardio-35.git
cd cardio-35

# Install development dependencies (Vitest, Puppeteer for verification)
npm install

# Start a local static HTTP server (e.g., using Python or any static server)
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080` in Safari or Chrome.

---

## Testing

Run all unit, integration, and browser verification tests:

```bash
npm test
```

The test suite covers:
- **PWA & Manifest**: Manifest keys, relative links, iOS meta tags, and service worker registration (`tests/pwa.test.js`).
- **Service Worker**: Cache name versioning (`cardio-30-v1`), precache asset verification, cache-first strategy, and clean activation (`tests/sw.test.js`).
- **Engine & Generator**: Interval state machine, 22-round circuit shuffling, timers, and lead-in beeps (`tests/engine.test.js`, `tests/generator.test.js`).
- **Audio & Sound**: Web Audio synthesizer, Speech cues, and mute toggles (`tests/sound.test.js`).
- **Storage & Recovery**: History logging, streak calculation, and active session recovery (`tests/storage.test.js`).
- **Device & Offline Checks**: Headless Chrome DevTools Protocol verification for iPhone and iPad viewports, touch targets, landscape overlay, and offline service worker operation (`tests/device-check.test.js`).

---

## Deployment

The application is deployed as a static site to GitHub Pages:
1. Ensure all tests pass (`npm test`).
2. Push commits to `main` on `duy-ly/cardio-35`.
3. Enable GitHub Pages in repository settings pointing to root (`/`) of branch `main`.
