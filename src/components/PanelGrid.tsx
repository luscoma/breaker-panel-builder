import { BreakerView } from './BreakerView';
import { Slot } from './Slot';
import { buildOccupancy } from '../model/panel';
import { PanelState, ROWS, SLOT_COUNT } from '../model/types';

interface PanelGridProps {
  state: PanelState;
  selectedId: string | null;
  /** Slots a drop would be legal in, or null when nothing is being dragged. */
  validSlots: Set<number> | null;
  onSlotTap: (slot: number) => void;
  onBreakerSelect: (id: string) => void;
}

export function PanelGrid({
  state,
  selectedId,
  validSlots,
  onSlotTap,
  onBreakerSelect,
}: PanelGridProps) {
  const occupancy = buildOccupancy(state);
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
  const rows = Array.from({ length: ROWS }, (_, i) => i + 1);

  return (
    <div className="panel">
      <div className="panel__grid">
        <div className="panel__bus" style={{ gridColumn: 2, gridRow: `1 / span ${ROWS}` }} />

        {slots.map((slot) => (
          <Slot
            key={slot}
            slot={slot}
            column={slot % 2 === 1 ? 1 : 3}
            row={Math.ceil(slot / 2)}
            occupied={occupancy.has(slot)}
            valid={validSlots ? validSlots.has(slot) : null}
            onTap={onSlotTap}
          />
        ))}

        {rows.map((row) => (
          <div className="spine" key={`spine-${row}`} style={{ gridColumn: 2, gridRow: row }}>
            <span>{row * 2 - 1}</span>
            <span>{row * 2}</span>
          </div>
        ))}

        {state.breakers.map((breaker) => (
          <BreakerView
            key={breaker.id}
            breaker={breaker}
            selected={breaker.id === selectedId}
            onSelect={onBreakerSelect}
          />
        ))}
      </div>
    </div>
  );
}
