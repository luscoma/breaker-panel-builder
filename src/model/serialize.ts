import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { canPlace, circuitCount, emptyPanel, newId } from './panel';
import {
  BreakerConfig,
  CircuitLabel,
  MAX_CIRCUITS,
  MAX_ROOMS,
  PANEL_VERSION,
  PanelState,
  SLOT_COUNT,
} from './types';

/**
 * A payload cannot describe more than one breaker per slot, so anything past a
 * generous multiple of that is junk. Bounds the work a crafted link can cause
 * even when every entry is invalid and nothing is ever placed.
 */
const MAX_WIRE_BREAKERS = SLOT_COUNT * 4;

/** Far longer than any label the UI shows; stops a crafted link carrying megabytes. */
const MAX_LABEL_LENGTH = 200;

// Short codes keep shared links small; the wire format is deliberately
// separate from PanelState so internal ids never leak into URLs.
const CODE_BY_CONFIG: Record<BreakerConfig, string> = {
  single: 's',
  tandem: 't',
  double: 'd',
  'double-2x120': 'd2',
  'double-2x240': 'q2',
  'double-240-2x120': 'q3',
  'double-4x120': 'q4',
};

const CONFIG_BY_CODE: Record<string, BreakerConfig> = Object.fromEntries(
  Object.entries(CODE_BY_CONFIG).map(([config, code]) => [code, config as BreakerConfig]),
);

/** [roomIndex, label]; roomIndex is -1 when the circuit has no room. */
type WireCircuit = [number, string];

interface WireBreaker {
  c: string;
  s: number;
  x: WireCircuit[];
}

interface WireState {
  v: typeof PANEL_VERSION;
  n: string;
  r: string[];
  b: WireBreaker[];
}

export function encodeState(state: PanelState): string {
  // Any room a circuit refers to gets written out, even if it somehow never
  // made it into the room list — otherwise sharing would silently drop it.
  const rooms = [...state.rooms];
  const roomIndex = new Map(rooms.map((room, i) => [room, i]));
  for (const breaker of state.breakers) {
    for (const circuit of breaker.circuits) {
      if (circuit.room && !roomIndex.has(circuit.room)) {
        roomIndex.set(circuit.room, rooms.push(circuit.room) - 1);
      }
    }
  }

  const wire: WireState = {
    v: PANEL_VERSION,
    n: state.name,
    r: rooms.slice(0, MAX_ROOMS),
    b: state.breakers.map((b) => ({
      c: CODE_BY_CONFIG[b.config],
      s: b.slot,
      x: b.circuits.map((c): WireCircuit => [roomIndex.get(c.room) ?? -1, c.label]),
    })),
  };
  return compressToEncodedURIComponent(JSON.stringify(wire));
}

/**
 * Decode a shared-URL payload. Returns null when the payload is unusable.
 * Individually invalid breakers (unknown config, bad slot, collision) are
 * dropped rather than failing the whole panel.
 */
export function decodeState(encoded: string): PanelState | null {
  let wire: unknown;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    wire = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof wire !== 'object' || wire === null) return null;
  const w = wire as Partial<WireState>;
  // Only the current format is readable. Earlier ones numbered slots and
  // ordered throws differently, so decoding one would quietly produce a
  // different panel than the link described.
  if (w.v !== PANEL_VERSION || !Array.isArray(w.b)) return null;

  // Positions must be preserved when reading room indices, so a junk entry
  // shifts nothing; only the resulting room list drops the blanks.
  const slots = Array.isArray(w.r)
    ? w.r.slice(0, MAX_ROOMS).map((r) => (typeof r === 'string' ? r.trim() : ''))
    : [];
  let state: PanelState = {
    ...emptyPanel(),
    name: typeof w.n === 'string' ? w.n : emptyPanel().name,
    rooms: [...new Set(slots.filter(Boolean))],
  };

  for (const raw of w.b.slice(0, MAX_WIRE_BREAKERS)) {
    // The panel physically cannot hold more than one breaker per slot.
    if (state.breakers.length >= SLOT_COUNT) break;
    if (typeof raw !== 'object' || raw === null) continue;
    const { c, s, x } = raw as Partial<WireBreaker>;
    const config = typeof c === 'string' ? CONFIG_BY_CODE[c] : undefined;
    if (!config || typeof s !== 'number') continue;
    if (!canPlace(state, config, s)) continue;

    const entries = Array.isArray(x) ? x : [];
    const length = Math.max(circuitCount(config), Math.min(entries.length, MAX_CIRCUITS));
    const circuits = Array.from({ length }, (_, i): CircuitLabel => {
      const entry = entries[i];
      const index = Array.isArray(entry) && typeof entry[0] === 'number' ? entry[0] : -1;
      const raw = Array.isArray(entry) && typeof entry[1] === 'string' ? entry[1] : '';
      return { room: slots[index] ?? '', label: raw.slice(0, MAX_LABEL_LENGTH) };
    });

    state = {
      ...state,
      breakers: [...state.breakers, { id: newId(), config, slot: s, circuits }],
    };
  }
  return state;
}

export function stateToHash(state: PanelState): string {
  return `#p=${encodeState(state)}`;
}

export function stateFromHash(hash: string): PanelState | null {
  const match = /^#p=(.+)$/.exec(hash);
  if (!match) return null;
  return decodeState(match[1]);
}

/** Whether a hash claims to carry a panel, regardless of whether it decodes. */
export function hashHasPanel(hash: string): boolean {
  return /^#p=.+$/.test(hash);
}
