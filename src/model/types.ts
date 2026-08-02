/**
 * A breaker is one of two physical widths — it occupies either one slot or two
 * adjacent slots in the same column. What varies within a width is the number
 * of throws (switch positions) on it, and whether each throw is one pole (120V)
 * or two poles bridged for 240V.
 */
export type BreakerConfig =
  | 'single'
  | 'tandem'
  | 'double'
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
  v: 2;
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
  single: { label: 'Single pole — 1 × 120V', short: 'Single', slots: 1, throws: [P1] },
  tandem: { label: 'Tandem — 2 × 120V', short: 'Tandem', slots: 1, throws: [P1, P1] },
  double: { label: 'Double pole — 1 × 240V', short: 'Double', slots: 2, throws: [P2] },
  'double-2x240': { label: 'Double — 2 × 240V', short: '2 × 240V', slots: 2, throws: [P2, P2] },
  'double-240-2x120': {
    label: 'Double — 1 × 240V + 2 × 120V',
    short: '240V + 2 × 120V',
    slots: 2,
    // The two 240V poles sit in the middle, with a 120V throw above and below,
    // which is how a real quad breaker is built.
    throws: [P1, P2, P1],
  },
  'double-4x120': { label: 'Quad — 4 × 120V', short: 'Quad', slots: 2, throws: [P1, P1, P1, P1] },
};

export const ALL_CONFIGS: BreakerConfig[] = [
  'single',
  'tandem',
  'double',
  'double-2x240',
  'double-240-2x120',
  'double-4x120',
];

/** The four the palette offers; every other arrangement is a config change. */
export const PALETTE_CONFIGS: BreakerConfig[] = ['single', 'tandem', 'double', 'double-4x120'];

export const SLOT_COUNT = 48;
/** Slots per column: left column is 1..24, right column is 25..48. */
export const COLUMN_SIZE = 24;
export const ROWS = COLUMN_SIZE;

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
