import {
  circuitsFor,
  isIndividuallyMonitored,
  spacesFor,
  summarize,
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

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function rowOf(slot: number): number {
  return Math.ceil(slot / 2) - 1;
}

function isLeft(slot: number): boolean {
  return slot % 2 === 1;
}

/** Total pole positions in a breaker body — the unit circuit heights divide. */
function poleUnits(breaker: Breaker): number {
  return circuitsFor(breaker.type, breaker.quadConfig).reduce((sum, c) => sum + c.poles, 0);
}

function renderBreaker(breaker: Breaker): string {
  const left = isLeft(breaker.slot);
  const x = left ? LEFT_BODY_X : RIGHT_BODY_X;
  const y = GRID_TOP + rowOf(breaker.slot) * ROW_H;
  const h = spacesFor(breaker.type) * ROW_H;
  const circuits = circuitsFor(breaker.type, breaker.quadConfig);
  const units = poleUnits(breaker);
  const monitored = isIndividuallyMonitored(breaker.type);

  const parts: string[] = [];
  parts.push(
    `<rect x="${x + 3}" y="${y + 2}" width="${BODY_W - 6}" height="${h - 4}" rx="4" ` +
      `fill="${COLORS.body}" stroke="${COLORS.bodyStroke}" stroke-width="1"/>`,
  );

  let offset = 0;
  circuits.forEach((circuit, i) => {
    const ch = ((h - 4) * circuit.poles) / units;
    const cy = y + 2 + offset;
    offset += ch;
    const midY = cy + ch / 2;

    if (i > 0) {
      parts.push(
        `<line x1="${x + 3}" y1="${cy}" x2="${x + BODY_W - 3}" y2="${cy}" ` +
          `stroke="${COLORS.bodyStroke}" stroke-width="0.75" stroke-dasharray="3 2"/>`,
      );
    }

    // Toggle handle on the spine side of the body, like a real panel face.
    const handleW = 16;
    const handleH = Math.min(ch - 6, 18);
    const handleX = left ? x + BODY_W - 3 - handleW - 4 : x + 7;
    parts.push(
      `<rect x="${handleX}" y="${midY - handleH / 2}" width="${handleW}" height="${handleH}" rx="2" ` +
        `fill="${COLORS.handle}"/>`,
    );

    const voltColor = circuit.voltage === 240 ? COLORS.v240 : COLORS.v120;
    const voltX = left ? x + 12 : x + BODY_W - 12;
    parts.push(
      `<text x="${voltX}" y="${midY + 3.5}" text-anchor="${left ? 'start' : 'end'}" ` +
        `font-size="10" font-weight="600" fill="${voltColor}">${circuit.voltage}V</text>`,
    );

    // Circuit label, printed outside the panel body like a directory card.
    const labelX = left ? PAD + LABEL_W - 12 : RIGHT_BODY_X + BODY_W + 12;
    const anchor = left ? 'end' : 'start';
    const text = breaker.labels[i]?.trim();
    parts.push(
      `<text x="${labelX}" y="${midY + 3.5}" text-anchor="${anchor}" font-size="11.5" ` +
        `fill="${text ? COLORS.ink : COLORS.muted}"${text ? '' : ' font-style="italic"'}>` +
        `${esc(text ? truncate(text, 32) : 'unlabeled')}</text>`,
    );

    // Monitoring marker: filled = its own CT channel, hollow = shares a space.
    const dotX = left ? PAD + LABEL_W - 4 : RIGHT_BODY_X + BODY_W + 4;
    parts.push(
      `<circle cx="${dotX}" cy="${midY}" r="2.6" fill="${monitored ? COLORS.ink : 'none'}" ` +
        `stroke="${COLORS.ink}" stroke-width="1"/>`,
    );
  });

  return parts.join('\n');
}

/**
 * Render the panel as a standalone SVG document. Pure and DOM-free so the
 * same output feeds the SVG download and the PNG canvas rasterization.
 */
export function renderPanelSvg(state: PanelState): string {
  const parts: string[] = [];

  parts.push(
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.bg}"/>`,
  );

  parts.push(
    `<text x="${PAD}" y="${34}" font-size="20" font-weight="700" fill="${COLORS.ink}">` +
      `${esc(truncate(state.name || 'Panel', 48))}</text>`,
  );
  parts.push(
    `<text x="${PAD}" y="${54}" font-size="12" fill="${COLORS.muted}">` +
      `48-space panel · circuit directory</text>`,
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
    parts.push(renderBreaker(breaker));
  }

  const s = summarize(state);
  const footY = GRID_TOP + GRID_H + 24;
  parts.push(
    `<text x="${PAD}" y="${footY}" font-size="11.5" fill="${COLORS.ink}">` +
      `${s.breakers} breakers · ${s.circuits} circuits · ${s.monitoredCircuits} individually ` +
      `monitored · ${s.usedSpaces}/48 spaces used</text>`,
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
