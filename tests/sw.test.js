import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Service Worker (Ticket 05)', () => {
  const rootDir = path.resolve(__dirname, '..');
  const swPath = path.join(rootDir, 'sw.js');

  it('sw.js exists and is configured correctly', () => {
    expect(fs.existsSync(swPath), 'sw.js should exist').toBe(true);
    const code = fs.readFileSync(swPath, 'utf8');

    // Uses versioned cache name cardio-30-v1
    expect(code).toContain('cardio-30-v1');

    // Never calls skipWaiting or clients.claim
    expect(code).not.toContain('skipWaiting');
    expect(code).not.toContain('clients.claim');

    // Listens for install, activate, and fetch
    expect(code).toMatch(/addEventListener\(\s*['"]install['"]/);
    expect(code).toMatch(/addEventListener\(\s*['"]activate['"]/);
    expect(code).toMatch(/addEventListener\(\s*['"]fetch['"]/);
  });

  it('every precached asset listed in sw.js exists on disk', () => {
    const code = fs.readFileSync(swPath, 'utf8');
    // Extract array of cached assets: matches strings inside an array definition
    const assetMatch = code.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
    expect(assetMatch, 'PRECACHE_ASSETS array should be defined').not.toBeNull();

    const assets = [...assetMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(assets.length).toBeGreaterThanOrEqual(10);

    for (const asset of assets) {
      if (asset === './' || asset === '/') continue;
      const normalized = asset.replace(/^\.\//, '').replace(/^\//, '');
      const filePath = path.join(rootDir, normalized);
      expect(fs.existsSync(filePath), `Precached file "${asset}" (${filePath}) must exist`).toBe(true);
    }
  });

  it('executes cache-first strategy, clean up on activate, and install caching in SW runtime', async () => {
    // Mock Cache & Caches API
    const cacheStore = new Map();
    const mockCache = {
      addAll: vi.fn(async (urls) => {
        for (const u of urls) cacheStore.set(u, new Response(`content of ${u}`));
      }),
      match: vi.fn(async (req) => {
        const url = typeof req === 'string' ? req : req.url;
        return cacheStore.get(url) || null;
      }),
      put: vi.fn(async (req, res) => {
        const url = typeof req === 'string' ? req : req.url;
        cacheStore.set(url, res);
      }),
    };

    const cachesMap = new Map([
      ['cardio-30-v0', { delete: vi.fn() }],
      ['cardio-30-v1', mockCache],
    ]);

    const mockCaches = {
      open: vi.fn(async (name) => {
        if (!cachesMap.has(name)) cachesMap.set(name, mockCache);
        return cachesMap.get(name);
      }),
      match: vi.fn(async (req) => {
        for (const c of cachesMap.values()) {
          const res = await c.match?.(req);
          if (res) return res;
        }
        return null;
      }),
      keys: vi.fn(async () => Array.from(cachesMap.keys())),
      delete: vi.fn(async (key) => cachesMap.delete(key)),
    };

    const listeners = {};
    const mockSelf = {
      addEventListener: (evt, handler) => {
        listeners[evt] = handler;
      },
      location: { href: 'https://example.com/cardio-35/sw.js' },
    };

    // Load sw.js code in mock environment
    const code = fs.readFileSync(swPath, 'utf8');
    const swFunction = new Function('self', 'caches', 'Response', code);
    swFunction(mockSelf, mockCaches, Response);

    expect(listeners['install']).toBeDefined();
    expect(listeners['activate']).toBeDefined();
    expect(listeners['fetch']).toBeDefined();

    // Test install event
    let installPromise;
    listeners['install']({
      waitUntil: (p) => {
        installPromise = p;
      },
    });
    await installPromise;
    expect(mockCaches.open).toHaveBeenCalledWith('cardio-30-v1');
    expect(mockCache.addAll).toHaveBeenCalled();

    // Test activate event: cleans up old cache cardio-30-v0
    let activatePromise;
    listeners['activate']({
      waitUntil: (p) => {
        activatePromise = p;
      },
    });
    await activatePromise;
    expect(mockCaches.delete).toHaveBeenCalledWith('cardio-30-v0');
    expect(cachesMap.has('cardio-30-v0')).toBe(false);

    // Test fetch event: cached match returns response
    cacheStore.set('https://example.com/cardio-35/index.html', new Response('cached-index'));
    let fetchPromise;
    listeners['fetch']({
      request: new Request('https://example.com/cardio-35/index.html'),
      respondWith: (p) => {
        fetchPromise = p;
      },
    });
    const response = await fetchPromise;
    expect(await response.text()).toBe('cached-index');
  });
});
