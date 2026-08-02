import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { canPlace, circuitCount, emptyPanel } from './panel';
import { BreakerConfig, CircuitLabel, PanelState } from './types';

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
  v: 3;
  n: string;
  r: string[];
  b: WireBreaker[];
}

export function encodeState(state: PanelState): string {
  const roomIndex = new Map(state.rooms.map((room, i) => [room, i]));
  const wire: WireState = {
    v: 3,
    n: state.name,
    r: state.rooms,
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
  if (w.v !== 3 || !Array.isArray(w.b)) return null;

  const rooms = Array.isArray(w.r) ? w.r.filter((r): r is string => typeof r === 'string') : [];
  let state: PanelState = {
    ...emptyPanel(),
    name: typeof w.n === 'string' ? w.n : emptyPanel().name,
    rooms,
  };

  for (const raw of w.b) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { c, s, x } = raw as Partial<WireBreaker>;
    const config = typeof c === 'string' ? CONFIG_BY_CODE[c] : undefined;
    if (!config || typeof s !== 'number') continue;
    if (!canPlace(state, config, s)) continue;

    const circuits = Array.from({ length: circuitCount(config) }, (_, i): CircuitLabel => {
      const entry = Array.isArray(x) ? x[i] : undefined;
      const index = Array.isArray(entry) && typeof entry[0] === 'number' ? entry[0] : -1;
      const label = Array.isArray(entry) && typeof entry[1] === 'string' ? entry[1] : '';
      return { room: rooms[index] ?? '', label };
    });

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
