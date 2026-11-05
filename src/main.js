import { WorkoutEngine } from './engine.js';
import { WakeLockController } from './wake-lock.js';
import { SoundController } from './sound.js';
import { WorkoutStorage } from './storage.js';
import { App } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (!root) return;

  const storage = new WorkoutStorage();
  const engine = new WorkoutEngine();
  const soundController = new SoundController();
  const wakeLock = new WakeLockController({
    navigator,
    document,
    onError: () => {
      app.showWakeLockNotice(true);
    },
  });

  const app = new App({ root, engine, wakeLock, soundController, storage });
  app.init();
});
