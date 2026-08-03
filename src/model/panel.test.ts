import { describe, expect, it } from 'vitest';
import {
  addRoom,
  commitCircuitRoom,
  canPlace,
  circuitCount,
  columnOf,
  emptyPanel,
  isIndividuallyMonitored,
  knownLabels,
  moveBreaker,
  occupiedSlots,
  placeBreaker,
  poleCount,
  poleLayout,
  poleRuns,
  removeBreaker,
  removeRoom,
  renameRoom,
  roomColor,
  roomUsage,
  rowOf,
  setCircuitLabel,
  setCircuitRoom,
  visibleCircuits,
  setConfig,
  slotsFor,
  summarize,
  throwsFor,
} from './panel';
import { ALL_CONFIGS, MAX_ROOMS } from './types';

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

  it('gives two-slot breakers every throw arrangement up to four', () => {
    expect(slotsFor('double')).toBe(2);
    expect(circuitCount('double')).toBe(1); // 1 x 240V
    expect(circuitCount('double-2x120')).toBe(2); // 2 x 120V
    expect(circuitCount('double-2x240')).toBe(2); // 2 x 240V
    expect(circuitCount('double-240-2x120')).toBe(3); // 240V + 2 x 120V
    expect(circuitCount('double-4x120')).toBe(4); // 4 x 120V
  });

  it('never puts more than four poles on a breaker', () => {
    for (const config of ALL_CONFIGS) {
      expect(poleCount(config)).toBeLessThanOrEqual(4);
    }
    expect(poleCount('double-2x120')).toBe(2);
    expect(poleCount('double-2x240')).toBe(4);
  });

  it('models throw voltages correctly', () => {
    expect(throwsFor('single')).toEqual([{ poles: 1, voltage: 120 }]);
    expect(throwsFor('double')).toEqual([{ poles: 2, voltage: 240 }]);
    expect(throwsFor('double-2x240')).toEqual([
      { poles: 2, voltage: 240 },
      { poles: 2, voltage: 240 },
    ]);
    // The 240V throw is listed first, matching the arrangement's name.
    expect(throwsFor('double-240-2x120').map((t) => t.voltage)).toEqual([240, 120, 120]);
    expect(throwsFor('double-2x120')).toEqual([
      { poles: 1, voltage: 120 },
      { poles: 1, voltage: 120 },
    ]);
    expect(throwsFor('double-4x120').every((t) => t.poles === 1)).toBe(true);
  });

  it('never uses more than two slots for any configuration', () => {
    for (const config of ALL_CONFIGS) {
      const slots = occupiedSlots({ config, slot: 3 });
      expect(slots.length).toBeLessThanOrEqual(2);
    }
  });

  it('puts a two-slot breaker in slot n and n + 2, the next row in its column', () => {
    expect(occupiedSlots({ config: 'single', slot: 5 })).toEqual([5]);
    expect(occupiedSlots({ config: 'tandem', slot: 5 })).toEqual([5]);
    expect(occupiedSlots({ config: 'double', slot: 5 })).toEqual([5, 7]);
    expect(occupiedSlots({ config: 'double-4x120', slot: 6 })).toEqual([6, 8]);
  });

  it('counts a circuit as individually monitored at one pole per slot', () => {
    // One pole per slot means nothing else shares the CT on that slot.
    expect(isIndividuallyMonitored('single')).toBe(true); // 1 pole, 1 slot
    expect(isIndividuallyMonitored('double')).toBe(true); // 2 poles, 2 slots
    expect(isIndividuallyMonitored('double-2x120')).toBe(true); // 2 poles, 2 slots
    // Packing extra poles into the same slots blurs the circuits together.
    expect(isIndividuallyMonitored('tandem')).toBe(false); // 2 poles, 1 slot
    expect(isIndividuallyMonitored('double-2x240')).toBe(false); // 4 poles, 2 slots
    expect(isIndividuallyMonitored('double-240-2x120')).toBe(false);
    expect(isIndividuallyMonitored('double-4x120')).toBe(false);
  });
});

describe('pole layout', () => {
  it('assigns every pole position to exactly one throw', () => {
    for (const config of ALL_CONFIGS) {
      const layout = poleLayout(config);
      expect(layout).toHaveLength(poleCount(config));
      // Each throw must claim exactly as many poles as it declares.
      throwsFor(config).forEach((t, index) => {
        expect(layout.filter((p) => p === index)).toHaveLength(t.poles);
      });
    }
  });

  it('ties the 240V throw across the outer poles on a four-pole double', () => {
    // Positions 1 and 4 are the tied 240V pair; 2 and 3 nest inside it.
    expect(poleLayout('double-2x240')).toEqual([0, 1, 1, 0]);
    expect(poleLayout('double-240-2x120')).toEqual([0, 1, 2, 0]);
  });

  it('stacks throws in order for the ordinary arrangements', () => {
    expect(poleLayout('single')).toEqual([0]);
    expect(poleLayout('tandem')).toEqual([0, 1]);
    expect(poleLayout('double')).toEqual([0, 0]);
    expect(poleLayout('double-2x120')).toEqual([0, 1]);
    expect(poleLayout('double-4x120')).toEqual([0, 1, 2, 3]);
  });

  it('splits a tied throw into two drawable runs', () => {
    const runs = poleRuns('double-240-2x120');
    expect(runs).toEqual([
      { throwIndex: 0, start: 0, length: 1, isFirst: true },
      { throwIndex: 1, start: 1, length: 1, isFirst: true },
      { throwIndex: 2, start: 2, length: 1, isFirst: true },
      { throwIndex: 0, start: 3, length: 1, isFirst: false },
    ]);
  });

  it('keeps a contiguous throw as a single run', () => {
    expect(poleRuns('double')).toEqual([{ throwIndex: 0, start: 0, length: 2, isFirst: true }]);
    // The inner 240V pair of a 2 x 240 is contiguous; the outer one is not.
    expect(poleRuns('double-2x240')).toEqual([
      { throwIndex: 0, start: 0, length: 1, isFirst: true },
      { throwIndex: 1, start: 1, length: 2, isFirst: true },
      { throwIndex: 0, start: 3, length: 1, isFirst: false },
    ]);
  });
});

describe('columns', () => {
  it('runs odd slots down the left column and even down the right', () => {
    expect(columnOf(1)).toBe(0);
    expect(columnOf(3)).toBe(0);
    expect(columnOf(47)).toBe(0);
    expect(columnOf(2)).toBe(1);
    expect(columnOf(48)).toBe(1);
  });

  it('pairs slot 2r-1 and 2r on the same row', () => {
    expect(rowOf(1)).toBe(1);
    expect(rowOf(2)).toBe(1);
    expect(rowOf(3)).toBe(2);
    expect(rowOf(47)).toBe(24);
    expect(rowOf(48)).toBe(24);
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

  it('stops a two-slot breaker running past the bottom row of its column', () => {
    const state = emptyPanel();
    expect(canPlace(state, 'double', 45)).toBe(true); // 45 and 47
    expect(canPlace(state, 'double', 46)).toBe(true); // 46 and 48
    expect(canPlace(state, 'double', 47)).toBe(false); // would need 49
    expect(canPlace(state, 'double', 48)).toBe(false); // would need 50
  });

  it('keeps a two-slot breaker within one column', () => {
    for (const slot of [1, 2, 21, 22]) {
      const slots = occupiedSlots({ config: 'double', slot });
      expect(columnOf(slots[0])).toBe(columnOf(slots[1]));
    }
  });

  it('rejects collisions with existing breakers', () => {
    const state = placeBreaker(emptyPanel(), 'double', 3); // occupies 3 and 5
    expect(canPlace(state, 'single', 3)).toBe(false);
    expect(canPlace(state, 'single', 5)).toBe(false);
    expect(canPlace(state, 'single', 4)).toBe(true); // other column, unaffected
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
    expect(placeBreaker(state, 'double', 47)).toBe(state);
  });

  it('moves a breaker only to a legal slot', () => {
    let state = placeBreaker(emptyPanel(), 'double', 1);
    const id = state.breakers[0].id;
    state = moveBreaker(state, id, 10);
    expect(state.breakers[0].slot).toBe(10);
    expect(moveBreaker(state, id, 47)).toBe(state); // would run off the bottom
  });

  it('never loses a label when the throw arrangement shrinks and grows back', () => {
    let state = placeBreaker(emptyPanel(), 'double-4x120', 1);
    const id = state.breakers[0].id;
    for (let i = 0; i < 4; i++) state = setCircuitLabel(state, id, i, `L${i + 1}`);

    // Only two circuits are exposed...
    state = setConfig(state, id, 'double-2x240');
    expect(visibleCircuits(state.breakers[0]).map((c) => c.label)).toEqual(['L1', 'L2']);

    // ...and the hidden ones come back intact rather than as blanks.
    state = setConfig(state, id, 'double-4x120');
    expect(state.breakers[0].circuits.map((c) => c.label)).toEqual(['L1', 'L2', 'L3', 'L4']);
  });

  it('ignores hidden circuits when counting room usage and suggesting labels', () => {
    let state = placeBreaker(emptyPanel(), 'double-4x120', 1);
    const id = state.breakers[0].id;
    state = commitCircuitRoom(state, id, 3, 'Attic');
    state = setCircuitLabel(state, id, 3, 'Hidden fan');
    expect(roomUsage(state, 'Attic')).toBe(1);

    state = setConfig(state, id, 'double'); // exposes only circuit 1
    expect(roomUsage(state, 'Attic')).toBe(0);
    expect(knownLabels(state)).not.toContain('Hidden fan');
  });

  it('allows a width change only when the slot below is free', () => {
    let state = placeBreaker(emptyPanel(), 'single', 1);
    state = placeBreaker(state, 'single', 3);
    const first = state.breakers[0].id;
    expect(setConfig(state, first, 'double')).toBe(state); // slot 3 is taken

    state = removeBreaker(state, state.breakers[1].id);
    state = setConfig(state, first, 'double');
    expect(state.breakers[0].config).toBe('double');
    expect(occupiedSlots(state.breakers[0])).toEqual([1, 3]);
  });
});

describe('rooms', () => {
  it('does not register a room while it is still being typed', () => {
    // Typing "Family" one keystroke at a time must not file six partial rooms.
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    for (const partial of ['F', 'Fa', 'Fam', 'Fami', 'Famil', 'Family']) {
      state = setCircuitRoom(state, id, 0, partial);
    }
    expect(state.rooms).toEqual([]);
    expect(state.breakers[0].circuits[0].room).toBe('Family');

    state = commitCircuitRoom(state, id, 0, 'Family');
    expect(state.rooms).toEqual(['Family']);
  });

  it('registers a room once it is committed, and reuses it', () => {
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    state = commitCircuitRoom(state, id, 0, 'Family');
    expect(state.rooms).toEqual(['Family']);
    expect(state.breakers[0].circuits[0].room).toBe('Family');

    // Reusing it on another circuit must not duplicate the room.
    state = commitCircuitRoom(state, id, 1, 'Family');
    expect(state.rooms).toEqual(['Family']);
    expect(roomUsage(state, 'Family')).toBe(2);
  });

  it('stores the trimmed name so the room list and the circuit agree', () => {
    let state = placeBreaker(emptyPanel(), 'single', 1);
    const id = state.breakers[0].id;
    state = commitCircuitRoom(state, id, 0, '  Kitchen  ');
    expect(state.rooms).toEqual(['Kitchen']);
    expect(state.breakers[0].circuits[0].room).toBe('Kitchen');
    expect(roomUsage(state, 'Kitchen')).toBe(1);
    expect(roomColor(state, state.breakers[0].circuits[0].room)).not.toBeNull();
  });

  it('supports pre-adding a room before any circuit uses it', () => {
    let state = addRoom(emptyPanel(), 'Garage');
    expect(state.rooms).toEqual(['Garage']);
    expect(roomUsage(state, 'Garage')).toBe(0);
    state = addRoom(state, '  Garage  '); // trimmed duplicate
    expect(state.rooms).toEqual(['Garage']);
    expect(addRoom(state, '   ')).toBe(state);
  });

  it('caps the room list at what a share link can carry', () => {
    let state = emptyPanel();
    for (let i = 0; i < MAX_ROOMS + 40; i++) state = addRoom(state, `Room ${i}`);
    expect(state.rooms).toHaveLength(MAX_ROOMS);
    expect(state.rooms[MAX_ROOMS - 1]).toBe(`Room ${MAX_ROOMS - 1}`);
  });

  it('renames a room across every circuit using it', () => {
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    state = commitCircuitRoom(state, id, 0, 'Family');
    state = commitCircuitRoom(state, id, 1, 'Family');
    state = renameRoom(state, 'Family', 'Living');
    expect(state.rooms).toEqual(['Living']);
    expect(state.breakers[0].circuits.every((c) => c.room === 'Living')).toBe(true);
  });

  it('clears a removed room from its circuits', () => {
    let state = placeBreaker(emptyPanel(), 'tandem', 1);
    const id = state.breakers[0].id;
    state = commitCircuitRoom(state, id, 0, 'Family');
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
    state = placeBreaker(state, 'double-4x120', 4); // 4 circuits, shared, 2 slots
    state = placeBreaker(state, 'double-2x120', 7); // 2 circuits, both monitored

    expect(summarize(state)).toEqual({
      breakers: 5,
      circuits: 10,
      monitoredCircuits: 4,
      usedSlots: 8,
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
