/**
 * A breaker is one of two physical widths — it occupies either one slot or two
 * vertically adjacent slots in the same column. What varies within a width is
 * the number of throws (switch positions) on it, and whether each throw is one
 * pole (120V) or two poles bridged for 240V.
 */
export type BreakerConfig =
  | 'single'
  | 'tandem'
  | 'double'
  | 'double-2x120'
  | 'double-2x240'
  | 'double-240-2x120'
  | 'double-4x120';

export interface ThrowDef {
  poles: 1 | 2;
  voltage: 120 | 240;
}

/** What the user writes on a circuit: which room it serves, and what it feeds. */
export interface CircuitLabel {
  room: string;
  label: string;
}

export interface Breaker {
  id: string;
  config: BreakerConfig;
  /** Topmost slot this breaker occupies. */
  slot: number;
  /** One entry per throw, in order from the top of the breaker. */
  circuits: CircuitLabel[];
}

export interface PanelState {
  v: 4;
  name: string;
  /** Room list in insertion order; also fixes each room's colour. */
  rooms: string[];
  breakers: Breaker[];
}

export interface ConfigDef {
  label: string;
  short: string;
  slots: 1 | 2;
  throws: ThrowDef[];
}

const P1: ThrowDef = { poles: 1, voltage: 120 };
const P2: ThrowDef = { poles: 2, voltage: 240 };

export const CONFIGS: Record<BreakerConfig, ConfigDef> = {
  single: { label: 'Single — 1 × 120V', short: 'Single', slots: 1, throws: [P1] },
  tandem: { label: 'Tandem — 2 × 120V', short: 'Tandem', slots: 1, throws: [P1, P1] },
  double: { label: 'Double — 1 × 240V', short: 'Double', slots: 2, throws: [P2] },
  'double-2x120': { label: '2 × 120 — two 120V throws', short: '2 × 120', slots: 2, throws: [P1, P1] },
  'double-2x240': { label: '2 × 240 — two 240V throws', short: '2 × 240', slots: 2, throws: [P2, P2] },
  'double-240-2x120': {
    label: '1 × 240, 2 × 120',
    short: '1 × 240, 2 × 120',
    slots: 2,
    // The 240V throw is listed first so it reads in the same order as the name.
    throws: [P2, P1, P1],
  },
  'double-4x120': {
    label: 'Quad — 4 × 120V',
    short: 'Quad',
    slots: 2,
    throws: [P1, P1, P1, P1],
  },
};

/**
 * Which throw sits on each pole position, top to bottom, for the arrangements
 * whose throws are not simply stacked in order. A four-pole breaker ties its
 * *outer* poles (1 and 4) together and nests the remaining throws between
 * them, so a 240V throw can span two non-adjacent positions.
 *
 * This is a drawing concern only — the editor never needs to know which pole a
 * throw lands on. Anything absent here is stacked in throw order.
 */
export const POLE_LAYOUT: Partial<Record<BreakerConfig, number[]>> = {
  // outer pair = throw 0 (240V), inner pair = throw 1 (240V)
  'double-2x240': [0, 1, 1, 0],
  // outer pair = throw 0 (240V), inner poles = throws 1 and 2 (120V each)
  'double-240-2x120': [0, 1, 2, 0],
};

export const ALL_CONFIGS: BreakerConfig[] = [
  'single',
  'tandem',
  'double',
  'double-2x120',
  'double-2x240',
  'double-240-2x120',
  'double-4x120',
];

/** The four the palette offers up front — the ones reached in a single tap. */
export const PALETTE_CONFIGS: BreakerConfig[] = ['single', 'tandem', 'double', 'double-4x120'];

/** The rarer arrangements, one tap further in behind the palette's More button. */
export const OVERFLOW_CONFIGS: BreakerConfig[] = [
  'double-2x120',
  'double-2x240',
  'double-240-2x120',
];

export const SLOT_COUNT = 48;
/**
 * Slots alternate across the panel face: odd numbers run down the left column,
 * even numbers down the right, so each row holds slot 2r-1 and 2r.
 */
export const ROWS = SLOT_COUNT / 2;

/** Suggested circuit labels; the field still accepts anything typed. */
export const DEFAULT_LABELS = [
  'Lights',
  'Plugs',
  'AC',
  'Pool',
  'Dryer',
  'Range',
  'Oven',
  'Microwave',
  'Dishwasher',
  'Disposal',
  'Fridge',
  'Washer',
  'Water heater',
  'Furnace',
  'EV charger',
  'Well pump',
  'Sub panel',
  'Smoke alarms',
];

/** Room colours, indexed by position in PanelState.rooms. */
export const ROOM_COLORS_DARK = [
  '#60a5fa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#a3e635',
];

/** Same hues, darkened for the white export background. */
export const ROOM_COLORS_LIGHT = [
  '#1d4ed8',
  '#be185d',
  '#047857',
  '#b45309',
  '#6d28d9',
  '#be123c',
  '#0e7490',
  '#4d7c0f',
];

/** No breaker exposes more than four throws, so nothing needs more circuits. */
export const MAX_CIRCUITS = 4;

/**
 * Every slot could hold a breaker carrying MAX_CIRCUITS circuits, each naming a
 * different room, so this is the most a panel can legitimately reference. The
 * encoder and decoder share the cap so a shared link can never carry rooms the
 * far side would throw away.
 */
export const MAX_ROOMS = SLOT_COUNT * MAX_CIRCUITS;
