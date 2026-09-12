/** Owns subscriptions and cancellable waits for one application component. */
export class Lifetime {
  constructor() { this.closed = false; this.cleanups = new Set(); }
  listen(target, type, listener, options) {
    if (!target || this.closed) return;
    target.addEventListener(type, listener, options);
    this.cleanups.add(() => target.removeEventListener(type, listener, options));
  }
  delay(ms) {
    if (this.closed) return Promise.resolve(false);
    return new Promise(resolve => {
      const cancel = () => { clearTimeout(timer); resolve(false); };
      const timer = setTimeout(() => { this.cleanups.delete(cancel); resolve(true); }, ms);
      this.cleanups.add(cancel);
    });
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
  }
}
