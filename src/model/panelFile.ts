import {
  addRoom,
  canPlace,
  circuitCount,
  emptyPanel,
  newId,
  visibleCircuits,
} from './panel';
import {
  BreakerConfig,
  CircuitLabel,
  MAX_ROOMS,
  PANEL_VERSION,
  PanelState,
} from './types';

/**
 * The names breakers go by in an exported file. Deliberately the names shown in
 * the app rather than the internal ids or the URL's short codes: this file is
 * meant to be read and hand-edited.
 */
export const FILE_NAME_BY_CONFIG: Record<BreakerConfig, string> = {
  single: 'single',
  tandem: 'tandem',
  double: 'double',
  'double-2x120': '2x120',
  'double-2x240': '2x240',
  'double-240-2x120': '240+2x120',
  'double-4x120': 'quad',
};

/**
 * A Map, not an object: indexing a plain object with a name like "constructor"
 * or "__proto__" walks the prototype chain and answers with a function, which
 * sails past a truthiness check and then explodes deeper in.
 */
const CONFIG_BY_FILE_NAME = new Map<string, BreakerConfig>(
  Object.entries(FILE_NAME_BY_CONFIG).map(([config, name]) => [name, config as BreakerConfig]),
);

/** Generous next to a 48-slot panel; stops a huge file pinning the main thread. */
const MAX_FILE_ENTRIES = 500;
const MAX_LABEL_LENGTH = 200;

/** Both fields are optional: an empty one is simply left out of the file. */
export interface FileCircuit {
  room?: string;
  label?: string;
}

export interface FileBreaker {
  breaker: string;
  /** Omitted entirely when every circuit on the breaker is blank. */
  circuits?: FileCircuit[];
}

/** Keyed by the breaker's topmost slot, so a two-slot breaker appears once. */
export interface PanelFile {
  version: number;
  name: string;
  rooms: string[];
  breakers: Record<string, FileBreaker>;
}

export function toPanelFile(state: PanelState): PanelFile {
  const breakers: Record<string, FileBreaker> = {};
  for (const breaker of [...state.breakers].sort((a, b) => a.slot - b.slot)) {
    // Only the circuits the arrangement currently exposes. A file listing four
    // circuits for a one-circuit breaker would read as a different panel.
    const circuits = visibleCircuits(breaker).map((c): FileCircuit => {
      const entry: FileCircuit = {};
      if (c.room) entry.room = c.room;
      if (c.label) entry.label = c.label;
      return entry;
    });
    const entry: FileBreaker = { breaker: FILE_NAME_BY_CONFIG[breaker.config] };
    // Blank circuits carry no information and would triple the file's length.
    if (circuits.some((c) => c.room || c.label)) entry.circuits = circuits;
    breakers[String(breaker.slot)] = entry;
  }
  return {
    version: PANEL_VERSION,
    name: state.name,
    rooms: [...state.rooms],
    breakers,
  };
}

/**
 * How wide a breaker line may get before its circuits go one per line. Set so a
 * one- or two-circuit breaker stays on a single line, which is the common case,
 * while a fully labelled quad wraps rather than running to 250 characters.
 */
const WRAP_AT = 140;

/**
 * Written by hand rather than by JSON.stringify's indenter, which puts every
 * circuit on four lines and makes a full panel a six-hundred-line file. One
 * breaker per line reads like the panel it describes. Every string still goes
 * through JSON.stringify, so escaping is exactly as correct as before.
 */
export function serializePanelFile(state: PanelState): string {
  const file = toPanelFile(state);
  const circuitText = (c: FileCircuit) =>
    `{ ${Object.entries(c)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(', ')} }`;

  const lines = [
    '{',
    `  "version": ${file.version},`,
    `  "name": ${JSON.stringify(file.name)},`,
    `  "rooms": [${file.rooms.map((r) => JSON.stringify(r)).join(', ')}],`,
    '  "breakers": {',
  ];

  const slots = Object.keys(file.breakers);
  if (slots.length === 0) {
    lines[lines.length - 1] = '  "breakers": {}';
    return `${lines.join('\n')}\n}\n`;
  }
  slots.forEach((slot, i) => {
    const entry = file.breakers[slot];
    const comma = i === slots.length - 1 ? '' : ',';
    const head = `    ${JSON.stringify(slot)}: { "breaker": ${JSON.stringify(entry.breaker)}`;
    if (!entry.circuits) {
      lines.push(`${head} }${comma}`);
      return;
    }
    const inline = `${head}, "circuits": [${entry.circuits.map(circuitText).join(', ')}] }${comma}`;
    if (inline.length <= WRAP_AT) {
      lines.push(inline);
      return;
    }
    lines.push(`${head},`);
    lines.push('      "circuits": [');
    entry.circuits.forEach((c, j) => {
      lines.push(`        ${circuitText(c)}${j === entry.circuits!.length - 1 ? '' : ','}`);
    });
    lines.push('      ]');
    lines.push(`    }${comma}`);
  });

  lines.push('  }', '}');
  return `${lines.join('\n')}\n`;
}

export type ImportResult =
  | { ok: true; state: PanelState; dropped: number }
  | { ok: false; reason: string };

function readCircuits(raw: unknown, config: BreakerConfig): CircuitLabel[] {
  const entries = Array.isArray(raw) ? raw : [];
  return Array.from({ length: circuitCount(config) }, (_, i): CircuitLabel => {
    const entry = entries[i];
    if (typeof entry !== 'object' || entry === null) return { room: '', label: '' };
    const { room, label } = entry as Partial<FileCircuit>;
    return {
      room: typeof room === 'string' ? room.trim().slice(0, MAX_LABEL_LENGTH) : '',
      // Not trimmed: the app lets a label keep its spacing, and trimming here
      // would make a round trip through the file quietly change it.
      label: typeof label === 'string' ? label.slice(0, MAX_LABEL_LENGTH) : '',
    };
  });
}

/**
 * Build a panel from a parsed file. Unlike the URL codec this reports what it
 * threw away: a person wrote this file by hand, so silently dropping their typo
 * would leave them staring at a missing breaker with no idea why.
 */
export function fromPanelFile(raw: unknown): ImportResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'That file does not look like a panel export' };
  }
  const file = raw as Partial<PanelFile>;

  if (file.version !== PANEL_VERSION) {
    const found = typeof file.version === 'number' ? `version ${file.version}` : 'no version';
    return { ok: false, reason: `That file has ${found}; this app reads version ${PANEL_VERSION}` };
  }
  if (typeof file.breakers !== 'object' || file.breakers === null || Array.isArray(file.breakers)) {
    return { ok: false, reason: 'That file has no breakers section' };
  }

  let state: PanelState = {
    ...emptyPanel(),
    name: typeof file.name === 'string' ? file.name : emptyPanel().name,
  };
  if (Array.isArray(file.rooms)) {
    for (const room of file.rooms.slice(0, MAX_ROOMS)) {
      if (typeof room === 'string') state = addRoom(state, room);
    }
  }

  const allEntries = Object.entries(file.breakers);
  // Anything past the cap is skipped too, and has to be counted or the toast
  // under-reports and breakers vanish with no accounting at all.
  let dropped = Math.max(0, allEntries.length - MAX_FILE_ENTRIES);
  const entries = allEntries.slice(0, MAX_FILE_ENTRIES);
  // Ascending slot order so a collision blames the later breaker, which is the
  // one a reader would expect to lose.
  entries.sort((a, b) => Number(a[0]) - Number(b[0]));

  for (const [key, value] of entries) {
    // Plain decimal only. Number() would take "0x3", "1e1", " 2" and "1.0",
    // which are different JSON keys that would land on the same slot.
    const slot = /^(?:0|[1-9]\d*)$/.test(key) ? Number(key) : NaN;
    if (typeof value !== 'object' || value === null) {
      dropped += 1;
      continue;
    }
    const name = (value as Partial<FileBreaker>).breaker;
    const config = typeof name === 'string' ? CONFIG_BY_FILE_NAME.get(name.trim()) : undefined;
    if (!config || !Number.isInteger(slot) || !canPlace(state, config, slot)) {
      dropped += 1;
      continue;
    }

    const circuits = readCircuits((value as Partial<FileBreaker>).circuits, config);
    // A hand-written file may name a room without listing it up top; keep it
    // rather than leaving the circuit pointing at a room the panel disowns.
    for (const circuit of circuits) state = addRoom(state, circuit.room);

    state = {
      ...state,
      breakers: [...state.breakers, { id: newId(), config, slot, circuits }],
    };
  }

  return { ok: true, state, dropped };
}

export function parsePanelFile(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not valid JSON' };
  }
  return fromPanelFile(raw);
}
