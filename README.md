# Breaker Panel Builder

A static web app for planning the circuit layout of a 48-slot smart panel (SPAN). Drag breakers
into slots, tag every circuit with a room and a label, and see how many circuits you can fit
before you start losing per-circuit monitoring. The whole layout lives in the URL, so sharing a
link shares the panel.

No backend, no accounts, no database — it builds to plain static files and deploys to GitHub Pages.

## The breaker model

A breaker is one of two physical widths. What varies within a width is how many **throws** (switch
positions) it carries, and whether each throw is one pole (120V) or two poles bridged for 240V.

| Breaker | Slots | Throws | Circuits |
| --- | --- | --- | --- |
| Single pole | 1 | 1 | 1 × 120V |
| Tandem | 1 | 2 | 2 × 120V |
| Double pole | 2 | 1 | 1 × 240V |
| Double — 2 × 240V | 2 | 2 | 2 × 240V |
| Double — 240V + 2 × 120V | 2 | 3 | 1 × 240V between two 120V |
| Quad | 2 | 4 | 4 × 120V |

There is no breaker wider than two slots — a "quad" is a two-slot breaker carrying four throws.
The palette offers the four common ones; any breaker's throw arrangement can be changed afterwards
from the editor, and a one-slot breaker can be widened in place when the next slot is free.

## Panel geometry

Slots are numbered down each column: **1–24 down the left, 25–48 down the right**. A two-slot
breaker occupies slot `n` and `n + 1`, so it cannot start on the last slot of a column — not at 24,
and not at 48.

## Rooms and labels

Every circuit carries a **room** and a **label** — "Family" + "Lights", "Family" + "Plugs".

- Rooms are reusable: type one once and it becomes a one-tap chip on every other circuit. Each room
  gets its own colour, used in the panel and in the export.
- Rooms can also be pre-added, renamed, or removed from the **Rooms** sheet. Renaming a room carries
  every circuit using it along.
- Labels autocomplete from a built-in list (Lights, Plugs, AC, Pool, Dryer, Range, Dishwasher, EV
  charger, …) plus anything already used in the panel. Any custom text is accepted.

## Monitoring

A smart panel meters per slot, so a circuit only gets its own monitoring channel when nothing else
shares the breaker — that is, when the breaker carries a single throw. Tandems and multi-throw
doubles trade monitoring resolution for circuit count, which is the tradeoff this tool exists to
make visible. The running total shows how many circuits keep their own channel, and the export marks
each circuit with a filled dot (own channel) or a hollow one (shared).

## Sharing and export

- **Copy link** — the panel is compressed into the URL fragment and kept current as you edit.
- **Copy PNG** — copied to the clipboard where the browser allows it, downloaded otherwise.
- **SVG** — downloads a vector of the same directory-card rendering.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # unit tests for the breaker model, placement rules, rooms and URL state
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds, and publishes `dist/`
to GitHub Pages.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub
Actions**.

The Vite `base` is `'./'`, so the build works from any path — including the `/<repo-name>/` subpath
GitHub Pages serves from.

## How state is stored

The panel is serialized to a compact JSON shape (rooms are stored once and referenced by index),
compressed with `lz-string`, and written to the URL hash as `#p=…` — debounced, via
`history.replaceState`, so it never spams browser history. A panel with 96 fully labelled circuits
stays under 1.5 kB of URL.

Nothing is written to local storage — the link is the save file. The format is versioned; links
from the earlier `v1` layout are rejected rather than decoded into the wrong slots.
