import { MAX_UPSTREAM_CONCURRENT, UPSTREAM_MIN_DELAY_MS } from '../config';
import logger from './logger';

class Semaphore {
  private count: number;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.count = maxConcurrent;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.count++;
    }
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

// Global semaphore for upstream API
const upstreamSemaphore = new Semaphore(MAX_UPSTREAM_CONCURRENT);
let lastFetchTime = 0;

/**
 * Throttle requests to the upstream API.
 * Ensures we don't exceed MAX_UPSTREAM_CONCURRENT active requests
 * and maintains at least UPSTREAM_MIN_DELAY_MS between the *starts* of requests.
 */
export async function throttledFetch<T>(fn: () => Promise<T>): Promise<T> {
  await upstreamSemaphore.acquire();

  try {
    const now = Date.now();
    const timeSinceLast = now - lastFetchTime;
    
    if (timeSinceLast < UPSTREAM_MIN_DELAY_MS) {
      const delay = UPSTREAM_MIN_DELAY_MS - timeSinceLast;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    
    lastFetchTime = Date.now();

    if (upstreamSemaphore.queueLength > 0) {
      logger.debug({ queued: upstreamSemaphore.queueLength }, '[throttle] Upstream requests queued');
    }

    return await fn();
  } finally {
    upstreamSemaphore.release();
  }
}
