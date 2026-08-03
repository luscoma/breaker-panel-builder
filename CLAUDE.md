# Working agreements

## Review at logical end states, not at every push

Run an adversarial code review (an Opus subagent, told to find real bugs and
prove them with runnable repros) whenever the work reaches a **logical end
state** — before opening a PR, or before pushing to `main`. Fix what the review
gets right, then push.

Intermediate commits on the working branch do not need one; push those freely as
you go. Docs-only changes never need one.

Work currently goes straight to `main` — the owner has said that is fine for
now, though it may change as the project grows. Ask before assuming otherwise.

Three such reviews have run so far and each found real defects the test suite
missed, mostly in event ordering and rendering that unit tests cannot reach.

## Verify in a browser, not just in tests

The bugs that matter here have consistently been ones `npm test` cannot catch:
blur-before-click ordering, drag-and-drop, text overflow, mobile-only styling.
Drive the real app with Playwright (Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) and check 390px wide as
well as desktop — the phone is the primary device.

## Domain rules

These are settled with the owner; do not "fix" them without asking.

- Slots alternate across the face: odd numbers down the left column, even down
  the right. Row `r` holds slots `2r-1` and `2r`.
- A breaker occupies one slot or two. A two-slot breaker takes slot `N` and
  `N+2` — the next row in the *same* column — so it can start at 1..46 but never
  47 or 48.
- A two-slot breaker carries up to four poles. Arrangements: 1×240, 2×120,
  2×240, 1×240+2×120, 4×120. A one-slot breaker is single or tandem.
- **Monitoring**: a circuit keeps its own channel exactly when
  `poleCount === slotCount` — one pole per slot. This is the app's whole point;
  it is not a throw count.
- The breaker face draws one block per throw, sized by pole count. Real four-pole
  hardware ties its outer poles, but drawing that literally makes a
  three-circuit breaker render as four blocks, so it is deliberately simplified.

## URL format

The hash fragment is the only persistence — there is no local storage. Only the
current version decodes; older ones are refused with a toast rather than
migrated. Bump the version whenever slot numbering or throw order changes
meaning, or shared links silently describe a different panel.
