import { describe, expect, it } from 'vitest';
import {
  addRoom,
  commitCircuitRoom,
  emptyPanel,
  placeBreaker,
  setCircuitLabel,
  setConfig,
  setName,
  visibleCircuits,
} from './panel';
import {
  FILE_NAME_BY_CONFIG,
  fromPanelFile,
  parsePanelFile,
  serializePanelFile,
  toPanelFile,
} from './panelFile';
import { ALL_CONFIGS, PANEL_VERSION } from './types';

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
