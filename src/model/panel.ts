import {
  Breaker,
  BreakerConfig,
  CONFIGS,
  CircuitLabel,
  DEFAULT_LABELS,
  MAX_CIRCUITS,
  MAX_ROOMS,
  PanelState,
  ROOM_COLORS_DARK,
  ROOM_COLORS_LIGHT,
  SLOT_COUNT,
  ThrowDef,
} from './types';

export function emptyPanel(): PanelState {
  return { v: 5, name: 'Main Panel', rooms: [], breakers: [] };
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

/** Total pole positions the breaker consumes on the bus. */
export function poleCount(config: BreakerConfig): number {
  return throwsFor(config).reduce((sum, t) => sum + t.poles, 0);
}

/**
 * A smart panel meters per slot, so a circuit keeps its own channel only when
 * every slot the breaker sits in carries exactly one of its poles. One pole per
 * slot means nothing shares a CT; pack more poles in and the circuits blur
 * together. That covers 1 × 120V, 1 × 240V and 2 × 120V, but not a tandem or
 * any four-pole double.
 */
export function isIndividuallyMonitored(config: BreakerConfig): boolean {
  return poleCount(config) === slotsFor(config);
}

/** 0 for the left column (odd slots), 1 for the right (even slots). */
export function columnOf(slot: number): 0 | 1 {
  return slot % 2 === 1 ? 0 : 1;
}

/** 1-based row down the panel face; each row holds slot 2r-1 and 2r. */
export function rowOf(slot: number): number {
  return Math.ceil(slot / 2);
}

/**
 * Slots occupied: [slot] or, for a two-slot breaker, [slot, slot + 2] — the
 * next row in the same column, which is how a breaker straddles both bus legs.
 */
export function occupiedSlots(breaker: Pick<Breaker, 'config' | 'slot'>): number[] {
  return slotsFor(breaker.config) === 2 ? [breaker.slot, breaker.slot + 2] : [breaker.slot];
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
 * runs to slot + 2, so it cannot start in the bottom row of either column.
 * `ignoreId` excludes a breaker from collision checks, for moves.
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
/**
 * Unique for the life of the tab. Decoding uses it too: positional ids would
 * collide across panels, so loading a link could silently re-point an open
 * editor at a different breaker.
 */
export function newId(): string {
  idCounter += 1;
  return `b${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function emptyCircuits(config: BreakerConfig): CircuitLabel[] {
  return Array.from({ length: circuitCount(config) }, () => ({ room: '', label: '' }));
}

/**
 * Grow a circuit list to at least `count`, keeping any entries past it. Those
 * extras are the labels of throws the current arrangement doesn't expose; they
 * come back if the user switches to an arrangement that has them again.
 */
export function padCircuits(circuits: CircuitLabel[], count: number): CircuitLabel[] {
  const kept = circuits.slice(0, MAX_CIRCUITS);
  const padded = [...kept];
  while (padded.length < count) padded.push({ room: '', label: '' });
  return padded;
}

/** The circuits a breaker's current arrangement actually exposes. */
export function visibleCircuits(breaker: Breaker): CircuitLabel[] {
  return breaker.circuits.slice(0, circuitCount(breaker.config));
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
 * when the slot below is free. Returns state unchanged if it cannot fit.
 *
 * Circuit labels are never discarded: an arrangement with fewer throws hides
 * the extra circuits rather than deleting them, so cycling through
 * arrangements to compare them does not cost the user their typing.
 */
export function setConfig(state: PanelState, id: string, config: BreakerConfig): PanelState {
  const breaker = state.breakers.find((b) => b.id === id);
  if (!breaker || breaker.config === config) return state;
  if (!canPlace(state, config, breaker.slot, id)) return state;

  const circuits = padCircuits(breaker.circuits, circuitCount(config));
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

/**
 * Set a circuit's room as typed, without registering it. Callers use this for
 * live keystrokes — registering here would add one room per character typed.
 */
export function setCircuitRoom(
  state: PanelState,
  id: string,
  index: number,
  room: string,
): PanelState {
  return patchCircuit(state, id, index, { room });
}

/**
 * Commit a circuit's room once the user is done typing it: the trimmed name is
 * both stored on the circuit and registered, so the room list and the circuit
 * can never disagree about whitespace.
 */
export function commitCircuitRoom(
  state: PanelState,
  id: string,
  index: number,
  room: string,
): PanelState {
  const name = room.trim();
  return patchCircuit(addRoom(state, name), id, index, { room: name });
}

export function addRoom(state: PanelState, room: string): PanelState {
  const name = room.trim();
  if (!name || state.rooms.includes(name)) return state;
  // Capped so the room list can never grow past what a share link carries.
  if (state.rooms.length >= MAX_ROOMS) return state;
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
    for (const c of visibleCircuits(b)) if (c.room === room) count += 1;
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
    for (const c of visibleCircuits(b)) {
      const label = c.label.trim();
      if (label) used.add(label);
    }
  }
  for (const label of DEFAULT_LABELS) used.delete(label);
  return [...DEFAULT_LABELS, ...[...used].sort()];
}

/**
 * Slots whose breaker puts more than one pole on them, so a per-slot CT cannot
 * separate its circuits. This is what the panel marks beside the slot number.
 */
export function sharedSlots(state: PanelState): Set<number> {
  const shared = new Set<number>();
  for (const b of state.breakers) {
    if (isIndividuallyMonitored(b.config)) continue;
    for (const slot of occupiedSlots(b)) shared.add(slot);
  }
  return shared;
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
