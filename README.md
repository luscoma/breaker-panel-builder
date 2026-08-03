# Breaker Panel Builder

A static web app for planning the circuit layout of a 48-slot smart panel (SPAN). Drag breakers
into slots, tag every circuit with a room and a label, and see how many circuits you can fit
before you start losing per-circuit monitoring. The whole layout lives in the URL, so sharing a
link shares the panel.

No backend, no accounts, no database — it builds to plain static files and deploys to GitHub Pages.

## The breaker model

A breaker is one of two physical widths. What varies within a width is how many **throws** (switch
positions) it carries, and whether each throw is one pole (120V) or two poles bridged for 240V.

| Breaker | Slots | Throws | Poles | Circuits |
| --- | --- | --- | --- | --- |
| Single | 1 | 1 | 1 | 1 × 120V |
| Tandem | 1 | 2 | 2 | 2 × 120V |
| Double | 2 | 1 | 2 | 1 × 240V |
| 2 × 120 | 2 | 2 | 2 | 2 × 120V |
| 2 × 240 | 2 | 2 | 4 | 2 × 240V |
| 1 × 240, 2 × 120 | 2 | 3 | 4 | 120V, 240V, 120V top to bottom |
| Quad | 2 | 4 | 4 | 4 × 120V |

Nothing is wider than two slots. A two-slot breaker holds up to four poles, which is what makes the
four-throw arrangements possible.

The palette offers the four common breakers — Single, Tandem, Double and Quad. The three rarer
arrangements live one tap further in, behind the palette's **More** button. Any breaker's throw
arrangement can also be changed after placement from the editor, and a one-slot breaker can be
widened in place when the slot below it is free.

Switching arrangements never costs you typing: an arrangement with fewer throws hides the extra
circuits rather than deleting them, and they come back with their labels intact if you switch to an
arrangement that has them again.

### Reading a breaker's face

Each throw is drawn as one block, sized by how many poles it takes, so a 240V throw is twice the
height of a 120V one. That makes the shape of the face identify the arrangement without opening
anything: `1 × 240, 2 × 120` reads as thin / thick / thin, `2 × 240` as two equal halves, and a Quad
as four equal quarters. A 2-pole throw also gets a taller handle, the way a common trip looks.

Real four-pole hardware ties its *outer* poles (positions 1 and 4) and nests the other throws
between them. The app deliberately does not draw that: depicting it literally makes a three-circuit
breaker render as four blocks, which reads as the wrong breaker. The circuit count, voltages and
monitoring are all still correct — only the internal pole picture is simplified.

## Panel geometry

Slots alternate across the panel face: **odd numbers down the left column, even numbers down the
right**, so each row holds slot `2r-1` and `2r`. A two-slot breaker occupies slot `n` and `n + 2` —
the next row in the *same* column, which is how it straddles both bus legs. That means a two-slot
breaker can start anywhere from slot 1 to 46, but not at 47 or 48.

## Rooms and labels

Every circuit carries a **room** and a **label** — "Family" + "Lights", "Family" + "Plugs".

- Rooms are reusable: type one once and it becomes a one-tap chip on every other circuit. Each room
  gets its own colour, used in the panel and in the export.
- Rooms can also be pre-added, renamed, or removed from the **Rooms** sheet. Renaming a room carries
  every circuit using it along.
- Labels autocomplete from a built-in list (Lights, Plugs, AC, Pool, Dryer, Range, Dishwasher, EV
  charger, …) plus anything already used in the panel. Any custom text is accepted.

## Monitoring

A smart panel meters per slot, so a circuit keeps its own monitoring channel exactly when every slot
its breaker sits in carries one pole. One pole per slot means nothing else shares that CT. That
holds for a single pole (1 pole, 1 slot), a double pole (2 poles, 2 slots) and a 2 × 120V double
(2 poles, 2 slots) — but not for a tandem (2 poles crammed into 1 slot) or any four-pole double.

Packing more poles in buys circuits and costs resolution, which is the tradeoff this tool exists to
make visible.

Because metering is per *slot*, that is where the panel marks it: **the slot number itself turns
amber and gains an underline** when its circuits share a channel. Tap a marked number for an
explanation, or read the legend beside the running totals. The export marks the same slot numbers,
and additionally gives each directory entry a filled dot (own channel) or a hollow one (shared).

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

Nothing is written to local storage — the link is the save file. The format is versioned and only
the current version is readable: earlier ones numbered slots and ordered throws differently, so
decoding one would quietly build a different panel than the link described. A link the app cannot
read is reported in a toast and cleared from the address bar rather than half-applied.
