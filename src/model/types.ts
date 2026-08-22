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

/**
 * A breaker that exists but is not in the panel — it sits in staging while the
 * layout is rearranged. Identical to a placed breaker minus its slot, so every
 * placement and monitoring rule applies unchanged once it lands.
 */
export interface StagedBreaker {
  id: string;
  config: BreakerConfig;
  /** One entry per throw, in order from the top of the breaker. */
  circuits: CircuitLabel[];
}

export interface Breaker extends StagedBreaker {
  /** Topmost slot this breaker occupies. */
  slot: number;
}

/**
 * What a slot number and a breaker's throw order mean. Bump it whenever either
 * changes, or a saved link or file will quietly describe a different panel.
 * Shared by the URL codec and the JSON file format.
 */
export const PANEL_VERSION = 5;

export interface PanelState {
  v: typeof PANEL_VERSION;
  name: string;
  /** Room list in insertion order; also fixes each room's colour. */
  rooms: string[];
  breakers: Breaker[];
  /** Breakers set aside while rearranging. Ordered; not part of the panel. */
  staging: StagedBreaker[];
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
    // Listed top to bottom as the breaker face draws them, so the editor's
    // circuit numbering matches what you see: the 240V sits in the middle at
    // half the breaker's height with a 120V above and below.
    throws: [P1, P2, P1],
  },
  'double-4x120': {
    label: 'Quad — 4 × 120V',
    short: 'Quad',
    slots: 2,
    throws: [P1, P1, P1, P1],
  },
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
 * Staging holds breakers that came off the panel, so it never needs to exceed
 * what the panel could have held. Keeps a shared link bounded.
 */
export const MAX_STAGING = SLOT_COUNT;

/**
 * Every slot could hold a breaker carrying MAX_CIRCUITS circuits, each naming a
 * different room — and so could every breaker waiting in staging, whose labels
 * are encoded just the same. Counting only the panel would let a full staging
 * area reference rooms the encoder then truncated away, blanking those circuits
 * on the far side of a link with nothing said about it.
 *
 * The encoder and decoder share the cap so a shared link can never carry rooms
 * the far side would throw away.
 */
export const MAX_ROOMS = (SLOT_COUNT + MAX_STAGING) * MAX_CIRCUITS;
