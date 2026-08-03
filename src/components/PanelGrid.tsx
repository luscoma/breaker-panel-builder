import { useRef } from 'react';
import { BreakerView } from './BreakerView';
import { Slot } from './Slot';
import { buildOccupancy, columnOf, rowOf, sharedSlots } from '../model/panel';
import { PanelState, ROWS, SLOT_COUNT } from '../model/types';

interface SpineNumberProps {
  slot: number;
  shared: boolean;
  /** True for the one marked number that carries the group's tab stop. */
  tabbable: boolean;
  onExplain: (slot: number) => void;
  onMove: (from: number, delta: 1 | -1) => void;
}

/**
 * A slot's number, marked when that slot's circuits share a monitoring channel.
 * Monitoring is a property of the slot, not the breaker, so this is where the
 * marker belongs. Marked numbers are tappable for an explanation, since there
 * is no hover on a phone.
 *
 * The marked numbers form one composite control rather than 48 separate tab
 * stops: only the first is in the tab order, and the arrow keys move between
 * them. Slot.tsx keeps the tab order clear the same way.
 */
function SpineNumber({ slot, shared, tabbable, onExplain, onMove }: SpineNumberProps) {
  if (!shared) return <span className="spine__num">{slot}</span>;
  return (
    <button
      type="button"
      className="spine__num spine__num--shared"
      data-shared-slot={slot}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`Slot ${slot}, shares a monitoring channel`}
      title={`Slot ${slot} shares a monitoring channel`}
      onClick={(e) => {
        e.stopPropagation();
        onExplain(slot);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          onMove(slot, 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onMove(slot, -1);
        }
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
  const gridRef = useRef<HTMLDivElement>(null);
  const occupancy = buildOccupancy(state);
  const shared = sharedSlots(state);
  const markedSlots = [...shared].sort((a, b) => a - b);
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
  const rows = Array.from({ length: ROWS }, (_, i) => i + 1);

  const moveFocus = (from: number, delta: 1 | -1) => {
    const index = markedSlots.indexOf(from);
    if (index < 0) return;
    const next = markedSlots[(index + delta + markedSlots.length) % markedSlots.length];
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-shared-slot="${next}"]`)
      ?.focus();
  };

  const spineNumber = (slot: number) => (
    <SpineNumber
      slot={slot}
      shared={shared.has(slot)}
      tabbable={slot === markedSlots[0]}
      onExplain={onExplainSlot}
      onMove={moveFocus}
    />
  );

  return (
    <div className="panel">
      <div className="panel__grid" ref={gridRef}>
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
            {spineNumber(row * 2 - 1)}
            {spineNumber(row * 2)}
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
