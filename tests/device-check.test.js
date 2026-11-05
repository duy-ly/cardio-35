import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const DEVICES = {
  iphone14ProMax: {
    name: 'iPhone 14 Pro Max',
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  ipad10thGen: {
    name: 'iPad 10th gen',
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

describe('E2E Device & Offline Verification via Headless Chrome', () => {
  let server;
  let serverUrl;
  let browser;
  const rootDir = path.resolve(__dirname, '..');

  beforeAll(async () => {
    // Start local static HTTP server
    server = http.createServer((req, res) => {
      let reqPath = new URL(req.url, 'http://127.0.0.1').pathname;
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(rootDir, safePath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Service-Worker-Allowed': '/',
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Launch headless Chrome
    browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
    });
  }, 20000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  for (const [key, dev] of Object.entries(DEVICES)) {
    describe(`Device: ${dev.name} (${dev.width} × ${dev.height})`, () => {
      it('verifies every screen in portrait: scrollHeight <= clientHeight & touch targets >= 44pt', async () => {
        const page = await browser.newPage();
        await page.setViewport({
          width: dev.width,
          height: dev.height,
          deviceScaleFactor: dev.deviceScaleFactor,
          isMobile: dev.isMobile,
          hasTouch: dev.hasTouch,
        });

        await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });

        // Helper to assert viewport scroll and touch targets
        const checkScreen = async (screenName) => {
          const metrics = await page.evaluate(() => {
            const docEl = document.documentElement;
            const body = document.body;
            const app = document.getElementById('app');

            // Find all interactive buttons/cards
            const buttons = Array.from(
              document.querySelectorAll('.btn, .start, .home, .card.resume, .btn-dismiss-install')
            );
            const targetMetrics = buttons.map((btn) => {
              const rect = btn.getBoundingClientRect();
              return {
                text: btn.textContent.trim().slice(0, 15),
                className: btn.className,
                width: rect.width,
                height: rect.height,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
              };
            });

            return {
              docClientHeight: docEl.clientHeight,
              docScrollHeight: docEl.scrollHeight,
              bodyScrollHeight: body.scrollHeight,
              appScrollHeight: app.scrollHeight,
              viewportHeight: window.innerHeight,
              viewportWidth: window.innerWidth,
              targetMetrics,
              overflowingElements: Array.from(document.querySelectorAll('.wm1, .wm2, .top, .count, .name, .lbl, .done, .total, .stats'))
                .map((el) => {
                  const r = el.getBoundingClientRect();
                  return {
                    tag: el.className,
                    text: el.textContent.slice(0, 20),
                    overflowX: r.right > window.innerWidth + 1 || r.left < -1,
                    overflowY: r.bottom > window.innerHeight + 1,
                  };
                })
                .filter((e) => e.overflowX || e.overflowY),
            };
          });

          // Assert no overflowing text elements
          expect(
            metrics.overflowingElements,
            `[${screenName}] Elements should not overflow viewport: ${JSON.stringify(metrics.overflowingElements)}`
          ).toEqual([]);

          // Assert no vertical scroll
          expect(
            metrics.docScrollHeight,
            `[${screenName}] docScrollHeight (${metrics.docScrollHeight}) must be <= docClientHeight (${metrics.docClientHeight})`
          ).toBeLessThanOrEqual(metrics.docClientHeight);

          expect(
            metrics.bodyScrollHeight,
            `[${screenName}] bodyScrollHeight (${metrics.bodyScrollHeight}) must be <= docClientHeight (${metrics.docClientHeight})`
          ).toBeLessThanOrEqual(metrics.docClientHeight);

          // Assert touch targets >= 44 x 44 pt
          for (const target of metrics.targetMetrics) {
            expect(
              target.width,
              `[${screenName}] target ${target.className} width (${target.width}) >= 44`
            ).toBeGreaterThanOrEqual(43.5); // Allow subpixel rounding
            expect(
              target.height,
              `[${screenName}] target ${target.className} height (${target.height}) >= 44`
            ).toBeGreaterThanOrEqual(43.5);
          }
        };

        // 1. Screen: Home without Resume
        await checkScreen('Home without Resume');

        // 2. Screen: Home with Resume
        await page.evaluate(() => {
          // Store an active session in localStorage
          const activeSession = {
            state: 'WORK',
            roundIndex: 14,
            stretchIndex: 0,
            remainingSessionTime: 1200,
            currentIntervalRemaining: 45,
            currentIntervalDuration: 60,
            savedAt: Date.now(),
          };
          localStorage.setItem('cardio30_active_session', JSON.stringify(activeSession));
          location.reload();
        });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await checkScreen('Home with Resume');

        // Clean up resume session for active test
        await page.evaluate(() => {
          localStorage.removeItem('cardio30_active_session');
          location.reload();
        });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

        // Click START -> transitions to GET_READY
        await page.click('.start');
        await page.waitForSelector('.screen[data-phase="GET_READY"]', { timeout: 3000 });
        await checkScreen('Get Ready');

        // Fast-forward to WARM_UP
        await page.evaluate(() => {
          const app = window.__testApp || document.querySelector('#app');
          // Engine skip jumps to WARM_UP
          document.querySelector('.btn-skip')?.click();
        });
        await page.waitForSelector('.screen[data-phase="WARM_UP"]', { timeout: 3000 });
        await checkScreen('Warm-up');

        // Skip WARM_UP -> transitions to WORK (Round 1)
        await page.click('.btn-skip');
        await page.waitForSelector('.screen[data-phase="WORK"]', { timeout: 3000 });
        await checkScreen('Work');

        // Skip to REST with cue stamp
        await page.click('.btn-skip');
        await page.waitForSelector('.screen[data-phase="REST"]', { timeout: 3000 });
        // Trigger a milestone stamp for testing visual fit
        await page.evaluate(() => {
          const stampSlot = document.querySelector('.stamp-slot');
          if (stampSlot) {
            stampSlot.innerHTML = '<span class="stamp">HALFWAY THERE</span>';
            stampSlot.style.display = 'flex';
          }
        });
        await checkScreen('Rest with cue stamp');

        // Jump engine to COOLDOWN (Side 2)
        await page.evaluate(() => {
          const app = window.__cardioApp;
          app.engine.state = 'COOLDOWN';
          app.engine.stretchIndex = 2;
          app.engine.stretchSide = 2;
          app.engine.currentExercise = { id: 'qs', name: 'Standing Quad Stretch' };
          app.engine.currentIntervalDuration = 40;
          app.engine.currentIntervalRemaining = 20;
          app.engine.remainingSessionTime = 300;
          app.renderActiveWorkout();
        });
        await checkScreen('Cooldown on side 2');

        // Screen: Finished
        await page.evaluate(() => {
          const app = window.__cardioApp;
          app.engine.state = 'FINISHED';
          app.engine.elapsedSessionTime = 2340;
          app.renderFinished();
        });
        await checkScreen('Finished');

        await page.close();
      }, 30000);
    });
  }

  it('shows full-screen "Rotate to portrait" overlay in landscape while workout timer keeps running', async () => {
    const page = await browser.newPage();
    // Landscape orientation: 932 x 430
    await page.setViewport({
      width: 932,
      height: 430,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });

    // Assert landscape overlay is visible
    const warningVisible = await page.evaluate(() => {
      const el = document.querySelector('.landscape-warning');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display === 'flex' && style.visibility !== 'hidden';
    });
    expect(warningVisible).toBe(true);

    const warningText = await page.$eval('.landscape-warning', (el) => el.textContent);
    expect(warningText).toContain('Rotate to portrait');

    // Start workout while in landscape
    await page.evaluate(() => {
      window.__cardioApp.handleStart();
    });

    const timer1 = await page.evaluate(() => window.__cardioApp.engine.currentIntervalRemaining);
    await new Promise((r) => setTimeout(r, 1200));
    const timer2 = await page.evaluate(() => window.__cardioApp.engine.currentIntervalRemaining);

    // Timer continued ticking behind the landscape warning!
    expect(timer2).toBeLessThan(timer1);

    await page.close();
  });

  it('service worker registers, precaches assets, and loads offline', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3 });

    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'networkidle0' });

    // Wait for service worker to become active
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    // Check caches
    const cachedUrls = await page.evaluate(async () => {
      const cache = await caches.open('cardio-30-v1');
      const keys = await cache.keys();
      return keys.map((k) => k.url);
    });
    expect(cachedUrls.length).toBeGreaterThanOrEqual(10);

    // Now turn network OFFLINE
    await page.setOfflineMode(true);

    // Reload the page while completely offline
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Assert app is loaded and renders Home
    const title = await page.$eval('.wm1', (el) => el.textContent);
    expect(title).toBe('CARDIO');

    // Click START while offline
    await page.click('.start');
    await page.waitForSelector('.screen[data-phase="GET_READY"]', { timeout: 3000 });

    const phase = await page.$eval('.screen', (el) => el.dataset.phase);
    expect(phase).toBe('GET_READY');

    await page.close();
  }, 30000);
});
