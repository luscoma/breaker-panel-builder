import { useDraggable } from '@dnd-kit/core';
import { circuitsFor, isIndividuallyMonitored, spacesFor } from '../model/panel';
import { Breaker } from '../model/types';

interface BreakerBodyProps {
  breaker: Breaker;
  compact?: boolean;
}

/** The visual face of a breaker, shared by the panel and the drag overlay. */
export function BreakerBody({ breaker, compact }: BreakerBodyProps) {
  const circuits = circuitsFor(breaker.type, breaker.quadConfig);
  const monitored = isIndividuallyMonitored(breaker.type);

  return (
    <div className="breaker__circuits">
      {circuits.map((circuit, i) => {
        const label = breaker.labels[i]?.trim();
        return (
          <div
            className="circuit"
            key={i}
            style={{ flexGrow: circuit.poles }}
            title={label || 'Unlabeled circuit'}
          >
            <span className="circuit__handle" aria-hidden="true" />
            <span className={`circuit__label${label ? '' : ' circuit__label--empty'}`}>
              {label || 'unlabeled'}
            </span>
            {!compact && (
              <span
                className={`circuit__volts circuit__volts--${circuit.voltage}`}
                data-shared={monitored ? undefined : 'true'}
              >
                {circuit.voltage}
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
  selected: boolean;
  onSelect: (id: string) => void;
}

export function BreakerView({ breaker, selected, onSelect }: BreakerViewProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `breaker-${breaker.id}`,
    data: { kind: 'breaker', id: breaker.id },
  });

  const column = breaker.slot % 2 === 1 ? 1 : 3;
  const row = Math.ceil(breaker.slot / 2);
  const span = spacesFor(breaker.type);
  const monitored = isIndividuallyMonitored(breaker.type);

  const classes = ['breaker', `breaker--${breaker.type}`, column === 1 ? 'breaker--left' : 'breaker--right'];
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
      aria-label={`Breaker at space ${breaker.slot}`}
    >
      <BreakerBody breaker={breaker} />
    </div>
  );
}
