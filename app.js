(function () {
  const { FixedWindow, SlidingLog, SlidingWindowCounter, TokenBucket, LeakyBucket } = window.RateLimiters;
  const $ = (id) => document.getElementById(id);

  const POLICY_RANGE = { limit: [2, 8], windowSec: [2, 8] };
  const POLICY_KEY = "rate-limiter-policy";
  const COMPARE_SPEED_KEY = "rate-limiter-compare-speed";
  let LIMIT = 4;
  let WINDOW = 4000;
  let RATE = 1;
  let TIMELINE_SPAN = 12000;

  const TRAVEL = 300;
  const EXIT = 500;
  const STAGE_H = 334;

  const sec = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  const num = (x) => String(Number(x.toFixed(2)));
  const secs = (ms) => num(ms / 1000);
  const seconds = (ms) => `${secs(ms)} second${ms === 1000 ? "" : "s"}`;
  const lerp = (a, b, p) => a + (b - a) * Math.min(1, Math.max(0, p));
  const reqs = (...times) => times.map((at) => ({ at }));
  const say = (at, text) => ({ at, say: text });
  const range = (start, count, gap) => Array.from({ length: count }, (_, i) => start + i * gap);
  const spread = (from, to, count) => Array.from({ length: count }, (_, i) => Math.round(from + ((to - from) * i) / Math.max(1, count - 1)));

  const TOKENS = {
    text: "ink",
    muted: "muted",
    border: "rule",
    track: "road",
    accent: "fill",
    ok: "ok",
    out: "ok",
    no: "no",
    warn: "ginger",
    onWarn: "on-ginger",
    shade: "shade",
    grid: "grid",
    card: "surface",
  };
  const SANS = '"Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
  const MONO = '"DM Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';
  const DISPLAY = '"Fredoka", "Nunito", "Trebuchet MS", sans-serif';
  const C = {};
  function readColors() {
    const css = getComputedStyle(document.documentElement);
    for (const [key, token] of Object.entries(TOKENS)) C[key] = css.getPropertyValue(`--${token}`).trim();
  }

  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function text(
    ctx,
    str,
    x,
    y,
    { size = 12, weight = 400, color = C.text, align = "left", baseline = "alphabetic", mono = false, display = false, maxWidth } = {},
  ) {
    ctx.font = `${weight} ${size}px ${mono ? MONO : display ? DISPLAY : SANS}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (maxWidth) ctx.fillText(str, x, y, maxWidth);
    else ctx.fillText(str, x, y);
  }

  function box(ctx, x, y, w, h, { fill, stroke, radius = 8, dash } = {}) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function cells(ctx, x, y, w, h, total, style) {
    const gap = 4;
    const cw = (w - gap * (total - 1)) / total;
    for (let i = 0; i < total; i++) {
      const s = style(i);
      ctx.globalAlpha = s.alpha ?? 1;
      box(ctx, x + i * (cw + gap), y, cw, h, { fill: s.fill, radius: 4 });
      ctx.globalAlpha = 1;
      if (s.label)
        text(ctx, s.label, x + i * (cw + gap) + cw / 2, y + h / 2 + 1, {
          size: 11,
          weight: 600,
          color: C.onWarn,
          align: "center",
          baseline: "middle",
          mono: true,
        });
    }
  }

  const CATS = {};
  for (const name of ["ginger", "black", "white", "grey"]) {
    CATS[name] = new Image();
    CATS[name].src = `cats/cat-${name}.svg`;
  }
  const catReady = (img) => img.complete && img.naturalWidth > 0;

  const tintedCats = new Map();
  function tintedCat(color) {
    if (!tintedCats.has(color)) {
      if (!catReady(CATS.grey)) return null;
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 96;
      const g = sprite.getContext("2d");
      g.drawImage(CATS.grey, 0, 0, 96, 96);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, 96, 96);
      tintedCats.set(color, sprite);
    }
    return tintedCats.get(color);
  }

  function catHead(ctx, x, y, width, color) {
    const sprite = tintedCat(color);
    if (!sprite) return;
    const size = (width / 24) * 32;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  }

  function isDarkTheme() {
    const theme = document.documentElement.dataset.theme;
    return theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function packet(ctx, x, y, id, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    catHead(ctx, x, y, 24, color);
    text(ctx, String(id), x, y + 3, { size: 10, weight: 600, color: C.card, align: "center", baseline: "middle", mono: true });
    ctx.globalAlpha = 1;
  }

  function paw(ctx, x, y) {
    ctx.fillStyle = C.card;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 4, 3.2, 0, 0, Math.PI * 2);
    for (const [dx, dy] of [
      [-4.5, -3],
      [-1.5, -5],
      [1.5, -5],
      [4.5, -3],
    ]) {
      ctx.moveTo(x + dx + 1.4, y + dy);
      ctx.arc(x + dx, y + dy, 1.4, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function fish(ctx, x, y, size, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x - size * 0.15, y, size * 0.75, size * 0.45, 0, 0, Math.PI * 2);
    ctx.moveTo(x + size * 0.45, y);
    ctx.lineTo(x + size, y - size * 0.45);
    ctx.lineTo(x + size, y + size * 0.45);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function bigStat(ctx, r, value, label) {
    text(ctx, value, r.x + r.w / 2, r.y + 24, { size: 28, weight: 600, align: "center", display: true });
    text(ctx, label, r.x + r.w / 2, r.y + 42, { size: 11, color: C.muted, align: "center", mono: true, maxWidth: r.w });
  }

  const ALGOS = {
    none: {
      name: "No limiter",
      create: () => ({ tryAcquire: () => true }),
      explain: () => "no limiter, sent straight through",
      draw(ctx, r) {
        bigStat(ctx, r, "No limiter", "every request goes straight to the API");
      },
    },

    fixed: {
      name: "Fixed Window",
      create: () => new FixedWindow({ limit: LIMIT, windowMs: WINDOW }),
      boundaries: true,
      shade: (l, now) => [l.state(now).windowStart, now],
      shadeLabel: () => "this window",
      explain: (r, before, after) =>
        r.ok ? `counter ${after.count}/${LIMIT} in this window` : `window full ${LIMIT}/${LIMIT} · Retry-After ${sec(after.resetsIn)}`,
      draw(ctx, r, l, now) {
        const s = l.state(now);
        bigStat(ctx, r, `${s.count} / ${LIMIT}`, "requests counted in this window");
        cells(ctx, r.x, r.y + 56, r.w, 18, LIMIT, (i) => ({ fill: i < s.count ? C.accent : C.track }));
        box(ctx, r.x, r.y + 88, r.w, 6, { fill: C.track, radius: 3 });
        box(ctx, r.x, r.y + 88, r.w * (1 - s.resetsIn / WINDOW), 6, { fill: C.accent, radius: 3 });
        const from = s.windowStart / 1000;
        text(ctx, `window ${from}–${from + WINDOW / 1000}s · resets in ${sec(s.resetsIn)}`, r.x + r.w / 2, r.y + 112, {
          size: 11,
          color: C.muted,
          align: "center",
          mono: true,
          maxWidth: r.w,
        });
      },
    },

    log: {
      name: "Sliding Window Log",
      create: () => new SlidingLog({ limit: LIMIT, windowMs: WINDOW }),
      shade: (l, now) => [now - WINDOW, now],
      shadeLabel: () => `counted: last ${secs(WINDOW)}s`,
      explain: (r, before, after) =>
        r.ok
          ? `${after.log.length} timestamp${after.log.length === 1 ? "" : "s"} logged in the last ${secs(WINDOW)}s`
          : `log full ${LIMIT}/${LIMIT} · Retry-After ${sec(before.log[0] + WINDOW - r.at)}`,
      draw(ctx, r, l, now, requests) {
        const s = l.state(now);
        bigStat(ctx, r, `${s.log.length} / ${LIMIT}`, `timestamps in the last ${secs(WINDOW)} seconds`);
        box(ctx, r.x, r.y + 54, r.w, 30, { fill: C.shade, radius: 6 });
        for (const t of s.log) {
          const req = requests.find((q) => q.ok && q.at === t);
          packet(ctx, r.x + 10 + ((t - (now - WINDOW)) / WINDOW) * (r.w - 20), r.y + 69, req ? req.id : "", C.accent);
        }
        text(ctx, `−${secs(WINDOW)}s`, r.x, r.y + 98, { size: 10, color: C.muted, mono: true });
        text(ctx, "now", r.x + r.w, r.y + 98, { size: 10, color: C.muted, align: "right", mono: true });
        if (s.log.length >= LIMIT) {
          text(ctx, `full · oldest expires in ${sec(s.log[0] + WINDOW - now)}`, r.x + r.w / 2, r.y + 118, {
            size: 11,
            color: C.muted,
            align: "center",
            mono: true,
            maxWidth: r.w,
          });
        }
      },
    },

    counter: {
      name: "Sliding Window Counter",
      create: () => new SlidingWindowCounter({ limit: LIMIT, windowMs: WINDOW }),
      boundaries: true,
      shade: (l, now) => [now - WINDOW, now],
      shadeLabel: () => `counted: last ${secs(WINDOW)}s`,
      explain(r, b) {
        const math = `${b.prevCount} × ${b.weight.toFixed(2)} + ${b.currCount} = ${b.estimate.toFixed(2)}`;
        return r.ok ? `estimate ${math}, +1 fits under ${LIMIT}` : `estimate ${math}, +1 would exceed ${LIMIT}`;
      },
      draw(ctx, r, l, now) {
        const s = l.state(now);
        const half = (r.w - 16) / 2;
        const narrow = r.w < 260;
        text(ctx, `${narrow ? "prev" : "previous"} × ${s.weight.toFixed(2)}`, r.x, r.y + 8, {
          size: narrow ? 10 : 11,
          color: C.muted,
          mono: true,
          maxWidth: half,
        });
        text(ctx, narrow ? "current" : "current window", r.x + half + 16, r.y + 8, { size: narrow ? 10 : 11, color: C.muted, mono: true, maxWidth: half });
        const weighted = s.prevCount * s.weight;
        cells(ctx, r.x, r.y + 16, half, 18, LIMIT, (i) =>
          i < s.prevCount ? { fill: C.accent, alpha: Math.min(1, Math.max(0.25, weighted - i)) } : { fill: C.track },
        );
        cells(ctx, r.x + half + 16, r.y + 16, half, 18, LIMIT, (i) => ({ fill: i < s.currCount ? C.accent : C.track }));
        text(ctx, `${s.prevCount} × ${s.weight.toFixed(2)} + ${s.currCount}`, r.x + r.w / 2, r.y + 62, {
          size: 13,
          color: C.muted,
          align: "center",
          mono: true,
          maxWidth: r.w,
        });
        text(ctx, `= ${s.estimate.toFixed(2)} / ${LIMIT}`, r.x + r.w / 2, r.y + 90, { size: 26, weight: 600, align: "center", display: true });
        text(ctx, `estimated requests in the last ${secs(WINDOW)} seconds`, r.x + r.w / 2, r.y + 108, {
          size: 11,
          color: C.muted,
          align: "center",
          mono: true,
          maxWidth: r.w,
        });
      },
    },

    token: {
      name: "Token Bucket",
      create: () => new TokenBucket({ capacity: LIMIT, refillPerSec: RATE }),
      explain: (r, before, after) =>
        r.ok
          ? `spent 1 token · ${after.tokens.toFixed(1)} left`
          : `${before.tokens.toFixed(1)} tokens, needs 1 · Retry-After ${sec(((1 - before.tokens) / RATE) * 1000)}`,
      draw(ctx, r, l, now) {
        const s = l.state(now);
        bigStat(ctx, r, `${s.tokens.toFixed(1)} / ${LIMIT}`, "tokens in the bucket");
        const bw = Math.min(r.w, LIMIT * 32 + 16);
        const bx = r.x + (r.w - bw) / 2;
        const by = r.y + 52;
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, by + 40);
        ctx.lineTo(bx + bw, by + 40);
        ctx.lineTo(bx + bw, by);
        ctx.stroke();
        const step = (bw - 16) / LIMIT;
        for (let i = 0; i < LIMIT; i++) {
          const fill = Math.min(1, Math.max(0, s.tokens - i));
          fish(ctx, bx + 8 + step * (i + 0.5), by + 22, Math.min(12, step / 2 - 2), fill > 0 ? C.warn : C.track, fill > 0 ? 0.25 + 0.75 * fill : 1);
        }
        text(ctx, `+${num(RATE)} token${RATE === 1 ? "" : "s"} per second · each request spends 1`, r.x + r.w / 2, r.y + 118, {
          size: 11,
          color: C.muted,
          align: "center",
          mono: true,
          maxWidth: r.w,
        });
      },
    },

    leaky: {
      name: "Leaky Bucket",
      create: () => new LeakyBucket({ capacity: LIMIT, leakPerSec: RATE }),
      explain(r, before, after) {
        if (!r.ok) return `queue full ${LIMIT}/${LIMIT}`;
        if (r.processAt === r.at) return "queue empty, sent straight through";
        return `${after.queued}/${LIMIT} waiting · leaves in ${sec(r.processAt - r.at)}`;
      },
      draw(ctx, r, l, now, requests) {
        const waiting = requests.filter((q) => q.ok && q.processAt > now).sort((a, b) => b.processAt - a.processAt);
        bigStat(ctx, r, `${waiting.length} / ${LIMIT}`, "requests waiting in the queue");
        const pad = LIMIT - waiting.length;
        cells(ctx, r.x, r.y + 54, r.w, 30, LIMIT, (i) => (i < pad ? { fill: C.track } : { fill: C.warn, label: `#${waiting[i - pad].id}` }));
        const next = waiting.length ? waiting[waiting.length - 1].processAt - now : null;
        text(ctx, `drains ${num(RATE)} per second →` + (next !== null ? ` next out in ${sec(next)}` : ""), r.x + r.w / 2, r.y + 108, {
          size: 11,
          color: C.muted,
          align: "center",
          mono: true,
          maxWidth: r.w,
        });
      },
    },
  };

  function buildSteps() {
    const L = LIMIT;
    const W = WINDOW;
    const u = WINDOW / LIMIT;
    const first = spread(0.15 * W, 0.85 * W, L + 1);
    const before = spread(2 * W - 600, 2 * W - 150, L);
    const after = spread(2 * W + 150, 2 * W + 600, L);
    const attack = [2 * W - 600, 2 * W + 600];
    const attackResult = (c, extra) => {
      const { ok } = c(...attack);
      return `${ok} of the ${2 * L} boundary requests were accepted. ${extra}`;
    };

    const introCount = 3 * L;
    const introEnd = 500 + introCount * 100;

    const burstEnd = 800 + (L + 1) * 60;
    const tokenBurstEnd = 800 + (L + 1) * 30;
    const steadyAt = tokenBurstEnd + 1.5 * u;
    const refillAt = steadyAt + 2 * u + W + 400;
    const drainedAt = 800 + (L + 2) * u + 600;

    return [
      {
        label: "Intro",
        algo: "none",
        eyebrow: "Introduction",
        title: "Why rate limit?",
        lead: "A rate limiter sits between clients and your API. For every request it decides whether to let it through or answer 429 Too Many Requests.",
        html: `
          <p>Without one, a single busy client can flood the API and starve everyone else. On the stage, each cat is one request.</p>
          <p>Every algorithm here enforces the rule in the header: <b>${L} requests per ${secs(W)} seconds</b>. Click it to change it.</p>
          <h3>How to use it</h3>
          <p>Press <b>Play scenario</b> to watch a short narrated run, then send your own requests with <b>Space</b>. Use the arrow keys to move between steps.</p>
          <h3>Legend</h3>
          <ul class="legend">
            <li><span class="chip" style="background:var(--fill)"></span>request on its way</li>
            <li><span class="chip" style="background:var(--ok)"></span>accepted, reaches the API</li>
            <li><span class="chip" style="background:var(--no)"></span>rejected with 429</li>
            <li><span class="chip" style="background:var(--ginger)"></span>waiting in a queue</li>
          </ul>`,
        scenario: [
          say(200, `A client fires ${introCount} requests in about ${seconds(introCount * 100)}…`),
          ...reqs(...range(500, introCount, 100)),
          say(introEnd + 800, `Without a limiter all ${introCount} hit the API at once. One noisy client can hog it.`),
        ],
      },
      {
        label: "Fixed window",
        algo: "fixed",
        eyebrow: "Algorithm 1 of 5",
        title: "Fixed Window",
        lead: "The simplest approach: count requests in fixed blocks of time and reset the count when a new block starts.",
        how: [
          `Time is cut into windows: 0–${secs(W)}s, ${secs(W)}–${secs(2 * W)}s, and so on.`,
          `Each window has a counter. A request is allowed while the counter is below ${L}.`,
          "When the next window starts, the counter resets to 0.",
        ],
        pros: ["One counter per client: tiny memory", "Very fast and easy to implement"],
        cons: [`Up to ${2 * L} requests can slip through around a window boundary`],
        scenario: [
          say(200, `${L + 1} requests arrive in the first window…`),
          ...reqs(...first),
          say(
            W + 100,
            (c) => `The first window accepted ${c(0, W).ok} and rejected ${c(0, W).no}. At ${secs(W)}s a new window starts and the counter drops back to 0.`,
          ),
          say(2 * W - 1000, `Now the weak spot. Watch ${L} requests just before the boundary at ${secs(2 * W)}s…`),
          ...reqs(...before),
          say(2 * W, `…and ${L} more just after it.`),
          ...reqs(...after),
          say(2 * W + 1200, (c) =>
            attackResult(c, "They land in two different windows, so each half is counted separately. This is the boundary burst problem."),
          ),
        ],
      },
      {
        label: "Sliding log",
        algo: "log",
        eyebrow: "Algorithm 2 of 5",
        title: "Sliding Window Log",
        lead: "Fixes the boundary problem by remembering exactly when each recent request happened.",
        how: [
          "Keep a log with the timestamp of every accepted request.",
          `On each request, drop timestamps older than ${secs(W)} seconds.`,
          `If fewer than ${L} remain, accept and add the new timestamp.`,
        ],
        pros: [`Exact: never more than ${L} in any ${secs(W)}-second span`, "No boundary bursts"],
        cons: ["Stores a timestamp per request, so memory grows with the limit"],
        scenario: [
          say(200, `Same traffic as the fixed window. First, ${L + 1} requests…`),
          ...reqs(...first),
          say(W + 100, `No reset at ${secs(W)}s. The window slides, so each timestamp expires exactly ${secs(W)}s after it was logged.`),
          ...reqs(Math.round(1.2 * W)),
          say(2 * W - 1000, "Now the same boundary burst that beat the fixed window…"),
          ...reqs(...before, ...after),
          say(2 * W + 1200, (c) => attackResult(c, `The log never lets more than ${L} through in any ${secs(W)}-second span.`)),
        ],
      },
      {
        label: "Sliding counter",
        algo: "counter",
        eyebrow: "Algorithm 3 of 5",
        title: "Sliding Window Counter",
        lead: "A cheap approximation of the sliding log, using only two counters.",
        how: [
          "Keep counters for the previous and the current fixed window.",
          `Weight the previous count by how much of it still overlaps the last ${secs(W)} seconds.`,
          `Estimate = previous × weight + current. Accept if the estimate + 1 ≤ ${L}.`,
        ],
        pros: ["Two counters per client: tiny memory", "Smooths out boundary bursts"],
        cons: ["An approximation: assumes requests were spread evenly across the previous window"],
        scenario: [
          say(200, `${L} requests fill the first window, and the next one is rejected.`),
          ...reqs(...first),
          say(W + 100, `A new window starts, but the previous ${L} still count, scaled down as they slide out of view.`),
          ...reqs(...[1.2, 1.3, 1.45].map((f) => Math.round(f * W))),
          say(2 * W - 1000, "Now the boundary burst again…"),
          ...reqs(...before, ...after),
          say(2 * W + 1200, (c) => attackResult(c, `The fixed window let all ${2 * L} through; the weighted estimate keeps it to ${L} or fewer.`)),
        ],
      },
      {
        label: "Token bucket",
        algo: "token",
        eyebrow: "Algorithm 4 of 5",
        title: "Token Bucket",
        lead: "Requests spend tokens from a bucket that refills at a steady rate. Saved-up tokens allow short bursts.",
        how: [
          `The bucket holds up to ${L} tokens and starts full.`,
          `Tokens are added at ${num(RATE)} per second, up to the cap.`,
          "Each request takes one token. No whole token means it is rejected.",
        ],
        pros: ["Allows short bursts while enforcing the average rate", "Two numbers per client: tokens + last refill time"],
        cons: [`A full bucket lets ${L} requests through at once`],
        scenario: [
          say(200, `The bucket starts full with ${L} tokens.`),
          ...reqs(...range(800, L + 2, 30)),
          say(
            tokenBurstEnd + 600,
            (c) => `A burst of ${L + 2}: ${c(800, tokenBurstEnd).ok} spent saved-up tokens at once and ${c(800, tokenBurstEnd).no} were rejected.`,
          ),
          ...reqs(...range(steadyAt, 3, u)),
          say(steadyAt + 0.5 * u + 300, `Tokens trickle back at ${num(RATE)} per second, so one request every ${secs(u)}s keeps passing.`),
          say(steadyAt + 2 * u + 600, "Now the client goes quiet and the bucket refills…"),
          say(refillAt - 400, "…so the next burst is allowed again."),
          ...reqs(...range(refillAt, L + 1, 60)),
          say(refillAt + (L + 1) * 60 + 700, (c) => `${c(refillAt, refillAt + L * 60).ok} of ${L + 1} were accepted this time.`),
        ],
      },
      {
        label: "Leaky bucket",
        algo: "leaky",
        eyebrow: "Algorithm 5 of 5",
        title: "Leaky Bucket",
        lead: "Requests wait in a queue that drains at a constant rate. The API sees perfectly smooth traffic.",
        how: [
          `Accepted requests join a queue with room for ${L}.`,
          `The queue sends one request to the API every ${secs(u)}s.`,
          "If the queue is full, new requests are rejected.",
        ],
        pros: ["Perfectly even load on the API", "Absorbs bursts instead of rejecting them"],
        cons: ["Queued requests are delayed", "A long queue means stale requests"],
        scenario: [
          say(200, `A burst of ${L + 2} arrives…`),
          ...reqs(...range(800, L + 2, 60)),
          say(burstEnd + 600, (c) => `${c(800, burstEnd).ok} accepted into the queue and ${c(800, burstEnd).no} rejected. The API doesn't see the burst.`),
          say(burstEnd + 600 + Math.max(1000, 1.5 * u), `Watch the API side: requests leave exactly ${secs(u)}s apart, however they arrived.`),
          say(drainedAt, "Smooth output protects a fragile backend, but every queued request paid for it in waiting time."),
          ...reqs(drainedAt + 800, drainedAt + 1000, drainedAt + 1200),
        ],
      },
      {
        label: "Compare",
        compare: true,
        eyebrow: "Wrap-up",
        title: "All five algorithms at once",
        lead: "The same traffic, sent through all five algorithms side by side. Pick a pattern to see how each one copes.",
        html: `
          <h3>Which one should I use?</h3>
          <ul>
            <li><b>Token bucket</b>: the usual default for APIs. Allows bursts and is cheap.</li>
            <li><b>Sliding window counter</b>: strict "N per window" limits with little memory.</li>
            <li><b>Sliding log</b>: when you need exact limits and the limit is small.</li>
            <li><b>Leaky bucket</b>: when the backend needs a steady flow and waiting is fine.</li>
            <li><b>Fixed window</b>: when simplicity matters more than boundary bursts.</li>
          </ul>`,
      },
    ];
  }

  let STEPS = buildSteps();

  const lab = {
    step: null,
    algo: null,
    limiter: null,
    now: 0,
    playing: false,
    requests: [],
    says: [],
    nextId: 1,
    scriptEnd: 0,
    ended: false,
    ok: 0,
    no: 0,
    signal: null,
  };

  function pushLog(li) {
    const list = $("narration");
    const reading = list.scrollTop > 2;
    const before = list.scrollHeight;
    list.prepend(li);
    if (reading) list.scrollTop += list.scrollHeight - before;
    while (list.children.length > 300) list.lastChild.remove();
  }

  function logSay(message) {
    const li = document.createElement("li");
    li.className = "say";
    li.textContent = message;
    pushLog(li);
  }

  function logEntry(time, id, status, detail) {
    const li = document.createElement("li");
    const kind = status === "429" ? "no" : status === "queued" ? "queued" : "ok";
    li.innerHTML = `<span>${sec(time)}</span><span>#${id}</span><span class="status ${kind}">${status}</span><span class="msg"></span>`;
    li.lastChild.textContent = detail;
    pushLog(li);
  }

  function setPlaying(playing) {
    lab.playing = playing;
    $("play").textContent = playing ? "Pause" : "Play";
  }

  function resetLab() {
    const step = lab.step;
    lab.algo = ALGOS[step.algo];
    lab.limiter = lab.algo.create();
    lab.now = 0;
    lab.nextId = 1;
    lab.ok = 0;
    lab.no = 0;
    lab.ended = false;
    lab.stopped = false;
    lab.signal = null;
    const byTime = [...step.scenario].sort((a, b) => a.at - b.at);
    lab.requests = byTime.filter((e) => !e.say).map((e) => ({ id: lab.nextId++, at: e.at, scripted: true }));
    lab.says = byTime.filter((e) => e.say);
    lab.scriptEnd = Math.max(...step.scenario.map((e) => e.at)) + 1500;
    $("narration").innerHTML = "";
    logSay("Press Play scenario to watch it run.");
    setPlaying(false);
    $("play").textContent = "Play scenario";
  }

  function decide(r) {
    const l = lab.limiter;
    const before = l.state ? l.state(r.at) : null;
    r.ok = l.tryAcquire(r.at);
    r.decided = true;
    if (r.ok && l instanceof LeakyBucket) r.processAt = l.pending[l.pending.length - 1];
    const after = l.state ? l.state(r.at) : null;
    r.ok ? lab.ok++ : lab.no++;
    lab.signal = { ok: r.ok, at: r.at };
    logEntry(r.at, r.id, !r.ok ? "429" : r.processAt > r.at ? "queued" : "200", lab.algo.explain(r, before, after));
  }

  function countDecided(from, to) {
    const hits = lab.requests.filter((r) => r.decided && r.at >= from && r.at <= to);
    return { ok: hits.filter((r) => r.ok).length, no: hits.filter((r) => !r.ok).length };
  }

  function stopScenario() {
    if (lab.stopped) return;
    const unsent = lab.requests.filter((r) => r.scripted && !r.decided && r.at - TRAVEL > lab.now);
    if (!unsent.length && !lab.says.length) return;
    lab.stopped = true;
    lab.requests = lab.requests.filter((r) => !unsent.includes(r));
    lab.nextId = Math.max(0, ...lab.requests.map((r) => r.id)) + 1;
    lab.says = [];
    lab.ended = true;
    logSay("Scenario stopped. Now only your requests are sent. Press Restart to watch the scenario again.");
  }

  function sendManual(count, gap) {
    stopScenario();
    for (let i = 0; i < count; i++) lab.requests.push({ id: lab.nextId++, at: lab.now + TRAVEL + i * gap });
    lab.requests.sort((a, b) => a.at - b.at);
    setPlaying(true);
  }

  function advanceLab(dt) {
    if (!lab.playing) return;
    lab.now += dt * Number($("speed").value);
    const now = lab.now;
    for (const r of lab.requests) {
      if (r.at > now) break;
      if (!r.decided) decide(r);
      if (r.processAt > r.at && !r.leftQueue && r.processAt <= now) {
        r.leftQueue = true;
        logEntry(r.processAt, r.id, "200", `left the queue after waiting ${sec(r.processAt - r.at)}`);
      }
    }
    while (lab.says.length && lab.says[0].at <= now) {
      const line = lab.says.shift().say;
      logSay(typeof line === "function" ? line(countDecided) : line);
    }
    if (lab.limiter.drain) lab.limiter.drain(now);
    if (!lab.ended && now >= lab.scriptEnd) {
      lab.ended = true;
      logSay("Scenario done. Your turn: send your own requests (Space) and watch how the limiter reacts.");
    }
    lab.requests = lab.requests.filter((r) => !r.decided || r.at > now - TIMELINE_SPAN - 1000 || r.processAt > now - EXIT);
  }

  function drawLab() {
    const fit = fitCanvas($("stage"));
    const ctx = fit.ctx;
    const k = fit.h / STAGE_H;
    ctx.scale(k, k);
    const w = fit.w / k;
    const now = lab.now;
    const small = w < 560;
    const side = small ? 50 : 78;
    const gap = small ? 26 : 44;
    const midY = 92;
    const client = { x: 0, y: midY - 30, w: side, h: 60 };
    const server = { x: w - side, y: midY - 30, w: side, h: 60 };
    const lim = { x: side + gap, y: 12, w: w - 2 * (side + gap), h: 160 };
    const binY = 216;

    const dropX = lim.x - gap / 2;
    const binEnd = Math.min(lim.x + lim.w, lim.x + 12 + 8 * 22);

    ctx.fillStyle = C.track;
    ctx.fillRect(0, midY - 15, w, 30);
    ctx.fillRect(dropX - 13, midY, 26, binY - midY);
    box(ctx, dropX - 13, binY - 13, binEnd - dropX + 26, 26, { fill: C.track, radius: 13 });
    for (let x = 18, i = 0; x < w; x += 34, i++) paw(ctx, x, midY + (i % 2 ? 6 : -6));

    const landed = lab.requests.some((r) => r.ok && now - ((r.processAt ?? r.at) + EXIT) >= 0 && now - ((r.processAt ?? r.at) + EXIT) < 200);
    box(ctx, client.x + 1, client.y, client.w - 2, client.h, { stroke: C.border, fill: C.card, radius: 4 });
    text(ctx, "Client", client.x + side / 2, midY + 5, { size: 15, weight: 600, align: "center", display: true });
    box(ctx, server.x + 1, server.y, server.w - 2, server.h, { stroke: landed ? C.ok : C.border, fill: C.card, radius: 4 });
    text(ctx, "API", server.x + side / 2, midY + 5, { size: 15, weight: 600, align: "center", display: true, color: landed ? C.ok : C.text });

    box(ctx, lim.x, lim.y, lim.w, lim.h, { stroke: C.text, fill: C.card, radius: 6 });
    if (!small) text(ctx, lab.algo.name, lim.x + 12, lim.y + 21, { size: 12, weight: 600, color: C.muted });
    lab.algo.draw(ctx, { x: lim.x + 14, y: lim.y + 34, w: lim.w - 28, h: lim.h - 44 }, lab.limiter, now, lab.requests);

    drawWatcher(ctx, dropX, midY - 15 - 22, now);
    text(ctx, "429 Too Many Requests · hiss!", lim.x, binY - 20, { size: 11, weight: 600, color: C.no, mono: true });

    for (const r of lab.requests) {
      if (now < r.at - TRAVEL) continue;
      if (now < r.at) {
        packet(ctx, lerp(client.x + side, lim.x, (now - (r.at - TRAVEL)) / TRAVEL), midY, r.id, C.accent);
      } else if (!r.ok) {
        const p = (now - r.at) / EXIT;
        const restX = lim.x + 12 + (r.id % 8) * 22;
        const fade = 1 - Math.max(0, (now - r.at - EXIT) / 1500);
        const x = p < 0.5 ? dropX : lerp(dropX, restX, (p - 0.5) * 2);
        const y = p < 0.5 ? lerp(midY, binY, p * 2) : binY;
        if (fade > 0) packet(ctx, x, y, r.id, C.no, fade);
      } else {
        const leave = r.processAt ?? r.at;
        if (now >= leave && now < leave + EXIT) packet(ctx, lerp(lim.x + lim.w, server.x, (now - leave) / EXIT), midY, r.id, C.ok);
      }
    }

    drawTimeline(ctx, { x: 0, y: 248, w, h: 74 }, now);
  }

  function drawWatcher(ctx, x, y, now) {
    const cat = CATS[isDarkTheme() ? "white" : "black"];
    const size = (30 / 24) * 32;
    if (catReady(cat)) ctx.drawImage(cat, x - size / 2, y - size / 2, size, size);
    if (lab.signal && now - lab.signal.at < 600) {
      for (const dx of [-5.5, 5.5]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + 2, 2.6, 3.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = lab.signal.ok ? C.ok : C.no;
        ctx.fill();
      }
    }
    $("lab-stats").textContent = `t = ${sec(now)} · ${lab.ok} accepted · ${lab.no} rejected`;
  }

  function drawTimeline(ctx, t, now) {
    const plotX = t.x + 34;
    const plotW = t.w - 34;
    const from = now - TIMELINE_SPAN;
    const x = (time) => plotX + ((time - from) / TIMELINE_SPAN) * plotW;
    const rows = { ok: t.y + 14, no: t.y + 34, out: t.y + 54 };

    box(ctx, t.x, t.y - 6, t.w, 1, { fill: C.border, radius: 0 });
    if (lab.algo.shade) {
      const [a, b] = lab.algo.shade(lab.limiter, now);
      ctx.fillStyle = C.shade;
      ctx.fillRect(Math.max(plotX, x(a)), t.y, x(b) - Math.max(plotX, x(a)), t.h - 10);
      if (x(b) - x(a) > 70) text(ctx, lab.algo.shadeLabel(), Math.max(plotX, x(a)) + 6, t.y + t.h - 16, { size: 10, color: C.muted, mono: true });
    }
    if (lab.algo.boundaries) {
      ctx.strokeStyle = C.grid;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let b = Math.max(WINDOW, Math.ceil(from / WINDOW) * WINDOW); b <= now; b += WINDOW) {
        ctx.moveTo(Math.round(x(b)) + 0.5, t.y);
        ctx.lineTo(Math.round(x(b)) + 0.5, t.y + t.h - 10);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    text(ctx, "200", t.x, rows.ok + 4, { size: 10, color: C.muted, mono: true });
    text(ctx, "429", t.x, rows.no + 4, { size: 10, color: C.muted, mono: true });
    const leaky = lab.limiter instanceof LeakyBucket;
    if (leaky) text(ctx, "→API", t.x, rows.out + 4, { size: 10, color: C.muted, mono: true });

    const dot = (time, y, color) => {
      if (time < from) return;
      ctx.beginPath();
      ctx.arc(x(time), y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    for (const r of lab.requests) {
      if (!r.decided) continue;
      dot(r.at, r.ok ? rows.ok : rows.no, r.ok ? C.ok : C.no);
      if (leaky && r.ok && r.processAt <= now) dot(r.processAt, rows.out, C.out);
    }
    text(ctx, `−${TIMELINE_SPAN / 1000}s`, plotX, t.y + t.h + 4, { size: 10, color: C.muted, mono: true });
    text(ctx, "now", t.x + t.w, t.y + t.h + 4, { size: 10, color: C.muted, align: "right", mono: true });
  }

  const COMPARE_ALGOS = ["fixed", "log", "counter", "token", "leaky"];
  const PATTERN_LABELS = { burst: "Sudden burst", boundary: "Boundary burst", steady: "Steady overload" };

  function buildPatterns() {
    const L = LIMIT;
    const W = WINDOW;
    const burstCount = Math.round(2.5 * L);
    const steadyGap = WINDOW / LIMIT / 2;
    return {
      burst: {
        desc: `${burstCount} requests in ${seconds(burstCount * 50)}, then 3 more spread out.`,
        duration: 2.5 * W,
        times: [...range(500, burstCount, 50), 1.5 * W, 1.75 * W, 2 * W],
        insight:
          "The token bucket spends its saved-up tokens at once, the leaky bucket queues the burst and sends it on one by one, and the window algorithms cap it per window.",
      },
      boundary: {
        desc: `${L} requests just before the ${secs(W)}s window boundary and ${L} just after.`,
        duration: 2.25 * W,
        times: [...spread(W - 450, W - 50, L), ...spread(W + 50, W + 450, L)],
        insight: "The two halves land in different fixed windows, so the fixed window counts them separately.",
      },
      steady: {
        desc: `A constant ${num(2 * RATE)} requests per second, double what the rule allows.`,
        duration: 3 * W,
        times: range(500, Math.floor((3 * W - 500) / steadyGap), steadyGap),
        insight: `Under sustained overload, every algorithm settles near the rule's ${num(RATE)} request${RATE === 1 ? "" : "s"} per second. They differ at the start and in which requests get rejected.`,
      },
    };
  }

  const listNames = (names) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

  function resultFacts() {
    const rows = cmp.rows.map((row) => ({ ...row, name: ALGOS[row.key].name }));
    const window = `${secs(WINDOW)}s`;
    const over = rows.filter((row) => row.peak > LIMIT);
    const within = rows.filter((row) => row.peak <= LIMIT);
    const facts = [];
    if (over.length) {
      facts.push(["over", `Over the limit: ${listNames(over.map((row) => `${row.name} (${row.peak} in ${window})`))}.`]);
      facts.push(["ok", `Within the limit: ${listNames(within.map((row) => row.name))}.`]);
    } else {
      facts.push(["ok", `Every algorithm stayed within ${LIMIT} requests per ${window}.`]);
    }
    const most = Math.max(...rows.map((row) => row.accepted));
    const top = rows.filter((row) => row.accepted === most);
    const wait = Math.max(...top.map((row) => row.wait));
    facts.push([
      "info",
      `Accepted the most: ${listNames(top.map((row) => row.name))}, ${most} requests` + (wait >= 50 ? `, but they waited ${sec(wait)} on average.` : "."),
    ]);
    const least = Math.min(...rows.map((row) => row.accepted));
    const others = rows.filter((row) => row.accepted !== most);
    if (others.length && others.every((row) => row.accepted === least)) {
      const count = ["", "one", "two", "three", "four"][others.length];
      facts.push(["info", others.length === 1 ? `${others[0].name} accepted ${least}.` : `The other ${count} accepted ${least} each.`]);
    } else if (least !== most) {
      facts.push(["info", `Accepted the fewest: ${listNames(rows.filter((row) => row.accepted === least).map((row) => row.name))}, ${least} requests.`]);
    }
    return facts;
  }

  function showResults(insight) {
    const body = document.createElement("div");
    const lead = document.createElement("p");
    lead.textContent = insight;
    const list = document.createElement("ul");
    for (const [kind, text] of resultFacts()) {
      const li = document.createElement("li");
      li.className = kind;
      li.textContent = text;
      list.appendChild(li);
    }
    body.append(lead, list);
    $("takeaway").replaceChildren(body);
    shrinkToFit($("takeaway"), $("compare"));
  }

  let PATTERNS = buildPatterns();

  const cmp = { pattern: "burst", now: 0, playing: false, rows: [] };

  function buildCompare() {
    const tabs = $("patterns");
    for (const [key, label] of Object.entries(PATTERN_LABELS)) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("role", "tab");
      b.dataset.pattern = key;
      b.addEventListener("click", () => {
        cmp.pattern = key;
        resetCompare();
      });
      tabs.appendChild(b);
    }
    const container = $("compare-rows");
    cmp.rows = COMPARE_ALGOS.map((key) => {
      const el = document.createElement("div");
      el.className = "row";
      el.innerHTML = `<span class="name">${ALGOS[key].name}</span><canvas></canvas>
        <span class="ok"></span><span class="no"></span><span class="peak"></span><span class="wait"></span>`;
      container.appendChild(el);
      return { key, el, canvas: el.querySelector("canvas") };
    });
  }

  function resetCompare() {
    const p = PATTERNS[cmp.pattern];
    for (const b of $("patterns").children) b.setAttribute("aria-selected", String(b.dataset.pattern === cmp.pattern));
    $("pattern-desc").textContent = p.desc;
    $("takeaway").textContent = "";
    $("compare-skip").disabled = false;
    cmp.now = 0;
    cmp.playing = true;
    for (const row of cmp.rows) {
      row.limiter = ALGOS[row.key].create();
      row.results = [];
      row.peak = 0;
    }
  }

  function peak(times) {
    let best = 0;
    for (let i = 0, j = 0; i < times.length; i++) {
      while (times[i] - times[j] >= WINDOW) j++;
      best = Math.max(best, i - j + 1);
    }
    return best;
  }

  function advanceCompare(dt) {
    if (!cmp.playing) return;
    const p = PATTERNS[cmp.pattern];
    cmp.now = Math.min(p.duration, cmp.now + dt * Number($("compare-speed").value));
    for (const row of cmp.rows) {
      while (row.results.length < p.times.length && p.times[row.results.length] <= cmp.now) {
        const at = p.times[row.results.length];
        const ok = row.limiter.tryAcquire(at);
        const l = row.limiter;
        row.results.push({ at, ok, servedAt: ok ? (l instanceof LeakyBucket ? l.pending[l.pending.length - 1] : at) : null });
      }
      if (row.limiter.drain) row.limiter.drain(cmp.now);
    }
    if (cmp.now >= p.duration) {
      cmp.playing = false;
      $("compare-skip").disabled = true;
      for (const row of cmp.rows) {
        const accepted = row.results.filter((r) => r.ok);
        row.peak = peak(
          accepted
            .filter((r) => r.servedAt <= cmp.now)
            .map((r) => r.servedAt)
            .sort((a, b) => a - b),
        );
        row.accepted = accepted.length;
        row.wait = accepted.length ? accepted.reduce((sum, r) => sum + r.servedAt - r.at, 0) / accepted.length : 0;
      }
      showResults(p.insight);
    }
  }

  function drawCompare() {
    const p = PATTERNS[cmp.pattern];
    for (const row of cmp.rows) {
      const { ctx, w, h } = fitCanvas(row.canvas);
      const x = (t) => 6 + (t / p.duration) * (w - 12);
      ctx.strokeStyle = C.grid;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let b = WINDOW; b < p.duration; b += WINDOW) {
        ctx.moveTo(Math.round(x(b)) + 0.5, 0);
        ctx.lineTo(Math.round(x(b)) + 0.5, h);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (cmp.playing) {
        ctx.fillStyle = C.shade;
        ctx.fillRect(x(cmp.now), 0, w - x(cmp.now), h);
      }

      const dot = (t, y, color) => {
        ctx.beginPath();
        ctx.arc(x(t), y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      };
      for (const r of row.results) {
        dot(r.at, h * (r.ok ? 0.2 : 0.5), r.ok ? C.ok : C.no);
        if (r.ok && r.servedAt !== r.at && r.servedAt <= cmp.now) dot(r.servedAt, h * 0.8, C.out);
      }

      const served = row.results
        .filter((r) => r.ok && r.servedAt <= cmp.now)
        .map((r) => r.servedAt)
        .sort((a, b) => a - b);
      const waits = row.results.filter((r) => r.ok).map((r) => r.servedAt - r.at);
      const top = peak(served);
      row.peak = top;
      const cellsEl = row.el.children;
      cellsEl[2].textContent = row.results.filter((r) => r.ok).length;
      cellsEl[3].textContent = row.results.filter((r) => !r.ok).length;
      cellsEl[4].textContent = top;
      cellsEl[4].className = top > LIMIT ? "hot" : "";
      cellsEl[5].textContent = waits.length ? sec(waits.reduce((a, b) => a + b, 0) / waits.length) : "—";
    }
  }

  let current = 0;

  function buildNav() {
    const nav = $("steps");
    STEPS.forEach((step, i) => {
      const b = document.createElement("button");
      b.innerHTML = `<span class="n">${i + 1}</span>${step.label}`;
      if (i === 1 || i === STEPS.length - 1) b.classList.add("group-start");
      b.addEventListener("click", () => goTo(i));
      nav.appendChild(b);
    });
  }

  function lessonHtml(step) {
    let html = "";
    if (step.how) html += `<h3>How it works</h3><ol>${step.how.map((x) => `<li>${x}</li>`).join("")}</ol>`;
    if (step.pros) html += `<h3>Good</h3><ul class="pros">${step.pros.map((x) => `<li>${x}</li>`).join("")}</ul>`;
    if (step.cons) html += `<h3>Watch out</h3><ul class="cons">${step.cons.map((x) => `<li>${x}</li>`).join("")}</ul>`;
    return html + (step.html || "");
  }

  const FIXED_LAYOUT = window.matchMedia("(min-width: 901px)");
  function shrinkToFit(textEl, container = textEl) {
    textEl.style.fontSize = "";
    if (!FIXED_LAYOUT.matches) return;
    let size = parseFloat(getComputedStyle(textEl).fontSize);
    while (container.scrollHeight > container.clientHeight + 1 && size > 11) {
      size -= 0.5;
      textEl.style.fontSize = `${size}px`;
    }
  }

  function fitLesson() {
    shrinkToFit(document.querySelector(".lesson"));
    if (STEPS[current]?.compare) shrinkToFit($("takeaway"), $("compare"));
  }

  function goTo(i) {
    current = Math.max(0, Math.min(STEPS.length - 1, i));
    const step = STEPS[current];
    history.replaceState(null, "", `#${current + 1}`);

    [...$("steps").children].forEach((b, j) => b.classList.toggle("active", j === current));
    $("steps").children[current].scrollIntoView({ block: "nearest", inline: "nearest" });

    $("eyebrow").textContent = step.eyebrow;
    $("title").textContent = step.title;
    $("lead").textContent = step.lead;
    $("lesson-body").innerHTML = lessonHtml(step);
    fitLesson();

    for (const [id, on] of [
      ["lab", !step.compare],
      ["compare", !!step.compare],
    ]) {
      $(id).classList.toggle("is-off", !on);
      $(id).inert = !on;
    }
    if (step.compare) {
      resetCompare();
    } else {
      lab.step = step;
      resetLab();
    }

    $("prev").disabled = current === 0;
    $("next").disabled = current === STEPS.length - 1;
    $("next").innerHTML =
      current === 0 ? "Start →" : current === STEPS.length - 1 ? "Done" : `Next<span class="next-label">: ${STEPS[current + 1].label}</span> →`;
    $("position").textContent = `Step ${current + 1} of ${STEPS.length}`;
    window.scrollTo({ top: 0 });
  }

  const policy = { limit: LIMIT, windowSec: WINDOW / 1000 };

  function loadPolicy() {
    try {
      const saved = JSON.parse(localStorage.getItem(POLICY_KEY) || "null");
      for (const key of Object.keys(POLICY_RANGE)) {
        const [lo, hi] = POLICY_RANGE[key];
        if (Number.isInteger(saved?.[key]) && saved[key] >= lo && saved[key] <= hi) policy[key] = saved[key];
      }
    } catch {}
  }

  function applyPolicy() {
    LIMIT = policy.limit;
    WINDOW = policy.windowSec * 1000;
    RATE = LIMIT / policy.windowSec;
    TIMELINE_SPAN = 3 * WINDOW;
    STEPS = buildSteps();
    PATTERNS = buildPatterns();
    $("sign-limit").textContent = LIMIT;
    $("sign-window").textContent = `${policy.windowSec}sec`;
    $("peak-head").textContent = `Peak / ${policy.windowSec}s`;
    $("pol-limit").textContent = LIMIT;
    $("pol-window").textContent = `${policy.windowSec}s`;
    for (const b of document.querySelectorAll(".stepper button")) {
      const [lo, hi] = POLICY_RANGE[b.dataset.key];
      const next = policy[b.dataset.key] + Number(b.dataset.step);
      b.disabled = next < lo || next > hi;
    }
    try {
      localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
    } catch {}
  }

  function togglePolicy(open) {
    $("policy-pop").hidden = !open;
    $("policy-btn").setAttribute("aria-expanded", String(open));
  }

  $("policy-btn").addEventListener("click", () => togglePolicy($("policy-pop").hidden));
  for (const b of document.querySelectorAll(".stepper button")) {
    b.addEventListener("click", () => {
      policy[b.dataset.key] += Number(b.dataset.step);
      applyPolicy();
      goTo(current);
    });
  }
  document.addEventListener("click", (e) => {
    if (!$("policy-pop").hidden && !e.target.closest(".policy")) togglePolicy(false);
  });

  $("play").addEventListener("click", () => setPlaying(!lab.playing));
  $("restart").addEventListener("click", resetLab);
  $("send").addEventListener("click", () => sendManual(1, 0));
  $("burst").addEventListener("click", () => sendManual(5, 80));
  $("compare-replay").addEventListener("click", resetCompare);
  try {
    const saved = localStorage.getItem(COMPARE_SPEED_KEY);
    if ([...$("compare-speed").options].some((o) => o.value === saved)) $("compare-speed").value = saved;
  } catch {}
  $("compare-speed").addEventListener("change", () => {
    try {
      localStorage.setItem(COMPARE_SPEED_KEY, $("compare-speed").value);
    } catch {}
  });
  $("compare-skip").addEventListener("click", () => advanceCompare(Infinity));
  $("prev").addEventListener("click", () => goTo(current - 1));
  $("next").addEventListener("click", () => goTo(current + 1));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("policy-pop").hidden) {
      togglePolicy(false);
      $("policy-btn").focus();
      return;
    }
    if (e.target.closest("input, select, button, textarea")) return;
    if (e.key === "ArrowRight") goTo(current + 1);
    else if (e.key === "ArrowLeft") goTo(current - 1);
    else if (e.code === "Space" && !STEPS[current].compare) {
      e.preventDefault();
      if (!e.repeat) sendManual(1, 0);
    }
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  window.addEventListener("resize", fitLesson);
  document.fonts?.ready.then(fitLesson);

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(100, t - last);
    last = t;
    if (STEPS[current].compare) {
      advanceCompare(dt);
      drawCompare();
    } else {
      advanceLab(dt);
      drawLab();
    }
    requestAnimationFrame(frame);
  }

  readColors();
  loadPolicy();
  applyPolicy();
  buildNav();
  buildCompare();
  goTo(Number(location.hash.slice(1)) - 1 || 0);
  requestAnimationFrame(frame);
})();
