/**
 * Screen Wake Lock controller.
 * Handles acquiring, releasing, re-acquiring on visibilitychange,
 * and error handling when Wake Lock is unavailable or rejected.
 */
export class WakeLockController {
  constructor(options = {}) {
    this.navigator = options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
    this.document = options.document || (typeof document !== 'undefined' ? document : null);
    this.onError = options.onError || null;

    this.sentinel = null;
    this.isActive = false;
    this.hasError = false;
    this.shouldBeActive = false;

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    if (this.document && this.document.addEventListener) {
      this.document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  async request() {
    this.shouldBeActive = true;
    if (!this.navigator?.wakeLock?.request) {
      this.hasError = true;
      this.isActive = false;
      if (this.onError) this.onError(new Error('Wake Lock not supported'));
      return false;
    }

    try {
      this.sentinel = await this.navigator.wakeLock.request('screen');
      this.isActive = true;
      this.hasError = false;

      this.sentinel.addEventListener('release', () => {
        this.isActive = false;
      });

      return true;
    } catch (err) {
      this.isActive = false;
      this.hasError = true;
      if (this.onError) this.onError(err);
      return false;
    }
  }

  async release() {
    this.shouldBeActive = false;
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // Ignore release errors
      }
      this.sentinel = null;
    }
    this.isActive = false;
  }

  async handleVisibilityChange() {
    if (this.document?.visibilityState === 'hidden') {
      this.isActive = false;
      this.sentinel = null;
    } else if (this.document?.visibilityState === 'visible' && this.shouldBeActive) {
      await this.request();
    }
  }

  destroy() {
    this.release();
    if (this.document && this.document.removeEventListener) {
      this.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}
