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
import { decodeState, encodeState, stateFromHash, stateToHash } from './serialize';

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

  it('returns null for unusable payloads', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('not-valid-lz-string!!')).toBeNull();
    expect(stateFromHash('#nope')).toBeNull();
    expect(stateFromHash('')).toBeNull();
  });

  it('rejects older formats rather than mis-placing their breakers', () => {
    // Earlier versions numbered slots differently, so their slot values mean
    // something else here. Decoding one would silently misplace every breaker.
    for (const version of [1, 2]) {
      const old = compressToEncodedURIComponent(
        JSON.stringify({ v: version, n: 'Old Panel', r: [], b: [{ c: 'd', s: 3, x: [] }] }),
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
        v: 3,
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

  it('refuses to decode more breakers than the panel has slots', () => {
    const b = Array.from({ length: 5000 }, () => ({ c: 's', s: 1, x: [] }));
    const payload = compressToEncodedURIComponent(JSON.stringify({ v: 3, n: 'P', r: [], b }));
    const decoded = decodeState(payload)!;
    expect(decoded.breakers.length).toBeLessThanOrEqual(48);
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
