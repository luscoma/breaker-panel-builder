import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { canPlace, circuitCount, emptyPanel } from './panel';
import { BreakerType, PanelState, QuadConfig } from './types';

// Compact wire format kept separate from PanelState so internal ids and
// future fields never leak into (or break) shared URLs.
interface WireBreaker {
  t: BreakerType;
  s: number;
  q?: QuadConfig;
  l: string[];
}

interface WireState {
  v: 1;
  n: string;
  b: WireBreaker[];
}

const BREAKER_TYPES: BreakerType[] = ['single', 'tandem', 'double', 'quad'];
const QUAD_CONFIGS: QuadConfig[] = ['four-120', 'two-240', '240-plus-two-120'];

export function encodeState(state: PanelState): string {
  const wire: WireState = {
    v: 1,
    n: state.name,
    b: state.breakers.map((b) => ({
      t: b.type,
      s: b.slot,
      ...(b.type === 'quad' ? { q: b.quadConfig } : {}),
      l: b.labels,
    })),
  };
  return compressToEncodedURIComponent(JSON.stringify(wire));
}

/**
 * Decode a shared-URL payload. Returns null when the payload is unusable;
 * individually invalid breakers (bad slot, collision) are dropped rather
 * than failing the whole panel.
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
  if (w.v !== 1 || !Array.isArray(w.b)) return null;

  let state = emptyPanel();
  state = { ...state, name: typeof w.n === 'string' ? w.n : state.name };
  for (const raw of w.b) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { t, s, q, l } = raw as Partial<WireBreaker>;
    if (!BREAKER_TYPES.includes(t as BreakerType) || typeof s !== 'number') continue;
    const type = t as BreakerType;
    const quadConfig =
      type === 'quad' && QUAD_CONFIGS.includes(q as QuadConfig) ? (q as QuadConfig) : undefined;
    if (!canPlace(state, type, s)) continue;
    const count = circuitCount(type, quadConfig);
    const labels = Array.from({ length: count }, (_, i) =>
      Array.isArray(l) && typeof l[i] === 'string' ? l[i] : '',
    );
    state = {
      ...state,
      breakers: [
        ...state.breakers,
        { id: `u${state.breakers.length}`, type, slot: s, quadConfig, labels },
      ],
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
