import {
  Breaker,
  BreakerConfig,
  CONFIGS,
  COLUMN_SIZE,
  CircuitLabel,
  DEFAULT_LABELS,
  PanelState,
  ROOM_COLORS_DARK,
  ROOM_COLORS_LIGHT,
  SLOT_COUNT,
  ThrowDef,
} from './types';

export function emptyPanel(): PanelState {
  return { v: 2, name: 'Main Panel', rooms: [], breakers: [] };
}

export function slotsFor(config: BreakerConfig): 1 | 2 {
  return CONFIGS[config].slots;
}

/** The throws on a breaker, in order from its top. */
export function throwsFor(config: BreakerConfig): ThrowDef[] {
  return CONFIGS[config].throws;
}

export function circuitCount(config: BreakerConfig): number {
  return CONFIGS[config].throws.length;
}

/**
 * A smart panel meters per slot, so a circuit only gets its own channel when
 * nothing else shares the breaker — i.e. the breaker carries a single throw.
 */
export function isIndividuallyMonitored(config: BreakerConfig): boolean {
  return circuitCount(config) === 1;
}

/** 0 for the left column (slots 1..24), 1 for the right (25..48). */
export function columnOf(slot: number): 0 | 1 {
  return slot <= COLUMN_SIZE ? 0 : 1;
}

/** 1-based position down the column. */
export function rowOf(slot: number): number {
  return slot <= COLUMN_SIZE ? slot : slot - COLUMN_SIZE;
}

/** Slots occupied: [slot] or [slot, slot + 1] for a two-slot breaker. */
export function occupiedSlots(breaker: Pick<Breaker, 'config' | 'slot'>): number[] {
  return slotsFor(breaker.config) === 2 ? [breaker.slot, breaker.slot + 1] : [breaker.slot];
}

export function buildOccupancy(state: PanelState): Map<number, Breaker> {
  const map = new Map<number, Breaker>();
  for (const b of state.breakers) {
    for (const s of occupiedSlots(b)) map.set(s, b);
  }
  return map;
}

/**
 * Whether a breaker of `config` fits with its top at `slot`. A two-slot breaker
 * must keep both slots in the same column, so it cannot start on the last slot
 * of a column. `ignoreId` excludes a breaker from collision checks, for moves.
 */
export function canPlace(
  state: PanelState,
  config: BreakerConfig,
  slot: number,
  ignoreId?: string,
): boolean {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) return false;
  const slots = occupiedSlots({ config, slot });
  const last = slots[slots.length - 1];
  if (last > SLOT_COUNT) return false;
  if (columnOf(slot) !== columnOf(last)) return false;

  const occupancy = buildOccupancy({
    ...state,
    breakers: state.breakers.filter((b) => b.id !== ignoreId),
  });
  return slots.every((s) => !occupancy.has(s));
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `b${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function emptyCircuits(config: BreakerConfig): CircuitLabel[] {
  return Array.from({ length: circuitCount(config) }, () => ({ room: '', label: '' }));
}

export function placeBreaker(state: PanelState, config: BreakerConfig, slot: number): PanelState {
  if (!canPlace(state, config, slot)) return state;
  const breaker: Breaker = { id: newId(), config, slot, circuits: emptyCircuits(config) };
  return { ...state, breakers: [...state.breakers, breaker] };
}

export function moveBreaker(state: PanelState, id: string, slot: number): PanelState {
  const breaker = state.breakers.find((b) => b.id === id);
  if (!breaker || !canPlace(state, breaker.config, slot, id)) return state;
  return { ...state, breakers: state.breakers.map((b) => (b.id === id ? { ...b, slot } : b)) };
}

export function removeBreaker(state: PanelState, id: string): PanelState {
  return { ...state, breakers: state.breakers.filter((b) => b.id !== id) };
}

/**
 * Change a breaker's throw arrangement. Widening a one-slot breaker is allowed
 * when the extra slot is free; existing circuit labels are kept where the new
 * arrangement still has a throw for them. Returns state unchanged if it cannot fit.
 */
export function setConfig(state: PanelState, id: string, config: BreakerConfig): PanelState {
  const breaker = state.breakers.find((b) => b.id === id);
  if (!breaker || breaker.config === config) return state;
  if (!canPlace(state, config, breaker.slot, id)) return state;

  const count = circuitCount(config);
  const circuits = Array.from(
    { length: count },
    (_, i) => breaker.circuits[i] ?? { room: '', label: '' },
  );
  return {
    ...state,
    breakers: state.breakers.map((b) => (b.id === id ? { ...b, config, circuits } : b)),
  };
}

function patchCircuit(
  state: PanelState,
  id: string,
  index: number,
  patch: Partial<CircuitLabel>,
): PanelState {
  return {
    ...state,
    breakers: state.breakers.map((b) => {
      if (b.id !== id || index < 0 || index >= b.circuits.length) return b;
      const circuits = [...b.circuits];
      circuits[index] = { ...circuits[index], ...patch };
      return { ...b, circuits };
    }),
  };
}

export function setCircuitLabel(
  state: PanelState,
  id: string,
  index: number,
  label: string,
): PanelState {
  return patchCircuit(state, id, index, { label });
}

/** Set a circuit's room, registering the room if it is a new one. */
export function setCircuitRoom(
  state: PanelState,
  id: string,
  index: number,
  room: string,
): PanelState {
  return patchCircuit(addRoom(state, room), id, index, { room });
}

export function addRoom(state: PanelState, room: string): PanelState {
  const name = room.trim();
  if (!name || state.rooms.includes(name)) return state;
  return { ...state, rooms: [...state.rooms, name] };
}

/** Rename a room, carrying every circuit that used it along. */
export function renameRoom(state: PanelState, from: string, to: string): PanelState {
  const name = to.trim();
  if (!name || from === name || !state.rooms.includes(from)) return state;
  if (state.rooms.includes(name)) return state;
  return {
    ...state,
    rooms: state.rooms.map((r) => (r === from ? name : r)),
    breakers: state.breakers.map((b) => ({
      ...b,
      circuits: b.circuits.map((c) => (c.room === from ? { ...c, room: name } : c)),
    })),
  };
}

/** Remove a room and clear it from any circuit using it. */
export function removeRoom(state: PanelState, room: string): PanelState {
  return {
    ...state,
    rooms: state.rooms.filter((r) => r !== room),
    breakers: state.breakers.map((b) => ({
      ...b,
      circuits: b.circuits.map((c) => (c.room === room ? { ...c, room: '' } : c)),
    })),
  };
}

export function setName(state: PanelState, name: string): PanelState {
  return { ...state, name };
}

export function roomUsage(state: PanelState, room: string): number {
  let count = 0;
  for (const b of state.breakers) {
    for (const c of b.circuits) if (c.room === room) count += 1;
  }
  return count;
}

export function roomColor(state: PanelState, room: string, light = false): string | null {
  const index = state.rooms.indexOf(room);
  if (index < 0) return null;
  const palette = light ? ROOM_COLORS_LIGHT : ROOM_COLORS_DARK;
  return palette[index % palette.length];
}

/** Suggested labels: the built-in list plus anything already used in this panel. */
export function knownLabels(state: PanelState): string[] {
  const used = new Set<string>();
  for (const b of state.breakers) {
    for (const c of b.circuits) {
      const label = c.label.trim();
      if (label) used.add(label);
    }
  }
  for (const label of DEFAULT_LABELS) used.delete(label);
  return [...DEFAULT_LABELS, ...[...used].sort()];
}

export interface PanelSummary {
  breakers: number;
  circuits: number;
  monitoredCircuits: number;
  usedSlots: number;
}

export function summarize(state: PanelState): PanelSummary {
  let circuits = 0;
  let monitored = 0;
  let usedSlots = 0;
  for (const b of state.breakers) {
    const n = circuitCount(b.config);
    circuits += n;
    if (isIndividuallyMonitored(b.config)) monitored += n;
    usedSlots += slotsFor(b.config);
  }
  return { breakers: state.breakers.length, circuits, monitoredCircuits: monitored, usedSlots };
}
