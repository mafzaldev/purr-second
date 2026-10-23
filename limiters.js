(function (root) {
  class FixedWindow {
    constructor({ limit, windowMs }) {
      this.limit = limit;
      this.windowMs = windowMs;
      this.windowStart = -Infinity;
      this.count = 0;
    }

    roll(now) {
      const start = Math.floor(now / this.windowMs) * this.windowMs;
      if (start !== this.windowStart) {
        this.windowStart = start;
        this.count = 0;
      }
    }

    tryAcquire(now) {
      this.roll(now);
      if (this.count < this.limit) {
        this.count++;
        return true;
      }
      return false;
    }

    state(now) {
      this.roll(now);
      return {
        count: this.count,
        limit: this.limit,
        windowStart: this.windowStart,
        resetsIn: this.windowStart + this.windowMs - now,
      };
    }
  }

  class SlidingLog {
    constructor({ limit, windowMs }) {
      this.limit = limit;
      this.windowMs = windowMs;
      this.log = [];
    }

    evict(now) {
      const cutoff = now - this.windowMs;
      while (this.log.length && this.log[0] <= cutoff) this.log.shift();
    }

    tryAcquire(now) {
      this.evict(now);
      if (this.log.length < this.limit) {
        this.log.push(now);
        return true;
      }
      return false;
    }

    state(now) {
      this.evict(now);
      return { log: this.log.slice(), limit: this.limit };
    }
  }

  class SlidingWindowCounter {
    constructor({ limit, windowMs }) {
      this.limit = limit;
      this.windowMs = windowMs;
      this.windowStart = -Infinity;
      this.prevCount = 0;
      this.currCount = 0;
    }

    roll(now) {
      const start = Math.floor(now / this.windowMs) * this.windowMs;
      if (start !== this.windowStart) {
        this.prevCount = start - this.windowStart === this.windowMs ? this.currCount : 0;
        this.currCount = 0;
        this.windowStart = start;
      }
    }

    weight(now) {
      this.roll(now);
      return 1 - (now - this.windowStart) / this.windowMs;
    }

    estimate(now) {
      const weight = this.weight(now);
      return this.prevCount * weight + this.currCount;
    }

    tryAcquire(now) {
      if (this.estimate(now) + 1 <= this.limit) {
        this.currCount++;
        return true;
      }
      return false;
    }

    state(now) {
      const weight = this.weight(now);
      return {
        prevCount: this.prevCount,
        currCount: this.currCount,
        weight,
        estimate: this.prevCount * weight + this.currCount,
        limit: this.limit,
        windowStart: this.windowStart,
      };
    }
  }

  class TokenBucket {
    constructor({ capacity, refillPerSec }) {
      this.capacity = capacity;
      this.refillPerSec = refillPerSec;
      this.tokens = capacity;
      this.last = undefined;
    }

    refill(now) {
      if (this.last !== undefined) {
        const added = ((now - this.last) / 1000) * this.refillPerSec;
        this.tokens = Math.min(this.capacity, this.tokens + added);
      }
      this.last = now;
    }

    tryAcquire(now) {
      this.refill(now);
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }
      return false;
    }

    state(now) {
      this.refill(now);
      return { tokens: this.tokens, capacity: this.capacity, refillPerSec: this.refillPerSec };
    }
  }

  class LeakyBucket {
    constructor({ capacity, leakPerSec }) {
      this.capacity = capacity;
      this.leakPerSec = leakPerSec;
      this.interval = 1000 / leakPerSec;
      this.pending = [];
      this.nextFree = -Infinity;
    }

    drain(now) {
      const out = [];
      while (this.pending.length && this.pending[0] <= now) out.push(this.pending.shift());
      return out;
    }

    queued(now) {
      return this.pending.filter((t) => t > now).length;
    }

    tryAcquire(now) {
      if (this.queued(now) >= this.capacity) return false;
      const at = Math.max(now, this.nextFree);
      this.nextFree = at + this.interval;
      this.pending.push(at);
      return true;
    }

    state(now) {
      return {
        queued: this.queued(now),
        capacity: this.capacity,
        leakPerSec: this.leakPerSec,
        nextOutIn: this.queued(now) ? this.pending.find((t) => t > now) - now : null,
      };
    }
  }

  root.RateLimiters = { FixedWindow, SlidingLog, SlidingWindowCounter, TokenBucket, LeakyBucket };
})(this);
