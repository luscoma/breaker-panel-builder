import {
  Breaker,
  BreakerType,
  CircuitDef,
  DEFAULT_QUAD_CONFIG,
  PanelState,
  QuadConfig,
  SLOT_COUNT,
} from './types';

export function emptyPanel(): PanelState {
  return { v: 1, name: 'Main Panel', breakers: [] };
}

/** Number of physical panel spaces a breaker type occupies. */
export function spacesFor(type: BreakerType): 1 | 2 {
  return type === 'double' || type === 'quad' ? 2 : 1;
}

/** Circuits provided by a breaker, in display order (top to bottom). */
export function circuitsFor(type: BreakerType, quadConfig?: QuadConfig): CircuitDef[] {
  switch (type) {
    case 'single':
      return [{ poles: 1, voltage: 120 }];
    case 'tandem':
      return [
        { poles: 1, voltage: 120 },
        { poles: 1, voltage: 120 },
      ];
    case 'double':
      return [{ poles: 2, voltage: 240 }];
    case 'quad':
      switch (quadConfig ?? DEFAULT_QUAD_CONFIG) {
        case 'four-120':
          return [
            { poles: 1, voltage: 120 },
            { poles: 1, voltage: 120 },
            { poles: 1, voltage: 120 },
            { poles: 1, voltage: 120 },
          ];
        case 'two-240':
          return [
            { poles: 2, voltage: 240 },
            { poles: 2, voltage: 240 },
          ];
        case '240-plus-two-120':
          return [
            { poles: 1, voltage: 120 },
            { poles: 2, voltage: 240 },
            { poles: 1, voltage: 120 },
          ];
      }
  }
}

export function circuitCount(type: BreakerType, quadConfig?: QuadConfig): number {
  return circuitsFor(type, quadConfig).length;
}

/**
 * A circuit is individually monitorable when every panel space it occupies
 * carries current only from that circuit. Tandems and quads pack multiple
 * circuits into shared spaces, so a per-space CT can't separate them.
 */
export function isIndividuallyMonitored(type: BreakerType): boolean {
  return type === 'single' || type === 'double';
}

/** Spaces occupied by a breaker: [slot] or [slot, slot+2] (same column). */
export function occupiedSlots(breaker: Pick<Breaker, 'type' | 'slot'>): number[] {
  return spacesFor(breaker.type) === 2 ? [breaker.slot, breaker.slot + 2] : [breaker.slot];
}

/** Map of space number -> breaker occupying it. */
export function buildOccupancy(state: PanelState): Map<number, Breaker> {
  const map = new Map<number, Breaker>();
  for (const b of state.breakers) {
    for (const s of occupiedSlots(b)) map.set(s, b);
  }
  return map;
}

/**
 * Whether a breaker of `type` can be placed with its top at `slot`.
 * `ignoreId` excludes a breaker from collision checks (for moves).
 */
export function canPlace(
  state: PanelState,
  type: BreakerType,
  slot: number,
  ignoreId?: string,
): boolean {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) return false;
  const slots = occupiedSlots({ type, slot });
  // A 2-space breaker sits in slot and slot+2 (next row, same column);
  // slot+2 must exist.
  if (slots[slots.length - 1] > SLOT_COUNT) return false;
  const occupancy = buildOccupancy({ ...state, breakers: state.breakers.filter((b) => b.id !== ignoreId) });
  return slots.every((s) => !occupancy.has(s));
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `b${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function placeBreaker(state: PanelState, type: BreakerType, slot: number): PanelState {
  if (!canPlace(state, type, slot)) return state;
  const quadConfig = type === 'quad' ? DEFAULT_QUAD_CONFIG : undefined;
  const breaker: Breaker = {
    id: newId(),
    type,
    slot,
    quadConfig,
    labels: Array(circuitCount(type, quadConfig)).fill(''),
  };
  return { ...state, breakers: [...state.breakers, breaker] };
}

export function moveBreaker(state: PanelState, id: string, slot: number): PanelState {
  const breaker = state.breakers.find((b) => b.id === id);
  if (!breaker || !canPlace(state, breaker.type, slot, id)) return state;
  return {
    ...state,
    breakers: state.breakers.map((b) => (b.id === id ? { ...b, slot } : b)),
  };
}

export function removeBreaker(state: PanelState, id: string): PanelState {
  return { ...state, breakers: state.breakers.filter((b) => b.id !== id) };
}

export function setLabel(state: PanelState, id: string, circuit: number, label: string): PanelState {
  return {
    ...state,
    breakers: state.breakers.map((b) => {
      if (b.id !== id || circuit < 0 || circuit >= b.labels.length) return b;
      const labels = [...b.labels];
      labels[circuit] = label;
      return { ...b, labels };
    }),
  };
}

export function setQuadConfig(state: PanelState, id: string, quadConfig: QuadConfig): PanelState {
  return {
    ...state,
    breakers: state.breakers.map((b) => {
      if (b.id !== id || b.type !== 'quad') return b;
      const count = circuitCount('quad', quadConfig);
      // Preserve existing label text where possible when the circuit count changes.
      const labels = Array.from({ length: count }, (_, i) => b.labels[i] ?? '');
      return { ...b, quadConfig, labels };
    }),
  };
}

export function setName(state: PanelState, name: string): PanelState {
  return { ...state, name };
}

export interface PanelSummary {
  breakers: number;
  circuits: number;
  monitoredCircuits: number;
  usedSpaces: number;
}

export function summarize(state: PanelState): PanelSummary {
  let circuits = 0;
  let monitored = 0;
  let usedSpaces = 0;
  for (const b of state.breakers) {
    const n = circuitCount(b.type, b.quadConfig);
    circuits += n;
    if (isIndividuallyMonitored(b.type)) monitored += n;
    usedSpaces += spacesFor(b.type);
  }
  return {
    breakers: state.breakers.length,
    circuits,
    monitoredCircuits: monitored,
    usedSpaces,
  };
}
