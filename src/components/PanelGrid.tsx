import { BreakerView } from './BreakerView';
import { Slot } from './Slot';
import { buildOccupancy, columnOf, rowOf, sharedSlots } from '../model/panel';
import { PanelState, ROWS, SLOT_COUNT } from '../model/types';

interface SpineNumberProps {
  slot: number;
  shared: boolean;
  onExplain: (slot: number) => void;
}

/**
 * A slot's number, marked when that slot's circuits share a monitoring channel.
 * Monitoring is a property of the slot, not the breaker, so this is where the
 * marker belongs. Marked numbers are tappable for an explanation, since there
 * is no hover on a phone.
 */
function SpineNumber({ slot, shared, onExplain }: SpineNumberProps) {
  if (!shared) return <span className="spine__num">{slot}</span>;
  return (
    <button
      type="button"
      className="spine__num spine__num--shared"
      title={`Slot ${slot} shares a monitoring channel`}
      onClick={(e) => {
        e.stopPropagation();
        onExplain(slot);
      }}
    >
      {slot}
    </button>
  );
}

interface PanelGridProps {
  state: PanelState;
  selectedId: string | null;
  /** Slots a drop would be legal in, or null when nothing is being dragged. */
  validSlots: Set<number> | null;
  roomColor: (room: string) => string | null;
  onSlotTap: (slot: number) => void;
  onBreakerSelect: (id: string) => void;
  onExplainSlot: (slot: number) => void;
}

export function PanelGrid({
  state,
  selectedId,
  validSlots,
  roomColor,
  onSlotTap,
  onBreakerSelect,
  onExplainSlot,
}: PanelGridProps) {
  const occupancy = buildOccupancy(state);
  const shared = sharedSlots(state);
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
            <SpineNumber
              slot={row * 2 - 1}
              shared={shared.has(row * 2 - 1)}
              onExplain={onExplainSlot}
            />
            <SpineNumber slot={row * 2} shared={shared.has(row * 2)} onExplain={onExplainSlot} />
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
