import { useDraggable } from '@dnd-kit/core';
import { columnOf, isIndividuallyMonitored, rowOf, slotsFor, throwsFor } from '../model/panel';
import { Breaker, PanelState } from '../model/types';

interface BreakerBodyProps {
  breaker: Breaker;
  roomColor: (room: string) => string | null;
  compact?: boolean;
}

/** The visual face of a breaker, shared by the panel and the drag overlay. */
export function BreakerBody({ breaker, roomColor, compact }: BreakerBodyProps) {
  const throws = throwsFor(breaker.config);
  const monitored = isIndividuallyMonitored(breaker.config);

  return (
    <div className="breaker__circuits">
      {throws.map((t, i) => {
        const circuit = breaker.circuits[i] ?? { room: '', label: '' };
        const room = circuit.room.trim();
        const label = circuit.label.trim();
        const color = room ? roomColor(room) : null;
        const title = [room, label].filter(Boolean).join(' · ') || 'Unlabeled circuit';

        return (
          <div className="circuit" key={i} style={{ flexGrow: t.poles }} title={title}>
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
              <span
                className={`circuit__volts circuit__volts--${t.voltage}`}
                data-shared={monitored ? undefined : 'true'}
              >
                {t.voltage}
              </span>
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
  const monitored = isIndividuallyMonitored(breaker.config);

  const classes = [
    'breaker',
    `breaker--${breaker.config}`,
    column === 1 ? 'breaker--left' : 'breaker--right',
  ];
  if (selected) classes.push('breaker--selected');
  if (isDragging) classes.push('breaker--dragging');
  if (!monitored) classes.push('breaker--shared');

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
