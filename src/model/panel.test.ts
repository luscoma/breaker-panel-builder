import { describe, expect, it } from 'vitest';
import {
  addRoom,
  canPlace,
  circuitCount,
  columnOf,
  emptyPanel,
  isIndividuallyMonitored,
  knownLabels,
  moveBreaker,
  occupiedSlots,
  placeBreaker,
  removeBreaker,
  removeRoom,
  renameRoom,
  roomUsage,
  setCircuitLabel,
  setCircuitRoom,
  setConfig,
  slotsFor,
  summarize,
  throwsFor,
} from './panel';
import { ALL_CONFIGS } from './types';

describe('breaker widths and throws', () => {
  it('has only one-slot and two-slot breakers', () => {
    for (const config of ALL_CONFIGS) {
      expect([1, 2]).toContain(slotsFor(config));
    }
  });

  it('gives one-slot breakers one or two throws', () => {
    expect(slotsFor('single')).toBe(1);
    expect(circuitCount('single')).toBe(1);
    expect(slotsFor('tandem')).toBe(1);
    expect(circuitCount('tandem')).toBe(2);
  });

  it('gives two-slot breakers between one and four throws', () => {
    expect(slotsFor('double')).toBe(2);
    expect(circuitCount('double')).toBe(1);
    expect(circuitCount('double-2x240')).toBe(2);
    expect(circuitCount('double-240-2x120')).toBe(3);
    expect(circuitCount('double-4x120')).toBe(4);
  });

  it('models throw voltages correctly', () => {
    expect(throwsFor('single')).toEqual([{ poles: 1, voltage: 120 }]);
    expect(throwsFor('double')).toEqual([{ poles: 2, voltage: 240 }]);
    expect(throwsFor('double-2x240')).toEqual([
      { poles: 2, voltage: 240 },
      { poles: 2, voltage: 240 },
    ]);
    // A quad's 240V pair sits between the two 120V throws.
    expect(throwsFor('double-240-2x120').map((t) => t.voltage)).toEqual([120, 240, 120]);
    expect(throwsFor('double-4x120').every((t) => t.poles === 1)).toBe(true);
  });

  it('never uses more than two slots for any configuration', () => {
    for (const config of ALL_CONFIGS) {
      const slots = occupiedSlots({ config, slot: 3 });
      expect(slots.length).toBeLessThanOrEqual(2);
    }
  });

  it('puts a two-slot breaker in slot n and n + 1', () => {
    expect(occupiedSlots({ config: 'single', slot: 5 })).toEqual([5]);
    expect(occupiedSlots({ config: 'tandem', slot: 5 })).toEqual([5]);
    expect(occupiedSlots({ config: 'double', slot: 5 })).toEqual([5, 6]);
    expect(occupiedSlots({ config: 'double-4x120', slot: 5 })).toEqual([5, 6]);
  });

  it('counts a circuit as individually monitored only on a single-throw breaker', () => {
    expect(isIndividuallyMonitored('single')).toBe(true);
    expect(isIndividuallyMonitored('double')).toBe(true);
    expect(isIndividuallyMonitored('tandem')).toBe(false);
    expect(isIndividuallyMonitored('double-2x240')).toBe(false);
    expect(isIndividuallyMonitored('double-240-2x120')).toBe(false);
    expect(isIndividuallyMonitored('double-4x120')).toBe(false);
  });
});

describe('columns', () => {
  it('splits the panel into a left and a right column of 24', () => {
    expect(columnOf(1)).toBe(0);
    expect(columnOf(24)).toBe(0);
    expect(columnOf(25)).toBe(1);
    expect(columnOf(48)).toBe(1);
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

  it('stops a two-slot breaker straddling the two columns', () => {
    const state = emptyPanel();
    expect(canPlace(state, 'double', 23)).toBe(true);
    expect(canPlace(state, 'double', 24)).toBe(false); // 24 is the last left slot
    expect(canPlace(state, 'double', 25)).toBe(true);
    expect(canPlace(state, 'double', 47)).toBe(true);
    expect(canPlace(state, 'double', 48)).toBe(false); // runs off the bottom
  });

  it('rejects collisions with existing breakers', () => {
    const state = placeBreaker(emptyPanel(), 'double', 3); // occupies 3 and 4
    expect(canPlace(state, 'single', 3)).toBe(false);
    expect(canPlace(state, 'single', 4)).toBe(false);
    expect(canPlace(state, 'single', 2)).toBe(true);
    expect(canPlace(state, 'single', 5)).toBe(true);
    expect(canPlace(state, 'double', 2)).toBe(false); // would need 2 and 3
  });

  it('ignores the breaker being moved when checking collisions', () => {
    const state = placeBreaker(emptyPanel(), 'double', 3);
    const id = state.breakers[0].id;
    expect(canPlace(state, 'double', 4)).toBe(false);
    expect(canPlace(state, 'double', 4, id)).toBe(true);
  });
});

describe('mutations', () => {
  it('creates one empty circuit per throw', () => {
    const state = placeBreaker(emptyPanel(), 'double-4x120', 1);
    expect(state.breakers[0].circuits).toEqual([
      { room: '', label: '' },
      { room: '', label: '' },
      { room: '', label: '' },
      { room: '', label: '' },
    ]);
  });

  it('refuses invalid placements without changing state', () => {
    const state = emptyPanel();
    expect(placeBreaker(state, 'double', 24)).toBe(state);
  });

  it('moves a breaker only to a legal slot', () => {
    let state = placeBreaker(emptyPanel(), 'double', 1);
    const id = state.breakers[0].id;
    state = moveBreaker(state, id, 10);
    expect(state.breakers[0].slot).toBe(10);
    expect(moveBreaker(state, id, 24)).toBe(state); // would straddle the columns
  });

  it('keeps circuit labels when the throw arrangement changes', () => {
    let state = placeBreaker(emptyPanel(), 'double-4x120', 1);
    const id = state.breakers[0].id;
    for (let i = 0; i < 4; i++) state = setCircuitLabel(state, id, i, `L${i + 1}`);

    state = setConfig(state, id, 'double-2x240');
    expect(state.breakers[0].circuits.map((c) => c.label)).toEqual(['L1', 'L2']);

    state = setConfig(state, id, 'double-4x120');
    expect(state.breakers[0].circuits.map((c) => c.label)).toEqual(['L1', 'L2', '', '']);
  });

  it('allows a width change only when the extra slot is free', () => {
    let state = placeBreaker(emptyPanel(), 'single', 1);
    state = placeBreaker(state, 'single', 2);
    const first = state.breakers[0].id;
    expect(setConfig(state, first, 'double')).toBe(state); // slot 2 is taken

    state = removeBreaker(state, state.breakers[1].id);
    state = setConfig(state, first, 'double');
    expect(state.breakers[0].config).toBe('double');
    expect(occupiedSlots(state.breakers[0])).toEqual([1, 2]);
  });
});

describe('rooms', () => {
  it('registers a room the first time it is typed on a circuit', () => {
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    state = setCircuitRoom(state, id, 0, 'Family');
    expect(state.rooms).toEqual(['Family']);
    expect(state.breakers[0].circuits[0].room).toBe('Family');

    // Reusing it on another circuit must not duplicate the room.
    state = setCircuitRoom(state, id, 1, 'Family');
    expect(state.rooms).toEqual(['Family']);
    expect(roomUsage(state, 'Family')).toBe(2);
  });

  it('supports pre-adding a room before any circuit uses it', () => {
    let state = addRoom(emptyPanel(), 'Garage');
    expect(state.rooms).toEqual(['Garage']);
    expect(roomUsage(state, 'Garage')).toBe(0);
    state = addRoom(state, '  Garage  '); // trimmed duplicate
    expect(state.rooms).toEqual(['Garage']);
    expect(addRoom(state, '   ')).toBe(state);
  });

  it('renames a room across every circuit using it', () => {
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    state = setCircuitRoom(state, id, 0, 'Family');
    state = setCircuitRoom(state, id, 1, 'Family');
    state = renameRoom(state, 'Family', 'Living');
    expect(state.rooms).toEqual(['Living']);
    expect(state.breakers[0].circuits.every((c) => c.room === 'Living')).toBe(true);
  });

  it('clears a removed room from its circuits', () => {
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    state = setCircuitRoom(state, id, 0, 'Family');
    state = removeRoom(state, 'Family');
    expect(state.rooms).toEqual([]);
    expect(state.breakers[0].circuits[0].room).toBe('');
  });

  it('suggests the built-in labels plus any already used', () => {
    let state = placeBreaker(emptyPanel(), 'single', 1);
    state = setCircuitLabel(state, state.breakers[0].id, 0, 'Hot tub');
    const labels = knownLabels(state);
    expect(labels).toContain('Lights');
    expect(labels).toContain('Plugs');
    expect(labels).toContain('Hot tub');
    // Built-ins are not duplicated when they get used.
    state = setCircuitLabel(state, state.breakers[0].id, 0, 'Lights');
    expect(knownLabels(state).filter((l) => l === 'Lights')).toHaveLength(1);
  });
});

describe('summarize', () => {
  it('counts circuits, monitored circuits and used slots', () => {
    let state = emptyPanel();
    state = placeBreaker(state, 'single', 1); // 1 circuit, monitored, 1 slot
    state = placeBreaker(state, 'tandem', 2); // 2 circuits, shared, 1 slot
    state = placeBreaker(state, 'double', 3); // 1 circuit, monitored, 2 slots
    state = placeBreaker(state, 'double-4x120', 5); // 4 circuits, shared, 2 slots

    expect(summarize(state)).toEqual({
      breakers: 4,
      circuits: 8,
      monitoredCircuits: 2,
      usedSlots: 6,
    });
  });

  it('fits 48 single-pole breakers, or far more circuits with tandems', () => {
    let singles = emptyPanel();
    for (let slot = 1; slot <= 48; slot++) singles = placeBreaker(singles, 'single', slot);
    expect(summarize(singles)).toMatchObject({ circuits: 48, monitoredCircuits: 48, usedSlots: 48 });

    let tandems = emptyPanel();
    for (let slot = 1; slot <= 48; slot++) tandems = placeBreaker(tandems, 'tandem', slot);
    expect(summarize(tandems)).toMatchObject({ circuits: 96, monitoredCircuits: 0, usedSlots: 48 });
  });
});
