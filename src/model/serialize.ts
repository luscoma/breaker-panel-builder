import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { canPlace, circuitCount, emptyPanel } from './panel';
import { BreakerConfig, CircuitLabel, MAX_CIRCUITS, PanelState, SLOT_COUNT } from './types';

/** A panel of 48 slots cannot meaningfully reference more rooms than circuits. */
const MAX_ROOMS = 96;

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
  v: 4;
  n: string;
  r: string[];
  b: WireBreaker[];
}

/**
 * v3 listed the 1 x 240, 2 x 120 arrangement's throws as [120, 240, 120].
 * v4 puts the 240V throw first, so a v3 link's first two circuit labels have
 * to swap or they would land on the wrong throws.
 */
function migrateV3Circuits(config: BreakerConfig, circuits: CircuitLabel[]): CircuitLabel[] {
  if (config !== 'double-240-2x120' || circuits.length < 2) return circuits;
  const [first, second, ...rest] = circuits;
  return [second, first, ...rest];
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
    v: 4,
    n: state.name,
    r: rooms,
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
  // v3 differs only in the throw order of one arrangement, so it is migrated
  // rather than rejected; anything older numbered slots differently and cannot
  // be read at all.
  const version: unknown = (wire as { v?: unknown }).v;
  if ((version !== 4 && version !== 3) || !Array.isArray(w.b)) return null;

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

  for (const raw of w.b) {
    // The panel physically cannot hold more than one breaker per slot, so this
    // also bounds the work a hostile payload can make us do.
    if (state.breakers.length >= SLOT_COUNT) break;
    if (typeof raw !== 'object' || raw === null) continue;
    const { c, s, x } = raw as Partial<WireBreaker>;
    const config = typeof c === 'string' ? CONFIG_BY_CODE[c] : undefined;
    if (!config || typeof s !== 'number') continue;
    if (!canPlace(state, config, s)) continue;

    const entries = Array.isArray(x) ? x : [];
    const length = Math.max(circuitCount(config), Math.min(entries.length, MAX_CIRCUITS));
    const decoded = Array.from({ length }, (_, i): CircuitLabel => {
      const entry = entries[i];
      const index = Array.isArray(entry) && typeof entry[0] === 'number' ? entry[0] : -1;
      const label = Array.isArray(entry) && typeof entry[1] === 'string' ? entry[1] : '';
      return { room: slots[index] ?? '', label };
    });
    const circuits = version === 3 ? migrateV3Circuits(config, decoded) : decoded;

    state = {
      ...state,
      breakers: [...state.breakers, { id: `u${state.breakers.length}`, config, slot: s, circuits }],
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
