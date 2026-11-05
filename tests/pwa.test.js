import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA Manifest & Meta Tags (Ticket 05)', () => {
  const rootDir = path.resolve(__dirname, '..');
  const manifestPath = path.join(rootDir, 'manifest.json');
  const indexPath = path.join(rootDir, 'index.html');

  it('manifest.json exists and contains correct PWA configuration', () => {
    expect(fs.existsSync(manifestPath), 'manifest.json should exist').toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(content.name).toBe('Cardio 30');
    expect(content.short_name).toBe('Cardio 30');
    expect(content.display).toBe('standalone');
    expect(content.orientation).toBe('portrait');
    expect(content.theme_color).toBe('#FFF6EE');
    expect(content.background_color).toBe('#FFF6EE');
    expect(content.start_url).toMatch(/^\.\//);
    expect(content.scope).toMatch(/^\.\//);

    expect(Array.isArray(content.icons)).toBe(true);
    expect(content.icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of content.icons) {
      expect(icon.src).toMatch(/^\.\//);
      const iconFilePath = path.join(rootDir, icon.src.replace(/^\.\//, ''));
      expect(fs.existsSync(iconFilePath), `Icon file ${icon.src} should exist on disk`).toBe(true);
    }
  });

  it('index.html contains required PWA and iOS meta and link tags', () => {
    const html = fs.readFileSync(indexPath, 'utf8');

    // Apple mobile web app capable
    expect(html).toMatch(/<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']/i);

    // Status bar style black-translucent
    expect(html).toMatch(/<meta\s+name=["']apple-mobile-web-app-status-bar-style["']\s+content=["']black-translucent["']/i);

    // Theme color #FFF6EE
    expect(html).toMatch(/<meta\s+name=["']theme-color["']\s+content=["']#FFF6EE["']/i);

    // Manifest link with relative path
    expect(html).toMatch(/<link\s+rel=["']manifest["']\s+href=["']\.\/manifest\.json["']/i);

    // Apple touch icon link
    expect(html).toMatch(/<link\s+rel=["']apple-touch-icon["']/i);

    // SVG icon / favicon
    expect(html).toMatch(/<link\s+rel=["']icon["']/i);
  });

  it('main.js registers service worker and requests persistent storage', () => {
    const mainPath = path.join(rootDir, 'src', 'main.js');
    const mainCode = fs.readFileSync(mainPath, 'utf8');

    // Registers ./sw.js
    expect(mainCode).toMatch(/navigator\.serviceWorker\.register\(\s*['"]\.\/sw\.js['"]\s*\)/);

    // Requests persistent storage
    expect(mainCode).toMatch(/navigator\.storage\.persist\(\)/);
  });

  it('provides landscape "Rotate to portrait" overlay with continuous execution', () => {
    const html = fs.readFileSync(indexPath, 'utf8');
    const cssPath = path.join(rootDir, 'css', 'app.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // index.html has landscape-warning container with "Rotate to portrait"
    expect(html).toContain('landscape-warning');
    expect(html).toContain('Rotate to portrait');

    // css/app.css has media query for landscape
    expect(css).toMatch(/@media\s*\(\s*orientation:\s*landscape\s*\)\s*\{[\s\S]*?\.landscape-warning\s*\{[\s\S]*?display:\s*flex/);
  });
});
