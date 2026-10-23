(function () {
  const { FixedWindow, SlidingLog, SlidingWindowCounter, TokenBucket, LeakyBucket } = window.RateLimiters;
  const $ = (id) => document.getElementById(id);

  const LIMIT = 4;
  const WINDOW = 4000;
  const RATE = LIMIT / (WINDOW / 1000);
  const TIMELINE_SPAN = 3 * WINDOW;

  const TRAVEL = 300;
  const EXIT = 500;
  const STAGE_H = 334;

  const sec = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  const num = (x) => String(Number(x.toFixed(2)));
  const secs = (ms) => num(ms / 1000);
  const lerp = (a, b, p) => a + (b - a) * Math.min(1, Math.max(0, p));
  const reqs = (...times) => times.map((at) => ({ at }));
  const say = (at, text) => ({ at, say: text });
  const range = (start, count, gap) => Array.from({ length: count }, (_, i) => start + i * gap);
  const spread = (from, to, count) => Array.from({ length: count }, (_, i) => Math.round(from + ((to - from) * i) / Math.max(1, count - 1)));

  const TOKENS = { text: 'ink', muted: 'muted', border: 'rule', track: 'road', accent: 'fill', ok: 'ok', out: 'ok', no: 'no', warn: 'ginger', onWarn: 'on-ginger', shade: 'shade', grid: 'grid', card: 'surface' };
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
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function text(ctx, str, x, y, { size = 12, weight = 400, color = C.text, align = 'left', baseline = 'alphabetic', mono = false, display = false, maxWidth } = {}) {
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
      if (s.label) text(ctx, s.label, x + i * (cw + gap) + cw / 2, y + h / 2 + 1, { size: 11, weight: 600, color: C.onWarn, align: 'center', baseline: 'middle', mono: true });
    }
  }

  function packet(ctx, x, y, id, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 3);
    ctx.lineTo(x - 8, y - 15);
    ctx.lineTo(x - 2, y - 9);
    ctx.moveTo(x + 10, y - 3);
    ctx.lineTo(x + 8, y - 15);
    ctx.lineTo(x + 2, y - 9);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(id), x, y + 1, { size: 10, weight: 600, color: C.card, align: 'center', baseline: 'middle', mono: true });
    ctx.globalAlpha = 1;
  }

  function paw(ctx, x, y) {
    ctx.fillStyle = C.card;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 4, 3.2, 0, 0, Math.PI * 2);
    for (const [dx, dy] of [[-4.5, -3], [-1.5, -5], [1.5, -5], [4.5, -3]]) {
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
    text(ctx, value, r.x + r.w / 2, r.y + 24, { size: 28, weight: 600, align: 'center', display: true });
    text(ctx, label, r.x + r.w / 2, r.y + 42, { size: 11, color: C.muted, align: 'center', mono: true, maxWidth: r.w });
  }

  const ALGOS = {
    none: {
      name: 'No limiter',
      create: () => ({ tryAcquire: () => true }),
      explain: () => 'no limiter, straight to the bowl',
      draw(ctx, r) {
        bigStat(ctx, r, 'No limiter', 'every cat goes straight to the bowl');
      },
    },

    fixed: {
      name: 'Fixed Window',
      create: () => new FixedWindow({ limit: LIMIT, windowMs: WINDOW }),
      boundaries: true,
      shade: (l, now) => [l.state(now).windowStart, now],
      explain: (r, before, after) =>
        r.ok
          ? `fed · ${after.count}/${LIMIT} this sitting`
          : `sitting full ${LIMIT}/${LIMIT} · Retry-After ${sec(after.resetsIn)}`,
      draw(ctx, r, l, now) {
        const s = l.state(now);
        bigStat(ctx, r, `${s.count} / ${LIMIT}`, 'cats fed this sitting');
        cells(ctx, r.x, r.y + 56, r.w, 18, LIMIT, (i) => ({ fill: i < s.count ? C.accent : C.track }));
        box(ctx, r.x, r.y + 88, r.w, 6, { fill: C.track, radius: 3 });
        box(ctx, r.x, r.y + 88, r.w * (1 - s.resetsIn / WINDOW), 6, { fill: C.accent, radius: 3 });
        const from = s.windowStart / 1000;
        text(ctx, `sitting ${from}–${from + WINDOW / 1000}s · next sitting in ${sec(s.resetsIn)}`, r.x + r.w / 2, r.y + 112, { size: 11, color: C.muted, align: 'center', mono: true, maxWidth: r.w });
      },
    },

    log: {
      name: 'Sliding Window Log',
      create: () => new SlidingLog({ limit: LIMIT, windowMs: WINDOW }),
      shade: (l, now) => [now - WINDOW, now],
      explain: (r, before, after) =>
        r.ok
          ? `noted · ${after.log.length} cat${after.log.length === 1 ? '' : 's'} in the last ${secs(WINDOW)}s`
          : `notebook full ${LIMIT}/${LIMIT} · Retry-After ${sec(before.log[0] + WINDOW - r.at)}`,
      draw(ctx, r, l, now, requests) {
        const s = l.state(now);
        bigStat(ctx, r, `${s.log.length} / ${LIMIT}`, `cats in the notebook, last ${secs(WINDOW)} seconds`);
        box(ctx, r.x, r.y + 54, r.w, 30, { fill: C.shade, radius: 6 });
        for (const t of s.log) {
          const req = requests.find((q) => q.ok && q.at === t);
          packet(ctx, r.x + 10 + ((t - (now - WINDOW)) / WINDOW) * (r.w - 20), r.y + 69, req ? req.id : '', C.accent);
        }
        text(ctx, `−${secs(WINDOW)}s`, r.x, r.y + 98, { size: 10, color: C.muted, mono: true });
        text(ctx, 'now', r.x + r.w, r.y + 98, { size: 10, color: C.muted, align: 'right', mono: true });
        if (s.log.length >= LIMIT) {
          text(ctx, `full · oldest entry expires in ${sec(s.log[0] + WINDOW - now)}`, r.x + r.w / 2, r.y + 118, { size: 11, color: C.muted, align: 'center', mono: true, maxWidth: r.w });
        }
      },
    },

    counter: {
      name: 'Sliding Window Counter',
      create: () => new SlidingWindowCounter({ limit: LIMIT, windowMs: WINDOW }),
      boundaries: true,
      shade: (l, now) => [now - WINDOW, now],
      explain(r, b) {
        const math = `${b.prevCount} × ${b.weight.toFixed(2)} + ${b.currCount} = ${b.estimate.toFixed(2)}`;
        return r.ok
          ? `estimate ${math}, room for 1 more`
          : `estimate ${math}, no room under ${LIMIT}`;
      },
      draw(ctx, r, l, now) {
        const s = l.state(now);
        const half = (r.w - 16) / 2;
        const narrow = r.w < 260;
        text(ctx, `${narrow ? 'prev' : 'previous'} × ${s.weight.toFixed(2)}`, r.x, r.y + 8, { size: narrow ? 10 : 11, color: C.muted, mono: true, maxWidth: half });
        text(ctx, narrow ? 'current' : 'current sitting', r.x + half + 16, r.y + 8, { size: narrow ? 10 : 11, color: C.muted, mono: true, maxWidth: half });
        const weighted = s.prevCount * s.weight;
        cells(ctx, r.x, r.y + 16, half, 18, LIMIT, (i) =>
          i < s.prevCount ? { fill: C.accent, alpha: Math.min(1, Math.max(0.25, weighted - i)) } : { fill: C.track });
        cells(ctx, r.x + half + 16, r.y + 16, half, 18, LIMIT, (i) => ({ fill: i < s.currCount ? C.accent : C.track }));
        text(ctx, `${s.prevCount} × ${s.weight.toFixed(2)} + ${s.currCount}`, r.x + r.w / 2, r.y + 62, { size: 13, color: C.muted, align: 'center', mono: true, maxWidth: r.w });
        text(ctx, `= ${s.estimate.toFixed(2)} / ${LIMIT}`, r.x + r.w / 2, r.y + 90, { size: 26, weight: 600, align: 'center', display: true });
        text(ctx, `estimated cats in the last ${secs(WINDOW)} seconds`, r.x + r.w / 2, r.y + 108, { size: 11, color: C.muted, align: 'center', mono: true, maxWidth: r.w });
      },
    },

    token: {
      name: 'Token Bucket',
      create: () => new TokenBucket({ capacity: LIMIT, refillPerSec: RATE }),
      explain: (r, before, after) =>
        r.ok
          ? `took a treat · ${after.tokens.toFixed(1)} left`
          : `${before.tokens.toFixed(1)} treats, needs 1 · Retry-After ${sec(((1 - before.tokens) / RATE) * 1000)}`,
      draw(ctx, r, l, now) {
        const s = l.state(now);
        bigStat(ctx, r, `${s.tokens.toFixed(1)} / ${LIMIT}`, 'treats in the jar');
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
        text(ctx, `+${num(RATE)} treat${RATE === 1 ? '' : 's'} per second · each cat takes 1`, r.x + r.w / 2, r.y + 118, { size: 11, color: C.muted, align: 'center', mono: true, maxWidth: r.w });
      },
    },

    leaky: {
      name: 'Leaky Bucket',
      create: () => new LeakyBucket({ capacity: LIMIT, leakPerSec: RATE }),
      explain(r, before, after) {
        if (!r.ok) return `line full ${LIMIT}/${LIMIT}`;
        if (r.processAt === r.at) return 'bowl free, ate straight away';
        return `${after.queued}/${LIMIT} in line · eats in ${sec(r.processAt - r.at)}`;
      },
      draw(ctx, r, l, now, requests) {
        const waiting = requests.filter((q) => q.ok && q.processAt > now).sort((a, b) => b.processAt - a.processAt);
        bigStat(ctx, r, `${waiting.length} / ${LIMIT}`, 'cats waiting in line');
        const pad = LIMIT - waiting.length;
        cells(ctx, r.x, r.y + 54, r.w, 30, LIMIT, (i) =>
          i < pad ? { fill: C.track } : { fill: C.warn, label: `#${waiting[i - pad].id}` });
        const next = waiting.length ? waiting[waiting.length - 1].processAt - now : null;
        text(ctx, `${num(RATE)} ${RATE === 1 ? 'cat eats' : 'cats eat'} per second →` + (next !== null ? ` next up in ${sec(next)}` : ''), r.x + r.w / 2, r.y + 108, { size: 11, color: C.muted, align: 'center', mono: true, maxWidth: r.w });
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
      return `${ok} of the ${2 * L} sneaky cats got fed. ${extra}`;
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
        label: 'Intro',
        algo: 'none',
        eyebrow: 'Introduction',
        title: 'Why ration the cats?',
        lead: 'Every cat wants dinner right now. A rate limiter sits between the cats (your clients) and the food bowl (your API): it lets some through and hisses 429 Too Many Cats at the rest.',
        html: `
          <p>In real systems each cat is a request. Without a rate limiter, one greedy client can empty the bowl and leave nothing for anyone else.</p>
          <p>Every algorithm here follows the rule on the tag above: <b>${L} cats per ${secs(W)} seconds</b>.</p>
          <h3>How to use it</h3>
          <p>Press <b>Play scenario</b> to watch a short narrated run, then send your own cats with <b>Space</b>. Use the arrow keys to move between steps.</p>
          <h3>Legend</h3>
          <ul class="legend">
            <li><span class="chip" style="background:var(--fill)"></span>cat on its way</li>
            <li><span class="chip" style="background:var(--ok)"></span>fed, reached the bowl</li>
            <li><span class="chip" style="background:var(--no)"></span>hissed away (429)</li>
            <li><span class="chip" style="background:var(--ginger)"></span>waiting its turn</li>
          </ul>`,
        scenario: [
          say(200, `${introCount} hungry cats come running in about ${secs(introCount * 100)} seconds…`),
          ...reqs(...range(500, introCount, 100)),
          say(introEnd + 800, `With no limiter all ${introCount} pile onto the bowl at once. That's an API with no rate limit.`),
        ],
      },
      {
        label: 'Fixed window',
        algo: 'fixed',
        eyebrow: 'Algorithm 1 of 5',
        title: 'Fixed Window',
        lead: 'Dinner is served in fixed sittings. Each sitting feeds a set number of cats, and the count starts over at the next sitting.',
        how: [
          `Time is cut into sittings (windows): 0–${secs(W)}s, ${secs(W)}–${secs(2 * W)}s, and so on.`,
          `Each sitting has a counter. A cat gets in while the counter is below ${L}.`,
          'When the next sitting starts, the counter resets to 0.',
        ],
        pros: ['One counter per client: tiny memory', 'Very fast and easy to implement'],
        cons: [`Up to ${2 * L} cats can sneak in around a change of sitting`],
        scenario: [
          say(200, `${L + 1} cats show up during the first sitting…`),
          ...reqs(...first),
          say(W + 100, (c) => `The first sitting fed ${c(0, W).ok} and hissed at ${c(0, W).no}. At ${secs(W)}s a new sitting starts and the counter drops back to 0.`),
          say(2 * W - 1000, `Now the loophole. Watch ${L} cats slip in just before the sitting changes at ${secs(2 * W)}s…`),
          ...reqs(...before),
          say(2 * W, `…and ${L} more right after it.`),
          ...reqs(...after),
          say(2 * W + 1200, (c) => attackResult(c, 'Each half lands in a different sitting, so each is counted separately. This is the boundary burst problem.')),
        ],
      },
      {
        label: 'Sliding log',
        algo: 'log',
        eyebrow: 'Algorithm 2 of 5',
        title: 'Sliding Window Log',
        lead: 'A cat-sitter writes down exactly when every cat ate, and only lets a cat in if the last few seconds of the notebook have room.',
        how: [
          'Write the time of every cat that gets fed in a notebook (the log).',
          `When a cat arrives, cross out entries older than ${secs(W)} seconds.`,
          `If fewer than ${L} entries remain, let it in and write it down.`,
        ],
        pros: [`Exact: never more than ${L} cats in any ${secs(W)}-second span`, 'No sneaking in at a change of sitting'],
        cons: ['One notebook entry per cat, so memory grows with the limit'],
        scenario: [
          say(200, `Same cats as the fixed window. First, ${L + 1} of them…`),
          ...reqs(...first),
          say(W + 100, `No fresh sitting at ${secs(W)}s. The window slides, so each entry expires exactly ${secs(W)}s after it was written.`),
          ...reqs(Math.round(1.2 * W)),
          say(2 * W - 1000, 'Now the same sneaky cats that fooled the fixed window…'),
          ...reqs(...before, ...after),
          say(2 * W + 1200, (c) => attackResult(c, `The notebook never lets more than ${L} through in any ${secs(W)}-second span.`)),
        ],
      },
      {
        label: 'Sliding counter',
        algo: 'counter',
        eyebrow: 'Algorithm 3 of 5',
        title: 'Sliding Window Counter',
        lead: 'A lazier cat-sitter keeps just two tallies, this sitting and the last one, and blends them into a good guess.',
        how: [
          'Keep a tally for the previous sitting and one for the current sitting.',
          `Weight the previous tally by how much of it still falls inside the last ${secs(W)} seconds.`,
          `Estimate = previous × weight + current. Let a cat in if the estimate + 1 ≤ ${L}.`,
        ],
        pros: ['Two tallies per client: tiny memory', 'Smooths out the sneaking at a change of sitting'],
        cons: ['A guess: it assumes last sitting\'s cats arrived evenly'],
        scenario: [
          say(200, `${L} cats fill the first sitting, and the next one gets hissed at.`),
          ...reqs(...first),
          say(W + 100, `A new sitting starts, but the previous ${L} still count, fading out as they slide out of view.`),
          ...reqs(...[1.2, 1.3, 1.45].map((f) => Math.round(f * W))),
          say(2 * W - 1000, 'Here come the sneaky cats again…'),
          ...reqs(...before, ...after),
          say(2 * W + 1200, (c) => attackResult(c, `The fixed window fed all ${2 * L}; the blended tally keeps it to ${L} or fewer.`)),
        ],
      },
      {
        label: 'Token bucket',
        algo: 'token',
        eyebrow: 'Algorithm 4 of 5',
        title: 'Token Bucket',
        lead: 'A treat jar sits by the door. Each cat takes a treat to get in, and the jar slowly refills, so saved-up treats allow a quick rush.',
        how: [
          `The jar (bucket) holds up to ${L} treats (tokens) and starts full.`,
          `Treats are added at ${num(RATE)} per second, up to the cap.`,
          'Each cat takes one treat. No whole treat means it gets hissed at.',
        ],
        pros: ['Allows short rushes while holding the average rate', 'Two numbers per client: treats left + last refill time'],
        cons: [`A full jar lets ${L} cats through at once`],
        scenario: [
          say(200, `The jar starts full with ${L} treats.`),
          ...reqs(...range(800, L + 2, 30)),
          say(tokenBurstEnd + 600, (c) => `A rush of ${L + 2} cats: ${c(800, tokenBurstEnd).ok} grabbed saved-up treats at once and ${c(800, tokenBurstEnd).no} got hissed at.`),
          ...reqs(...range(steadyAt, 3, u)),
          say(steadyAt + 0.5 * u + 300, `Treats trickle back at ${num(RATE)} per second, so one cat every ${secs(u)}s always gets in.`),
          say(steadyAt + 2 * u + 600, 'Now the cats nap for a while and the jar refills…'),
          say(refillAt - 400, '…so the next rush gets in again.'),
          ...reqs(...range(refillAt, L + 1, 60)),
          say(refillAt + (L + 1) * 60 + 700, (c) => `${c(refillAt, refillAt + L * 60).ok} of ${L + 1} got in this time.`),
        ],
      },
      {
        label: 'Leaky bucket',
        algo: 'leaky',
        eyebrow: 'Algorithm 5 of 5',
        title: 'Leaky Bucket',
        lead: 'Cats line up at the bowl and eat one at a time, at a steady pace. The bowl never gets crowded.',
        how: [
          `Cats that get in join a line (queue) with room for ${L}.`,
          `One cat from the front eats every ${secs(u)}s.`,
          'If the line is full, newcomers get hissed at.',
        ],
        pros: ['Perfectly even load on the bowl', 'Absorbs a rush instead of turning it away'],
        cons: ['Cats in line have to wait', 'A long line means stale requests'],
        scenario: [
          say(200, `A rush of ${L + 2} cats arrives…`),
          ...reqs(...range(800, L + 2, 60)),
          say(burstEnd + 600, (c) => `${c(800, burstEnd).ok} got in line and ${c(800, burstEnd).no} got hissed at. Nobody stampedes the bowl.`),
          say(burstEnd + 600 + Math.max(1000, 1.5 * u), `Watch the bowl: cats eat exactly ${secs(u)}s apart, however they arrived.`),
          say(drainedAt, 'A calm bowl protects a fragile backend, but every cat in line paid for it in waiting time.'),
          ...reqs(drainedAt + 800, drainedAt + 1000, drainedAt + 1200),
        ],
      },
    ];
  }

  const STEPS = buildSteps();

  const lab = { step: null, algo: null, limiter: null, now: 0, playing: false, requests: [], says: [], nextId: 1, scriptEnd: 0, ended: false, ok: 0, no: 0, signal: null };

  function pushLog(li) {
    const list = $('narration');
    list.prepend(li);
    while (list.children.length > 8) list.lastChild.remove();
  }

  function logSay(message) {
    const li = document.createElement('li');
    li.className = 'say';
    li.textContent = message;
    pushLog(li);
  }

  function logEntry(time, id, status, detail) {
    const li = document.createElement('li');
    const kind = status === '429' ? 'no' : status === 'queued' ? 'queued' : 'ok';
    li.innerHTML = `<span>${sec(time)}</span><span>#${id}</span><span class="status ${kind}">${status}</span><span class="msg"></span>`;
    li.lastChild.textContent = detail;
    pushLog(li);
  }

  function setPlaying(playing) {
    lab.playing = playing;
    $('play').textContent = playing ? 'Pause' : 'Play';
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
    lab.signal = null;
    const byTime = [...step.scenario].sort((a, b) => a.at - b.at);
    lab.requests = byTime.filter((e) => !e.say).map((e) => ({ id: lab.nextId++, at: e.at }));
    lab.says = byTime.filter((e) => e.say);
    lab.scriptEnd = Math.max(...step.scenario.map((e) => e.at)) + 1500;
    $('narration').innerHTML = '';
    logSay('Press Play scenario to watch it run.');
    setPlaying(false);
    $('play').textContent = 'Play scenario';
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
    logEntry(r.at, r.id, !r.ok ? '429' : r.processAt > r.at ? 'queued' : '200', lab.algo.explain(r, before, after));
  }

  function countDecided(from, to) {
    const hits = lab.requests.filter((r) => r.decided && r.at >= from && r.at <= to);
    return { ok: hits.filter((r) => r.ok).length, no: hits.filter((r) => !r.ok).length };
  }

  function sendManual(count, gap) {
    for (let i = 0; i < count; i++) lab.requests.push({ id: lab.nextId++, at: lab.now + TRAVEL + i * gap });
    lab.requests.sort((a, b) => a.at - b.at);
    setPlaying(true);
  }

  function advanceLab(dt) {
    if (!lab.playing) return;
    lab.now += dt * Number($('speed').value);
    const now = lab.now;
    for (const r of lab.requests) {
      if (r.at > now) break;
      if (!r.decided) decide(r);
      if (r.processAt > r.at && !r.leftQueue && r.processAt <= now) {
        r.leftQueue = true;
        logEntry(r.processAt, r.id, '200', `ate after waiting ${sec(r.processAt - r.at)}`);
      }
    }
    while (lab.says.length && lab.says[0].at <= now) {
      const line = lab.says.shift().say;
      logSay(typeof line === 'function' ? line(countDecided) : line);
    }
    if (lab.limiter.drain) lab.limiter.drain(now);
    if (!lab.ended && now >= lab.scriptEnd) {
      lab.ended = true;
      logSay('Scenario done. Your turn: send your own cats (Space) and watch how the limiter reacts.');
    }
    lab.requests = lab.requests.filter((r) => !r.decided || r.at > now - TIMELINE_SPAN - 1000 || r.processAt > now - EXIT);
  }

  function drawLab() {
    const fit = fitCanvas($('stage'));
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
    text(ctx, 'Cats', client.x + side / 2, midY + 5, { size: 15, weight: 600, align: 'center', display: true });
    box(ctx, server.x + 1, server.y, server.w - 2, server.h, { stroke: landed ? C.ok : C.border, fill: C.card, radius: 4 });
    text(ctx, 'Bowl', server.x + side / 2, midY + 5, { size: 15, weight: 600, align: 'center', display: true, color: landed ? C.ok : C.text });

    box(ctx, lim.x, lim.y, lim.w, lim.h, { stroke: C.text, fill: C.card, radius: 6 });
    if (!small) text(ctx, lab.algo.name, lim.x + 12, lim.y + 21, { size: 12, weight: 600, color: C.muted });
    lab.algo.draw(ctx, { x: lim.x + 14, y: lim.y + 34, w: lim.w - 28, h: lim.h - 44 }, lab.limiter, now, lab.requests);

    drawWatcher(ctx, dropX, midY - 15 - 22, now);
    text(ctx, '429 Too Many Cats · hiss!', lim.x, binY - 20, { size: 11, weight: 600, color: C.no, mono: true });

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
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 2);
    ctx.lineTo(x - 11, y - 20);
    ctx.lineTo(x - 3, y - 12);
    ctx.moveTo(x + 14, y - 2);
    ctx.lineTo(x + 11, y - 20);
    ctx.lineTo(x + 3, y - 12);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    const recent = lab.signal && now - lab.signal.at < 600;
    const color = recent ? (lab.signal.ok ? C.ok : C.no) : '#e8c547';
    for (const dx of [-5, 5]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y - 1, 3, recent ? 4 : 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    $('lab-stats').textContent = `t = ${sec(now)} · ${lab.ok} fed · ${lab.no} hissed at`;
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

    text(ctx, 'fed', t.x, rows.ok + 4, { size: 10, color: C.muted, mono: true });
    text(ctx, 'hiss', t.x, rows.no + 4, { size: 10, color: C.muted, mono: true });
    const leaky = lab.limiter instanceof LeakyBucket;
    if (leaky) text(ctx, 'ate', t.x, rows.out + 4, { size: 10, color: C.muted, mono: true });

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
    text(ctx, 'now', t.x + t.w, t.y + t.h + 4, { size: 10, color: C.muted, align: 'right', mono: true });
  }

  let current = 0;

  function buildNav() {
    const nav = $('steps');
    STEPS.forEach((step, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="n">${i + 1}</span>${step.label}`;
      b.addEventListener('click', () => goTo(i));
      nav.appendChild(b);
    });
  }

  function lessonHtml(step) {
    let html = '';
    if (step.how) html += `<h3>How it works</h3><ol>${step.how.map((x) => `<li>${x}</li>`).join('')}</ol>`;
    if (step.pros) html += `<h3>Good</h3><ul class="pros">${step.pros.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    if (step.cons) html += `<h3>Watch out</h3><ul class="cons">${step.cons.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    return html + (step.html || '');
  }

  function goTo(i) {
    current = Math.max(0, Math.min(STEPS.length - 1, i));
    const step = STEPS[current];
    history.replaceState(null, '', `#${current + 1}`);

    [...$('steps').children].forEach((b, j) => b.classList.toggle('active', j === current));
    $('steps').children[current].scrollIntoView({ block: 'nearest', inline: 'nearest' });

    $('eyebrow').textContent = step.eyebrow;
    $('title').textContent = step.title;
    $('lead').textContent = step.lead;
    $('lesson-body').innerHTML = lessonHtml(step);

    lab.step = step;
    resetLab();

    $('prev').disabled = current === 0;
    $('next').disabled = current === STEPS.length - 1;
    $('next').innerHTML = current === 0 ? 'Start →' : current === STEPS.length - 1 ? 'Done' : `Next<span class="next-label">: ${STEPS[current + 1].label}</span> →`;
    $('position').textContent = `Step ${current + 1} of ${STEPS.length}`;
    window.scrollTo({ top: 0 });
  }

  $('play').addEventListener('click', () => setPlaying(!lab.playing));
  $('restart').addEventListener('click', resetLab);
  $('send').addEventListener('click', () => sendManual(1, 0));
  $('burst').addEventListener('click', () => sendManual(5, 80));
  $('prev').addEventListener('click', () => goTo(current - 1));
  $('next').addEventListener('click', () => goTo(current + 1));

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, button, textarea')) return;
    if (e.key === 'ArrowRight') goTo(current + 1);
    else if (e.key === 'ArrowLeft') goTo(current - 1);
    else if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) sendManual(1, 0);
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(100, t - last);
    last = t;
    advanceLab(dt);
    drawLab();
    requestAnimationFrame(frame);
  }

  readColors();
  buildNav();
  goTo(Number(location.hash.slice(1)) - 1 || 0);
  requestAnimationFrame(frame);
})();
