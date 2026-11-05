import { WorkoutEngine } from './engine.js';
import { WakeLockController } from './wake-lock.js';
import { App } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (!root) return;

  const engine = new WorkoutEngine();
  const wakeLock = new WakeLockController({
    navigator,
    document,
    onError: () => {
      app.showWakeLockNotice(true);
    },
  });

  const app = new App({ root, engine, wakeLock });
  app.init();
});
