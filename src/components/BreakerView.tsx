import { useDraggable } from '@dnd-kit/core';
import { columnOf, rowOf, slotsFor, throwsFor } from '../model/panel';
import { Breaker, PanelState } from '../model/types';

interface BreakerBodyProps {
  breaker: Breaker;
  roomColor: (room: string) => string | null;
  compact?: boolean;
}

/**
 * The visual face of a breaker: one block per throw, sized by how many poles it
 * takes. A 240V throw is twice the height of a 120V one, so the shape of the
 * face alone tells you which arrangement you are looking at — a 1 × 240, 2 × 120
 * reads as a thin, thick, thin stack without opening the editor.
 */
export function BreakerBody({ breaker, roomColor, compact }: BreakerBodyProps) {
  const throws = throwsFor(breaker.config);

  return (
    <div className="breaker__circuits">
      {throws.map((t, i) => {
        const circuit = breaker.circuits[i] ?? { room: '', label: '' };
        const room = circuit.room.trim();
        const label = circuit.label.trim();
        const color = room ? roomColor(room) : null;
        const base = [room, label].filter(Boolean).join(' · ') || 'Unlabeled circuit';

        return (
          <div
            className={`circuit${t.poles === 2 ? ' circuit--tied' : ''}`}
            key={i}
            style={{ flexGrow: t.poles }}
            title={t.poles === 2 ? `${base} (${t.voltage}V, 2-pole)` : base}
          >
            <span className="circuit__handle" aria-hidden="true" />
            <span className="circuit__text">
              {room && (
                <span className="circuit__room" style={color ? { color } : undefined}>
                  {room}
                </span>
              )}
              <span className={`circuit__label${label ? '' : ' circuit__label--empty'}`}>
                {label || (room ? '—' : 'unlabeled')}
              </span>
            </span>
            {!compact && (
              <span className={`circuit__volts circuit__volts--${t.voltage}`}>{t.voltage}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface BreakerViewProps {
  breaker: Breaker;
  state: PanelState;
  selected: boolean;
  roomColor: (room: string) => string | null;
  onSelect: (id: string) => void;
}

export function BreakerView({ breaker, selected, roomColor, onSelect }: BreakerViewProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `breaker-${breaker.id}`,
    data: { kind: 'breaker', id: breaker.id },
  });

  const column = columnOf(breaker.slot) === 0 ? 1 : 3;
  const row = rowOf(breaker.slot);
  const span = slotsFor(breaker.config);

  const classes = [
    'breaker',
    `breaker--${breaker.config}`,
    column === 1 ? 'breaker--left' : 'breaker--right',
  ];
  if (selected) classes.push('breaker--selected');
  if (isDragging) classes.push('breaker--dragging');

  return (
    <div
      ref={setNodeRef}
      className={classes.join(' ')}
      style={{ gridColumn: column, gridRow: `${row} / span ${span}` }}
      onClick={() => onSelect(breaker.id)}
      {...listeners}
      {...attributes}
      aria-label={`Breaker at slot ${breaker.slot}`}
    >
      <BreakerBody breaker={breaker} roomColor={roomColor} />
    </div>
  );
}
