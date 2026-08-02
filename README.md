# Breaker Panel Builder

A static web app for planning the circuit layout of a 48-space smart panel (SPAN). Drag breakers
into spaces, label every circuit, and see how many circuits you can fit before you start losing
per-circuit monitoring. The whole layout lives in the URL, so sharing a link shares the panel.

No backend, no accounts, no database — it builds to plain static files and deploys to GitHub Pages.

## Features

- **48 spaces**, numbered like a real panel: odd numbers down the left column, even down the right.
- **Four breaker types** — single pole (120V), tandem (2 × 120V in one space), double pole (240V,
  two spaces), and quad (two spaces).
- **Quad configurations**: 4 × 120V, 2 × 240V, or 1 × 240V + 2 × 120V, so odd circuit layouts can
  be modeled exactly.
- **Drag and drop** placement and rearrangement, with touch support. Illegal drops (off the bottom
  of a column, or onto an occupied space) are blocked and highlighted while dragging.
- **Per-circuit labels** — every circuit a breaker provides gets its own label.
- **Monitoring awareness**: a smart panel meters per *space*, so any breaker that packs more than
  one circuit into a space (tandem, quad) makes those circuits share a monitoring channel. The
  running total shows how many circuits keep their own channel.
- **Share by link** — the panel is compressed into the URL fragment; copy the address and send it.
- **Export** the panel as a PNG (copied to the clipboard where the browser allows it, downloaded
  otherwise) or as an SVG.

## Panel geometry

A breaker occupying two spaces sits at space `n` and `n + 2` — the next row in the *same* column,
which is how a two-pole breaker physically straddles both bus legs. That means a two-space breaker
can start anywhere from space 1 to 46, but not at 47 or 48.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # unit tests for placement rules and URL serialization
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds, and publishes `dist/`
to GitHub Pages.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub
Actions**.

The Vite `base` is `'./'`, so the build works from any path — including the
`/<repo-name>/` subpath GitHub Pages serves from.

## How state is stored

The panel is serialized to a compact JSON shape, compressed with `lz-string`, and written to the
URL hash as `#p=…` (debounced, via `history.replaceState`, so it never spams browser history). A
fully loaded 48-breaker panel with labels stays well under 1.2 kB of URL.

Nothing is written to local storage — the link is the save file.
