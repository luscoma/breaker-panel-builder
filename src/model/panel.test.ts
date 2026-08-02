import { describe, expect, it } from 'vitest';
import {
  canPlace,
  circuitCount,
  emptyPanel,
  isIndividuallyMonitored,
  moveBreaker,
  occupiedSlots,
  placeBreaker,
  removeBreaker,
  setLabel,
  setQuadConfig,
  spacesFor,
  summarize,
} from './panel';

describe('breaker geometry', () => {
  it('uses one space for single and tandem, two for double and quad', () => {
    expect(spacesFor('single')).toBe(1);
    expect(spacesFor('tandem')).toBe(1);
    expect(spacesFor('double')).toBe(2);
    expect(spacesFor('quad')).toBe(2);
  });

  it('occupies the next space in the same column for two-space breakers', () => {
    expect(occupiedSlots({ type: 'single', slot: 5 })).toEqual([5]);
    expect(occupiedSlots({ type: 'double', slot: 5 })).toEqual([5, 7]);
    expect(occupiedSlots({ type: 'quad', slot: 6 })).toEqual([6, 8]);
  });

  it('counts circuits per type and quad configuration', () => {
    expect(circuitCount('single')).toBe(1);
    expect(circuitCount('tandem')).toBe(2);
    expect(circuitCount('double')).toBe(1);
    expect(circuitCount('quad', 'four-120')).toBe(4);
    expect(circuitCount('quad', 'two-240')).toBe(2);
    expect(circuitCount('quad', '240-plus-two-120')).toBe(3);
  });

  it('treats only single and double pole breakers as individually monitored', () => {
    expect(isIndividuallyMonitored('single')).toBe(true);
    expect(isIndividuallyMonitored('double')).toBe(true);
    expect(isIndividuallyMonitored('tandem')).toBe(false);
    expect(isIndividuallyMonitored('quad')).toBe(false);
  });
});

describe('canPlace', () => {
  it('rejects slots outside the panel', () => {
    const state = emptyPanel();
    expect(canPlace(state, 'single', 0)).toBe(false);
    expect(canPlace(state, 'single', 49)).toBe(false);
    expect(canPlace(state, 'single', 1)).toBe(true);
    expect(canPlace(state, 'single', 48)).toBe(true);
  });

  it('rejects two-space breakers that would run past the bottom row', () => {
    const state = emptyPanel();
    expect(canPlace(state, 'double', 46)).toBe(true);
    expect(canPlace(state, 'double', 47)).toBe(false);
    expect(canPlace(state, 'double', 48)).toBe(false);
  });

  it('rejects collisions with existing breakers', () => {
    const state = placeBreaker(emptyPanel(), 'double', 3); // occupies 3 and 5
    expect(canPlace(state, 'single', 3)).toBe(false);
    expect(canPlace(state, 'single', 5)).toBe(false);
    expect(canPlace(state, 'single', 4)).toBe(true);
    expect(canPlace(state, 'single', 7)).toBe(true);
    expect(canPlace(state, 'double', 1)).toBe(false); // would need 1 and 3
  });

  it('ignores the breaker being moved when checking collisions', () => {
    const state = placeBreaker(emptyPanel(), 'double', 3);
    const id = state.breakers[0].id;
    expect(canPlace(state, 'double', 5)).toBe(false);
    expect(canPlace(state, 'double', 5, id)).toBe(true);
  });
});

describe('mutations', () => {
  it('creates one empty label per circuit', () => {
    const state = placeBreaker(emptyPanel(), 'tandem', 1);
    expect(state.breakers[0].labels).toEqual(['', '']);
  });

  it('refuses invalid placements without changing state', () => {
    const state = emptyPanel();
    expect(placeBreaker(state, 'double', 47)).toBe(state);
  });

  it('moves a breaker only to a legal slot', () => {
    let state = placeBreaker(emptyPanel(), 'single', 1);
    const id = state.breakers[0].id;
    state = moveBreaker(state, id, 10);
    expect(state.breakers[0].slot).toBe(10);
    const blocked = moveBreaker(state, id, 49);
    expect(blocked).toBe(state);
  });

  it('sets labels by circuit index', () => {
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    state = setLabel(state, id, 1, 'Bedroom lights');
    expect(state.breakers[0].labels).toEqual(['', 'Bedroom lights']);
  });

  it('preserves label text when the quad configuration changes', () => {
    let state = placeBreaker(emptyPanel(), 'quad', 1);
    const id = state.breakers[0].id;
    state = setQuadConfig(state, id, 'four-120');
    state = setLabel(state, id, 0, 'Kitchen');
    state = setLabel(state, id, 1, 'Garage');
    state = setLabel(state, id, 2, 'Office');
    state = setLabel(state, id, 3, 'Porch');

    state = setQuadConfig(state, id, 'two-240');
    expect(state.breakers[0].labels).toEqual(['Kitchen', 'Garage']);

    state = setQuadConfig(state, id, 'four-120');
    expect(state.breakers[0].labels).toEqual(['Kitchen', 'Garage', '', '']);
  });

  it('removes breakers', () => {
    let state = placeBreaker(emptyPanel(), 'single', 1);
    state = removeBreaker(state, state.breakers[0].id);
    expect(state.breakers).toHaveLength(0);
  });
});

describe('summarize', () => {
  it('counts circuits, monitored circuits and used spaces', () => {
    let state = emptyPanel();
    state = placeBreaker(state, 'single', 1); // 1 circuit, monitored, 1 space
    state = placeBreaker(state, 'tandem', 3); // 2 circuits, shared, 1 space
    state = placeBreaker(state, 'double', 5); // 1 circuit, monitored, 2 spaces
    state = placeBreaker(state, 'quad', 2); // two-240: 2 circuits, shared, 2 spaces

    expect(summarize(state)).toEqual({
      breakers: 4,
      circuits: 6,
      monitoredCircuits: 2,
      usedSpaces: 6,
    });
  });
});
