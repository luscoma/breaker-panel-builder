import { compressToEncodedURIComponent } from 'lz-string';
import { describe, expect, it } from 'vitest';
import {
  addRoom,
  commitCircuitRoom,
  emptyPanel,
  placeBreaker,
  setCircuitLabel,
  setCircuitRoom,
  setName,
} from './panel';
import { decodeState, encodeState, hashHasPanel, stateFromHash, stateToHash } from './serialize';
import { MAX_ROOMS } from './types';

function sampleState() {
  let state = setName(emptyPanel(), 'House Panel');
  state = placeBreaker(state, 'single', 1);
  state = commitCircuitRoom(state, state.breakers[0].id, 0, 'Family');
  state = setCircuitLabel(state, state.breakers[0].id, 0, 'Lights');

  state = placeBreaker(state, 'double-240-2x120', 2);
  const quad = state.breakers[1].id;
  state = commitCircuitRoom(state, quad, 0, 'Family');
  state = setCircuitLabel(state, quad, 0, 'Plugs');
  state = commitCircuitRoom(state, quad, 1, 'Kitchen');
  state = setCircuitLabel(state, quad, 1, 'Range');

  state = placeBreaker(state, 'tandem', 7);
  state = placeBreaker(state, 'double-2x120', 9);
  state = addRoom(state, 'Garage'); // pre-added, not used by any circuit yet
  return state;
}

describe('URL state', () => {
  it('round-trips a panel through encode/decode', () => {
    const state = sampleState();
    const decoded = decodeState(encodeState(state));
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('House Panel');
    expect(decoded!.rooms).toEqual(state.rooms);
    expect(decoded!.breakers.map((b) => [b.config, b.slot, b.circuits])).toEqual(
      state.breakers.map((b) => [b.config, b.slot, b.circuits]),
    );
  });

  it('carries rooms across, including ones no circuit uses yet', () => {
    const decoded = decodeState(encodeState(sampleState()))!;
    expect(decoded.rooms).toContain('Garage');
    expect(decoded.breakers[0].circuits[0]).toEqual({ room: 'Family', label: 'Lights' });
    expect(decoded.breakers[1].circuits[1]).toEqual({ room: 'Kitchen', label: 'Range' });
  });

  it('round-trips through a hash fragment', () => {
    const state = sampleState();
    const hash = stateToHash(state);
    expect(hash.startsWith('#p=')).toBe(true);
    expect(stateFromHash(hash)!.breakers).toHaveLength(state.breakers.length);
  });

  it('keeps shared links reasonably short for a full panel', () => {
    let state = emptyPanel();
    const rooms = ['Family', 'Kitchen', 'Primary', 'Garage', 'Outside'];
    for (const room of rooms) state = addRoom(state, room);
    for (let slot = 1; slot <= 48; slot++) {
      state = placeBreaker(state, 'tandem', slot);
      const id = state.breakers[slot - 1].id;
      for (const i of [0, 1]) {
        state = commitCircuitRoom(state, id, i, rooms[slot % rooms.length]);
        state = setCircuitLabel(state, id, i, i === 0 ? 'Lights' : 'Plugs');
      }
    }
    // 96 fully labelled circuits still fits comfortably in a URL.
    expect(encodeState(state).length).toBeLessThan(1500);
  });

  it('recognises a hash that claims to carry a panel even when it will not decode', () => {
    // The app uses this to tell "no link" from "unreadable link" so it can say so.
    expect(hashHasPanel('#p=anything')).toBe(true);
    expect(hashHasPanel('#p=')).toBe(false);
    expect(hashHasPanel('#other')).toBe(false);
    expect(hashHasPanel('')).toBe(false);
  });

  it('returns null for unusable payloads', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('not-valid-lz-string!!')).toBeNull();
    expect(stateFromHash('#nope')).toBeNull();
    expect(stateFromHash('')).toBeNull();
  });

  it('refuses every older format outright', () => {
    // Earlier versions numbered slots and ordered throws differently, so
    // decoding one would quietly build a different panel than the link meant.
    for (const version of [1, 2, 3, 4]) {
      const old = compressToEncodedURIComponent(
        JSON.stringify({ v: version, n: 'Old Panel', r: [], b: [{ c: 'q3', s: 1, x: [] }] }),
      );
      expect(decodeState(old)).toBeNull();
    }
  });

  it('drops individually invalid breakers instead of failing the panel', () => {
    const state = sampleState();
    const encoded = encodeState({
      ...state,
      breakers: [
        ...state.breakers,
        { id: 'x', config: 'double', slot: 47, circuits: [{ room: '', label: '' }] }, // runs off the bottom
        { id: 'y', config: 'single', slot: 1, circuits: [{ room: '', label: '' }] }, // collides
      ],
    });
    expect(decodeState(encoded)!.breakers).toHaveLength(state.breakers.length);
  });

  it('preserves a room a circuit uses even if it is missing from the room list', () => {
    // Guards the encode path against silently erasing rooms on a desync.
    let state = placeBreaker(emptyPanel(), 'single', 1);
    state = setCircuitRoom(state, state.breakers[0].id, 0, 'Orphan');
    expect(state.rooms).toEqual([]);
    const decoded = decodeState(encodeState(state))!;
    expect(decoded.breakers[0].circuits[0].room).toBe('Orphan');
    expect(decoded.rooms).toContain('Orphan');
  });

  it('keeps room indices aligned when the room array holds junk', () => {
    const payload = compressToEncodedURIComponent(
      JSON.stringify({
        v: 5,
        n: 'P',
        r: [123, 'Kitchen'],
        b: [{ c: 's', s: 1, x: [[1, 'Range']] }],
      }),
    );
    const decoded = decodeState(payload)!;
    expect(decoded.breakers[0].circuits[0]).toEqual({ room: 'Kitchen', label: 'Range' });
  });

  it('carries hidden circuit labels across a share link', () => {
    let state = placeBreaker(emptyPanel(), 'double-4x120', 1);
    const id = state.breakers[0].id;
    for (let i = 0; i < 4; i++) state = setCircuitLabel(state, id, i, `L${i + 1}`);
    state = { ...state, breakers: state.breakers.map((b) => ({ ...b, config: 'double' as const })) };
    const decoded = decodeState(encodeState(state))!;
    expect(decoded.breakers[0].circuits.map((c) => c.label)).toEqual(['L1', 'L2', 'L3', 'L4']);
  });

  it('carries a full room list across without dropping any', () => {
    // The encoder must never write more rooms than the decoder will accept,
    // or a shared link silently blanks the circuits using the lost ones.
    let state = emptyPanel();
    for (let i = 0; i < MAX_ROOMS; i++) state = addRoom(state, `Room ${i}`);
    state = placeBreaker(state, 'single', 1);
    const last = state.rooms[state.rooms.length - 1];
    state = commitCircuitRoom(state, state.breakers[0].id, 0, last);

    const decoded = decodeState(encodeState(state))!;
    expect(decoded.rooms).toHaveLength(MAX_ROOMS);
    expect(decoded.breakers[0].circuits[0].room).toBe(last);
  });

  it('refuses to decode more breakers than the panel has slots', () => {
    const b = Array.from({ length: 5000 }, () => ({ c: 's', s: 1, x: [] }));
    const payload = compressToEncodedURIComponent(JSON.stringify({ v: 5, n: 'P', r: [], b }));
    const decoded = decodeState(payload)!;
    expect(decoded.breakers.length).toBeLessThanOrEqual(48);
  });

  it('gives every decoded breaker a globally unique id', () => {
    // Positional ids collide across panels, which let a loaded link re-point an
    // open editor at an unrelated breaker — and its delete button with it.
    const a = decodeState(encodeState(sampleState()))!;
    const b = decodeState(encodeState(sampleState()))!;
    const ids = [...a.breakers, ...b.breakers].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    // No id from one decode may appear in another.
    const aIds = new Set(a.breakers.map((x) => x.id));
    expect(b.breakers.some((x) => aIds.has(x.id))).toBe(false);
  });

  it('does not reuse ids already handed out by placeBreaker', () => {
    let live = placeBreaker(emptyPanel(), 'single', 1);
    live = placeBreaker(live, 'single', 2);
    const decoded = decodeState(encodeState(sampleState()))!;
    const liveIds = new Set(live.breakers.map((b) => b.id));
    expect(decoded.breakers.some((b) => liveIds.has(b.id))).toBe(false);
  });

  it('caps an absurdly long label rather than carrying it into state', () => {
    const payload = compressToEncodedURIComponent(
      JSON.stringify({
        v: 5,
        n: 'P',
        r: [],
        b: [{ c: 's', s: 1, x: [[-1, 'x'.repeat(50_000)]] }],
      }),
    );
    expect(decodeState(payload)!.breakers[0].circuits[0].label.length).toBeLessThanOrEqual(200);
  });

  it('ignores an unknown breaker configuration', () => {
    const state = sampleState();
    const encoded = encodeState({
      ...state,
      breakers: [{ ...state.breakers[0], config: 'not-a-config' as never }],
    });
    expect(decodeState(encoded)!.breakers).toHaveLength(0);
  });
});
