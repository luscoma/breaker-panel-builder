import {
  columnOf,
  isIndividuallyMonitored,
  poleCount,
  poleRuns,
  roomColor,
  rowOf,
  slotsFor,
  summarize,
  throwsFor,
} from '../model/panel';
import { Breaker, PanelState, ROWS } from '../model/types';

const ROW_H = 34;
const LABEL_W = 250;
const BODY_W = 132;
const SPINE_W = 54;
const HEADER_H = 86;
const FOOTER_H = 58;
const PAD = 16;

const LEFT_BODY_X = PAD + LABEL_W;
const SPINE_X = LEFT_BODY_X + BODY_W;
const RIGHT_BODY_X = SPINE_X + SPINE_W;
const WIDTH = PAD * 2 + LABEL_W * 2 + BODY_W * 2 + SPINE_W;
const GRID_TOP = HEADER_H;
const GRID_H = ROWS * ROW_H;
const HEIGHT = GRID_TOP + GRID_H + FOOTER_H;

const COLORS = {
  bg: '#ffffff',
  ink: '#111827',
  muted: '#6b7280',
  rule: '#d1d5db',
  spine: '#f3f4f6',
  body: '#e5e7eb',
  bodyStroke: '#9ca3af',
  handle: '#374151',
  v240: '#b45309',
  v120: '#1d4ed8',
};

/** Half of a surrogate pair with no partner — invalid in a URI-encoded SVG. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function esc(text: string): string {
  return text
    .replace(LONE_SURROGATE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Approximate advance width of one code point. CJK, Hangul, Kana and emoji are
 * full-width; Latin averages about half an em in this font stack. Rough is
 * fine — it only has to keep text inside its column.
 */
function charWidth(point: string, fontSize: number): number {
  const code = point.codePointAt(0) ?? 0;
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    code >= 0x1f300;
  return wide ? fontSize : fontSize * 0.53;
}

function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const point of text) width += charWidth(point, fontSize);
  return width;
}

/**
 * Truncate to a pixel budget, stepping by code point so a cut never lands
 * inside a surrogate pair — a lone surrogate makes encodeURIComponent throw
 * when the SVG becomes a data URL, which would break the whole PNG export.
 * Counting code points alone is not enough: 24 CJK characters are twice as
 * wide as 24 Latin ones and would run off the page.
 */
function truncate(text: string, maxWidth: number, fontSize = 11.5): string {
  const points = Array.from(text);
  const ellipsis = charWidth('…', fontSize);
  let width = 0;
  for (let i = 0; i < points.length; i++) {
    const next = charWidth(points[i], fontSize);
    if (width + next > maxWidth) {
      while (i > 0 && width + ellipsis > maxWidth) {
        i -= 1;
        width -= charWidth(points[i], fontSize);
      }
      return `${points.slice(0, i).join('')}…`;
    }
    width += next;
  }
  return text;
}

/** Usable width of a directory column, less its padding and monitoring dot. */
const DIR_W = LABEL_W - 26;
const LABEL_FS = 11.5;

/** Total pole positions on a breaker — the unit its throw heights divide. */
function poleUnits(breaker: Breaker): number {
  return poleCount(breaker.config);
}

function renderBreaker(state: PanelState, breaker: Breaker): string {
  const left = columnOf(breaker.slot) === 0;
  const x = left ? LEFT_BODY_X : RIGHT_BODY_X;
  const y = GRID_TOP + (rowOf(breaker.slot) - 1) * ROW_H;
  const h = slotsFor(breaker.config) * ROW_H;
  const throws = throwsFor(breaker.config);
  const runs = poleRuns(breaker.config);
  const units = poleUnits(breaker);
  const monitored = isIndividuallyMonitored(breaker.config);
  const innerY = y + 2;
  const innerH = h - 4;
  const poleH = innerH / units;

  const parts: string[] = [];
  parts.push(
    `<rect x="${x + 3}" y="${innerY}" width="${BODY_W - 6}" height="${innerH}" rx="4" ` +
      `fill="${COLORS.body}" stroke="${COLORS.bodyStroke}" stroke-width="1"/>`,
  );

  const handleW = 16;
  const handleX = left ? x + BODY_W - 3 - handleW - 4 : x + 7;

  for (const run of runs) {
    const t = throws[run.throwIndex];
    const runY = innerY + run.start * poleH;
    const runH = poleH * run.length;
    const midY = runY + runH / 2;

    if (run.start > 0) {
      parts.push(
        `<line x1="${x + 3}" y1="${runY}" x2="${x + BODY_W - 3}" y2="${runY}" ` +
          `stroke="${COLORS.bodyStroke}" stroke-width="0.75" stroke-dasharray="3 2"/>`,
      );
    }

    // Toggle handle on the spine side of the body, like a real panel face.
    const handleH = Math.min(runH - 6, 18);
    parts.push(
      `<rect x="${handleX}" y="${midY - handleH / 2}" width="${handleW}" height="${handleH}" rx="2" ` +
        `fill="${COLORS.handle}"/>`,
    );

    if (!run.isFirst) continue;

    const voltColor = t.voltage === 240 ? COLORS.v240 : COLORS.v120;
    const voltX = left ? x + 12 : x + BODY_W - 12;
    parts.push(
      `<text x="${voltX}" y="${midY + 3.5}" text-anchor="${left ? 'start' : 'end'}" ` +
        `font-size="10" font-weight="600" fill="${voltColor}">${t.voltage}V</text>`,
    );

    // Room and label, printed outside the panel body like a directory card.
    const circuit = breaker.circuits[run.throwIndex] ?? { room: '', label: '' };
    const room = circuit.room.trim();
    const label = circuit.label.trim();
    const labelX = left ? PAD + LABEL_W - 12 : RIGHT_BODY_X + BODY_W + 12;
    const anchor = left ? 'end' : 'start';
    const color = room ? roomColor(state, room, true) ?? COLORS.muted : COLORS.muted;

    let content: string;
    if (room && label) {
      // The room is bold, so it measures a little wider than its plain width.
      const roomText = truncate(room, DIR_W * 0.45, LABEL_FS * 1.06);
      const sep = textWidth(' · ', LABEL_FS);
      const used = textWidth(roomText, LABEL_FS * 1.06) + sep;
      content =
        `<tspan fill="${color}" font-weight="600">${esc(roomText)}</tspan>` +
        `<tspan fill="${COLORS.muted}"> · </tspan>` +
        `<tspan fill="${COLORS.ink}">${esc(truncate(label, DIR_W - used))}</tspan>`;
    } else if (room) {
      content = `<tspan fill="${color}" font-weight="600">${esc(truncate(room, DIR_W, LABEL_FS * 1.06))}</tspan>`;
    } else if (label) {
      content = `<tspan fill="${COLORS.ink}">${esc(truncate(label, DIR_W))}</tspan>`;
    } else {
      content = `<tspan fill="${COLORS.muted}" font-style="italic">unlabeled</tspan>`;
    }

    // The clip is a hard backstop: however the width estimate lands, no
    // directory entry can spill into the panel face or off the page.
    parts.push(
      `<text x="${labelX}" y="${midY + 3.5}" text-anchor="${anchor}" font-size="${LABEL_FS}" ` +
        `clip-path="url(#dir-${left ? 'left' : 'right'})">${content}</text>`,
    );

    // Monitoring marker: filled = its own CT channel, hollow = shares a slot.
    const dotX = left ? PAD + LABEL_W - 4 : RIGHT_BODY_X + BODY_W + 4;
    parts.push(
      `<circle cx="${dotX}" cy="${midY}" r="2.6" fill="${monitored ? COLORS.ink : 'none'}" ` +
        `stroke="${COLORS.ink}" stroke-width="1"/>`,
    );
  }

  // Handle tie for a throw split across non-adjacent poles, drawn the way a
  // panel schedule shows a common trip: a bar joining the two handles.
  for (let index = 0; index < throws.length; index++) {
    const mine = runs.filter((r) => r.throwIndex === index);
    if (mine.length < 2) continue;
    const first = mine[0];
    const last = mine[mine.length - 1];
    const topY = innerY + first.start * poleH + (poleH * first.length) / 2;
    const bottomY = innerY + last.start * poleH + (poleH * last.length) / 2;
    const tieX = left ? handleX + handleW + 1 : handleX - 1;
    parts.push(
      `<path d="M ${tieX} ${topY} H ${tieX + (left ? 2 : -2)} V ${bottomY} H ${tieX}" ` +
        `fill="none" stroke="${COLORS.handle}" stroke-width="1.4"/>`,
    );
  }

  return parts.join('\n');
}

/**
 * Render the panel as a standalone SVG document. Pure and DOM-free so the
 * same output feeds the SVG download and the PNG canvas rasterization.
 */
export function renderPanelSvg(state: PanelState): string {
  const parts: string[] = [];

  parts.push(
    `<defs>` +
      `<clipPath id="dir-left"><rect x="0" y="0" width="${PAD + LABEL_W - 2}" height="${HEIGHT}"/></clipPath>` +
      `<clipPath id="dir-right">` +
      `<rect x="${RIGHT_BODY_X + BODY_W + 2}" y="0" width="${WIDTH - RIGHT_BODY_X - BODY_W - 2}" height="${HEIGHT}"/>` +
      `</clipPath>` +
      `</defs>`,
  );
  parts.push(`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.bg}"/>`);

  parts.push(
    `<text x="${PAD}" y="34" font-size="20" font-weight="700" fill="${COLORS.ink}">` +
      `${esc(truncate(state.name || 'Panel', WIDTH - PAD * 2, 20))}</text>`,
  );
  parts.push(
    `<text x="${PAD}" y="54" font-size="12" fill="${COLORS.muted}">` +
      `48-slot panel · circuit directory</text>`,
  );

  // Panel face outline and centre spine.
  parts.push(
    `<rect x="${LEFT_BODY_X}" y="${GRID_TOP}" width="${BODY_W * 2 + SPINE_W}" height="${GRID_H}" ` +
      `fill="none" stroke="${COLORS.rule}" stroke-width="1.5" rx="3"/>`,
  );
  parts.push(
    `<rect x="${SPINE_X}" y="${GRID_TOP}" width="${SPINE_W}" height="${GRID_H}" fill="${COLORS.spine}"/>`,
  );

  for (let row = 0; row < ROWS; row++) {
    const y = GRID_TOP + row * ROW_H;
    if (row > 0) {
      parts.push(
        `<line x1="${LEFT_BODY_X}" y1="${y}" x2="${RIGHT_BODY_X + BODY_W}" y2="${y}" ` +
          `stroke="${COLORS.rule}" stroke-width="0.5"/>`,
      );
    }
    const midY = y + ROW_H / 2 + 3.5;
    parts.push(
      `<text x="${SPINE_X + SPINE_W / 2 - 6}" y="${midY}" text-anchor="end" font-size="10.5" ` +
        `fill="${COLORS.muted}">${row * 2 + 1}</text>`,
    );
    parts.push(
      `<text x="${SPINE_X + SPINE_W / 2 + 6}" y="${midY}" text-anchor="start" font-size="10.5" ` +
        `fill="${COLORS.muted}">${row * 2 + 2}</text>`,
    );
  }

  for (const breaker of state.breakers) {
    parts.push(renderBreaker(state, breaker));
  }

  const s = summarize(state);
  const footY = GRID_TOP + GRID_H + 24;
  parts.push(
    `<text x="${PAD}" y="${footY}" font-size="11.5" fill="${COLORS.ink}">` +
      `${s.breakers} breakers · ${s.circuits} circuits · ${s.monitoredCircuits} individually ` +
      `monitored · ${s.usedSlots}/48 slots used</text>`,
  );
  parts.push(
    `<circle cx="${PAD + 4}" cy="${footY + 18}" r="2.6" fill="${COLORS.ink}"/>` +
      `<text x="${PAD + 13}" y="${footY + 21.5}" font-size="10.5" fill="${COLORS.muted}">` +
      `own monitoring channel</text>`,
  );
  parts.push(
    `<circle cx="${PAD + 150}" cy="${footY + 18}" r="2.6" fill="none" stroke="${COLORS.ink}" stroke-width="1"/>` +
      `<text x="${PAD + 159}" y="${footY + 21.5}" font-size="10.5" fill="${COLORS.muted}">` +
      `shares a monitoring channel</text>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">\n` +
    parts.join('\n') +
    `\n</svg>`
  );
}

export const SVG_SIZE = { width: WIDTH, height: HEIGHT };
