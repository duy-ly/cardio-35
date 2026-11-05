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
  if (typeof window !== 'undefined') {
    window.__cardioApp = app;
  }

  if (typeof navigator !== 'undefined' && 'storage' in navigator && typeof navigator.storage.persist === 'function') {
    navigator.storage.persist().catch(() => {});
  }
});

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
