import { describe, expect, it } from 'vitest';
import { emptyPanel, placeBreaker, setLabel, setQuadConfig } from './panel';
import { decodeState, encodeState, stateFromHash, stateToHash } from './serialize';

function sampleState() {
  let state = emptyPanel();
  state = { ...state, name: 'House Panel' };
  state = placeBreaker(state, 'single', 1);
  state = setLabel(state, state.breakers[0].id, 0, 'Fridge');
  state = placeBreaker(state, 'quad', 2);
  state = setQuadConfig(state, state.breakers[1].id, '240-plus-two-120');
  state = setLabel(state, state.breakers[1].id, 1, 'Range');
  state = placeBreaker(state, 'tandem', 3);
  return state;
}

describe('URL state', () => {
  it('round-trips a panel through encode/decode', () => {
    const state = sampleState();
    const decoded = decodeState(encodeState(state));
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('House Panel');
    expect(decoded!.breakers.map((b) => [b.type, b.slot, b.quadConfig, b.labels])).toEqual(
      state.breakers.map((b) => [b.type, b.slot, b.quadConfig, b.labels]),
    );
  });

  it('round-trips through a hash fragment', () => {
    const state = sampleState();
    const hash = stateToHash(state);
    expect(hash.startsWith('#p=')).toBe(true);
    expect(stateFromHash(hash)!.breakers).toHaveLength(state.breakers.length);
  });

  it('keeps shared links reasonably short', () => {
    let state = emptyPanel();
    for (let slot = 1; slot <= 48; slot++) {
      state = placeBreaker(state, 'single', slot);
      state = setLabel(state, state.breakers[slot - 1].id, 0, `Circuit ${slot}`);
    }
    expect(encodeState(state).length).toBeLessThan(1200);
  });

  it('returns null for unusable payloads', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('not-valid-lz-string!!')).toBeNull();
    expect(stateFromHash('#nope')).toBeNull();
    expect(stateFromHash('')).toBeNull();
  });

  it('drops individually invalid breakers instead of failing the panel', () => {
    const state = sampleState();
    const encoded = encodeState({
      ...state,
      breakers: [
        ...state.breakers,
        { id: 'x', type: 'double', slot: 47, labels: [''] }, // runs past the bottom
        { id: 'y', type: 'single', slot: 1, labels: [''] }, // collides with the first breaker
      ],
    });
    const decoded = decodeState(encoded);
    expect(decoded!.breakers).toHaveLength(state.breakers.length);
  });

  it('normalizes a missing or bogus quad configuration', () => {
    let state = emptyPanel();
    state = placeBreaker(state, 'quad', 1);
    const encoded = encodeState({
      ...state,
      breakers: [{ ...state.breakers[0], quadConfig: 'nonsense' as never }],
    });
    const decoded = decodeState(encoded);
    expect(decoded!.breakers[0].quadConfig).toBeUndefined();
    expect(decoded!.breakers[0].labels).toHaveLength(2); // falls back to the default 2 × 240V
  });
});
