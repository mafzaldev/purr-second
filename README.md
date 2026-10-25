<p align="center">
  <img src="cats/cat-ginger.svg" width="64" height="64" alt="">
  <img src="cats/cat-black.svg" width="64" height="64" alt="">
  <img src="cats/cat-white.svg" width="64" height="64" alt="">
  <img src="cats/cat-grey.svg" width="64" height="64" alt="">
</p>

<h1 align="center">Purr Second</h1>

A visual guide to rate limiting. Watch five rate limiting algorithms decide, request by request, what reaches your API and what gets a `429 Too Many Requests`. Each request on the stage is drawn as a cat. The cats are decoration; everything else uses the real terms.

## What's inside

A guided walkthrough in seven steps:

1. **Intro**: what a rate limiter does, and what happens without one.
2. **Fixed window**: one counter per window, and the boundary burst problem.
3. **Sliding window log**: exact limits using a log of timestamps.
4. **Sliding window counter**: two counters blended into a cheap estimate.
5. **Token bucket**: saved-up tokens allow short bursts.
6. **Leaky bucket**: a queue that sends requests on at a constant rate.
7. **Compare**: the same traffic through all five algorithms side by side.

Each algorithm step has:

- a short explanation with strengths and weak spots,
- a narrated scenario you can play, pause, restart and slow down,
- free play: send single requests (Space) or bursts and watch the limiter react,
- a live access log with `200`, `429` and `queued` entries, including `Retry-After` where it applies,
- a timeline showing accepted and rejected requests and the window being counted.

The Compare step runs three traffic patterns (sudden burst, boundary burst, steady overload) and reports which algorithms went over the limit, which accepted the most and how long queued requests waited. It can run at up to 8× speed or skip straight to the results.

## The rate limit

Every algorithm enforces the same rule, shown in the header (4 requests per 4 seconds by default). Click it to change the number of requests (2–8) and the window length (2–8 seconds). Scenarios, lessons and comparisons all adapt to the new rule. The rule and the comparison speed are remembered in your browser.
