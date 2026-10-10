import { HttpError } from "./http.js";

export interface Limiter {
  /**
   * Runs `job` when a slot is free. Rejects with HttpError 503 when every slot is busy and the
   * queue is full, or after `close()`.
   */
  run<T>(job: () => T | Promise<T>): Promise<T>;
  /** Jobs running now. */
  readonly active: number;
  /** Jobs waiting for a slot. */
  readonly queued: number;
  /** Rejects the queued jobs and every later one; running jobs finish. */
  close(): void;
}

/** At most `concurrency` jobs run at once, and at most `maxQueue` wait; more gives a 503. */
export function createLimiter(concurrency: number, maxQueue: number): Limiter {
  const waiting: { start(): void; refuse(error: HttpError): void }[] = [];
  let active = 0;
  let closed = false;

  const busy = () => new HttpError(503, "The lab is busy. Try again in a moment.");
  const closing = () => new HttpError(503, "The lab is shutting down.");

  const startNext = () => {
    const next = waiting.shift();
    if (next !== undefined) next.start();
  };

  return {
    run<T>(job: () => T | Promise<T>): Promise<T> {
      if (closed) return Promise.reject(closing());
      if (active >= concurrency && waiting.length >= maxQueue) return Promise.reject(busy());
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          active += 1;
          Promise.resolve()
            .then(job)
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              startNext();
            });
        };
        if (active < concurrency) start();
        else waiting.push({ start, refuse: reject });
      });
    },
    get active() {
      return active;
    },
    get queued() {
      return waiting.length;
    },
    close() {
      closed = true;
      for (const entry of waiting.splice(0)) entry.refuse(closing());
    },
  };
}
