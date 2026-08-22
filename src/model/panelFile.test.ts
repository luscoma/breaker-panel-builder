import { describe, expect, it } from 'vitest';
import {
  addRoom,
  commitCircuitRoom,
  emptyPanel,
  placeBreaker,
  setCircuitLabel,
  setConfig,
  setName,
  stageNewBreaker,
  visibleCircuits,
} from './panel';
import {
  FILE_NAME_BY_CONFIG,
  fromPanelFile,
  parsePanelFile,
  serializePanelFile,
  toPanelFile,
} from './panelFile';
import { ALL_CONFIGS, MAX_STAGING, PANEL_VERSION } from './types';

/** Mirrors the serializer's wrap threshold. */
const WRAP_AT_LIMIT = 140;

function sample() {
  let state = setName(emptyPanel(), 'Lusco House');
  state = placeBreaker(state, 'single', 1);
  state = commitCircuitRoom(state, state.breakers[0].id, 0, 'Family');
  state = setCircuitLabel(state, state.breakers[0].id, 0, 'Lights');

  state = placeBreaker(state, 'tandem', 2);
  const tandem = state.breakers[1].id;
  state = commitCircuitRoom(state, tandem, 0, 'Family');
  state = setCircuitLabel(state, tandem, 0, 'Plugs');
  state = commitCircuitRoom(state, tandem, 1, 'Kitchen');
  state = setCircuitLabel(state, tandem, 1, 'Disposal');

  state = placeBreaker(state, 'double-240-2x120', 3);
  state = placeBreaker(state, 'double-4x120', 6);
  state = addRoom(state, 'Garage'); // pre-added, unused
  return state;
}

describe('the exported file', () => {
  it('is keyed by slot, with the shape a person would write by hand', () => {
    const file = toPanelFile(sample());
    expect(file.version).toBe(PANEL_VERSION);
    expect(file.name).toBe('Lusco House');
    expect(file.rooms).toEqual(['Family', 'Kitchen', 'Garage']);
    expect(file.breakers['1']).toEqual({
      breaker: 'single',
      circuits: [{ room: 'Family', label: 'Lights' }],
    });
    expect(file.breakers['2'].breaker).toBe('tandem');
    expect(file.breakers['2'].circuits).toHaveLength(2);
    // An empty field is left out rather than written as "".
    expect(file.breakers['2'].circuits![0]).toEqual({ room: 'Family', label: 'Plugs' });
    // A two-slot breaker appears once, under its topmost slot.
    expect(file.breakers['3'].breaker).toBe('240+2x120');
    expect(file.breakers['5']).toBeUndefined();
  });

  it('names breakers the way the app does, not by internal id', () => {
    expect(Object.values(FILE_NAME_BY_CONFIG)).toEqual([
      'single',
      'tandem',
      'double',
      '2x120',
      '2x240',
      '240+2x120',
      'quad',
    ]);
    // Every arrangement must be nameable or exporting would silently lose it.
    for (const config of ALL_CONFIGS) expect(FILE_NAME_BY_CONFIG[config]).toBeTruthy();
    expect(new Set(Object.values(FILE_NAME_BY_CONFIG)).size).toBe(ALL_CONFIGS.length);
  });

  it('omits the circuits list entirely when nothing on the breaker is labelled', () => {
    // Two unlabelled breakers in the sample: the quad and the 240+2x120.
    const file = toPanelFile(sample());
    expect(file.breakers['3']).toEqual({ breaker: '240+2x120' });
    expect(file.breakers['6']).toEqual({ breaker: 'quad' });
  });

  it('gives one circuit entry per visible throw once any is labelled', () => {
    let state = placeBreaker(emptyPanel(), 'double-240-2x120', 1);
    state = setCircuitLabel(state, state.breakers[0].id, 1, 'Range');
    const file = toPanelFile(state);
    expect(file.breakers['1'].circuits).toEqual([{}, { label: 'Range' }, {}]);
  });

  it('writes one breaker per line, in slot order', () => {
    const text = serializePanelFile(sample());
    expect(text).toContain('  "version": 5,');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('"3": { "breaker": "240+2x120" }');
    expect(text).toContain('"1": { "breaker": "single", "circuits": [{ "room": "Family"');

    const order = [...text.matchAll(/^\s{4}"(\d+)":/gm)].map((m) => Number(m[1]));
    expect(order).toEqual([1, 2, 3, 6]);
    // A full panel must stay readable, not run to hundreds of lines.
    expect(text.split('\n').length).toBeLessThan(13);
  });

  it('stays valid JSON, and survives text that needs escaping', () => {
    let state = setName(emptyPanel(), 'He said "hi"\\ok');
    state = placeBreaker(state, 'single', 1);
    state = commitCircuitRoom(state, state.breakers[0].id, 0, 'Ünïcødé 🔌');
    state = setCircuitLabel(state, state.breakers[0].id, 0, 'a"b\\c\\nd');
    const text = serializePanelFile(state);
    expect(() => JSON.parse(text)).not.toThrow();
    const round = parsePanelFile(text);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.name).toBe(state.name);
    expect(round.state.breakers[0].circuits[0]).toEqual(state.breakers[0].circuits[0]);
  });

  it('wraps a breaker whose circuits would make an over-long line', () => {
    let state = placeBreaker(emptyPanel(), 'double-4x120', 1);
    const id = state.breakers[0].id;
    for (let i = 0; i < 4; i++) {
      state = commitCircuitRoom(state, id, i, `Room number ${i + 1}`);
      state = setCircuitLabel(state, id, i, `A fairly long circuit label ${i + 1}`);
    }
    const lines = serializePanelFile(state).split('\n');
    expect(lines.some((l) => l.trim() === '"circuits": [')).toBe(true);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(WRAP_AT_LIMIT);
  });
});

describe('importing a file', () => {
  it('round-trips a panel', () => {
    const state = sample();
    const result = parsePanelFile(serializePanelFile(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toBe(0);
    expect(result.state.name).toBe(state.name);
    expect(result.state.rooms).toEqual(state.rooms);
    expect(result.state.breakers.map((b) => [b.config, b.slot, visibleCircuits(b)])).toEqual(
      state.breakers.map((b) => [b.config, b.slot, visibleCircuits(b)]),
    );
  });

  it('reads a minimal hand-written file', () => {
    const result = parsePanelFile(
      JSON.stringify({
        version: PANEL_VERSION,
        breakers: { '7': { breaker: 'quad', circuits: [{ room: 'Shop', label: 'Bench' }] } },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.breakers[0].config).toBe('double-4x120');
    // Circuits are padded to the arrangement's throw count.
    expect(result.state.breakers[0].circuits).toHaveLength(4);
    // A room named only on a circuit still joins the room list.
    expect(result.state.rooms).toEqual(['Shop']);
  });

  it('refuses a file it cannot trust, changing nothing', () => {
    expect(parsePanelFile('not json')).toEqual({ ok: false, reason: 'That file is not valid JSON' });
    expect(parsePanelFile('[]').ok).toBe(false);
    expect(parsePanelFile('"hello"').ok).toBe(false);

    const wrongVersion = parsePanelFile(JSON.stringify({ version: 4, breakers: {} }));
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.reason).toContain('version 4');

    const noVersion = parsePanelFile(JSON.stringify({ breakers: {} }));
    expect(noVersion.ok).toBe(false);
    if (!noVersion.ok) expect(noVersion.reason).toContain('no version');

    const noBreakers = parsePanelFile(JSON.stringify({ version: PANEL_VERSION }));
    expect(noBreakers.ok).toBe(false);
  });

  it('reports hand-edit mistakes rather than dropping them silently', () => {
    const result = parsePanelFile(
      JSON.stringify({
        version: PANEL_VERSION,
        breakers: {
          '1': { breaker: 'single', circuits: [] }, // fine
          '47': { breaker: 'double', circuits: [] }, // would need slot 49
          '99': { breaker: 'single', circuits: [] }, // off the panel
          '10': { breaker: 'triple', circuits: [] }, // no such breaker
          '12': 'nonsense', // not an object
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.breakers).toHaveLength(1);
    expect(result.dropped).toBe(4);
  });

  it('drops the later breaker when two overlap', () => {
    const result = parsePanelFile(
      JSON.stringify({
        version: PANEL_VERSION,
        breakers: {
          '1': { breaker: 'double', circuits: [] }, // occupies 1 and 3
          '3': { breaker: 'single', circuits: [] }, // collides
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.breakers.map((b) => b.slot)).toEqual([1]);
    expect(result.dropped).toBe(1);
  });

  it('gives imported breakers unique ids', () => {
    const text = serializePanelFile(sample());
    const a = parsePanelFile(text);
    const b = parsePanelFile(text);
    if (!a.ok || !b.ok) throw new Error('expected both imports to succeed');
    const ids = [...a.state.breakers, ...b.state.breakers].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exports only the circuits the arrangement shows', () => {
    // Shrinking keeps hidden labels in memory; the file is what you can see.
    let state = placeBreaker(emptyPanel(), 'double-4x120', 1);
    const id = state.breakers[0].id;
    for (let i = 0; i < 4; i++) state = setCircuitLabel(state, id, i, `L${i + 1}`);
    state = setConfig(state, id, 'double');

    const file = toPanelFile(state);
    expect(file.breakers['1'].circuits).toEqual([{ label: 'L1' }]);
  });

  it('tolerates junk inside an otherwise good breaker', () => {
    const result = parsePanelFile(
      JSON.stringify({
        version: PANEL_VERSION,
        name: 42,
        rooms: ['Ok', 7, null],
        breakers: {
          '1': { breaker: ' single ', circuits: [{ room: 5, label: null }, 'x'] },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.name).toBe('Main Panel'); // fell back
    expect(result.state.rooms).toEqual(['Ok']);
    expect(result.state.breakers[0].config).toBe('single'); // whitespace trimmed
    expect(result.state.breakers[0].circuits[0]).toEqual({ room: '', label: '' });
  });

  it('imports the example from docs/panel-file-format.md verbatim', () => {
    // Kept identical to the doc so a spec an agent generates against cannot
    // drift away from what the importer actually accepts.
    const result = parsePanelFile(`{
  "version": 5,
  "name": "Lusco House",
  "rooms": ["Family", "Kitchen", "Garage"],
  "breakers": {
    "1": { "breaker": "single", "circuits": [{ "room": "Family", "label": "Lights" }] },
    "2": { "breaker": "tandem", "circuits": [{ "room": "Family", "label": "Plugs" }, { "room": "Kitchen", "label": "Disposal" }] },
    "3": { "breaker": "240+2x120", "circuits": [{ "label": "Bath" }, { "room": "Kitchen", "label": "Range" }, {}] },
    "6": { "breaker": "quad" },
    "12": { "breaker": "double", "circuits": [{ "room": "Garage", "label": "EV charger" }] }
  },
  "staging": [
    { "breaker": "quad", "circuits": [{ "room": "Garage", "label": "Freezer" }, {}, {}, {}] },
    { "breaker": "single" }
  ]
}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toBe(0);
    expect(result.state.name).toBe('Lusco House');
    expect(result.state.rooms).toEqual(['Family', 'Kitchen', 'Garage']);
    expect(result.state.breakers.map((b) => [b.slot, b.config])).toEqual([
      [1, 'single'],
      [2, 'tandem'],
      [3, 'double-240-2x120'],
      [6, 'double-4x120'],
      [12, 'double'],
    ]);
    // The doc says index 1 of a 240+2x120 is the 240V circuit.
    expect(result.state.breakers[2].circuits[1]).toEqual({ room: 'Kitchen', label: 'Range' });
    // And that staging is a list of the same entries, minus any slot.
    expect(result.state.staging.map((b) => b.config)).toEqual(['double-4x120', 'single']);
    expect(result.state.staging[0].circuits[0]).toEqual({ room: 'Garage', label: 'Freezer' });
    // And that the smallest valid file is accepted.
    const minimal = parsePanelFile('{ "version": 5, "breakers": {} }');
    expect(minimal.ok && minimal.state.breakers).toEqual([]);
  });

  it('refuses a breaker name that collides with Object.prototype', () => {
    // Indexing a plain object with these returns a function, which would sail
    // past a truthiness check and then throw deeper in with no toast at all.
    for (const name of [
      'constructor',
      '__proto__',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
    ]) {
      const result = fromPanelFile({
        version: PANEL_VERSION,
        breakers: { '1': { breaker: name } },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.breakers).toHaveLength(0);
      expect(result.dropped).toBe(1);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps a blank panel name, the way a shared link does', () => {
    for (const name of ['', '   ']) {
      const state = setName(emptyPanel(), name);
      const result = parsePanelFile(serializePanelFile(state));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.name).toBe(name);
    }
  });

  it('accepts only plain decimal slot keys', () => {
    // Number() would take all of these, and "1" / "1.0" / "01" are distinct
    // JSON keys that would collapse onto one slot and look like a collision.
    for (const key of ['0x3', '0b11', '1e1', ' 2', '4 ', '\n5', '+3', '01', '1.0', '1.5', '-1']) {
      const result = fromPanelFile({
        version: PANEL_VERSION,
        breakers: { [key]: { breaker: 'single' } },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.breakers, `key ${JSON.stringify(key)}`).toHaveLength(0);
    }
    // Plain decimals still work.
    const good = fromPanelFile({ version: PANEL_VERSION, breakers: { '7': { breaker: 'single' } } });
    expect(good.ok && good.state.breakers[0].slot).toBe(7);
  });

  it('counts entries dropped for exceeding the file cap', () => {
    const breakers: Record<string, unknown> = {};
    for (let i = 1; i <= 600; i++) breakers[String(i)] = { breaker: 'single' };
    const result = fromPanelFile({ version: PANEL_VERSION, breakers });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Every entry is accounted for: placed + dropped == what the file held.
    expect(result.state.breakers.length + result.dropped).toBe(600);
  });

  it('writes an empty panel tidily', () => {
    const text = serializePanelFile(emptyPanel());
    expect(text).toContain('"breakers": {}');
    expect(() => JSON.parse(text)).not.toThrow();
    const back = parsePanelFile(text);
    expect(back.ok && back.state.breakers).toEqual([]);
  });

  it('caps an absurd room name as well as an absurd label', () => {
    const result = fromPanelFile({
      version: PANEL_VERSION,
      breakers: {
        '1': { breaker: 'single', circuits: [{ room: 'r'.repeat(9000), label: 'l'.repeat(9000) }] },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const circuit = result.state.breakers[0].circuits[0];
    expect(circuit.room.length).toBeLessThanOrEqual(200);
    expect(circuit.label.length).toBeLessThanOrEqual(200);
  });

  it('caps an absurd label and an absurd number of entries', () => {
    const breakers: Record<string, unknown> = {};
    for (let i = 1; i <= 2000; i++) {
      breakers[String(i)] = { breaker: 'single', circuits: [{ room: '', label: 'x'.repeat(9000) }] };
    }
    const result = fromPanelFile({ version: PANEL_VERSION, breakers });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.breakers.length).toBeLessThanOrEqual(48);
    expect(result.state.breakers[0].circuits[0].label.length).toBeLessThanOrEqual(200);
  });
});

describe('staging in the panel file', () => {
  function withStaging() {
    let state = sample();
    state = stageNewBreaker(state, 'double-4x120');
    state = stageNewBreaker(state, 'single');
    state = {
      ...state,
      staging: [
        { ...state.staging[0], circuits: [
          { room: 'Garage', label: 'EV charger' },
          { room: '', label: '' },
          { room: '', label: '' },
          { room: '', label: '' },
        ] },
        state.staging[1],
      ],
    };
    return state;
  }

  it('writes staging as a list, since a staged breaker has no slot', () => {
    const file = toPanelFile(withStaging());
    expect(file.staging).toEqual([
      {
        breaker: 'quad',
        circuits: [
          { room: 'Garage', label: 'EV charger' },
          {},
          {},
          {},
        ],
      },
      { breaker: 'single' },
    ]);
  });

  it('omits staging entirely when nothing is set aside', () => {
    expect(toPanelFile(sample())).not.toHaveProperty('staging');
    expect(serializePanelFile(sample())).not.toContain('staging');
  });

  it('stays valid JSON with staging present', () => {
    const text = serializePanelFile(withStaging());
    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(toPanelFile(withStaging()))));
  });

  it('stays valid JSON with staging but no placed breakers', () => {
    // The breakers block collapses to {} here, and still needs its comma.
    const state = stageNewBreaker(emptyPanel(), 'tandem');
    const text = serializePanelFile(state);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text).breakers).toEqual({});
    expect(JSON.parse(text).staging).toEqual([{ breaker: 'tandem' }]);
  });

  it('round-trips a panel with staging', () => {
    const state = withStaging();
    const result = parsePanelFile(serializePanelFile(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toBe(0);
    expect(result.state.staging.map((b) => b.config)).toEqual(['double-4x120', 'single']);
    expect(result.state.staging[0].circuits[0]).toEqual({ room: 'Garage', label: 'EV charger' });
  });

  it('imports a file with no staging key as empty staging', () => {
    const result = fromPanelFile({ version: PANEL_VERSION, breakers: { '1': { breaker: 'single' } } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.staging).toEqual([]);
  });

  it('picks up a room named only by a staged circuit', () => {
    const result = fromPanelFile({
      version: PANEL_VERSION,
      breakers: {},
      staging: [{ breaker: 'single', circuits: [{ room: 'Attic', label: 'Fan' }] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.rooms).toEqual(['Attic']);
  });

  it('skips and counts unusable staging entries rather than dropping them silently', () => {
    const result = fromPanelFile({
      version: PANEL_VERSION,
      breakers: {},
      staging: [{ breaker: 'nonsense' }, null, 'quad', { breaker: 'quad' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.staging).toHaveLength(1);
    expect(result.dropped).toBe(3);
  });

  it('refuses a prototype-chain breaker name in staging', () => {
    for (const breaker of ['constructor', '__proto__', 'toString']) {
      const result = fromPanelFile({ version: PANEL_VERSION, breakers: {}, staging: [{ breaker }] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.staging).toEqual([]);
    }
  });

  it('ignores a staging value that is not an array', () => {
    const result = fromPanelFile({ version: PANEL_VERSION, breakers: {}, staging: 'quad' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.staging).toEqual([]);
    expect(result.dropped).toBe(0);
  });

  it('caps staging on import and counts the overflow', () => {
    const result = fromPanelFile({
      version: PANEL_VERSION,
      breakers: {},
      staging: Array.from({ length: MAX_STAGING + 5 }, () => ({ breaker: 'single' })),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.staging).toHaveLength(MAX_STAGING);
    expect(result.dropped).toBe(5);
  });

  it('gives every imported breaker a distinct id across panel and staging', () => {
    const result = fromPanelFile({
      version: PANEL_VERSION,
      breakers: { '1': { breaker: 'single' }, '2': { breaker: 'single' } },
      staging: [{ breaker: 'single' }, { breaker: 'single' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = [...result.state.breakers, ...result.state.staging].map((b) => b.id);
    expect(new Set(ids).size).toBe(4);
  });
});
