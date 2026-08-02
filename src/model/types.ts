export type BreakerType = 'single' | 'tandem' | 'double' | 'quad';

export type QuadConfig = 'four-120' | 'two-240' | '240-plus-two-120';

export interface Breaker {
  id: string;
  type: BreakerType;
  /** Topmost panel space this breaker occupies (1-48). */
  slot: number;
  /** Only meaningful when type === 'quad'. */
  quadConfig?: QuadConfig;
  /** One label per circuit, in circuit order. */
  labels: string[];
}

export interface PanelState {
  v: 1;
  name: string;
  breakers: Breaker[];
}

export interface CircuitDef {
  poles: 1 | 2;
  voltage: 120 | 240;
}

export const SLOT_COUNT = 48;
export const ROWS = SLOT_COUNT / 2;

export const DEFAULT_QUAD_CONFIG: QuadConfig = 'two-240';

export const BREAKER_TYPE_LABELS: Record<BreakerType, string> = {
  single: 'Single pole',
  tandem: 'Tandem',
  double: 'Double pole',
  quad: 'Quad',
};

export const QUAD_CONFIG_LABELS: Record<QuadConfig, string> = {
  'four-120': '4 × 120V',
  'two-240': '2 × 240V',
  '240-plus-two-120': '1 × 240V + 2 × 120V',
};
