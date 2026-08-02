import { BreakerView } from './BreakerView';
import { Slot } from './Slot';
import { buildOccupancy, columnOf, rowOf } from '../model/panel';
import { COLUMN_SIZE, PanelState, ROWS, SLOT_COUNT } from '../model/types';

interface PanelGridProps {
  state: PanelState;
  selectedId: string | null;
  /** Slots a drop would be legal in, or null when nothing is being dragged. */
  validSlots: Set<number> | null;
  roomColor: (room: string) => string | null;
  onSlotTap: (slot: number) => void;
  onBreakerSelect: (id: string) => void;
}

export function PanelGrid({
  state,
  selectedId,
  validSlots,
  roomColor,
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
            column={columnOf(slot) === 0 ? 1 : 3}
            row={rowOf(slot)}
            occupied={occupancy.has(slot)}
            valid={validSlots ? validSlots.has(slot) : null}
            onTap={onSlotTap}
          />
        ))}

        {rows.map((row) => (
          <div className="spine" key={`spine-${row}`} style={{ gridColumn: 2, gridRow: row }}>
            <span>{row}</span>
            <span>{row + COLUMN_SIZE}</span>
          </div>
        ))}

        {state.breakers.map((breaker) => (
          <BreakerView
            key={breaker.id}
            breaker={breaker}
            state={state}
            selected={breaker.id === selectedId}
            roomColor={roomColor}
            onSelect={onBreakerSelect}
          />
        ))}
      </div>
    </div>
  );
}
