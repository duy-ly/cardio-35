import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WakeLockController } from '../src/wake-lock.js';

describe('WakeLockController', () => {
  let mockSentinel;
  let mockWakeLock;
  let mockNav;
  let mockDoc;

  beforeEach(() => {
    mockSentinel = {
      released: false,
      release: vi.fn().mockImplementation(() => {
        mockSentinel.released = true;
        return Promise.resolve();
      }),
      addEventListener: vi.fn(),
    };

    mockWakeLock = {
      request: vi.fn().mockResolvedValue(mockSentinel),
    };

    mockNav = {
      wakeLock: mockWakeLock,
    };

    mockDoc = {
      visibilityState: 'visible',
      listeners: {},
      addEventListener: vi.fn((event, cb) => {
        mockDoc.listeners[event] = cb;
      }),
      removeEventListener: vi.fn((event, cb) => {
        if (mockDoc.listeners[event] === cb) {
          delete mockDoc.listeners[event];
        }
      }),
    };
  });

  it('requests wake lock successfully', async () => {
    const controller = new WakeLockController({
      navigator: mockNav,
      document: mockDoc,
    });

    const success = await controller.request();
    expect(success).toBe(true);
    expect(mockWakeLock.request).toHaveBeenCalledWith('screen');
    expect(controller.isActive).toBe(true);
    expect(controller.hasError).toBe(false);
  });

  it('releases wake lock when release() is called', async () => {
    const controller = new WakeLockController({
      navigator: mockNav,
      document: mockDoc,
    });

    await controller.request();
    await controller.release();

    expect(mockSentinel.release).toHaveBeenCalled();
    expect(controller.isActive).toBe(false);
  });

  it('re-requests wake lock on visibilitychange when returning to visible', async () => {
    const controller = new WakeLockController({
      navigator: mockNav,
      document: mockDoc,
    });

    await controller.request();
    expect(mockWakeLock.request).toHaveBeenCalledTimes(1);

    // Document hides
    mockDoc.visibilityState = 'hidden';
    mockDoc.listeners['visibilitychange']();

    // Document becomes visible again
    mockDoc.visibilityState = 'visible';
    await mockDoc.listeners['visibilitychange']();

    expect(mockWakeLock.request).toHaveBeenCalledTimes(2);
    expect(controller.isActive).toBe(true);
  });

  it('handles unsupported or rejected wake lock gracefully', async () => {
    let notifiedNotice = false;
    const failingNav = {
      wakeLock: {
        request: vi.fn().mockRejectedValue(new Error('WakeLock denied')),
      },
    };

    const controller = new WakeLockController({
      navigator: failingNav,
      document: mockDoc,
      onError: () => {
        notifiedNotice = true;
      },
    });

    const success = await controller.request();
    expect(success).toBe(false);
    expect(controller.isActive).toBe(false);
    expect(controller.hasError).toBe(true);
    expect(notifiedNotice).toBe(true);
  });
});
